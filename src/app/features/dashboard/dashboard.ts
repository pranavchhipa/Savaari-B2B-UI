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
import { toSavaariDateTime, calculateDuration } from '../../core/utils/date-format.util';
import { BannerService, BannerImage } from '../../core/services/banner.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { LocalityService, Locality } from '../../core/services/locality.service';
import { AddressAutocompleteService, AddressSuggestion } from '../../core/services/address-autocomplete.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

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

  // Loading state for Explore Cabs button
  isSearching = false;

  // Round Trip multi-city destinations (max 12)
  extraDestinations: City[] = [];
  readonly MAX_DESTINATIONS = 12;

  addDestinationCity() {
    if (this.extraDestinations.length >= this.MAX_DESTINATIONS - 1) return;

    // Don't add if main TO city isn't filled yet
    const toCity = this.bookingForm.get('toCity')?.value;
    if (!toCity || typeof toCity !== 'object' || !toCity.id) return;

    // Don't add if the last extra destination isn't filled yet
    if (this.extraDestinations.length > 0) {
      const last = this.extraDestinations[this.extraDestinations.length - 1];
      if (!last || typeof last !== 'object' || !last.id) return;
    }

    this.extraDestinations.push(null as any);
    this.cdr.markForCheck();
  }

  removeDestinationCity(index: number) {
    this.extraDestinations.splice(index, 1);
    this.cdr.markForCheck();
  }

  onExtraDestinationSelect(event: any, index: number) {
    const city: City = event.value || event;
    this.extraDestinations[index] = city;
  }

  filterExtraDestCities(event: AutoCompleteCompleteEvent) {
    this.filteredDestinationCities = this.filterCitiesRanked(this.destinationCities, event.query);
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
      this.filteredLocalities = suggestions;
      this.cdr.markForCheck();
    });
  }

  /** When user selects an address from autocomplete → call 2nd API (place_id) to get lat/lng + city IDs */
  onAddressSelect(event: any) {
    const suggestion: AddressSuggestion = event.value || event;
    if (!suggestion?.place_id) return;

    const request = this.bookingForm.get('tripType')?.value === 'pickup' ? 'to' : 'from';
    this.addressAutocomplete.getPlaceDetails(suggestion.place_id, request).subscribe(details => {
      if (details) {
        this.selectedPlaceDetails = {
          lat: details.lat,
          lng: details.lng,
          name: details.name,
          place_id: details.place_id,
          aliasSourceCityId: details.aliasSourceCityId,
          aliasDestCityId: details.aliasDestCityId,
        };
        if (!environment.production) {
          console.log('[Dashboard] Place details resolved:', details.name, 'sourceCity:', details.aliasSourceCityId, 'destCity:', details.aliasDestCityId);
        }
      }
      this.cdr.markForCheck();
    });
  }

  /** Search airports from GET /airport-list (CityService.getAirportList). */
  filterAirports(event: AutoCompleteCompleteEvent) {
    const q = (event.query || '').toLowerCase();
    const airports = this.airportList;
    if (!q) {
      this.filteredAirports = airports.slice(0, 20);
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
      this.filteredAirports = [...prefix, ...substring].slice(0, 20);
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

  /** Minimum selectable pickup date (today) */
  minPickupDate: Date = new Date();

  /** Minimum selectable return date (pickup date + 1 day) */
  minReturnDate: Date = new Date();

  private readonly SEARCH_STATE_KEY = 'b2b_search_state';

  ngOnInit() {
    this.initForm();
    this.restoreSearchState();

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

        // Cast to any[] for flexible property access (API uses snake_case)
        const all = bookings as any[];

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
      tripType: [null],
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

    // Watch pickupDate changes to auto-adjust return date + track analytics
    this.bookingForm.get('pickupDate')?.valueChanges.subscribe((newPickupDate: Date) => {
      if (newPickupDate) {
        this.updateMinReturnDate(newPickupDate);
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
      if (state.pickupAddress) this.bookingForm.patchValue({ pickupAddress: state.pickupAddress }, { emitEvent: false });
      if (state.dropAirport) this.bookingForm.patchValue({ dropAirport: state.dropAirport }, { emitEvent: false });
      if (state.airportLocality) this.bookingForm.patchValue({ airportLocality: state.airportLocality }, { emitEvent: false });
      if (state.airportCity) this.bookingForm.patchValue({ airportCity: state.airportCity }, { emitEvent: false });
      if (state.pickupDate) this.bookingForm.patchValue({ pickupDate: new Date(state.pickupDate) }, { emitEvent: false });
      if (state.returnDate) this.bookingForm.patchValue({ returnDate: new Date(state.returnDate) }, { emitEvent: false });
      if (state.pickupTime) this.bookingForm.patchValue({ pickupTime: new Date(state.pickupTime) }, { emitEvent: false });

      // Restore airport state
      if (state.selectedAirportCity) this.selectedAirportCity = state.selectedAirportCity;
      if (state.airportLocalityId) this.airportLocalityId = state.airportLocalityId;
      if (state.airportLocalityName) this.airportLocalityName = state.airportLocalityName;

      // Restore extra destinations
      if (state.extraDestinations?.length) this.extraDestinations = state.extraDestinations;

      // Load destination cities if source city was already selected
      if (state.fromCity?.id) {
        const apiParams = this.tripTypeService.mapUiTabToApiParams(this.selectedTab, {});
        this.cityService.getDestinationCities(apiParams.tripType, apiParams.subTripType, state.fromCity.id).subscribe(cities => {
          this.destinationCities = cities;
          this.cdr.markForCheck();
        });
      }

      this.cdr.markForCheck();
    } catch { /* ignore corrupt data */ }
  }

  /** Update minReturnDate and auto-adjust returnDate if it's now invalid */
  private updateMinReturnDate(pickupDate: Date) {
    const nextDay = new Date(pickupDate);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);
    this.minReturnDate = nextDay;

    // If current return date is on the same day or before, push it forward
    const currentReturn = this.bookingForm.get('returnDate')?.value;
    if (currentReturn) {
      const returnNormalized = new Date(currentReturn);
      returnNormalized.setHours(0, 0, 0, 0);
      const pickupNormalized = new Date(pickupDate);
      pickupNormalized.setHours(0, 0, 0, 0);
      if (returnNormalized <= pickupNormalized) {
        this.bookingForm.get('returnDate')?.setValue(new Date(nextDay));
      }
    }
    this.cdr.markForCheck();
  }

  /** Load source cities from CityService */
  private loadSourceCities() {
    const apiParams = this.getApiParams();
    this.cityService.getSourceCities(apiParams.tripType, apiParams.subTripType).subscribe({
      next: (cities) => {
        this.sourceCities = cities;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load source cities:', err);
        this.sourceCities = [];
        this.cdr.markForCheck();
      }
    });
  }

  /** Load airport list from CityService */
  private loadAirportList() { 
    this.cityService.getAirportList().subscribe({
      next: (cities) => {
        this.airportList = cities;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load airport list:', err);
        this.airportList = [];
        this.cdr.markForCheck();
      }
    });
  }
  

  /** Load destination cities based on selected source city */
  private loadDestinationCities() {
    const apiParams = this.getApiParams();
    this.cityService.getDestinationCities(apiParams.tripType, apiParams.subTripType, 377).subscribe({
      next: (cities) => {
        this.destinationCities = cities;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load destination cities:', err);
        this.destinationCities = [];
        this.cdr.markForCheck();
      }
    });
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

  /** PrimeNG AutoComplete: filter source cities (prefix matches first) */
  filterSourceCities(event: AutoCompleteCompleteEvent) {
    this.filteredSourceCities = this.filterCitiesRanked(this.sourceCities, event.query);
  }

  /** PrimeNG AutoComplete: filter destination cities (prefix matches first) */
  filterDestinationCities(event: AutoCompleteCompleteEvent) {
    this.filteredDestinationCities = this.filterCitiesRanked(this.destinationCities, event.query);
  }

  /** Filter cities: prefix matches on cityOnly first, then substring matches */
  private filterCitiesRanked(cities: City[], query: string): City[] {
    const q = (query || '').toLowerCase();
    if (!q) return cities;
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
    return [...prefix, ...substring];
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

    // Validation — airport tab uses free-text fields, skip city autocomplete checks
    const isValidCity = (c: any) => c && typeof c === 'object' && c.id;
    if (!isAirport && !isValidCity(fromCityObj)) {
      this.showError = true;
      this.errorMessage = 'Please select the source city.';
      this.analytics.trackFromCityError(typeof fromCityObj === 'string' ? fromCityObj : '', tripType, 'empty_or_invalid');
      this.analytics.trackExploreButtonError('from_city_empty', tripType, this.getAnalyticsSubtype(this.selectedTab));
      return;
    }
    if (!isLocal && !isAirport && !isValidCity(toCityObj)) {
      this.showError = true;
      this.errorMessage = 'Please select valid destination city';
      this.analytics.trackToCityError(typeof toCityObj === 'string' ? toCityObj : '', this.getAnalyticsSubtype(this.selectedTab), 'empty_or_invalid');
      this.analytics.trackExploreButtonError('to_city_empty', tripType, this.getAnalyticsSubtype(this.selectedTab));
      return;
    }

    // Airport validation: require airport selection
    if (isAirport) {
      if (!this.selectedAirportCity && !val.airportLocality?.id) {
        this.showError = true;
        this.errorMessage = 'Please select an airport.';
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
        customerLatLong: this.selectedPlaceDetails ? `${this.selectedPlaceDetails.lat},${this.selectedPlaceDetails.lng}` : '',
      })
    };

    this.bookingState.setItinerary(itinerary);

    // ── Airport → One Way upfront conversion (confirmed by Shubhendu) ──
    // Compare address city (source_city_info.city_id from place_id API) with airport city.
    // If different → user is in a different city from the airport → convert to one-way directly.
    if (isAirport && this.selectedPlaceDetails?.aliasSourceCityId) {
      const addressCityId = this.selectedPlaceDetails.aliasSourceCityId;
      const airportCityId = selectedAirport?.id || fromCityId;

      if (addressCityId !== airportCityId) {
        if (!environment.production) {
          console.log('[Dashboard] Airport city mismatch: address city', addressCityId, '!= airport city', airportCityId, '→ converting to One Way');
        }
        // Determine source/destination based on trip direction
        const isPickupFromAirport = val.tripType === 'pickup';
        const oneWaySource = isPickupFromAirport ? airportCityId : addressCityId;
        const oneWayDest = isPickupFromAirport ? addressCityId : airportCityId;

        this.isSearching = true;
        this.cdr.markForCheck();
        this.convertAirportToOneWay(itinerary, oneWaySource, pickupDate, pickupTimeStr, oneWayDest);
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
      ...((!isLocal && !isAirport) && { destinationCity: toCityId }),
      // Multicity intermediate stops for round trip (e.g. Bangalore → Mysore → Ooty)
      ...(isRoundTrip && this.extraDestinations.length > 0 && {
        multicityId: this.extraDestinations
          .filter(c => c && typeof c === 'object' && c.id)
          .map(c => c.id)
          .join(',')
      }),
      duration: isRoundTrip ? calculateDuration(pickupDate, returnDate) : 1,
      ...(isAirport && this.airportLocalityId && { localityId: this.airportLocalityId }),
      // Airport-specific params (confirmed by Shubhendu — aid from source-cities API)
      // HAR: selectPlaceId = actual place_id from autocomplete, customerLatLong = "lat,lng" from place_id API
      ...(isAirport && {
        airport_id: selectedAirport?.aid ? Number(selectedAirport.aid) : (this.airportLocalityId || undefined),
        airport_name: selectedAirport?.name || this.airportLocalityName || '',
        terminalId: '',
        selectPlaceId: this.selectedPlaceDetails?.place_id || '',
        custShortAddress: (typeof val.pickupAddress === 'object' ? (val.pickupAddress?.description || val.pickupAddress?.main_text || val.pickupAddress?.name) : val.pickupAddress) || '',
        customerLatLong: this.selectedPlaceDetails ? `${this.selectedPlaceDetails.lat},${this.selectedPlaceDetails.lng}` : '',
      }),
    };

    // Show loading, call availability API, then navigate
    this.isSearching = true;
    this.cdr.markForCheck();

    this.availabilityService.checkAvailability(availabilityRequest).subscribe({
      next: (response) => {
        if (isAirport && (!response.cars || response.cars.length === 0)) {
          // Airport returned no cars → convert to One Way (HAR-confirmed behavior)
          this.convertAirportToOneWay(itinerary, fromCityId, pickupDate, pickupTimeStr);
          return;
        }
        this.bookingState.setAvailabilityResponse(response);
        this.isSearching = false;
        this.cdr.markForCheck();
        this.router.navigate(['/select-car']);
      },
      error: (err) => {
        if (isAirport) {
          // Airport availability failed → convert to One Way (HAR-confirmed behavior)
          this.convertAirportToOneWay(itinerary, fromCityId, pickupDate, pickupTimeStr);
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
    fromCityId: number,
    pickupDate: Date,
    pickupTimeStr: string,
    destinationCityId?: number
  ) {
    const selectedAirport = this.selectedAirportCity;
    const destId = destinationCityId || selectedAirport?.id || fromCityId;

    // Build One Way availability request
    const oneWayRequest: AvailabilityRequest = {
      sourceCity: fromCityId,
      tripType: 'outstation',
      subTripType: 'oneWay',
      destinationCity: destId,
      pickupDateTime: toSavaariDateTime(pickupDate, pickupTimeStr),
      duration: 1,
    };

    this.availabilityService.checkAvailability(oneWayRequest).subscribe({
      next: (response) => {
        if (!response.cars || response.cars.length === 0) {
          this.isSearching = false;
          this.formSubmitted = false;
          this.showError = true;
          this.errorMessage = 'No cabs available for this route. Please try a different date or city.';
          this.cdr.markForCheck();
          return;
        }

        // Update itinerary to reflect One Way conversion
        const convertedItinerary = {
          ...originalItinerary,
          tripType: 'One Way',
          subTripType: 'oneWay',
          toCityId: destId,
          fromCityId: fromCityId,
          airportConvertedToOneWay: true,
          aliasDestCityId: destId,
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

  /** User clicks OK on the conversion popup → navigate to select-car */
  onConversionPopupOk() {
    this.showConversionPopup = false;
    this.cdr.markForCheck();
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
