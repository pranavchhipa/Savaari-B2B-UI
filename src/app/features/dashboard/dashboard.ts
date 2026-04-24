import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { FooterComponent } from '../../components/layout/footer/footer';
import { BookingStateService } from '../../core/services/booking-state.service';
import { CityService } from '../../core/services/city.service';
import { TripTypeService } from '../../core/services/trip-type.service';
import { AvailabilityService } from '../../core/services/availability.service';
import { BookingApiService } from '../../core/services/booking-api.service';
import { City, AvailabilityRequest } from '../../core/models';
import { toSavaariDateTime, calculateDuration, toSavaariDate, to24HourTime } from '../../core/utils/date-format.util';
import { BannerService, BannerImage } from '../../core/services/banner.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { LocalityService, Locality } from '../../core/services/locality.service';
import { AddressAutocompleteService, AddressSuggestion } from '../../core/services/address-autocomplete.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { switchMap, of } from 'rxjs';

type TabType = 'ONE_WAY' | 'ROUND_TRIP' | 'LOCAL' | 'AIRPORT';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, LucideAngularModule, DatePickerModule, SelectModule, AutoCompleteModule, FooterComponent, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private bookingState = inject(BookingStateService);
  private cdr = inject(ChangeDetectorRef);
  private cityService = inject(CityService);
  private tripTypeService = inject(TripTypeService);
  private availabilityService = inject(AvailabilityService);
  private bannerService = inject(BannerService);
  private bookingApi = inject(BookingApiService);
  private analytics = inject(AnalyticsService);
  private localityService = inject(LocalityService);
  private authService = inject(AuthService);
  private addressAutocomplete = inject(AddressAutocompleteService);

  dashboardImages = environment.dashboardImages;
  selectedTab: TabType = 'ONE_WAY';

  get agentFirstName(): string {
    const u = this.authService.getUserProfile() as any;
    const name = u?.firstname || u?.companyname || 'Agent';
    return name.split(' ')[0];
  }

  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  // Banner images from API
  bannerImages: BannerImage[] = [];
  currentBannerIndex = 0;
  private bannerInterval: ReturnType<typeof setInterval> | null = null;
  bookingForm!: FormGroup;

  // City autocomplete data
  sourceCities: City[] = [];
  airportList: City[] = [];
  destinationCities: City[] = [];
  filteredSourceCities: City[] = [];
  filteredDestinationCities: City[] = [];

  /**
   * Maximum suggestions rendered in the autocomplete dropdown across ALL
   * tabs (outstation, local, airport, round-trip — source, destination,
   * extra stops, airport search, locality search).
   *
   * Why 5 and not 20 or unlimited:
   *   - 2000+ cities × 20 DOM nodes per suggestion = visible scroll lag on
   *     every keystroke, especially on mid-range laptops where the tester
   *     flagged the UI as "making the ui ux lag very much".
   *   - The autocomplete is ranked (prefix > substring > fuzzy), so the
   *     top 5 are overwhelmingly the correct choice. If the user's target
   *     isn't in the first 5, typing one more character narrows it down
   *     faster than scrolling.
   */
  private readonly MAX_SUGGESTIONS = 5;

  // Loading state for Explore Cabs button
  isSearching = false;

  // Round Trip multi-city destinations.
  // Up to 20 extra stops allowed; the UI lays them out 5 per row and wraps
  // the rest onto subsequent rows (see dashboard.html "Stops" grid).
  extraDestinations: City[] = [];
  readonly MAX_DESTINATIONS = 20;

  addDestinationCity() {
    if (this.extraDestinations.length >= this.MAX_DESTINATIONS) return;

    // Don't add if main TO city isn't filled yet
    const toCity = this.bookingForm.get('toCity')?.value;
    if (!toCity || typeof toCity !== 'object' || !toCity.id) return;

    // Don't add if the last extra destination isn't filled yet
    if (this.extraDestinations.length > 0) {
      const last = this.extraDestinations[this.extraDestinations.length - 1];
      if (!last || typeof last !== 'object' || !last.id) return;
    }

    this.extraDestinations.push(null as any);
    this.saveSearchState();
    this.cdr.markForCheck();
  }

  removeDestinationCity(index: number) {
    this.extraDestinations.splice(index, 1);
    this.saveSearchState();
    this.cdr.markForCheck();
  }

  onExtraDestinationSelect(event: any, index: number) {
    const city: City = event.value || event;

    // Duplicate guard: don't let the same city be a stop twice.
    // A city cannot be both the main TO and an extra stop, and no two extra
    // stops can be the same. (FROM is allowed to repeat — that's normal for
    // a round trip that loops back home.)
    const used = this.getUsedDestinationCityIds(index);
    if (city?.id && used.has(String(city.id))) {
      // Reject the selection — clear the slot so the user picks a different city.
      this.extraDestinations[index] = null as any;
      this.cdr.markForCheck();
      return;
    }

    this.extraDestinations[index] = city;
    this.saveSearchState();
  }

  filterExtraDestCities(event: AutoCompleteCompleteEvent, index: number = -1) {
    const ranked = this.filterCitiesRanked(this.destinationCities, event.query);
    // Hide cities already chosen as the main TO or as another extra stop so
    // the user can't accidentally re-pick a duplicate from the dropdown.
    const used = this.getUsedDestinationCityIds(index);
    this.filteredDestinationCities = used.size === 0
      ? ranked
      : ranked.filter(c => !used.has(String(c?.id)));
    this.cdr.markForCheck();
  }

  /**
   * Collect IDs of every destination currently in use (main TO + each extra
   * stop) so the autocomplete and select handlers can prevent duplicates.
   * Pass `excludeIndex` to keep the current stop's own value in the set of
   * allowed options (e.g. when the user re-opens the same dropdown).
   */
  private getUsedDestinationCityIds(excludeIndex: number = -1): Set<string> {
    const ids = new Set<string>();
    const toCity: any = this.bookingForm?.get('toCity')?.value;
    if (toCity && typeof toCity === 'object' && toCity.id != null) {
      ids.add(String(toCity.id));
    }
    this.extraDestinations.forEach((c: any, i: number) => {
      if (i === excludeIndex) return;
      if (c && typeof c === 'object' && c.id != null) {
        ids.add(String(c.id));
      }
    });
    return ids;
  }

  // Real business stats from API
  dashboardStats = {
    bookingsThisMonth: 0,
    revenue: '\u20B90',
    commissionEarned: '\u20B90',
    pendingBookings: 0
  };

  recentBookings: { id: string; route: string; date: string; status: string; amount: string }[] = [];
  statsLoading = true;

  // ── Live Stats Bar (dummy social-proof counter) ──
  liveBookings = 0;
  liveAgents = 0;
  readonly liveCities = '2,000+';
  private liveStatsInterval: ReturnType<typeof setInterval> | null = null;

  /** Generate a deterministic daily seed so all agents see similar numbers */
  private getDailySeed(): number {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  /** Seeded pseudo-random (mulberry32) — same seed = same sequence */
  private seededRandom(seed: number): () => number {
    let t = seed + 0x6D2B79F5;
    return () => {
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Hourly booking rate weights — models real-world cab booking patterns in India.
   * Night (12AM-5AM): very low, Morning (6-9AM): rising, Midday (10AM-1PM): peak,
   * Afternoon (2-4PM): moderate, Evening (5-8PM): peak, Night (9-11PM): declining.
   * Total weights ≈ used to distribute ~5,000 daily bookings across hours.
   */
  private readonly HOURLY_WEIGHTS = [
    5,   // 12 AM — almost nil
    3,   // 1 AM
    2,   // 2 AM
    2,   // 3 AM
    3,   // 4 AM
    8,   // 5 AM — early risers
    25,  // 6 AM — airport/outstation pickups start
    45,  // 7 AM — morning rush
    60,  // 8 AM — peak morning
    55,  // 9 AM — still busy
    50,  // 10 AM — midday bookings
    65,  // 11 AM — high activity
    70,  // 12 PM — lunch peak
    55,  // 1 PM — moderate
    45,  // 2 PM — afternoon
    40,  // 3 PM — moderate
    50,  // 4 PM — evening starts
    65,  // 5 PM — evening rush begins
    70,  // 6 PM — peak evening
    60,  // 7 PM — still busy
    45,  // 8 PM — winding down
    30,  // 9 PM — late evening
    18,  // 10 PM — low
    10,  // 11 PM — very low
  ];

  /** Calculate cumulative bookings up to the current minute using hourly weights */
  private calculateLiveStats(): void {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const rng = this.seededRandom(this.getDailySeed());
    const maxDaily = 4500 + Math.floor(rng() * 1000); // 4,500–5,500 daily target

    // Sum all weights to normalize
    const totalWeight = this.HOURLY_WEIGHTS.reduce((sum, w) => sum + w, 0);

    // Calculate cumulative bookings up to current hour + fractional minute
    let cumulativeWeight = 0;
    for (let h = 0; h < currentHour; h++) {
      cumulativeWeight += this.HOURLY_WEIGHTS[h];
    }
    // Add fractional weight for current hour based on minutes elapsed
    cumulativeWeight += this.HOURLY_WEIGHTS[currentHour] * (currentMinute / 60);

    const baseBookings = Math.floor(maxDaily * (cumulativeWeight / totalWeight));

    // Add small jitter (±1.5%) so number doesn't look frozen
    const jitter = 1 + (Math.random() - 0.5) * 0.03;
    this.liveBookings = Math.max(0, Math.floor(baseBookings * jitter));

    this.cdr.markForCheck();
  }

  private startLiveStats(): void {
    this.calculateLiveStats();
    // Update every 8–12 seconds
    this.liveStatsInterval = setInterval(() => {
      this.calculateLiveStats();
    }, 8000 + Math.random() * 4000);
  }

  /** Format number with commas (Indian style: 1,23,456) */
  formatLiveNumber(n: number): string {
    return n.toLocaleString('en-IN');
  }

  tripTypes = [
    { label: 'Drop to Airport', value: 'drop' },
    { label: 'Pickup from Airport', value: 'pickup' }
  ];

  // Airport autocomplete — uses sourceCities filtered by isAirport
  filteredAirports: City[] = [];
  selectedAirportCity: City | null = null;
  /** Locality ID for the selected airport (required by availability API) */
  airportLocalityId: number | null = null;
  airportLocalityName: string = '';

  /** One-way conversion popup for airport bookings */
  showConversionPopup = false;

  /** Address suggestions for airport pickup/drop (from Savaari autocomplete API) */
  filteredLocalities: AddressSuggestion[] = [];

  /** Resolved place details from 2nd API (place_id) — includes aliasSourceCityId for airport conversion */
  selectedPlaceDetails: { lat: number; lng: number; name: string; place_id: string; aliasSourceCityId?: number; aliasDestCityId?: number } | null = null;

  /** Filter addresses using Savaari autocomplete API (replaces Google Maps Places) */
  filterLocalities(event: AutoCompleteCompleteEvent) {
    const q = event.query || '';
    if (q.length < 3) {
      this.filteredLocalities = [];
      this.cdr.markForCheck();
      return;
    }
    console.log('selectedAirportCity', this.selectedAirportCity);
    const cityName = this.selectedAirportCity?.cityOnly || this.selectedAirportCity?.name?.split(',')[0]?.trim() || '';
    const ll = this.selectedAirportCity?.ll?.split(',') || [];
    const lat = ll[0] || '';
    const lng = ll[1] || '';
    const request = this.bookingForm.get('tripType')?.value === 'pickup' ? 'to' : 'from';
    this.addressAutocomplete.searchAddress(q, request, cityName, lat, lng).subscribe(suggestions => {
      // Cap address suggestions to keep the dropdown snappy — the first 5
      // ranked results from Savaari's autocomplete API are virtually always
      // the right pick for airport pickup/drop points.
      this.filteredLocalities = (suggestions || []).slice(0, this.MAX_SUGGESTIONS);
      this.cdr.markForCheck();
    });
  }

  /** When user selects an address from autocomplete → call place_id API for lat/lng + city IDs.
   *  Handles graceful fallback when place_id API returns empty data (common with beta API). */
  onAddressSelect(event: any) {
    const suggestion: AddressSuggestion = event.value || event;
    if (!suggestion?.place_id) return;

    // Fallback suggestion (city-level, has latlng directly) — skip place_id API call
    if (suggestion.isFallback && suggestion.latlng) {
      const parts = suggestion.latlng.split(',');
      this.selectedPlaceDetails = {
        lat: parseFloat(parts[0]) || 0,
        lng: parseFloat(parts[1]) || 0,
        name: suggestion.main_text || suggestion.description || '',
        place_id: suggestion.place_id,
        aliasSourceCityId: 0,
        aliasDestCityId: 0,
      };
      if (!environment.production) {
        console.log('[Dashboard] Fallback address selected (no place_id call):', suggestion.description, 'lat:', this.selectedPlaceDetails.lat, 'lng:', this.selectedPlaceDetails.lng);
      }
      this.cdr.markForCheck();
      return;
    }

    // Call place_id API with request='from' (request='to' returns empty data from beta API)
    this.addressAutocomplete.getPlaceDetails(suggestion.place_id, 'from').subscribe(details => {
      if (details && details.lat && details.lng) {
        // API returned valid coordinates
        this.selectedPlaceDetails = {
          lat: details.lat,
          lng: details.lng,
          name: details.name,
          place_id: details.place_id,
          aliasSourceCityId: details.aliasSourceCityId,
          aliasDestCityId: details.aliasDestCityId,
        };
      } else {
        // place_id API returned empty/zero data — use airport coordinates as fallback
        const airportLL = this.selectedAirportCity?.ll?.split(',') || [];
        this.selectedPlaceDetails = {
          lat: parseFloat(airportLL[0]) || 0,
          lng: parseFloat(airportLL[1]) || 0,
          name: details?.name || suggestion.main_text || suggestion.description || '',
          place_id: details?.place_id || suggestion.place_id,
          aliasSourceCityId: details?.aliasSourceCityId || 0,
          aliasDestCityId: details?.aliasDestCityId || 0,
        };
        if (!environment.production) {
          console.log('[Dashboard] place_id returned empty data, using airport coords as fallback');
        }
      }
      if (!environment.production) {
        console.log('[Dashboard] Place details resolved:', this.selectedPlaceDetails.name,
          'lat:', this.selectedPlaceDetails.lat, 'lng:', this.selectedPlaceDetails.lng,
          'sourceCity:', this.selectedPlaceDetails.aliasSourceCityId, 'destCity:', this.selectedPlaceDetails.aliasDestCityId);
      }
      this.cdr.markForCheck();
    });
  }

  /** Search airports from GET /airport-list (CityService.getAirportList). */
  filterAirports(event: AutoCompleteCompleteEvent) {
    const q = (event.query || '').toLowerCase();
    const airports = this.airportList;
    if (!q) {
      this.filteredAirports = airports.slice(0, this.MAX_SUGGESTIONS);
    } else {
      const prefix: City[] = [];
      const substring: City[] = [];
      for (const c of airports) {
        const name = c.name.toLowerCase();
        const cityOnly = (c.cityOnly || '').toLowerCase();
        const kw = (c.airportSearchKeywords || '').toLowerCase();
        const keywordPrefix = kw.split(',').some(k => {
          const t = k.trim();
          return t.length > 0 && t.startsWith(q);
        });
        const keywordSub = kw.split(',').some(k => {
          const t = k.trim();
          return t.length > 0 && t.includes(q);
        });
        if (cityOnly.startsWith(q) || name.startsWith(q) || keywordPrefix) {
          prefix.push(c);
        } else if (name.includes(q) || cityOnly.includes(q) || kw.includes(q) || keywordSub) {
          substring.push(c);
        }
      }
      this.filteredAirports = [...prefix, ...substring].slice(0, this.MAX_SUGGESTIONS);
    }
    this.cdr.markForCheck();
  }

  /** When user selects an airport from autocomplete, also resolve its locality ID */
  onAirportSelect(event: any) {
    const city: City = event.value || event;
    this.selectedAirportCity = city;
    this.airportLocalityId = null;
    this.airportLocalityName = '';
    // Load localities for this city and find the airport locality ID + name
    if (city?.id) {
      this.localityService.getAirports(city.id).subscribe(airports => {
        if (airports.length > 0) {
          this.airportLocalityId = airports[0].id;
          this.airportLocalityName = airports[0].name;
        }
        this.cdr.markForCheck();
      });
    }
  }

  /** Urgent-booking gap: agents can only book a cab at least N hours from now. */
  private readonly URGENT_GAP_HOURS = 4;

  /** Minimum selectable pickup date (today, unless now+gap crosses midnight → tomorrow) */
  minPickupDate: Date = new Date();

  /** Minimum selectable return date (pickup date + 1 day) */
  minReturnDate: Date = new Date();

  /**
   * Minimum selectable pickup TIME (only constrains the time-spinner when
   * pickupDate === today). For future dates this stays null so any time is
   * allowed. PrimeNG's `<p-datepicker [timeOnly]>` honours `minDate`'s hours
   * and minutes when the form value's date matches `minDate`'s date.
   */
  minPickupTime: Date | null = null;

  private readonly SEARCH_STATE_KEY = 'b2b_search_state';

  // localStorage cache keys for instant autocomplete suggestions.
  // TTL is 7 days — city/airport lists rarely change and users get an instant
  // dropdown on every visit after the first. API still refreshes in background.
  private readonly CACHE_KEY_SOURCE_CITIES = 'b2b_cache_source_cities';
  private readonly CACHE_KEY_DEST_CITIES = 'b2b_cache_dest_cities';
  private readonly CACHE_KEY_AIRPORTS = 'b2b_cache_airports';
  private readonly CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * Hardcoded fallback for first-time users who have no cache yet.
   * Real IDs from the live beta source-cities API so clicking these actually
   * resolves to valid selections. Covers the top metro origins nationally.
   */
  private readonly POPULAR_CITIES: City[] = [
    { id: 377,  name: 'Bangalore, Karnataka', cityOnly: 'Bangalore', state: 'Karnataka' },
    { id: 3858, name: 'Mumbai, Maharashtra',  cityOnly: 'Mumbai',    state: 'Maharashtra' },
    { id: 1442, name: 'Delhi, Delhi',         cityOnly: 'Delhi',     state: 'Delhi' },
    { id: 829,  name: 'Chennai, Tamil Nadu',  cityOnly: 'Chennai',   state: 'Tamil Nadu' },
    { id: 2163, name: 'Hyderabad, Telangana', cityOnly: 'Hyderabad', state: 'Telangana' },
    { id: 1263, name: 'Pune, Maharashtra',    cityOnly: 'Pune',      state: 'Maharashtra' },
  ];

  ngOnInit() {
    this.initForm();
    this.restoreSearchState();
    // Hydrate autocomplete lists from localStorage synchronously BEFORE the
    // API calls fire so the dropdowns have data to show on the very first
    // click. API refresh in the background replaces stale entries silently.
    this.hydrateCaches();

    // Refresh partner token first (prevents stale token errors), then load data
    this.authService.fetchPartnerToken().subscribe({
      next: () => {
        this.loadSourceCities();
        this.loadDestinationCities();
        this.loadAirportList();
        this.loadBanners();
        this.loadDashboardStats();
        this.cdr.markForCheck();
      },
      error: () => {
        // Even if token refresh fails, try loading with existing token
        this.loadSourceCities();
        this.loadDestinationCities();
        this.loadAirportList();
        this.loadBanners();
        this.loadDashboardStats();
      }
    });

    this.startLiveStats();
    // Track page load after 2s (mirrors savaari.com behaviour)
    setTimeout(() => this.analytics.trackPageLoad(), 2000);
  }

  ngOnDestroy() {
    if (this.bannerInterval) clearInterval(this.bannerInterval);
    if (this.liveStatsInterval) clearInterval(this.liveStatsInterval);
  }

  /** Load real booking data from API and compute dashboard stats */
  private loadDashboardStats() {
    this.statsLoading = true;
    this.bookingApi.getAllBookings().subscribe({
      next: (bookings) => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Cast to any[] for flexible property access (API uses snake_case).
        // Drop "Potential" records — bookings created server-side but never
        // paid for; including them would inflate revenue totals and surface
        // them in the Recent Bookings widget without a valid payment method.
        const all = (bookings as any[]).filter(b => {
          const raw = String(b?.['booking_status'] || b?.['status'] || '').toLowerCase().trim();
          return raw !== 'potential';
        });

        // Filter bookings for this month
        const thisMonthBookings = all.filter(b => {
          const dateStr: string = b['start_date_time'] || b['startDateTime'] || '';
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        // Calculate revenue (sum of gross_amount)
        let totalRevenue = 0;
        let totalCommission = 0;
        for (const b of all) {
          const amount = parseFloat(b['gross_amount'] || b['grossAmount'] || b['total_fare'] || '0');
          if (!isNaN(amount)) totalRevenue += amount;
          const comm = parseFloat(b['commission'] || b['agent_commission'] || '0');
          if (!isNaN(comm)) totalCommission += comm;
        }

        // Count pending/upcoming bookings
        const pendingCount = all.filter(b => {
          const status = String(b['booking_status'] || b['status'] || '').toLowerCase();
          return status === 'upcoming' || status === 'confirmed' || status === 'in_progress' || status === 'in progress';
        }).length;

        this.dashboardStats = {
          bookingsThisMonth: thisMonthBookings.length,
          revenue: '\u20B9' + this.formatIndianNumber(totalRevenue),
          commissionEarned: '\u20B9' + this.formatIndianNumber(totalCommission),
          pendingBookings: pendingCount
        };

        // Recent bookings — take latest 5
        const sorted = [...all].sort((a, b) => {
          const da = new Date(a['start_date_time'] || a['startDateTime'] || 0).getTime();
          const db = new Date(b['start_date_time'] || b['startDateTime'] || 0).getTime();
          return db - da;
        });

        this.recentBookings = sorted.slice(0, 5).map(b => {
          const pickCity: string = b['pick_city'] || b['sourceCity'] || '';
          const itinerary: string = b['itinerary'] || '';
          const tripType: string = b['trip_type'] || '';
          const usageName: string = b['usagename'] || '';

          // Build route display: use itinerary for intercity, else show trip type
          let route = pickCity;
          if (itinerary && itinerary !== 'N/A') {
            route = this.decodeHtml(itinerary); // decode &rarr; → →
          } else if (tripType === 'Local' && usageName) {
            route = pickCity.split(',')[0] + ' \u2022 ' + usageName; // e.g. "Bangalore • Local (8hr/80 km)"
          }

          const dateStr: string = b['start_date_time'] || b['startDateTime'] || '';
          const d = dateStr ? new Date(dateStr) : new Date();
          const dateFormatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          const rawStatus: string = String(b['booking_status'] || b['status'] || 'Unknown');
          const status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
          const fare = parseFloat(b['gross_amount'] || b['grossAmount'] || b['total_fare'] || '0');
          const amount = '\u20B9' + this.formatIndianNumber(fare);
          return {
            id: String(b['booking_id'] || b['bookingId'] || ''),
            route,
            date: dateFormatted,
            status: status === 'In_progress' ? 'In Progress' : status,
            amount
          };
        });

        // Add demo recent bookings if none from API
        if (this.recentBookings.length === 0) {
          const today = new Date();
          const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          this.recentBookings = [
            { id: 'B2B-284719', route: 'Bangalore → Mysore (One Way)', date: fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)), status: 'Confirmed', amount: '₹4,345' },
            { id: 'B2B-284720', route: 'Mumbai → Pune (Round Trip)', date: fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)), status: 'Confirmed', amount: '₹12,850' },
            { id: 'B2B-284721', route: 'Delhi • 8hrs 80km', date: fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3)), status: 'Assigned', amount: '₹2,990' },
            { id: 'B2B-284698', route: 'Chennai → Pondicherry (One Way)', date: fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2)), status: 'Completed', amount: '₹3,780' },
            { id: 'B2B-284655', route: 'Hyderabad • 12hrs 120km', date: fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5)), status: 'Completed', amount: '₹4,200' },
          ];
        }

        this.statsLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load dashboard stats:', err);
        this.statsLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  /** Format a number in Indian numbering system (12,34,567) */
  private decodeHtml(str: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(str, 'text/html');
    return doc.body.textContent || str;
  }

  private formatIndianNumber(num: number): string {
    if (isNaN(num) || num === 0) return '0';
    const rounded = Math.round(num);
    const str = rounded.toString();
    // Indian format: last 3 digits, then groups of 2
    if (str.length <= 3) return str;
    const last3 = str.slice(-3);
    const remaining = str.slice(0, -3);
    const pairs = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return pairs + ',' + last3;
  }

  /** Load promotional banners from API */
  private loadBanners() {
    this.bannerService.getBanners().subscribe(banners => {
      this.bannerImages = banners;
      if (banners.length > 1) {
        this.startBannerRotation();
      }
      this.cdr.markForCheck();
    });
  }

  private startBannerRotation() {
    if (this.bannerInterval) clearInterval(this.bannerInterval);
    this.bannerInterval = setInterval(() => {
      if (this.bannerImages.length > 0) {
        this.currentBannerIndex = (this.currentBannerIndex + 1) % this.bannerImages.length;
        this.cdr.markForCheck();
      }
    }, 5000); // Rotate every 5 seconds
  }

  nextBanner() {
    if (this.bannerImages.length > 0) {
      this.currentBannerIndex = (this.currentBannerIndex + 1) % this.bannerImages.length;
      this.cdr.markForCheck();
    }
  }

  prevBanner() {
    if (this.bannerImages.length > 0) {
      this.currentBannerIndex = (this.currentBannerIndex - 1 + this.bannerImages.length) % this.bannerImages.length;
      this.cdr.markForCheck();
    }
  }

  initForm() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    this.bookingForm = this.fb.group({
      fromCity: [null],
      toCity: [null],
      tripType: ['drop'],
      pickupAddress: [''],
      dropAirport: [''],
      airportLocality: [null],
      airportCity: [null],
      pickupDate: [tomorrow],
      returnDate: [dayAfter],
      pickupTime: [new Date(new Date().setHours(18, 0, 0, 0))]
    });

    // Set initial minReturnDate to tomorrow + 1 = dayAfter
    this.updateMinReturnDate(tomorrow);

    // Apply the urgent-booking 4-hour gap rule on initial form state
    this.updateUrgentGapConstraints(tomorrow);

    // Watch pickupDate changes to auto-adjust return date + recompute the
    // urgent-booking time floor + track analytics
    this.bookingForm.get('pickupDate')?.valueChanges.subscribe((newPickupDate: Date) => {
      if (newPickupDate) {
        this.updateMinReturnDate(newPickupDate);
        this.updateUrgentGapConstraints(newPickupDate);
        const apiParams = this.getApiParams();
        this.analytics.trackPickupDateFill(
          newPickupDate.toLocaleDateString('en-IN'),
          apiParams.tripType, apiParams.subTripType
        );
      }
    });

    // Track pickup time fills
    this.bookingForm.get('pickupTime')?.valueChanges.subscribe((newTime: Date) => {
      if (newTime) {
        const apiParams = this.getApiParams();
        this.analytics.trackPickupTimeFill(
          newTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          apiParams.tripType, apiParams.subTripType
        );
      }
    });

    // Auto-save search state on any form change
    this.bookingForm.valueChanges.subscribe(() => this.saveSearchState());
  }

  /** Save current search form state to sessionStorage for refresh persistence */
  private saveSearchState(): void {
    try {
      const form = this.bookingForm.getRawValue();
      const state: any = {
        selectedTab: this.selectedTab,
        fromCity: form.fromCity,
        toCity: form.toCity,
        tripType: form.tripType,
        pickupAddress: form.pickupAddress,
        dropAirport: form.dropAirport,
        airportLocality: form.airportLocality,
        airportCity: form.airportCity,
        pickupDate: form.pickupDate ? new Date(form.pickupDate).toISOString() : null,
        returnDate: form.returnDate ? new Date(form.returnDate).toISOString() : null,
        pickupTime: form.pickupTime ? new Date(form.pickupTime).toISOString() : null,
        selectedAirportCity: this.selectedAirportCity,
        airportLocalityId: this.airportLocalityId,
        airportLocalityName: this.airportLocalityName,
        extraDestinations: this.extraDestinations,
      };
      sessionStorage.setItem(this.SEARCH_STATE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }

  /** Restore search form state from sessionStorage after page refresh */
  private restoreSearchState(): void {
    try {
      const raw = sessionStorage.getItem(this.SEARCH_STATE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);

      // Restore tab
      if (state.selectedTab) {
        this.selectedTab = state.selectedTab;
      }

      // Restore form values
      if (state.fromCity) this.bookingForm.patchValue({ fromCity: state.fromCity }, { emitEvent: false });
      if (state.toCity) this.bookingForm.patchValue({ toCity: state.toCity }, { emitEvent: false });
      if (state.tripType) this.bookingForm.patchValue({ tripType: state.tripType }, { emitEvent: false });
      // For airport tab: intentionally do NOT restore pickup address / airport locality / airport city.
      // Returning users should start with cleared fields so the autocomplete works fresh.
      const isAirportTab = this.selectedTab === 'AIRPORT';
      if (!isAirportTab && state.pickupAddress) this.bookingForm.patchValue({ pickupAddress: state.pickupAddress }, { emitEvent: false });
      if (state.dropAirport) this.bookingForm.patchValue({ dropAirport: state.dropAirport }, { emitEvent: false });
      if (!isAirportTab && state.airportLocality) this.bookingForm.patchValue({ airportLocality: state.airportLocality }, { emitEvent: false });
      if (!isAirportTab && state.airportCity) this.bookingForm.patchValue({ airportCity: state.airportCity }, { emitEvent: false });
      if (state.pickupDate) {
        const restored = new Date(state.pickupDate);
        // Only restore if date is valid and not in the past
        if (!isNaN(restored.getTime()) && restored >= this.minPickupDate) {
          this.bookingForm.patchValue({ pickupDate: restored }, { emitEvent: false });
        }
      }
      // After restoring pickup date, recompute minReturnDate so the calendar blocks past dates
      const restoredPickup = this.bookingForm.get('pickupDate')?.value;
      if (restoredPickup) {
        this.updateMinReturnDate(restoredPickup);
      }

      if (state.returnDate) {
        const restored = new Date(state.returnDate);
        const pickupFloor = restoredPickup ? new Date(restoredPickup) : this.minPickupDate;
        pickupFloor.setHours(0, 0, 0, 0);
        const restoredDay = new Date(restored);
        restoredDay.setHours(0, 0, 0, 0);
        // Return date must be >= pickup date (not just >= today)
        if (!isNaN(restored.getTime()) && restoredDay.getTime() >= pickupFloor.getTime()) {
          this.bookingForm.patchValue({ returnDate: restored }, { emitEvent: false });
        }
      }
      if (state.pickupTime) this.bookingForm.patchValue({ pickupTime: new Date(state.pickupTime) }, { emitEvent: false });

      // Restore airport state (skipped on airport tab so fields clear on return)
      if (!isAirportTab) {
        if (state.selectedAirportCity) this.selectedAirportCity = state.selectedAirportCity;
        if (state.airportLocalityId) this.airportLocalityId = state.airportLocalityId;
        if (state.airportLocalityName) this.airportLocalityName = state.airportLocalityName;
      } else {
        this.selectedAirportCity = null;
        this.airportLocalityId = null;
        this.airportLocalityName = '';
      }

      // Restore extra destinations
      if (state.extraDestinations?.length) this.extraDestinations = state.extraDestinations;

      // Load destination cities if source city was already selected (not for Airport/Local)
      if (state.fromCity?.id && this.selectedTab !== 'AIRPORT' && this.selectedTab !== 'LOCAL') {
        const apiParams = this.tripTypeService.mapUiTabToApiParams(this.selectedTab, {});
        this.cityService.getDestinationCities(apiParams.tripType, apiParams.subTripType, state.fromCity.id).subscribe(cities => {
          this.destinationCities = cities;
          this.cdr.markForCheck();
        });
      }

      this.cdr.markForCheck();
    } catch { /* ignore corrupt data */ }
  }

  /** Update minReturnDate and auto-adjust returnDate if it's now invalid.
   *  Same-day return is allowed — minReturnDate equals the pickup day itself.
   */
  private updateMinReturnDate(pickupDate: Date) {
    const sameDay = new Date(pickupDate);
    sameDay.setHours(0, 0, 0, 0);
    this.minReturnDate = sameDay;

    // Only push forward if the existing return date is strictly BEFORE pickup.
    // Same-day is preserved.
    const currentReturn = this.bookingForm.get('returnDate')?.value;
    if (currentReturn) {
      const returnNormalized = new Date(currentReturn);
      returnNormalized.setHours(0, 0, 0, 0);
      if (returnNormalized.getTime() < sameDay.getTime()) {
        this.bookingForm.get('returnDate')?.setValue(new Date(sameDay));
      }
    }
    this.cdr.markForCheck();
  }

  /**
   * Earliest bookable instant from "now" — current time + URGENT_GAP_HOURS,
   * rounded UP to the next 15-min slot. e.g. now=10:47 AM → 02:45 PM.
   */
  private getEarliestBookableInstant(): Date {
    const t = new Date();
    t.setHours(t.getHours() + this.URGENT_GAP_HOURS);
    t.setSeconds(0, 0);
    const rem = t.getMinutes() % 15;
    if (rem !== 0) t.setMinutes(t.getMinutes() + (15 - rem));
    return t;
  }

  /** True when the given date is the same calendar day as today. */
  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  /**
   * Recompute minPickupDate / minPickupTime against the URGENT_GAP_HOURS rule
   * and auto-bump pickupDate / pickupTime when they fall before the new floor.
   *
   * Called on init and whenever pickupDate changes.
   */
  private updateUrgentGapConstraints(pickupDate: Date | null) {
    const earliest = this.getEarliestBookableInstant();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // If now+gap crosses midnight (e.g. 21:00 + 4h = 01:00 next day),
    // today is no longer bookable → minPickupDate becomes tomorrow.
    const earliestDay = new Date(earliest);
    earliestDay.setHours(0, 0, 0, 0);
    if (earliestDay.getTime() > today.getTime()) {
      this.minPickupDate = earliestDay;
    } else {
      this.minPickupDate = today;
    }

    if (!pickupDate) {
      this.minPickupTime = null;
      this.cdr.markForCheck();
      return;
    }

    // If user picked a date earlier than the new floor → push it to the floor.
    const picked = new Date(pickupDate);
    picked.setHours(0, 0, 0, 0);
    if (picked.getTime() < this.minPickupDate.getTime()) {
      // Avoid recursion: patch with emitEvent so valueChanges can re-run cleanly.
      this.bookingForm.get('pickupDate')?.setValue(new Date(this.minPickupDate));
      return; // valueChanges will re-fire and re-enter this method
    }

    // Apply minTime ONLY when the picked date is today (the only day where
    // a 4-hour-from-now floor matters). For future dates, any time is allowed.
    if (this.isSameDay(picked, today) && this.isSameDay(today, earliest)) {
      this.minPickupTime = earliest;
      // Auto-bump current pickupTime if it falls below the floor
      const currentTime: Date | null = this.bookingForm.get('pickupTime')?.value;
      if (currentTime instanceof Date) {
        const candidate = new Date();
        candidate.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0);
        if (candidate.getTime() < earliest.getTime()) {
          this.bookingForm.get('pickupTime')?.setValue(new Date(earliest));
        }
      }
    } else {
      // Future date — clear the time floor.
      this.minPickupTime = null;
    }
    this.cdr.markForCheck();
  }

  /** Load source cities from CityService */
  private loadSourceCities() {
    const apiParams = this.getApiParams();
    this.cityService.getSourceCities(apiParams.tripType, apiParams.subTripType).subscribe({
      next: (cities) => {
        this.sourceCities = cities;
        this.writeCache(this.CACHE_KEY_SOURCE_CITIES, cities);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load source cities:', err);
        // Keep whatever we hydrated from cache / popular fallback so the user
        // still sees suggestions — don't wipe it to an empty array on error.
        this.cdr.markForCheck();
      }
    });
  }

  /** Load airport list from CityService */
  private loadAirportList() {
    this.cityService.getAirportList().subscribe({
      next: (cities) => {
        this.airportList = cities;
        this.writeCache(this.CACHE_KEY_AIRPORTS, cities);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load airport list:', err);
        this.cdr.markForCheck();
      }
    });
  }


  /** Load destination cities based on selected source city.
   *  Airport & Local tabs don't use destination cities — skip to avoid "Invalid trip type" 400. */
  private loadDestinationCities() {
    if (this.selectedTab === 'AIRPORT' || this.selectedTab === 'LOCAL') return;
    const apiParams = this.getApiParams();
    this.cityService.getDestinationCities(apiParams.tripType, apiParams.subTripType, 377).subscribe({
      next: (cities) => {
        this.destinationCities = cities;
        this.writeCache(this.CACHE_KEY_DEST_CITIES, cities);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load destination cities:', err);
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Synchronously populate sourceCities / destinationCities / airportList from
   * the last cached API response (localStorage, 7-day TTL). Runs before the
   * token refresh + network calls in ngOnInit, so the first click on any
   * autocomplete has data to show. If no cache exists (first-time user), seeds
   * the two city lists with POPULAR_CITIES as a minimal but real fallback.
   * Silent: any localStorage / JSON failure just leaves the arrays empty.
   */
  private hydrateCaches(): void {
    const cachedSource = this.readCache<City[]>(this.CACHE_KEY_SOURCE_CITIES);
    const cachedDest   = this.readCache<City[]>(this.CACHE_KEY_DEST_CITIES);
    const cachedAir    = this.readCache<City[]>(this.CACHE_KEY_AIRPORTS);

    this.sourceCities      = (cachedSource && cachedSource.length) ? cachedSource : this.POPULAR_CITIES.slice();
    this.destinationCities = (cachedDest   && cachedDest.length)   ? cachedDest   : this.POPULAR_CITIES.slice();
    this.airportList       = (cachedAir    && cachedAir.length)    ? cachedAir    : [];
  }

  /** Persist an autocomplete list to localStorage with a timestamp. */
  private writeCache<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
    } catch {
      // Quota / private mode — cache is best-effort, ignore.
    }
  }

  /** Read a cached autocomplete list; returns null if missing or stale. */
  private readCache<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { t: number; v: T };
      if (!parsed || typeof parsed.t !== 'number') return null;
      if (Date.now() - parsed.t > this.CACHE_TTL_MS) return null;
      return parsed.v;
    } catch {
      return null;
    }
  }

  /** Get API tripType/subTripType from current UI tab */
  private getApiParams() {
    const uiTripType = this.selectedTab === 'ROUND_TRIP' ? 'Round Trip'
      : this.selectedTab === 'LOCAL' ? 'Local'
      : this.selectedTab === 'AIRPORT' ? 'Airport'
      : 'One Way';
    return this.tripTypeService.mapUiTabToApiParams(uiTripType, {
      airportSubType: this.bookingForm?.get('tripType')?.value
    });
  }

  /** PrimeNG AutoComplete: filter source cities (prefix matches first).
   *  IMPORTANT: must return a NEW array reference every call — PrimeNG's
   *  `handleSuggestionsChange` only clears the loading spinner when the
   *  `[suggestions]` input reference changes. Returning the same `sourceCities`
   *  array on empty-query clicks leaves the spinner stuck forever. */
  filterSourceCities(event: AutoCompleteCompleteEvent) {
    this.filteredSourceCities = this.filterCitiesRanked(this.sourceCities, event.query);
    this.cdr.markForCheck();
  }

  /** PrimeNG AutoComplete: filter destination cities (prefix matches first) */
  filterDestinationCities(event: AutoCompleteCompleteEvent) {
    this.filteredDestinationCities = this.filterCitiesRanked(this.destinationCities, event.query);
    this.cdr.markForCheck();
  }

  /** Filter cities: prefix matches on cityOnly first, then substring matches.
   *  Always returns a NEW array (even for empty queries) so PrimeNG's
   *  `[suggestions]` input sees a reference change and clears its loading state. */
  private filterCitiesRanked(cities: City[], query: string): City[] {
    const q = (query || '').toLowerCase();
    // Empty query (dropdown opened via focus, no typing) — show the first
    // few cities as a "popular" hint rather than dumping 2000 rows into the
    // DOM. The user will start typing anyway to narrow down.
    if (!q) return cities.slice(0, this.MAX_SUGGESTIONS);
    const prefix: City[] = [];
    const substring: City[] = [];
    for (const c of cities) {
      const name = c.name.toLowerCase();
      const cityOnly = (c.cityOnly || '').toLowerCase();
      if (cityOnly.startsWith(q) || name.startsWith(q)) {
        prefix.push(c);
      } else if (name.includes(q)) {
        substring.push(c);
      }
    }
    // If strict match found something, or query is too short for fuzzy to be
    // meaningful, return the top-N only. Prefix matches come first so they
    // occupy the visible slots before substring matches fill the remainder.
    if (prefix.length > 0 || substring.length > 0 || q.length < 4) {
      return [...prefix, ...substring].slice(0, this.MAX_SUGGESTIONS);
    }
    // Fuzzy fallback — catches common typos / fast-typing misses that the
    // strict filter would otherwise reject. Reported April 2026: typing
    // "banglor" (missing the second 'a') returned "No results found" even
    // though Bangalore is clearly the intended city. Same for "mumbi",
    // "hydrabad", "chenai" etc.
    //
    // Tolerance scales with query length so a 4-char typo can only be 1
    // edit away, while longer queries allow up to 2 edits.
    const maxDist = q.length >= 6 ? 2 : 1;
    const fuzzy: { city: City; distance: number }[] = [];
    for (const c of cities) {
      const cityOnly = (c.cityOnly || c.name || '').toLowerCase();
      // Compare query against the leading portion of cityOnly that's within
      // `maxDist` characters of the query length. This lets "banglor" (7)
      // match "bangalore" (9) since |9-7| = 2 ≤ maxDist.
      const compareLen = Math.min(cityOnly.length, q.length + maxDist);
      const truncated = cityOnly.substring(0, compareLen);
      const d = this.levenshtein(q, truncated);
      if (d <= maxDist) fuzzy.push({ city: c, distance: d });
    }
    fuzzy.sort((a, b) => a.distance - b.distance);
    return fuzzy.slice(0, this.MAX_SUGGESTIONS).map(f => f.city);
  }

  /**
   * Classic iterative Levenshtein distance (two-row rolling buffer).
   * Used only by the fuzzy fallback in filterCitiesRanked, so called at most
   * ~2000 times per keystroke on a typo — well under 5ms on typical inputs.
   */
  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[] = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        dp[j] = a.charCodeAt(i - 1) === b.charCodeAt(j - 1)
          ? prev
          : Math.min(prev, dp[j - 1], dp[j]) + 1;
        prev = tmp;
      }
    }
    return dp[n];
  }

  /** When source city is selected, load destinations */
  onSourceCitySelect(event: any) {
    const city: City = event.value || event;
    if (city?.id) {
      this.loadDestinationCities();
    }
  }

  get airportLabel1(): string {
    const type = this.bookingForm?.get('tripType')?.value;
    if (type === 'pickup') return 'PICKUP AIRPORT';
    if (type === 'drop') return 'PICKUP ADDRESS';
    return 'DROP AIRPORT';
  }

  get airportLabel2(): string {
    const type = this.bookingForm?.get('tripType')?.value;
    if (type === 'pickup') return 'DROP ADDRESS';
    return 'DROP AIRPORT';
  }

  swapCities() {
    const from = this.bookingForm.get('fromCity')?.value;
    const to = this.bookingForm.get('toCity')?.value;
    if (!from?.name || !to?.name) return;

    // After swap, the new "from" must use its ID from the source cities list,
    // and the new "to" must use its ID from the destination cities list.
    // Source and destination APIs return DIFFERENT cityIds for the same city.
    const newFromName = (to.cityOnly || to.name || '').toLowerCase();
    const matchedSource = this.sourceCities.find(
      c => (c.cityOnly || c.name || '').toLowerCase() === newFromName
    );

    if (!matchedSource) {
      // City not available as source — can't swap
      console.warn('[Dashboard] Cannot swap: destination city not found in source cities list');
      return;
    }

    // Set the new from city with the correct source city ID
    this.bookingForm.patchValue({ fromCity: matchedSource, toCity: null });
    this.cdr.markForCheck();

    // Load destination cities for the new source, then find and set the old "from" as "to"
    this.loadDestinationCities();
    const oldFromName = (from.cityOnly || from.name || '').toLowerCase();

    // Wait for destination cities to load, then match
    const apiParams = this.getApiParams();
    this.cityService.getDestinationCities(apiParams.tripType, apiParams.subTripType, matchedSource.id).subscribe(cities => {
      this.destinationCities = cities;
      const matchedDest = cities.find(
        c => (c.cityOnly || c.name || '').toLowerCase() === oldFromName
      );
      if (matchedDest) {
        this.bookingForm.patchValue({ toCity: matchedDest });
      } else {
        // Fallback: use the original from object (ID might mismatch but name is correct)
        this.bookingForm.patchValue({ toCity: from });
      }
      this.cdr.markForCheck();
    });
  }

  selectTab(tab: any) {
    const prevSubtype = this.getAnalyticsSubtype(this.selectedTab);
    this.selectedTab = tab as TabType;
    this.formSubmitted = false;
    this.showError = false;
    this.extraDestinations = [];
    this.bookingForm.updateValueAndValidity();
    this.loadSourceCities();
    this.loadDestinationCities();
    this.saveSearchState();
    this.cdr.markForCheck();
    this.analytics.trackSwitchTripType(prevSubtype, this.getAnalyticsSubtype(tab));
  }

  /** Open a PrimeNG datepicker from the parent cell click.
   *  Skips if the click landed on the datepicker's own input or a nested
   *  button — PrimeNG handles the input click on its own. Defensive against
   *  a missing picker ref (no-op rather than throwing). */
  openPicker(event: Event, picker: any) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.tagName === 'INPUT' || target.closest('button')) return;
    if (!picker) return;
    if (typeof picker.showOverlay === 'function') {
      try { picker.showOverlay(); } catch { /* no-op */ }
    } else if (typeof picker.show === 'function') {
      try { picker.show(); } catch { /* no-op */ }
    }
  }

  /** Click-anywhere-in-cell handler for autocomplete / select fields.
   *  Autocomplete: focus the inner <input> AND trigger an empty search so the
   *  dropdown panel pops up with values right away (filterCitiesRanked etc.
   *  return the full list when the query is empty).
   *  Select: open the dropdown overlay (no inner input exists).
   *  Ignores clicks on the input itself and on nested buttons (clear X). */
  focusField(event: Event, ref: any): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.tagName === 'INPUT' || target.closest('button')) return;

    const nativeEl: HTMLElement | undefined = ref?.el?.nativeElement;
    if (!nativeEl) return;

    // Autocomplete renders a real <input> inside — prefer focusing that.
    // p-select (no filter) renders no <input>, so we open the overlay instead.
    const input = nativeEl.querySelector('input') as HTMLInputElement | null;
    if (input) {
      input.focus();
      // Some browsers don't move the caret on programmatic focus — nudge it.
      try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* no-op */ }
      // PrimeNG v21 autocomplete: use source='dropdown' so the internal guard
      // (`source === 'input' && query.trim().length === 0`) does NOT drop the
      // empty query. `completeMethod` fires → our filter populates the list.
      // Then call show() so the overlay is visible even if it wasn't already.
      if (typeof ref.search === 'function') {
        try { ref.search(event, '', 'dropdown'); } catch { /* no-op */ }
      }
      if (typeof ref.show === 'function') {
        try { ref.show(); } catch { /* no-op */ }
      }
      return;
    }
    // No inner input → p-select. Open its overlay.
    if (typeof ref.show === 'function') {
      try { ref.show(); } catch { /* no-op */ }
    }
  }

  private getAnalyticsSubtype(tab: any): string {
    switch (tab) {
      case 'ONE_WAY': return 'oneWay';
      case 'ROUND_TRIP': return 'roundTrip';
      case 'LOCAL': return 'local';
      case 'AIRPORT': return 'airport';
      default: return 'unknown';
    }
  }

  showError = false;
  errorMessage = '';

  /**
   * Fixed drop time for Round Trip bookings (9:45 PM on the return date).
   * This is the standard end-of-day cutoff — night charges apply after this.
   */
  getDropTime(): string {
    return '09:45 PM';
  }

  /** Tooltip message for drop time */
  getDropTimeMessage(): string {
    return 'Keep the cab till 9:45 PM at no extra cost. Night charges will apply post that.';
  }

  formSubmitted = false;

  onExploreCabs() {
    this.showError = false;
    this.errorMessage = '';
    this.formSubmitted = true;
    this.cdr.markForCheck();

    const val = this.bookingForm.value;
    const isRoundTrip = this.selectedTab === 'ROUND_TRIP';
    const isAirport = this.selectedTab === 'AIRPORT';
    const isLocal = this.selectedTab === 'LOCAL';
    const tripType = isRoundTrip ? 'Round Trip' : isLocal ? 'Local' : isAirport ? 'Airport' : 'One Way';

    // Resolve city names and IDs from the autocomplete City objects
    const fromCityObj: City | string = val.fromCity;
    const toCityObj: City | string = val.toCity;

    // Validation — every autocomplete must hold a real selected object (City
     // with `id`), not a free-typed string. `isValidCity` checks for that shape;
     // `formSubmitted` must be reset to false on every failure so the red error
     // line renders (`*ngIf="showError && !formSubmitted"` in the template).
    const isValidCity = (c: any) => c && typeof c === 'object' && c.id;
    if (!isAirport && !isValidCity(fromCityObj)) {
      this.formSubmitted = false;
      this.showError = true;
      this.errorMessage = 'Please select the source city from the dropdown suggestions.';
      this.analytics.trackFromCityError(typeof fromCityObj === 'string' ? fromCityObj : '', tripType, 'empty_or_invalid');
      this.analytics.trackExploreButtonError('from_city_empty', tripType, this.getAnalyticsSubtype(this.selectedTab));
      this.cdr.markForCheck();
      return;
    }
    if (!isLocal && !isAirport && !isValidCity(toCityObj)) {
      this.formSubmitted = false;
      this.showError = true;
      this.errorMessage = 'Please select the destination city from the dropdown suggestions.';
      this.analytics.trackToCityError(typeof toCityObj === 'string' ? toCityObj : '', this.getAnalyticsSubtype(this.selectedTab), 'empty_or_invalid');
      this.analytics.trackExploreButtonError('to_city_empty', tripType, this.getAnalyticsSubtype(this.selectedTab));
      this.cdr.markForCheck();
      return;
    }

    // Round Trip extra stops: any stop the user started typing in but didn't
    // pick from the dropdown leaves a non-object in `extraDestinations[i]`
    // (or the old value cleared by `forceSelection` but never repicked).
    // Block explore so we never send half-typed city names to /availability.
    if (isRoundTrip && this.extraDestinations.length > 0) {
      for (let i = 0; i < this.extraDestinations.length; i++) {
        if (!isValidCity(this.extraDestinations[i])) {
          this.formSubmitted = false;
          this.showError = true;
          this.errorMessage = `Please select Stop ${i + 1} from the dropdown suggestions.`;
          this.cdr.markForCheck();
          return;
        }
      }
    }

    // Airport validation: require airport selection + address selection from suggestions.
    // Note: place_id API may return lat:0/lng:0 — airport's own coordinates used as fallback.
    // Live site sends customerLatLong='' for airport, so lat/lng not strictly required.
    if (isAirport) {
      if (!this.selectedAirportCity && !val.airportLocality?.id) {
        this.formSubmitted = false;
        this.showError = true;
        this.errorMessage = 'Please select an airport from the dropdown suggestions.';
        this.cdr.markForCheck();
        return;
      }
      if (!this.selectedPlaceDetails) {
        this.formSubmitted = false;
        this.showError = true;
        this.errorMessage = 'Please select a pickup/drop address from the dropdown suggestions.';
        this.cdr.markForCheck();
        return;
      }
    }

    // Urgent-booking 4-hour gap rule (applies to ALL 4 trip types).
    // Combine the picked date + picked time and ensure it sits at or after
    // "now + URGENT_GAP_HOURS". Auto-correct via updateUrgentGapConstraints
    // should normally prevent this, but a determined user could still bypass
    // it by typing — block here as a safety net.
    if (val.pickupDate instanceof Date && val.pickupTime instanceof Date) {
      const combined = new Date(val.pickupDate);
      combined.setHours(val.pickupTime.getHours(), val.pickupTime.getMinutes(), 0, 0);
      const earliest = this.getEarliestBookableInstant();
      if (combined.getTime() < earliest.getTime()) {
        // Bump the form forward and show a clear message instead of failing silently.
        this.updateUrgentGapConstraints(val.pickupDate);
        this.formSubmitted = false;
        this.showError = true;
        this.errorMessage = `Urgent bookings need at least ${this.URGENT_GAP_HOURS} hours of gap. Pickup time has been adjusted — please review and try again.`;
        return;
      }
    }

    // For airport: derive city from the selected airport entry (source city with isAirport=true)
    const selectedAirport = this.selectedAirportCity;
    const fromCityName = isAirport
      ? (selectedAirport?.name?.split(',').pop()?.trim() || selectedAirport?.name || 'Bangalore, Karnataka')
      : (typeof fromCityObj === 'object' && fromCityObj?.name ? fromCityObj.name : (fromCityObj as string || 'Bangalore'));
    const fromCityId = isAirport
      ? (selectedAirport?.id || 377)
      : (typeof fromCityObj === 'object' && (fromCityObj as City)?.id ? (fromCityObj as City).id : 377);
    const toCityName = typeof toCityObj === 'object' && toCityObj?.name ? toCityObj.name : (toCityObj as string || 'Mysore');
    const toCityId = typeof toCityObj === 'object' && (toCityObj as City)?.id ? (toCityObj as City).id : 237;

    // Resolve whether the destination city also appears in the source cities list.
    // If yes, its source city ID is the same (same Savaari DB). If not (destination-only
    // city like small towns), toCitySourceId stays undefined — locality suggestions
    // won't be shown for the drop address and the user types free text instead.
    const toCitySourceId = this.sourceCities.find(c => c.id === toCityId)?.id;

    // Parse pickupTime to hh:mm AM/PM string
    const timeDate: Date = val.pickupTime instanceof Date ? val.pickupTime : new Date();
    const hours = timeDate.getHours();
    const minutes = timeDate.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const pickupTimeStr = `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;

    const pickupDate: Date = val.pickupDate || new Date();
    const returnDate: Date = val.returnDate || new Date();

    // Get API params from trip type service
    const apiParams = this.tripTypeService.mapUiTabToApiParams(tripType, {
      airportSubType: val.tripType
    });

    // Extract city lat/lng for autocomplete API (SavaariCity.ll = "12.966,77.606")
    const fromCityLL = typeof fromCityObj === 'object' ? (fromCityObj as City)?.ll : undefined;
    const toCityLL = typeof toCityObj === 'object' ? (toCityObj as City)?.ll : undefined;

    // Build and save itinerary
    const itinerary = {
      fromCity: fromCityName,
      fromCityId: fromCityId,
      toCity: toCityName,
      toCityId: toCityId,
      toCitySourceId: toCitySourceId,
      fromCityLL: fromCityLL,
      toCityLL: toCityLL,
      pickupDate: pickupDate,
      pickupTime: pickupTimeStr,
      tripType: tripType,
      subTripType: apiParams.subTripType,
      ...(isRoundTrip && {
        returnDate: returnDate,
        duration: calculateDuration(pickupDate, returnDate),
        // Multi-city intermediate stops (e.g. Bangalore → Mysore → Ooty → Bangalore)
        ...(this.extraDestinations.length > 0 && {
          extraDestinations: this.extraDestinations
            .filter(c => c && typeof c === 'object' && c.id)
            .map(c => ({ cityId: c.id, cityName: c.name, cityOnly: c.cityOnly }))
        })
      }),
      ...(isAirport && {
        airportSubType: val.tripType || 'drop',
        pickupAddress: (typeof val.pickupAddress === 'object' ? (val.pickupAddress?.description || val.pickupAddress?.main_text || val.pickupAddress?.name) : val.pickupAddress) || '',
        dropAirport: selectedAirport?.name || val.dropAirport || '',
        airportName: selectedAirport?.name || this.airportLocalityName || '',
        airportCityId: selectedAirport?.id,
        airportId: selectedAirport?.aid ? Number(selectedAirport.aid) : (this.airportLocalityId || undefined),
        custShortAddress: (typeof val.pickupAddress === 'object' ? (val.pickupAddress?.description || val.pickupAddress?.main_text || val.pickupAddress?.name) : val.pickupAddress) || '',
        // Pass resolved place details for booking page to use
        selectPlaceId: this.selectedPlaceDetails?.place_id || '',
        customerLatLong: (this.selectedPlaceDetails?.lat && this.selectedPlaceDetails?.lng)
          ? `${this.selectedPlaceDetails.lat},${this.selectedPlaceDetails.lng}`
          : (selectedAirport?.ll || ''),
      })
    };

    this.bookingState.setItinerary(itinerary);

    // ── Airport → One Way upfront conversion (confirmed by backend team) ──
    // Compare address city (source_city_map_info.city_id from place_id API) with airport city.
    // If different → user is in a different city from the airport → convert to one-way directly.
    // place_id API always called with request='from', so aliasSourceCityId is reliably populated.
    const addressCityId = this.selectedPlaceDetails?.aliasSourceCityId || this.selectedPlaceDetails?.aliasDestCityId;

    if (!environment.production && isAirport) {
      console.log('[Dashboard] Airport conversion check — direction:', val.tripType,
        '| aliasSourceCityId:', this.selectedPlaceDetails?.aliasSourceCityId,
        '| aliasDestCityId:', this.selectedPlaceDetails?.aliasDestCityId,
        '| resolved addressCityId:', addressCityId,
        '| airportCityId:', selectedAirport?.id || fromCityId);
    }

    if (isAirport && addressCityId) {
      const airportCityId = selectedAirport?.id || fromCityId;

      if (addressCityId !== airportCityId) {
        if (!environment.production) {
          console.log('[Dashboard] Airport city mismatch: address city', addressCityId, '!= airport city', airportCityId, '→ converting to One Way');
        }
        // Determine source/destination based on trip direction
        const isPickupFromAirport = val.tripType === 'pickup';
        const oneWaySource = isPickupFromAirport ? airportCityId : addressCityId;
        const oneWayDest = isPickupFromAirport ? addressCityId : airportCityId;

        // Resolve city names for the conversion
        const addressCityName = this.selectedPlaceDetails?.name || itinerary.custShortAddress || '';
        const airportCityName = selectedAirport?.cityOnly || selectedAirport?.name?.split(',').pop()?.trim() || '';
        const oneWayFromName = isPickupFromAirport ? airportCityName : addressCityName;
        const oneWayToName = isPickupFromAirport ? addressCityName : airportCityName;

        this.isSearching = true;
        this.cdr.markForCheck();
        this.convertAirportToOneWay(itinerary, oneWaySource, pickupDate, pickupTimeStr, oneWayDest, oneWayFromName, oneWayToName);
        return;
      }
    }

    // Build availability request
    // Live site sends empty subTripType for local (package chosen on select-car page)
    const availabilityRequest: AvailabilityRequest = {
      sourceCity: fromCityId,
      tripType: apiParams.tripType,
      subTripType: isLocal ? '' : apiParams.subTripType,
      pickupDateTime: toSavaariDateTime(pickupDate, pickupTimeStr),
      // destinationCity: comma-separated list of ALL destination cities (main TO + extra stops)
      // Beta HAR confirms: "destinationCity=4483,1993" (no separate multicityId param)
      ...((!isLocal && !isAirport) && {
        destinationCity: isRoundTrip && this.extraDestinations.length > 0
          ? [toCityId, ...this.extraDestinations.filter(c => c?.id).map(c => c.id)].join(',')
          : toCityId
      }),
      duration: isRoundTrip ? calculateDuration(pickupDate, returnDate) : 1,
      ...(isAirport && this.airportLocalityId && { localityId: this.airportLocalityId }),
      // Airport-specific params (confirmed by backend team — aid from source-cities API)
      // HAR: selectPlaceId = actual place_id from autocomplete, customerLatLong = "lat,lng" from place_id API
      ...(isAirport && {
        airport_id: selectedAirport?.aid ? Number(selectedAirport.aid) : (this.airportLocalityId || undefined),
        airport_name: selectedAirport?.name || this.airportLocalityName || '',
        terminalId: '',
        selectPlaceId: this.selectedPlaceDetails?.place_id || '',
        custShortAddress: (typeof val.pickupAddress === 'object' ? (val.pickupAddress?.description || val.pickupAddress?.main_text || val.pickupAddress?.name) : val.pickupAddress) || '',
        // Use place details lat/lng if valid, otherwise airport coordinates, otherwise empty (live site sends '')
        customerLatLong: (this.selectedPlaceDetails?.lat && this.selectedPlaceDetails?.lng)
          ? `${this.selectedPlaceDetails.lat},${this.selectedPlaceDetails.lng}`
          : (selectedAirport?.ll || ''),
      }),
    };

    // Show loading, call availability API, then navigate
    this.isSearching = true;
    this.cdr.markForCheck();

    if (isAirport && !environment.production) {
      console.log('[Dashboard] Airport availability request:', JSON.stringify(availabilityRequest, null, 2));
      console.log('[Dashboard] selectedPlaceDetails:', this.selectedPlaceDetails);
      console.log('[Dashboard] selectedAirportCity:', this.selectedAirportCity);
    }

    // For airport fallback: check if address and airport are in the same city
    // Same city = never convert to one-way (confirmed by backend team)
    // Use both aliasSourceCityId and aliasDestCityId — either matching means same city
    const addressCityIdForFallback = this.selectedPlaceDetails?.aliasSourceCityId || this.selectedPlaceDetails?.aliasDestCityId;
    const isSameCityAirport = isAirport && addressCityIdForFallback === fromCityId;

    // Pre-compute city names for potential one-way conversion fallback
    // For "Pickup from Airport": source = airport city, dest = address city
    // For "Drop to Airport": source = address city, dest = airport city
    const addressText = (typeof val.pickupAddress === 'object' ? (val.pickupAddress?.description || val.pickupAddress?.main_text || val.pickupAddress?.name) : val.pickupAddress) || '';
    const rawAddressName = this.selectedPlaceDetails?.name || addressText.split(',')[0]?.trim() || '';
    const rawAirportCityName = selectedAirport?.cityOnly || selectedAirport?.name?.split(',').pop()?.trim() || '';
    const isPickupDirection = val.tripType === 'pickup';
    const fallbackFromName = isPickupDirection ? rawAirportCityName : rawAddressName;
    const fallbackToName = isPickupDirection ? rawAddressName : rawAirportCityName;
    const fallbackDestId = isPickupDirection ? (addressCityIdForFallback || undefined) : undefined;

    this.availabilityService.checkAvailability(availabilityRequest).subscribe({
      next: (response) => {
        if (isAirport && (!response.cars || response.cars.length === 0)) {
          if (isSameCityAirport) {
            // Same city — don't convert, show error
            this.isSearching = false;
            this.formSubmitted = false;
            this.showError = true;
            this.errorMessage = 'Airport cabs not available for this route. Please try a different date or time.';
            this.cdr.markForCheck();
            return;
          }
          // Different city — convert to One Way (HAR-confirmed behavior)
          this.convertAirportToOneWay(itinerary, fromCityId, pickupDate, pickupTimeStr, fallbackDestId, fallbackFromName, fallbackToName);
          return;
        }
        this.bookingState.setAvailabilityResponse(response);
        this.isSearching = false;
        this.cdr.markForCheck();
        // Lifecycle event: agent successfully submitted Explore Cabs — funnel
        // step 1 in the B2B analytics pipeline (backend team spec, April 2026).
        // Field shape mirrors savaari.com select_trip — pickup_city/drop_city,
        // start_date/end_date (DD-MM-YYYY), start_time (24h HH:MM). end_date
        // equals start_date for non-round-trip flows.
        this.analytics.trackSelectTrip({
          trip_type: tripType,
          trip_subtype: this.getAnalyticsSubtype(this.selectedTab),
          pickup_city: fromCityName,
          drop_city: isLocal || isAirport ? '' : toCityName,
          start_date: toSavaariDate(pickupDate),
          end_date: isRoundTrip ? toSavaariDate(returnDate) : toSavaariDate(pickupDate),
          start_time: to24HourTime(pickupTimeStr),
        });
        this.router.navigate(['/select-car']);
      },
      error: (err) => {
        if (isAirport) {
          if (isSameCityAirport) {
            // Same city — don't convert, show error
            this.isSearching = false;
            this.formSubmitted = false;
            this.showError = true;
            this.errorMessage = 'Airport cabs not available for this route. Please try a different date or time.';
            this.cdr.markForCheck();
            return;
          }
          // Different city — convert to One Way (HAR-confirmed behavior)
          this.convertAirportToOneWay(itinerary, fromCityId, pickupDate, pickupTimeStr, fallbackDestId, fallbackFromName, fallbackToName);
          return;
        }
        this.isSearching = false;
        this.formSubmitted = false;
        this.showError = true;
        this.errorMessage = err?.message || 'Failed to fetch cab availability. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Convert an airport booking to One Way.
   *
   * HAR-confirmed: When airport availability fails or returns no cars,
   * the live site retries as outstation/oneWay with:
   *   - sourceCity = airport city ID
   *   - destinationCity = airport's aliased city (from HAR: alias_dest_city_id)
   *   - tripType=outstation, subTripType=oneWay
   * Shows popup: "Based on your pickup and drop details, your trip has been updated to One way service."
   */
  private convertAirportToOneWay(
    originalItinerary: any,
    fallbackFromCityId: number,
    pickupDate: Date,
    pickupTimeStr: string,
    destinationCityId?: number,
    fromCityName?: string,
    toCityName?: string
  ) {
    const selectedAirport = this.selectedAirportCity;
    const destId = destinationCityId || selectedAirport?.id || fallbackFromCityId;

    // Savaari place_id API often returns wrong aliasSourceCityId (e.g., Bhiwandi → 377/Bangalore).
    // Airport city ID (e.g. 114 for Mumbai in airport list) is NOT the same as outstation city ID.
    // Both from/to cities must be resolved from source/destination cities APIs.
    const custShortAddr = originalItinerary.custShortAddress || '';

    /** Helper: find city by name from a list, trying multiple candidate tokens. Returns { id, displayName }. */
    const resolveCity = (
      cityList: City[],
      cityName: string | undefined,
      fallbackId: number,
      fallbackName: string,
      label: string,
      preferAirport = false
    ): { id: number; displayName: string } => {
      if (!cityName || !cityList.length) return { id: fallbackId, displayName: fallbackName };
      const candidates = [
        cityName,
        cityName.split(',')[0]?.trim(),
      ].filter(Boolean).map(s => s!.toLowerCase());

      let matched: City | undefined;

      for (const candidate of candidates) {
        if (!candidate) continue;
        const matches = cityList.filter(c => {
          const co = c.cityOnly?.toLowerCase() || '';
          const cn = c.name.toLowerCase();
          return co === candidate || cn.startsWith(candidate) || candidate.startsWith(co) || cn === candidate;
        });
        if (matches.length) {
          if (preferAirport) {
            // Prefer "Mumbai (Bombay Airport)" format over "Mumbai Airport" — match beta
            matched = matches.find(c => c.name.toLowerCase().includes('(') && c.name.toLowerCase().includes('airport'))
              ?? matches.find(c => c.name.toLowerCase().includes('airport'))
              ?? matches[0];
          } else {
            matched = matches[0];
          }
          break;
        }
      }

      if (matched) {
        // Use cityOnly for short display (e.g. "Bhiwandi" or "Mumbai (Bombay Airport)")
        const displayName = matched.cityOnly || matched.name.split(',')[0].trim();
        if (!environment.production) console.log(`[Dashboard] ${label} resolved:`, matched.name, '→ display:', displayName, '(id:', matched.id, ')');
        return { id: matched.id, displayName };
      }
      if (!environment.production) console.warn(`[Dashboard] ${label} NOT resolved, using fallback:`, fallbackId, '| tried:', candidates);
      return { id: fallbackId, displayName: fallbackName };
    };

    // Step 1: get source cities → resolve fromCityId
    // Step 2: get destination cities for that source → resolve toCityId
    // Step 3: call availability API
    this.cityService.getSourceCities('outstation', 'oneWay').pipe(
      switchMap(sourceCities => {
        if (!environment.production) {
          console.log('[Dashboard] convertAirportToOneWay — fromCityName:', fromCityName,
            '| toCityName:', toCityName,
            '| custShortAddress:', custShortAddr,
            '| fallbackFromId:', fallbackFromCityId, '| fallbackDestId:', destId,
            '| source cities:', sourceCities.length);
        }

        // Resolve source city (address side, e.g. Bhiwandi)
        // Try place_name first; fallback to first token of custShortAddress (e.g. "Bhiwandi" from "Bhiwandi, Maharashtra, India")
        const fromNameHint = fromCityName || custShortAddr.split(',')[0]?.trim() || '';
        const resolvedFrom = resolveCity(sourceCities, fromNameHint, fallbackFromCityId, fromCityName || '', 'fromCity', false);

        // Now get destination cities for this source city
        return this.cityService.getDestinationCities('outstation', 'oneWay', resolvedFrom.id).pipe(
          switchMap(destCities => {
            // Resolve destination city — prefer airport-named entry (e.g. "Mumbai (Bombay Airport)")
            const resolvedTo = resolveCity(destCities, toCityName, destId, toCityName || '', 'toCity', true);

            if (!environment.production) {
              console.log('[Dashboard] Final one-way request: sourceCity:', resolvedFrom.id, resolvedFrom.displayName, '→ destCity:', resolvedTo.id, resolvedTo.displayName);
            }

            const oneWayRequest: AvailabilityRequest = {
              sourceCity: resolvedFrom.id,
              tripType: 'outstation',
              subTripType: 'oneWay',
              destinationCity: resolvedTo.id,
              pickupDateTime: toSavaariDateTime(pickupDate, pickupTimeStr),
              duration: 1,
            };

            return this.availabilityService.checkAvailability(oneWayRequest).pipe(
              switchMap(response => of({ response, resolvedFrom, resolvedTo }))
            );
          })
        );
      })
    ).subscribe({
      next: ({ response, resolvedFrom, resolvedTo }) => {
        if (!response.cars || response.cars.length === 0) {
          this.isSearching = false;
          this.formSubmitted = false;
          this.showError = true;
          this.errorMessage = 'No cabs available for this route. Please try a different date or city.';
          this.cdr.markForCheck();
          return;
        }

        // Update itinerary to reflect One Way conversion
        // Use cityOnly display names so select-car shows "Bhiwandi / Mumbai (Bombay Airport)"
        const convertedItinerary = {
          ...originalItinerary,
          tripType: 'One Way',
          subTripType: 'oneWay',
          fromCity: resolvedFrom.displayName || fromCityName || originalItinerary.fromCity,
          fromCityId: resolvedFrom.id,
          toCity: resolvedTo.displayName || toCityName || originalItinerary.toCity,
          toCityId: resolvedTo.id,
          airportConvertedToOneWay: true,
          aliasDestCityId: resolvedTo.id,
        };

        this.bookingState.setItinerary(convertedItinerary);
        this.bookingState.setAvailabilityResponse(response);

        this.isSearching = false;
        this.showConversionPopup = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isSearching = false;
        this.formSubmitted = false;
        this.showError = true;
        this.errorMessage = 'No cabs available for this route. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  /** Clear airport pickup address field + resolved place details */
  clearPickupAddress() {
    this.bookingForm.get('pickupAddress')?.reset();
    this.selectedPlaceDetails = null;
    this.cdr.markForCheck();
  }

  /** Clear airport selection + related state */
  clearAirportField() {
    this.bookingForm.get('airportLocality')?.reset();
    this.selectedAirportCity = null;
    this.airportLocalityId = null;
    this.airportLocalityName = '';
    this.cdr.markForCheck();
  }

  /** User clicks OK on the conversion popup → navigate to select-car */
  onConversionPopupOk() {
    this.showConversionPopup = false;
    this.cdr.markForCheck();
    // Lifecycle event: airport request got auto-converted to a One Way trip
    // by the backend. Still counts as a successful trip selection for the
    // B2B analytics funnel (backend team spec, April 2026).
    //
    // Airport-converted-to-OneWay never has a return date, so end_date mirrors
    // start_date. pickupDate may be a Date or a stringified Date depending on
    // how the itinerary was hydrated — normalise defensively before formatting.
    const converted = this.bookingState.getItinerary();
    if (converted) {
      const rawDate: any = converted.pickupDate;
      const pickupDateObj: Date = rawDate instanceof Date
        ? rawDate
        : (rawDate ? new Date(rawDate) : new Date());
      const startDate = isNaN(pickupDateObj.getTime()) ? '' : toSavaariDate(pickupDateObj);
      this.analytics.trackSelectTrip({
        trip_type: converted.tripType || 'One Way',
        trip_subtype: converted.subTripType || 'oneway',
        pickup_city: converted.fromCity || '',
        drop_city: converted.toCity || '',
        start_date: startDate,
        end_date: startDate, // airport conversion is always one-way
        start_time: converted.pickupTime ? to24HourTime(converted.pickupTime) : '',
      });
    }
    this.router.navigate(['/select-car']);
  }

  /** CSS classes for booking status badges */
  getStatusClasses(status: string): Record<string, boolean> {
    const s = (status || '').toLowerCase();
    return {
      'text-emerald-600 dark:text-emerald-400': s === 'completed' || s === 'billed',
      'text-sky-600 dark:text-sky-400': s === 'upcoming' || s === 'confirmed' || s === 'assigned',
      'text-amber-600 dark:text-amber-400': s === 'in progress' || s === 'in_progress',
      'text-red-500 dark:text-red-400': s === 'cancel' || s === 'cancelled' || s === 'canceled',
      'text-slate-500 dark:text-slate-400': !['completed','billed','upcoming','confirmed','assigned','in progress','in_progress','cancel','cancelled','canceled'].includes(s),
    };
  }

  /** Display label for booking status — maps API values to user-friendly labels */
  getStatusLabel(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'billed') return 'Completed';
    if (s === 'cancel' || s === 'canceled') return 'Cancelled';
    if (s === 'in_progress') return 'In Progress';
    return status || '';
  }
}
