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

  /** One-way conversion popup for airport bookings */
  showConversionPopup = false;

  /** Locality suggestions for airport pickup/drop address */
  filteredLocalities: Locality[] = [];

  /** Filter localities for the pickup/drop address autocomplete (airport tab) */
  filterLocalities(event: AutoCompleteCompleteEvent) {
    const q = event.query || '';
    const cityId = this.selectedAirportCity?.id;
    if (!cityId || q.length < 2) {
      this.filteredLocalities = [];
      this.cdr.markForCheck();
      return;
    }
    this.localityService.searchLocalities(cityId, q, 20).subscribe(localities => {
      this.filteredLocalities = localities;
      this.cdr.markForCheck();
    });
  }

  /** Search airports when user types in the airport autocomplete.
   *  Source cities already contain airport entries (isAirport: true) with
   *  names like "Kempegowda International Airport, Bangalore" or "Mumbai Airport, Mumbai".
   *  Searching "Mumbai" shows all Mumbai airports; searching "CSMT" shows that terminal.
   */
  filterAirports(event: AutoCompleteCompleteEvent) {
    const q = (event.query || '').toLowerCase();
    const airportCities = this.sourceCities.filter(c => c.isAirport);
    if (!q) {
      this.filteredAirports = airportCities.slice(0, 20);
    } else {
      // Prefix matches first, then substring
      const prefix: City[] = [];
      const substring: City[] = [];
      for (const c of airportCities) {
        const name = c.name.toLowerCase();
        const cityOnly = (c.cityOnly || '').toLowerCase();
        if (cityOnly.startsWith(q) || name.startsWith(q)) {
          prefix.push(c);
        } else if (name.includes(q) || cityOnly.includes(q)) {
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
    // Load localities for this city and find the airport locality ID
    if (city?.id) {
      this.localityService.getAirports(city.id).subscribe(airports => {
        if (airports.length > 0) {
          this.airportLocalityId = airports[0].id;
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
        this.loadBanners();
        this.loadDashboardStats();
        this.cdr.markForCheck();
      },
      error: () => {
        // Even if token refresh fails, try loading with existing token
        this.loadSourceCities();
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

  /** Load destination cities based on selected source city */
  private loadDestinationCities(sourceCityId: number) {
    const apiParams = this.getApiParams();
    this.cityService.getDestinationCities(apiParams.tripType, apiParams.subTripType, sourceCityId).subscribe({
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
      this.loadDestinationCities(city.id);
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
    this.bookingForm.patchValue({ fromCity: to, toCity: from });
    if (to?.id) {
      this.loadDestinationCities(to.id);
    }
    this.cdr.markForCheck();
  }

  selectTab(tab: any) {
    const prevSubtype = this.getAnalyticsSubtype(this.selectedTab);
    this.selectedTab = tab as TabType;
    this.formSubmitted = false;
    this.showError = false;
    this.extraDestinations = [];
    this.bookingForm.updateValueAndValidity();
    this.loadSourceCities();
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

    // Build and save itinerary
    const itinerary = {
      fromCity: fromCityName,
      fromCityId: fromCityId,
      toCity: toCityName,
      toCityId: toCityId,
      toCitySourceId: toCitySourceId,
      pickupDate: pickupDate,
      pickupTime: pickupTimeStr,
      tripType: tripType,
      subTripType: apiParams.subTripType,
      ...(isRoundTrip && {
        returnDate: returnDate,
        duration: calculateDuration(pickupDate, returnDate)
      }),
      ...(isAirport && {
        airportSubType: val.tripType || 'drop',
        pickupAddress: val.pickupAddress || '',
        dropAirport: selectedAirport?.name || val.dropAirport || '',
        airportName: selectedAirport?.cityOnly || selectedAirport?.name || '',
        airportCityId: selectedAirport?.id,
      })
    };

    this.bookingState.setItinerary(itinerary);

    // Build availability request
    // Live site sends empty subTripType for local (package chosen on select-car page)
    const availabilityRequest: AvailabilityRequest = {
      sourceCity: fromCityId,
      tripType: apiParams.tripType,
      subTripType: isLocal ? '' : apiParams.subTripType,
      pickupDateTime: toSavaariDateTime(pickupDate, pickupTimeStr),
      ...((!isLocal && !isAirport) && { destinationCity: toCityId }),
      duration: isRoundTrip ? calculateDuration(pickupDate, returnDate) : 1,
      ...(isAirport && this.airportLocalityId && { localityId: this.airportLocalityId }),
    };

    // Show loading, call availability API, then navigate
    this.isSearching = true;
    this.cdr.markForCheck();

    this.availabilityService.checkAvailability(availabilityRequest).subscribe({
      next: (response) => {
        this.bookingState.setAvailabilityResponse(response);
        this.isSearching = false;
        this.cdr.markForCheck();
        this.router.navigate(['/select-car']);
      },
      error: (err) => {
        this.isSearching = false;
        this.formSubmitted = false;
        this.showError = true;
        this.errorMessage = isAirport
          ? 'Airport cab service is temporarily unavailable. This may be a server issue — please try again later.'
          : (err?.message || 'Failed to fetch cab availability. Please try again.');
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Convert a failed airport booking to One Way.
   * Fetches availability with One Way params and shows a conversion popup.
   */
  /** User clicks OK on the conversion popup → close popup */
  onConversionPopupOk() {
    this.showConversionPopup = false;
    this.cdr.markForCheck();
  }

  /** CSS classes for booking status badges */
  getStatusClasses(status: string): Record<string, boolean> {
    const s = (status || '').toLowerCase();
    return {
      'bg-emerald-100 text-emerald-700': s === 'completed' || s === 'billed',
      'bg-sky-100 text-sky-700': s === 'upcoming' || s === 'confirmed' || s === 'assigned',
      'bg-amber-100 text-amber-700': s === 'in progress' || s === 'in_progress',
      'bg-red-100 text-red-600': s === 'cancel' || s === 'cancelled' || s === 'canceled',
      'bg-slate-100 text-slate-600': !['completed','billed','upcoming','confirmed','assigned','in progress','in_progress','cancel','cancelled','canceled'].includes(s),
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
