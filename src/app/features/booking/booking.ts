import { Component, OnInit, OnDestroy, AfterViewChecked, inject, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { AuthService } from '../../core/services/auth.service';
import { BookingStateService, Itinerary, SelectedCar } from '../../core/services/booking-state.service';
import { BookingApiService } from '../../core/services/booking-api.service';
import { BookingRegistryService } from '../../core/services/booking-registry.service';
import { TripTypeService } from '../../core/services/trip-type.service';
import { WalletService } from '../../core/services/wallet.service';
import { PaymentService } from '../../core/services/payment.service';
import { CommissionService } from '../../core/services/commission.service';
import { CountryCodeService, CountryCodeEntry } from '../../core/services/country-code.service';
import { LocalityService } from '../../core/services/locality.service';
import { AddressAutocompleteService, AddressSuggestion } from '../../core/services/address-autocomplete.service';
import { CityService } from '../../core/services/city.service';
// AvailabilityService removed — fare recalculation is now client-side (Haversine distance)
import { CreateBookingRequest } from '../../core/models';
import { toSavaariDateTime, calculateDuration } from '../../core/utils/date-format.util';
import { decodeGSTIN, GSTINDecodeResult } from '../../core/utils/gstin-decoder';
import { Observable } from 'rxjs';
import { FooterComponent } from '../../components/layout/footer/footer';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, FormsModule, AutoCompleteModule, FooterComponent],

  templateUrl: './booking.html',
  styleUrl: './booking.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingComponent implements OnInit, OnDestroy, AfterViewChecked {
  public router = inject(Router);
  private location = inject(Location);
  private auth = inject(AuthService);
  private bookingState = inject(BookingStateService);
  private bookingApi = inject(BookingApiService);
  private bookingRegistry = inject(BookingRegistryService);
  private tripTypeService = inject(TripTypeService);
  private countryCodeService = inject(CountryCodeService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  Math = Math; // expose for template
  itinerary: Itinerary | null = null;
  selectedCar: SelectedCar | null = null;

  // Form Fields
  guestName: string = '';
  guestEmail: string = '';
  agentEmail: string = '';
  pickupAddress: string = '';
  dropAddress: string = '';
  phone: string = '';
  landmark: string = '';
  selectedCountryCode: CountryCodeEntry | null = null;
  countryCodes: CountryCodeEntry[] = [];
  countryDropdownOpen = false;
  countrySearch = '';

  step1Complete = false;
  showRazorpayModal = false;
  showVASModal = false;

  // VAS Selections
  vasLuggageCarrier = false;
  vasLanguageDriver = false;

  // 0 = no selection, 1/2/3 = B2B payment choices
  paymentOption = 0;

  // Payment method: wallet deduction or direct Razorpay
  paymentMethod: 'wallet' | 'razorpay' = 'wallet';
  isProcessingRazorpay = false;
  razorpayProcessingStage: 'payment' | 'booking' = 'payment'; // For showing different messages
  isCreatingBooking = false;  // Loading state for "Proceed to Next" button

  // Info tooltip toggle (0 = none, 1/2/3 = which payment option's info is shown)
  showInfo: number = 0;

  // --- Option 1: Flexible Agent Payment Slider ---
  option1SliderPercent: number = 25;   // Agent-chosen percentage (25% to 100%)
  readonly SLIDER_MIN = 25;
  readonly SLIDER_MAX = 100;
  readonly SLIDER_STEP = 5;            // 5% increments for clean amounts

  isProcessingWallet = false;
  bookingConfirmed = false;
  bookingId = '';

  // GST Invoice
  needsGstInvoice = false;
  agentGstNumber = '';
  gstDecoded: GSTINDecodeResult | null = null;
  gstManualEntry = false;       // true when agent has no GST in profile

  // Error display
  bookingError = '';
  formSubmitAttempted = false;

  // Wallet top-up modal
  topUpAmount: number = 0;
  isProcessingTopUp = false;
  topUpSuccess = false;
  topUpPresets = [5000, 10000, 25000, 50000];
  showTopUpConfirm = false;
  showTopUpModal = false;
  showWalletConfirm = false;

  // Stored from advance_payment_check (fired on page load)
  private advancePercent = 25; // from advance_payment_check response

  // Stored from booking create response (fired on "Proceed to Next")
  private advanceAmount = 0;     // from paymentOptions[*].parameters.amount25per
  private encodedAmount = '';    // from paymentOptions[*].parametersEncoded.amount25perEncoded
  private savaariPayId = '';     // from data.order_id

  // From place_id API responses — used in booking create
  private pickupPlaceName = '';        // place_name → locality
  private pickupAliasSourceCityId = 0; // source_city_map_info.city_id → alias_source_city_id
  private dropPlaceName = '';          // place_name for drop
  private dropSublocality = '';        // sublocality → dropLocality
  private dropAliasDestCityId = 0;     // destination_city_map_info.city_id → alias_dest_city_id

  // Fare recalculation (One Way drop address)
  showFareChangePopup = false;
  fareChangeAmount = 0;
  previousFare = 0;
  isRecalculatingFare = false;
  private dropAddressProcessed = '';

  walletBalance$!: Observable<number>;
  private walletService = inject(WalletService);
  private paymentService = inject(PaymentService);
  private commissionService = inject(CommissionService);
  private localityService = inject(LocalityService);
  // availabilityService removed — fare recalc is now client-side
  private addressAutocomplete = inject(AddressAutocompleteService);
  private cityService = inject(CityService);

  // Confetti canvas
  @ViewChild('confettiCanvas') confettiCanvas!: ElementRef<HTMLCanvasElement>;
  private confettiFired = false;

  // Browser back button interception
  private locationSub: any;

  // Session storage key for passenger details
  private readonly PASSENGER_STATE_KEY = 'b2b_passenger_state';

  // Address autocomplete suggestions (localities API — matches live beta site)
  pickupSuggestions: string[] = [];
  dropSuggestions: string[] = [];

  // Full locality objects (kept to look up locality ID when user selects)
  private pickupSuggestionsRaw: AddressSuggestion[] = [];
  private dropSuggestionsRaw: AddressSuggestion[] = [];

  // Lat/lng resolved from place_id API (2nd API) after address selection
  private pickupLatLng: { lat: number; lng: number } | null = null;
  private dropLatLng: { lat: number; lng: number } | null = null;

  // City-level lat/lng for autocomplete API (from SavaariCity.ll via city service cache)
  private fromCityLat = '';
  private fromCityLng = '';
  private toCityLat = '';
  private toCityLng = '';

  ngOnInit() {
    this.walletBalance$ = this.walletService.balance$;
    this.agentEmail = this.auth.getUserEmail();

    // Load country codes for phone number dropdown
    this.countryCodeService.getCountryCodes().subscribe(codes => {
      this.countryCodes = codes;
      // Default to India
      this.selectedCountryCode = codes.find(c => c.isdCode === '91') || codes[0] || null;
      this.cdr.markForCheck();
    });

    // GST: auto-apply if agent has GST in profile
    const profileGst = this.auth.getGstNumber();
    if (profileGst) {
      this.agentGstNumber = profileGst;
      this.gstDecoded = decodeGSTIN(profileGst);
      this.needsGstInvoice = true; // Per Shivam: auto-tick if GST filled
      this.gstManualEntry = false;
    }

    // Initial sync
    this.itinerary = this.bookingState.getItinerary();
    this.selectedCar = this.bookingState.getSelectedCar();

    // Resolve city lat/lng for autocomplete API — fetch source cities to get ll field
    this.fetchCityLatLng();

    // Pre-fetch localities (live site also fires this on page load)
    if (this.itinerary?.fromCityId) {
      this.localityService.getLocalities(this.itinerary.fromCityId).subscribe();
    }
    const dropCityId = this.itinerary?.toCitySourceId || this.itinerary?.toCityId;
    if (dropCityId) {
      this.localityService.getLocalities(dropCityId).subscribe();
    }

    // Fire advance_payment_check on page load (live site does this on page load, not on Proceed)
    this.fireAdvancePaymentCheck();

    // Reactive sync with auto-cleanup
    this.bookingState.currentItinerary$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        if (data) {
          this.itinerary = data;
          this.cdr.markForCheck();
        }
      });

    this.bookingState.selectedCar$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        if (data) {
          this.selectedCar = data;
          this.cdr.markForCheck();
        }
      });

    // Restore passenger details from session storage (survives back navigation)
    this.restorePassengerState();

    // Intercept browser back button: if on payment step, go back to passenger details instead of leaving
    this.locationSub = this.location.subscribe((event) => {
      if (event.type === 'popstate' && this.step1Complete && !this.bookingConfirmed) {
        // Push state back so we stay on this page
        this.location.go(this.router.url);
        this.step1Complete = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.cdr.markForCheck();
      }
    });
  }

  ngAfterViewInit() {
    // Auto-save passenger state every 2 seconds (debounced persist on any field change)
    this.autoSaveInterval = setInterval(() => this.savePassengerState(), 2000);
  }

  private autoSaveInterval: any;

  ngOnDestroy() {
    if (this.locationSub) {
      this.locationSub.unsubscribe();
    }
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    // Final save on leave
    this.savePassengerState();
  }

  // ─── GST Invoice ───────────────────────────────────────────

  /** Toggle GST invoice checkbox */
  onGstToggle(): void {
    if (this.needsGstInvoice && !this.agentGstNumber) {
      // Checked but no GST in profile → show manual entry
      this.gstManualEntry = true;
    }
    if (!this.needsGstInvoice) {
      this.gstManualEntry = false;
    }
    this.cdr.markForCheck();
  }

  /** Navigate to Account Settings so agent can update GST in profile */
  goToProfileForGst(): void {
    this.router.navigate(['/account-settings'], { queryParams: { focus: 'gst' } });
  }

  proceedToPayment() {
    this.formSubmitAttempted = true;
    this.cdr.markForCheck();

    if (!this.isPickupDetailsValid()) {
      return;
    }

    // Save passenger details before proceeding
    this.savePassengerState();

    // Mock mode: skip API calls, go straight to payment page
    if (environment.useMockData) {
      this.bookingId = 'MOCK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      this.advanceAmount = this.getPayNowAmount(1); // default 25%
      this.step1Complete = true;
      history.pushState({ step: 'payment' }, '', this.router.url);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.cdr.markForCheck();
      return;
    }

    // Live flow (HAR-confirmed): booking create fires on "Proceed to Next"
    // 1. Refresh partner token
    // 2. advance_payment_check → get advance amount
    // 3. POST /booking → create booking (returns booking_id)
    // 4. Show payment page with booking already created
    this.isCreatingBooking = true;
    this.bookingError = '';
    this.cdr.markForCheck();

    this.auth.fetchPartnerToken().subscribe({
      next: () => this.executeBookingOnProceed(),
      error: () => this.executeBookingOnProceed(),
    });
  }

  /**
   * Live site confirmed: booking create fires on "Proceed to Next" (BEFORE payment page).
   * advance_payment_check already fired on page load — just create booking here.
   */
  private executeBookingOnProceed() {
    if (!this.itinerary || !this.selectedCar) return;

    const apiParams = this.tripTypeService.mapUiTabToApiParams(this.itinerary.tripType, {
      localPackage: this.itinerary.localPackage,
      airportSubType: this.itinerary.airportSubType,
    });

    const prePayment = this.advanceAmount || Math.round(this.selectedCar.price * 0.25);
    const request = this.buildBookingRequest(apiParams, prePayment);

    // Create booking
    this.bookingApi.createBooking(request).subscribe({
      next: (response) => {
        const bkId = response.bookingId || response.booking_id || '';
        if (!bkId) {
          this.isCreatingBooking = false;
          this.bookingError = 'Booking creation failed. Please try again.';
          this.cdr.markForCheck();
          return;
        }

        this.bookingId = bkId;

        // CRITICAL (FLOW.md Fix #3 + #7): Extract payment values from booking create response
        // These come from the API response, NOT from advance_payment_check or client generation
        const raw = response.data as any;
        const dataItem = Array.isArray(raw) ? raw[0] : raw;
        if (dataItem) {
          // order_id = savaari_payment_id (e.g. "SW35004S0426-2361706")
          this.savaariPayId = dataItem.order_id || '';
          // paymentOptions[0].parameters.amount25per = advance amount
          const payOpts = dataItem.paymentOptions || [];
          if (payOpts.length > 0) {
            this.advanceAmount = payOpts[0]?.parameters?.amount25per || payOpts[0]?.parameters?.amountAdv || this.advanceAmount;
            this.encodedAmount = payOpts[0]?.parametersEncoded?.amount25perEncoded || payOpts[0]?.parametersEncoded?.amountAdvEncoded || this.encodedAmount;
          }
        }
        // Fallback: generate savaari_payment_id if API didn't return one
        if (!this.savaariPayId) {
          this.savaariPayId = this.paymentService.generateSavaariPaymentId(bkId);
        }

        this.registerBookingData(bkId, response, request, prePayment, 'razorpay');

        // Booking created → show payment page
        this.isCreatingBooking = false;
        this.step1Complete = true;
        history.pushState({ step: 'payment' }, '', this.router.url);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isCreatingBooking = false;
        this.bookingError = err?.message || 'Booking creation failed. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  get filteredCountryCodes(): CountryCodeEntry[] {
    if (!this.countrySearch?.trim()) return this.countryCodes;
    const q = this.countrySearch.toLowerCase();
    return this.countryCodes.filter(c =>
      c.countryName.toLowerCase().includes(q) || c.isdCode.includes(q)
    );
  }

  selectCountry(cc: CountryCodeEntry): void {
    this.selectedCountryCode = cc;
    this.countryDropdownOpen = false;
    this.countrySearch = '';
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (this.countryDropdownOpen && !target.closest('.country-code-wrapper')) {
      this.countryDropdownOpen = false;
      this.countrySearch = '';
      this.cdr.markForCheck();
    }
  }

  /**
   * Fetch source/destination cities from API to get lat/lng for autocomplete.
   * Live site uses city lat/lng to improve Google Places results.
   * Falls back to itinerary.fromCityLL if already set by dashboard.
   */
  private fetchCityLatLng(): void {
    // Quick check: if itinerary already has ll, use it directly
    if (this.itinerary?.fromCityLL) {
      const p = this.itinerary.fromCityLL.split(',');
      this.fromCityLat = p[0]?.trim() || '';
      this.fromCityLng = p[1]?.trim() || '';
    }
    if (this.itinerary?.toCityLL) {
      const p = this.itinerary.toCityLL.split(',');
      this.toCityLat = p[0]?.trim() || '';
      this.toCityLng = p[1]?.trim() || '';
    }

    // If already resolved, skip API call
    if (this.fromCityLat && this.toCityLat) return;

    // Fetch source cities from API (also populates city service cache)
    if (!this.itinerary?.fromCityId) return;
    const apiParams = this.tripTypeService.mapUiTabToApiParams(this.itinerary.tripType, {
      localPackage: this.itinerary.localPackage,
      airportSubType: this.itinerary.airportSubType,
    });

    this.cityService.getSourceCities(apiParams.tripType, apiParams.subTripType).subscribe(cities => {
      if (!this.fromCityLat) {
        const fromCity = cities.find(c => c.id === this.itinerary!.fromCityId);
        if (fromCity?.ll) {
          const p = fromCity.ll.split(',');
          this.fromCityLat = p[0]?.trim() || '';
          this.fromCityLng = p[1]?.trim() || '';
        }
      }

      // Also fetch destination cities for drop address autocomplete
      if (!this.toCityLat && this.itinerary?.toCityId) {
        this.cityService.getDestinationCities(apiParams.tripType, apiParams.subTripType, this.itinerary.fromCityId!).subscribe(destCities => {
          const toCity = destCities.find(c => c.id === this.itinerary!.toCityId);
          if (toCity?.ll) {
            const p = toCity.ll.split(',');
            this.toCityLat = p[0]?.trim() || '';
            this.toCityLng = p[1]?.trim() || '';
          }
        });
      }
    });
  }

  /** Fire advance_payment_check on page load (matches live site behavior) */
  private fireAdvancePaymentCheck(): void {
    if (!this.itinerary || !this.selectedCar || environment.useMockData) return;

    const apiParams = this.tripTypeService.mapUiTabToApiParams(this.itinerary.tripType, {
      localPackage: this.itinerary.localPackage,
      airportSubType: this.itinerary.airportSubType,
    });
    // HAR-confirmed (FLOW.md): outstation=3, local=3, airport=5
    const tripTypeMap: Record<string, number> = { outstation: 3, local: 3, airport: 5 };
    const subTripTypeMap: Record<string, number> = { oneWay: 7, roundTrip: 1, '880': 4 };

    const pickupDT = toSavaariDateTime(new Date(this.itinerary.pickupDate), this.itinerary.pickupTime);

    this.paymentService.checkAdvancePayment({
      t_id: tripTypeMap[apiParams.tripType] || 3,
      t_s_id: subTripTypeMap[apiParams.subTripType] || 4,
      c_id: this.itinerary.fromCityId || 377,
      pick_date: pickupDT.split(' ')[0] || '',
      car_id: this.selectedCar.carTypeId || 43,
      package_id: this.selectedCar.packageId || '',
      tot_amt: this.selectedCar.price,
      b_src: 0,
      pick_time: pickupDT.split(' ')[1] || '12:00',
      IsPremium: 0,
      drop_city_id: this.itinerary.toCityId || '',
      reverse_dynamic_oneway: 0,
    }).subscribe(resp => {
      this.advanceAmount = resp.advance_amount || Math.round(this.selectedCar!.price * 0.25);
      this.encodedAmount = (resp as any).encoded_amount || '';
    });
  }

  /** PrimeNG AutoComplete: search pickup address via localities API (matches live beta site) */
  searchPickupAddress(event: AutoCompleteCompleteEvent): void {
    const query = event.query?.trim() || '';
    if (!query || query.length < 2) {
      this.pickupSuggestions = [];
      this.pickupSuggestionsRaw = [];
      return;
    }

    const city = this.itinerary?.fromCity || '';
    this.addressAutocomplete
      .searchAddress(query, 'from', city, this.fromCityLat || undefined, this.fromCityLng || undefined)
      .subscribe(results => {
        this.pickupSuggestionsRaw = results;
        this.pickupSuggestions = results.map(r => r.description);
        this.cdr.markForCheck();
      });
  }

  /** PrimeNG AutoComplete: search drop address via localities API (matches live beta site) */
  searchDropAddress(event: AutoCompleteCompleteEvent): void {
    const query = event.query?.trim() || '';
    if (!query || query.length < 2) {
      this.dropSuggestions = [];
      this.dropSuggestionsRaw = [];
      return;
    }

    const city = this.itinerary?.toCity || '';
    this.addressAutocomplete
      .searchAddress(query, 'to', city, this.toCityLat || undefined, this.toCityLng || undefined)
      .subscribe(results => {
        this.dropSuggestionsRaw = results;
        this.dropSuggestions = results.map(r => r.description);
        this.cdr.markForCheck();
      });
  }

  /** When user selects a pickup address from localities list */
  onPickupAddressSelect(event: any): void {
    const selected: string = event?.value || event;
    const match = this.pickupSuggestionsRaw.find(s => s.description === selected);
    if (!match?.place_id) return;

    // Resolve place_id to get place_name (locality) + lat/lng for fare calc + alias IDs for booking create.
    this.addressAutocomplete.getPlaceDetails(match.place_id, 'from').subscribe(details => {
      if (!details) return;

      this.pickupPlaceName = details.name;
      this.pickupLatLng = { lat: details.lat, lng: details.lng };
      this.pickupAliasSourceCityId = details.aliasSourceCityId;

      // If drop is already selected, we can immediately recalculate the fare.
      if (this.itinerary?.tripType === 'One Way' && this.dropLatLng) {
        this.recalculateFareForDrop();
      }

      this.cdr.markForCheck();
    });
  }

  /** When user selects a drop address from localities list */
  onDropAddressSelect(event: any): void {
    const selected: string = event?.value || event;
    const match = this.dropSuggestionsRaw.find(s => s.description === selected);
    if (!match?.place_id) return;

    // Resolve place_id to get place_name + sublocality + lat/lng for fare calc + alias IDs for booking create.
    this.addressAutocomplete.getPlaceDetails(match.place_id, 'to').subscribe(details => {
      if (!details) return;

      this.dropPlaceName = details.name;
      this.dropSublocality = details.sublocality;
      this.dropLatLng = { lat: details.lat, lng: details.lng };
      this.dropAliasDestCityId = details.aliasDestCityId;

      // One Way: update fare when we have both pickup & drop lat/lng.
      if (this.itinerary?.tripType === 'One Way' && this.pickupLatLng) {
        this.recalculateFareForDrop();
      }

      this.cdr.markForCheck();
    });
  }

  /** Triggered when drop address field loses focus (One Way) — no-op, fare recalc triggers on lat/lng resolution */
  onDropAddressBlur(): void {
    // Fare recalculation now triggers when place_id API resolves lat/lng in onDropAddressSelect
  }

  /**
   * Recalculate fare based on pickup/drop addresses for One Way trips.
   *
   * HAR-confirmed: NO separate API call. The availability response contains
   * kmsIncluded + extraKmRate per car. Frontend calculates actual road distance
   * from pickup/drop lat/lng (Haversine * 1.3 road factor) and adds extra KM
   * charges client-side.
   *
   * Live site shows: "Your fare has been updated based on the pickup & drop
   * location entered. The minimum package fare is ₹2493."
   * KMs display: "185 (150 + 35) km"
   */
  private recalculateFareForDrop(): void {
    if (!this.selectedCar || !this.itinerary || this.itinerary.tripType !== 'One Way') return;
    const addr = (typeof this.dropAddress === 'string' ? this.dropAddress : String(this.dropAddress || '')).trim();
    if (addr.length < 3 || addr === this.dropAddressProcessed) return;

    // Need both pickup and drop lat/lng for distance calculation
    if (!this.pickupLatLng || !this.dropLatLng) return;

    this.dropAddressProcessed = addr;
    this.previousFare = this.selectedCar.price;

    // Calculate road distance from lat/lng
    const straightLineKm = this.haversineDistance(
      this.pickupLatLng.lat, this.pickupLatLng.lng,
      this.dropLatLng.lat, this.dropLatLng.lng
    );
    // Road distance ≈ straight-line × 1.3 (road winding factor)
    const estimatedRoadKm = Math.round(straightLineKm * 1.3);

    // Parse included KMs from string like "150 km"
    const includedKms = parseInt(this.selectedCar.kmsIncluded) || 0;
    const extraKmRate = this.selectedCar.extraKmRate || 0;

    if (estimatedRoadKm > includedKms && extraKmRate > 0) {
      const extraKms = estimatedRoadKm - includedKms;
      const extraCharge = Math.round(extraKms * extraKmRate);
      const baseFare = this.selectedCar.originalPrice || this.selectedCar.price;
      const newFare = baseFare + extraCharge;

      // Update the selectedCar
      this.selectedCar.price = newFare;
      this.selectedCar.kmsIncluded = `${estimatedRoadKm} (${includedKms} + ${extraKms}) km`;
      this.bookingState.setSelectedCar(this.selectedCar);

      // Show fare change popup
      this.fareChangeAmount = newFare - this.previousFare;
      this.showFareChangePopup = true;
      this.autoFillTopUpShortfall();
    }
    this.cdr.markForCheck();
  }

  /**
   * Haversine formula: calculate straight-line distance between two lat/lng points in km.
   */
  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /** Dismiss the fare change popup */
  dismissFareChangePopup(): void {
    this.showFareChangePopup = false;
    this.cdr.markForCheck();
  }

  /** Check if all mandatory pickup fields are filled */
  isPickupDetailsValid(): boolean {
    // For One Way trips, drop address is also required
    if (this.itinerary?.tripType === 'One Way') {
      return this.isGuestNameValid() && this.isPhoneValid() && this.isPickupAddressValid() && this.isDropAddressValid();
    }
    return this.isGuestNameValid() && this.isPhoneValid() && this.isPickupAddressValid();
  }

  isGuestNameValid(): boolean {
    return this.guestName.trim().length >= 2;
  }

  isPhoneValid(): boolean {
    const digits = this.phone.replace(/\D/g, '');
    return digits.length >= 10;
  }

  isPickupAddressValid(): boolean {
    return (typeof this.pickupAddress === 'string' ? this.pickupAddress : String(this.pickupAddress || '')).trim().length >= 3;
  }

  isDropAddressValid(): boolean {
    return (typeof this.dropAddress === 'string' ? this.dropAddress : String(this.dropAddress || '')).trim().length >= 3;
  }

  setPaymentOption(option: number) {
    // Toggle: clicking the same option again deselects it
    if (this.paymentOption === option) {
      this.paymentOption = 0;
      return;
    }
    this.paymentOption = option;
    // Reset slider to minimum when switching to Option 1
    if (option === 1) {
      this.option1SliderPercent = 25;
    }
    // Auto-fill top-up amount with shortfall (required - available balance)
    this.autoFillTopUpShortfall();
    this.showTopUpConfirm = false;
    this.cdr.markForCheck();
  }

  /** Called when the Option 1 slider value changes */
  onSliderChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    let val = parseInt(target.value, 10);
    if (val < this.SLIDER_MIN) val = this.SLIDER_MIN;
    if (val > this.SLIDER_MAX) val = this.SLIDER_MAX;
    this.option1SliderPercent = val;
    this.autoFillTopUpShortfall();
    this.cdr.markForCheck();
  }

  /** Auto-fill topUpAmount with the shortfall between required amount and current balance */
  autoFillTopUpShortfall(): void {
    const payNow = this.getPayNowAmount();
    const balance = this.walletService.getCurrentBalance();
    const shortfall = payNow - balance;
    this.topUpAmount = shortfall > 0 ? shortfall : 0;
  }

  // Timing Validations
  private getPickupDateTime(): Date | null {
    if (!this.itinerary || !this.itinerary.pickupDate) return null;

    // Create a base date from the pickupDate (ensures we have year/month/day)
    const dt = new Date(this.itinerary.pickupDate);

    // Parse pickupTime (expected format: "HH:mm AM/PM" like "09:30 PM")
    const timeStr = this.itinerary.pickupTime || '12:00 PM';
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);

    if (match) {
      let hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const ampm = match[3].toUpperCase();

      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      dt.setHours(hours, minutes, 0, 0);
    }

    return dt;
  }

  isBookingUrgent(): boolean {
    const pickupDt = this.getPickupDateTime();
    if (!pickupDt) return false;

    const now = new Date();
    // Compare at minute-level to avoid seconds/ms precision issues
    const diffInMinutes = Math.floor((pickupDt.getTime() - now.getTime()) / (1000 * 60));
    return diffInMinutes < 48 * 60;  // < 2880 minutes
  }

  isBookingWindowValid(): boolean {
    const pickupDt = this.getPickupDateTime();
    if (!pickupDt) return false;

    const now = new Date();
    // Compare at minute-level to avoid seconds/ms precision issues
    const diffInMinutes = Math.floor((pickupDt.getTime() - now.getTime()) / (1000 * 60));
    return diffInMinutes >= 6 * 60;  // >= 360 minutes
  }

  /**
   * Calculates the amount to deduct from wallet RIGHT NOW at booking time.
   *
   * Option 1 (Flexible): Agent pays slider % of fare. No deferred deduction.
   * Option 2 (Full Agent): 25% now, 75% deferred 48h before. Urgent → 100% now.
   * Option 3 (Full + Buffer): 25% now, 95% deferred 48h before. Urgent → (100% + 20%) now.
   */
  getPayNowAmount(optionOverride?: number): number {
    if (!this.selectedCar) return 0;
    const total = this.selectedCar.price;
    // Use the higher of regularPrice and displayed price as the base.
    // API validates prePayment >= 25% of its totalFare — we must meet or exceed that.
    // For round trips, regularPrice may be one-way rate while total is full trip fare.
    const prePayBase = Math.max(this.selectedCar.regularPrice || total, total);
    const option = optionOverride !== undefined ? optionOverride : this.paymentOption;
    const isUrgent = this.isBookingUrgent();

    // Option 1: Flexible Agent — slider % of fare (API minimum compliance)
    if (option === 1) {
      return Math.round(prePayBase * (this.option1SliderPercent / 100));
    }

    // Option 2: Pay 25% now, rest auto-deducted
    // Urgent (<48h): 100% now (no time for auto-deduction)
    // Advance (>48h): 25% now, 75% auto-deducted 48h before trip
    if (option === 2) {
      return isUrgent ? total : Math.round(prePayBase * 0.25);
    }

    // Option 3: Zero cash — full wallet
    // Urgent (<48h): 100% + 20% buffer now (buffer refunded post-trip)
    // Advance (>48h): 25% now, (75% + 20% buffer) auto-deducted 48h before trip
    if (option === 3) {
      return isUrgent ? Math.round(total * 1.20) : Math.round(prePayBase * 0.25);
    }

    return 0;
  }

  /**
   * Amount auto-deducted from wallet 48 hours before trip.
   * Returns 0 for Option 1 (no deferred) or urgent bookings (everything upfront).
   */
  getDeferredAmount(optionOverride?: number): number {
    if (!this.selectedCar) return 0;
    const total = this.selectedCar.price;
    const option = optionOverride !== undefined ? optionOverride : this.paymentOption;

    // Option 1 never has deferred deductions
    if (option === 1) return 0;

    // Urgent bookings pay everything upfront — nothing deferred
    if (this.isBookingUrgent()) return 0;

    // Option 2: 75% auto-deducted 48h before trip
    if (option === 2) return total - this.getPayNowAmount(2);

    // Option 3: (75% + 20% buffer) auto-deducted 48h before trip
    // Total commitment = fare + 20% buffer, minus the 25% paid now
    if (option === 3) return Math.round(total * 1.20) - this.getPayNowAmount(3);

    return 0;
  }

  /** For Option 1: amount the driver collects from the customer */
  getDriverCollectsAmount(): number {
    if (!this.selectedCar) return 0;
    return this.selectedCar.price - this.getPayNowAmount(1);
  }

  /** Total agent wallet commitment (now + deferred) */
  getTotalAgentCommitment(optionOverride?: number): number {
    const option = optionOverride !== undefined ? optionOverride : this.paymentOption;
    return this.getPayNowAmount(option) + this.getDeferredAmount(option);
  }

  /** Returns the 20% buffer amount for Option 3 display */
  getOption3BufferAmount(): number {
    if (!this.selectedCar) return 0;
    return Math.round(this.selectedCar.price * 0.20);
  }

  hasSufficientWalletBalance(balance: number | null): boolean {
    if (balance === null) return false;
    return balance >= this.getPayNowAmount();
  }

  /** Effective price */
  getEffectivePrice(): number {
    if (!this.selectedCar) return 0;
    return this.selectedCar.price;
  }

  bookNow() {
    this.bookingError = '';

    if (this.paymentOption === 0) {
      this.bookingError = 'Please select a payment option.';
      this.cdr.markForCheck();
      return;
    }

    const payNow = this.getPayNowAmount();

    if (this.paymentMethod === 'razorpay') {
      // Booking already created on "Proceed to Next" — just handle Razorpay payment
      this.processRazorpayPayment(payNow);
    } else {
      // Wallet payment — booking already created, just deduct wallet
      const currentBalance = this.walletService.getCurrentBalance();
      if (payNow > 0 && currentBalance < payNow) {
        this.bookingError = `Insufficient wallet balance. You need ₹${payNow.toLocaleString('en-IN')} but have ₹${currentBalance.toLocaleString('en-IN')}. Please top up your wallet or switch to Razorpay.`;
        this.cdr.markForCheck();
        return;
      }
      this.processWalletPayment(payNow);
    }
  }

  /**
   * Process Razorpay payment for already-created booking.
   *
   * HAR-confirmed: booking is already created on "Proceed to Next".
   * This method handles:
   *   1. razor_createorder.php → create Razorpay order
   *   2. Razorpay SDK popup → user pays
   *   3. razor_checkhash.php → verify payment signature
   *   4. email_sent → send confirmation email
   *   5. confirmation.php → final payment confirmation
   */
  private processRazorpayPayment(amount: number) {
    if (!this.bookingId) {
      this.bookingError = 'No booking found. Please go back and try again.';
      this.cdr.markForCheck();
      return;
    }

    this.isProcessingRazorpay = true;
    this.razorpayProcessingStage = 'payment';
    this.bookingError = '';
    this.cdr.markForCheck();

    // Mock mode: skip Razorpay, simulate payment success
    if (environment.useMockData) {
      setTimeout(() => {
        this.isProcessingRazorpay = false;
        this.bookingConfirmed = true;
        this.clearPassengerState();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.cdr.markForCheck();
      }, 1500);
      return;
    }

    const bkId = this.bookingId;
    const advanceAmount = this.advanceAmount || amount;
    const savaariPayId = this.savaariPayId || this.paymentService.generateSavaariPaymentId(bkId);

    // Step 1: Create Razorpay order via PHP
    this.paymentService.createRazorpayOrder({
      amount: advanceAmount,
      encoded_amount: this.encodedAmount,
      savaari_payment_id: savaariPayId,
    }).subscribe({
      next: (orderResp) => {
        if (!orderResp) {
          this.isProcessingRazorpay = false;
          this.bookingError = 'Failed to create payment order. Please try again.';
          this.cdr.markForCheck();
          return;
        }

        const razorpayOrderId = orderResp.razorpay_order_id || orderResp.order_id || '';

        // Step 2: Open Razorpay SDK
        const options: any = {
          key: environment.razorpayKeyId,
          amount: advanceAmount * 100, // Razorpay expects paise
          currency: 'INR',
          name: environment.brandName,
          description: `Booking #${bkId} - ₹${advanceAmount}`,
          order_id: razorpayOrderId,
          handler: (rzpResponse: any) => {
            // HAR-confirmed post-payment flow (FLOW.md):
            //   1. razor_checkhash.php → verify payment signature (multipart/form-data)
            //   2. autologin → refresh B2B JWT (may have expired during Razorpay flow)
            //   3. email_sent × 2 → send confirmation emails
            //   4. confirmation.php → mark booking as paid

            const razorpayPaymentId = rzpResponse.razorpay_payment_id || '';
            const rzpOrderId = rzpResponse.razorpay_order_id || razorpayOrderId;
            const razorpaySignature = rzpResponse.razorpay_signature || '';

            // Step 1: Verify payment hash (razor_checkhash.php)
            this.paymentService.verifyRazorpayPayment({
              razorpay_order_id: rzpOrderId,
              razorpay_payment_id: razorpayPaymentId,
              razorpay_signature: razorpaySignature,
              savaari_pay_id: savaariPayId,
              selectedAmount: advanceAmount,
            }).subscribe({
              next: () => {
                // Step 2: Refresh B2B JWT via autologin
                this.auth.autoLogin().subscribe();

                // Step 3: Fire email_sent twice (matches live site — agent + customer emails)
                this.paymentService.sendConfirmationEmail(bkId).subscribe();
                this.paymentService.sendConfirmationEmail(bkId).subscribe();

                // Step 4: Final payment confirmation (confirmation.php)
                this.paymentService.confirmPayment({
                  advancedAmount: advanceAmount,
                  orderId: savaariPayId,
                  paymentId: razorpayPaymentId,
                  paymentmode: 'savaariwebsite',
                }).subscribe({
                  next: () => {
                    this.isProcessingRazorpay = false;
                    this.bookingConfirmed = true;
                    this.clearPassengerState();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    this.cdr.markForCheck();
                  },
                  error: () => {
                    // confirmation API failed — still show success (payment already done)
                    this.isProcessingRazorpay = false;
                    this.bookingConfirmed = true;
                    this.clearPassengerState();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    this.cdr.markForCheck();
                  }
                });
              },
              error: () => {
                // checkhash failed — still attempt confirmation (payment was taken by Razorpay)
                this.paymentService.sendConfirmationEmail(bkId).subscribe();
                this.paymentService.sendConfirmationEmail(bkId).subscribe();
                this.paymentService.confirmPayment({
                  advancedAmount: advanceAmount,
                  orderId: savaariPayId,
                  paymentId: razorpayPaymentId,
                  paymentmode: 'savaariwebsite',
                }).subscribe({
                  next: () => {
                    this.isProcessingRazorpay = false;
                    this.bookingConfirmed = true;
                    this.clearPassengerState();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    this.cdr.markForCheck();
                  },
                  error: () => {
                    this.isProcessingRazorpay = false;
                    this.bookingConfirmed = true;
                    this.clearPassengerState();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    this.cdr.markForCheck();
                  }
                });
              }
            });
          },
          modal: {
            ondismiss: () => {
              this.isProcessingRazorpay = false;
              this.cdr.markForCheck();
            }
          },
          prefill: { email: this.auth.getUserEmail() },
          theme: { color: '#00ace6' },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      },
      error: () => {
        this.isProcessingRazorpay = false;
        this.bookingError = 'Failed to create payment order.';
        this.cdr.markForCheck();
      }
    });
  }

  /** Build a CreateBookingRequest from current form state
   * Field mapping matches FLOW.md exactly (from HAR analysis of b2bcab.betasavaari.com)
   */
  private buildBookingRequest(apiParams: { tripType: string; subTripType: string }, prePaymentAmount: number): CreateBookingRequest {
    const pickupAddr = typeof this.pickupAddress === 'string' ? this.pickupAddress : String(this.pickupAddress || '');
    const isAirport = apiParams.tripType === 'airport';

    // locality = place_name from place_id API (e.g. "Koramangala"), NOT full address
    // dropLocality = sublocality from place_id API (e.g. "Chamrajpura"), NOT full address
    const locality = this.pickupPlaceName || pickupAddr.split(',')[0]?.trim() || '';
    const dropLocality = this.dropSublocality || this.dropPlaceName || '';

    return {
      sourceCity: this.itinerary!.fromCityId || 377,
      tripType: apiParams.tripType,
      subTripType: apiParams.subTripType,
      pickupDateTime: toSavaariDateTime(new Date(this.itinerary!.pickupDate), this.itinerary!.pickupTime),
      duration: this.itinerary!.duration || 1,
      pickupAddress: pickupAddr || this.itinerary!.pickupAddress || '',
      customerLatLong: this.pickupLatLng ? `${this.pickupLatLng.lat},${this.pickupLatLng.lng}` : '',
      locality,
      alias_source_city_id: this.pickupAliasSourceCityId || 0,
      dropAddress: this.dropAddress || '',
      dropLatLong: this.dropLatLng ? `${this.dropLatLng.lat},${this.dropLatLng.lng}` : '',
      dropLocality,
      alias_dest_city_id: this.dropAliasDestCityId || this.itinerary!.aliasDestCityId || 0,
      customerTitle: 'Mr',
      customerName: this.guestName,
      customerEmail: this.guestEmail || this.agentEmail || undefined,
      customerMobile: this.phone,
      countryCode: this.selectedCountryCode ? `${this.selectedCountryCode.isdCode}|${this.selectedCountryCode.key?.split('|')[1] || 'IND'}` : '91|IND',
      customerSecondaryEmail: this.agentEmail || undefined,
      carType: this.selectedCar!.carTypeId || 4,
      premiumFlag: 0,
      prePayment: prePaymentAmount,
      app_user_id: Number(this.auth.getAgentId()) || undefined,
      couponCode: '',
      device: 'MOBILE',
      invoicePayer: this.commissionService.getInvoicePayer(),
      ...(this.itinerary!.toCityId && { destinationCity: this.itinerary!.toCityId }),
      ...(this.itinerary!.extraDestinations?.length && {
        multicityId: this.itinerary!.extraDestinations.map(s => s.cityId).join(',')
      }),
      ...(this.itinerary!.localityId && { localityId: this.itinerary!.localityId }),
      // Airport-specific params
      ...(isAirport && {
        airport_id: this.itinerary!.airportId ? String(this.itinerary!.airportId) : '',
        airport_name: this.itinerary!.airportName || '',
        terminalId: this.itinerary!.terminalId || '',
        selectPlaceId: this.itinerary!.selectPlaceId || '',
        custShortAddress: locality || this.itinerary!.pickupAddress || '',
      }),
      ...(this.isBookingUrgent() && { Urgent_booking: '1' }),
      ...(this.needsGstInvoice && this.agentGstNumber && { gst_invoice_required: '1', gst_number: this.agentGstNumber }),
    };
  }

  /** Register booking data in the local registry for history page */
  private registerBookingData(bkId: string, response: any, request: CreateBookingRequest, prePaymentAmount: number, paymentMethod: string) {
    this.bookingRegistry.addBookingId(bkId);
    this.bookingRegistry.storeBookingData(bkId, {
      ...response,
      pick_city: this.itinerary?.fromCity || '',
      drop_city: this.itinerary?.toCity || '',
      source_city: this.itinerary?.fromCity || '',
      destination_city: this.itinerary?.toCity || '',
      ...(this.itinerary?.extraDestinations?.length && {
        intermediate_cities: this.itinerary.extraDestinations.map(s => s.cityOnly || s.cityName).join(', ')
      }),
      pickup_address: this.pickupAddress || this.itinerary?.pickupAddress || '',
      drop_address: this.dropAddress || '',
      start_date_time: (() => {
        const dt = request.pickupDateTime || '';
        const match = dt.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2})$/);
        return match ? `${match[3]}-${match[2]}-${match[1]}T${match[4]}` : dt;
      })(),
      pickupDateTime: request.pickupDateTime || '',
      trip_type: request.tripType || '',
      usage_name: request.subTripType || '',
      booking_status: 'CONFIRMED',
      car_name: this.selectedCar?.name || '',
      gross_amount: this.selectedCar?.price || 0,
      total_amount: this.selectedCar?.price || 0,
      customer_name: this.guestName || '',
      customer_mobile: this.phone || '',
      customer_email: this.guestEmail || '',
      itinerary: (this.itinerary?.fromCity || '') + (this.itinerary?.extraDestinations?.length ? ' → ' + this.itinerary.extraDestinations.map(s => s.cityOnly || s.cityName).join(' → ') : '') + ' → ' + (this.itinerary?.toCity || ''),
      prePayment: prePaymentAmount,
      cashToCollect: (this.selectedCar?.price || 0) - prePaymentAmount,
      carType: this.selectedCar?.carTypeId || request.carType || 0,
      paymentOption: this.paymentOption,
      paymentMethod,
    });

    // Update VAS if selected
    if (bkId && (this.vasLuggageCarrier || this.vasLanguageDriver)) {
      this.bookingApi.updateVasBooking(bkId, {
        luggageCarrier: this.vasLuggageCarrier,
        languageDriver: this.vasLanguageDriver,
      }).subscribe();
    }
  }

  /**
   * Process wallet payment for already-created booking.
   * Booking was already created on "Proceed to Next" — just deduct wallet + confirm.
   *
   * Flow (from Jibin's confirmation callback doc):
   *   1. POST /wallet/pay-booking → deduct wallet, get transaction_id
   *   2. POST /confirmation.php → source=B2B_WALLET, booking_id, payment_option, transaction_id
   *   3. email_sent × 2 → confirmation emails
   */
  private processWalletPayment(payNow: number) {
    if (!this.bookingId) {
      this.bookingError = 'No booking found. Please go back and try again.';
      this.cdr.markForCheck();
      return;
    }

    this.isProcessingWallet = true;
    this.bookingError = '';
    this.cdr.markForCheck();

    const bkId = this.bookingId;

    if (payNow > 0) {
      // Step 1: Deduct wallet balance
      this.walletService.payForBooking(bkId, payNow, this.paymentOption as 1 | 2 | 3).subscribe({
        next: (result) => {
          if (result.success) {
            // Step 2: Call confirmation.php with wallet-specific params
            this.paymentService.confirmPayment({
              source: 'B2B_WALLET',
              booking_id: bkId,
              payment_option: this.paymentOption,
              transaction_id: result.transactionId || '',
              advancedAmount: payNow,
            } as any).subscribe();

            // Step 3: Send confirmation emails (fire-and-forget)
            this.paymentService.sendConfirmationEmail(bkId).subscribe();
            this.paymentService.sendConfirmationEmail(bkId).subscribe();

            this.isProcessingWallet = false;
            this.bookingConfirmed = true;
            this.clearPassengerState();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            this.cdr.markForCheck();
          } else {
            this.isProcessingWallet = false;
            this.bookingError = 'Wallet payment failed. Please try again or switch to Razorpay.';
            this.cdr.markForCheck();
          }
        },
        error: () => {
          this.isProcessingWallet = false;
          this.bookingError = 'Wallet payment failed. Please try again.';
          this.cdr.markForCheck();
        }
      });
    } else {
      // Zero payment — just confirm
      this.paymentService.sendConfirmationEmail(bkId).subscribe();
      this.paymentService.sendConfirmationEmail(bkId).subscribe();
      this.isProcessingWallet = false;
      this.bookingConfirmed = true;
      this.clearPassengerState();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.cdr.markForCheck();
    }
  }

  /** Save passenger form state to sessionStorage */
  private savePassengerState(): void {
    const state = {
      guestName: this.guestName,
      guestEmail: this.guestEmail,
      phone: this.phone,
      pickupAddress: this.pickupAddress,
      dropAddress: this.dropAddress,
      landmark: this.landmark,
      needsGstInvoice: this.needsGstInvoice,
      paymentOption: this.paymentOption,
      paymentMethod: this.paymentMethod,
      selectedCountryCode: this.selectedCountryCode,
    };
    sessionStorage.setItem(this.PASSENGER_STATE_KEY, JSON.stringify(state));
  }

  /** Restore passenger form state from sessionStorage */
  private restorePassengerState(): void {
    const raw = sessionStorage.getItem(this.PASSENGER_STATE_KEY);
    if (!raw) return;
    try {
      const state = JSON.parse(raw);
      if (state.guestName) this.guestName = state.guestName;
      if (state.guestEmail) this.guestEmail = state.guestEmail;
      if (state.phone) this.phone = state.phone;
      if (state.pickupAddress) this.pickupAddress = state.pickupAddress;
      if (state.dropAddress) this.dropAddress = state.dropAddress;
      if (state.landmark) this.landmark = state.landmark;
      if (state.needsGstInvoice !== undefined) this.needsGstInvoice = state.needsGstInvoice;
      if (state.paymentOption) this.paymentOption = state.paymentOption;
      if (state.paymentMethod) this.paymentMethod = state.paymentMethod;
      if (state.selectedCountryCode) this.selectedCountryCode = state.selectedCountryCode;
      this.cdr.markForCheck();
    } catch {}
  }

  /** Clear passenger state after successful booking */
  private clearPassengerState(): void {
    sessionStorage.removeItem(this.PASSENGER_STATE_KEY);
  }

  /** Navigate back: payment → passenger details → select-car → dashboard */
  goBackFromBooking() {
    if (this.step1Complete) {
      // On payment step → go back to passenger details
      this.step1Complete = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.cdr.markForCheck();
    } else {
      // On passenger details step → go back to select-car or dashboard
      const itinerary = this.bookingState.getItinerary();
      if (itinerary?.fromCityId) {
        this.router.navigate(['/select-car']);
      } else {
        this.router.navigate(['/dashboard']);
      }
    }
  }

  closeModal() {
    this.cdr.markForCheck();
  }

  // VAS Functions
  openVASModal() {
    this.showVASModal = true;
    this.cdr.markForCheck();
  }

  closeVASModal() {
    this.showVASModal = false;
    this.cdr.markForCheck();
  }

  toggleVasLuggage() {
    this.vasLuggageCarrier = !this.vasLuggageCarrier;
    this.cdr.markForCheck();
  }

  toggleVasLanguage() {
    this.vasLanguageDriver = !this.vasLanguageDriver;
    this.cdr.markForCheck();
  }

  /** Sidebar button handler: scroll to top-up if balance is low, otherwise book */
  handleBookOrTopUp() {
    const balance = this.walletService.getCurrentBalance();
    if (this.paymentOption !== 0 && this.paymentMethod === 'wallet' && !this.hasSufficientWalletBalance(balance)) {
      this.showTopUpModal = true;
      this.autoFillTopUpShortfall();
      this.cdr.markForCheck();
    } else {
      this.bookNow();
    }
  }

  /** Scroll to the top-up section in the left panel */
  scrollToTopUp() {
    const el = document.getElementById('topUpSection');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash highlight to draw attention
      el.classList.add('ring-2', 'ring-orange-400', 'ring-offset-2', 'rounded-xl');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-orange-400', 'ring-offset-2', 'rounded-xl');
      }, 2000);
    }
  }

  /** Set top-up amount from preset button */
  setTopUpAmount(amount: number) {
    this.topUpAmount = amount;
    this.topUpSuccess = false;
    this.cdr.markForCheck();
  }

  /** Process real wallet top-up via Razorpay */
  processTopUp() {
    if (this.topUpAmount <= 0) return;
    this.isProcessingTopUp = true;
    this.topUpSuccess = false;
    this.bookingError = '';
    this.cdr.markForCheck();

    // Mock mode: skip Razorpay, credit wallet directly
    if (environment.useMockData) {
      this.walletService.verifyTopUp('mock_order', 'mock_pay', 'mock_sig', this.topUpAmount).subscribe(success => {
        this.isProcessingTopUp = false;
        if (success) {
          this.topUpSuccess = true;
          this.topUpAmount = 0;
          this.showTopUpConfirm = false;
          setTimeout(() => { this.topUpSuccess = false; this.showTopUpModal = false; this.cdr.markForCheck(); }, 2000);
        }
        this.cdr.markForCheck();
      });
      return;
    }

    // Step 1: Initiate top-up order on backend
    this.walletService.initiateTopUp(this.topUpAmount).subscribe({
      next: (order) => {
        if (!order || !order.orderId) {
          this.isProcessingTopUp = false;
          this.bookingError = 'Failed to create top-up order. Please try again.';
          this.cdr.markForCheck();
          return;
        }

        // Step 2: Open Razorpay checkout
        const razorpayKey = order.razorpayKeyId || environment.razorpayKeyId;
        const amountInPaise = order.amount; // Backend returns paise
        const savedAmount = this.topUpAmount; // Save before clearing

        const options: any = {
          key: razorpayKey,
          amount: amountInPaise,
          currency: order.currency || 'INR',
          name: `${environment.brandName} Wallet`,
          description: `Wallet Top-up ₹${savedAmount}`,
          order_id: order.orderId,
          handler: (response: any) => {
            // Step 3: Verify payment on backend
            this.walletService.verifyTopUp(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature,
              savedAmount
            ).subscribe({
              next: (success) => {
                this.isProcessingTopUp = false;
                if (success) {
                  this.topUpSuccess = true;
                  this.topUpAmount = 0;
                  this.showTopUpConfirm = false;
                  setTimeout(() => {
                    this.topUpSuccess = false;
                    this.showTopUpModal = false;
                    this.cdr.markForCheck();
                  }, 2000);
                } else {
                  this.bookingError = 'Payment verification failed. Contact support if money was deducted.';
                }
                this.cdr.markForCheck();
              },
              error: () => {
                this.isProcessingTopUp = false;
                this.bookingError = 'Payment verification failed. Contact support if money was deducted.';
                this.cdr.markForCheck();
              }
            });
          },
          modal: {
            ondismiss: () => {
              this.isProcessingTopUp = false;
              this.cdr.markForCheck();
            }
          },
          prefill: {
            email: this.auth.getUserEmail(),
          },
          theme: { color: '#f97316' },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      },
      error: () => {
        this.isProcessingTopUp = false;
        this.bookingError = 'Failed to initiate top-up. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  ngAfterViewChecked() {
    if (this.bookingConfirmed && this.confettiCanvas && !this.confettiFired) {
      this.confettiFired = true;
      this.launchConfetti();
    }
  }

  /** Canvas confetti burst — no external library needed */
  private launchConfetti() {
    const canvas = this.confettiCanvas.nativeElement;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    const PARTICLE_COUNT = 120;
    const GRAVITY = 0.12;
    const DRAG = 0.98;

    const particles: { x: number; y: number; vx: number; vy: number; w: number; h: number; color: string; rotation: number; rotSpeed: number; opacity: number; }[] = [];

    // Burst from two points — left and right top
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const fromLeft = i % 2 === 0;
      particles.push({
        x: fromLeft ? W * 0.15 : W * 0.85,
        y: H * 0.2,
        vx: (fromLeft ? 1 : -1) * (Math.random() * 8 + 4),
        vy: -(Math.random() * 12 + 4),
        w: Math.random() * 8 + 4,
        h: Math.random() * 6 + 2,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        opacity: 1,
      });
    }

    let frame = 0;
    const MAX_FRAMES = 180; // ~3 seconds at 60fps

    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, W, H);

      for (const p of particles) {
        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.vy *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;

        // Fade out in last 60 frames
        if (frame > MAX_FRAMES - 60) {
          p.opacity = Math.max(0, p.opacity - 0.018);
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (frame < MAX_FRAMES) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, W, H);
      }
    };

    requestAnimationFrame(animate);
  }

  /** Share booking details via WhatsApp */
  shareOnWhatsApp() {
    if (!this.itinerary || !this.selectedCar) return;

    const pickupDate = this.itinerary.pickupDate
      ? new Date(this.itinerary.pickupDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';

    let itineraryText = '';
    if (this.itinerary.tripType === 'Local') {
      itineraryText = `${this.itinerary.fromCity} (Local - ${this.itinerary.localPackage || '8hr/80km'})`;
    } else if (this.itinerary.tripType === 'Airport') {
      itineraryText = `${this.itinerary.fromCity} (Airport ${this.itinerary.airportSubType === 'pickup' ? 'Pickup' : 'Drop'})`;
    } else if (this.itinerary.tripType === 'Round Trip') {
      const stops = this.itinerary.extraDestinations?.map(s => s.cityOnly || s.cityName).join(' → ') || '';
      itineraryText = `${this.itinerary.fromCity}${stops ? ' → ' + stops : ''} → ${this.itinerary.toCity} → ${this.itinerary.fromCity} (Round Trip)`;
    } else {
      itineraryText = `${this.itinerary.fromCity} → ${this.itinerary.toCity} (One Way)`;
    }

    const lines = [
      `*Booking Confirmation - ${environment.brandName}*`,
      ``,
      `Booking ID: ${this.bookingId}`,
      `Trip: ${itineraryText}`,
      `Pickup: ${pickupDate}, ${this.itinerary.pickupTime || ''}`,
      this.pickupAddress ? `Address: ${this.pickupAddress}` : '',
      `Car: ${this.selectedCar.name || 'Sedan'}`,
      `Fare: ₹${(this.selectedCar.price || 0).toLocaleString('en-IN')}`,
      ``,
      `_Powered by ${environment.brandName} - India's #1 Cab Service since 2006_`,
    ].filter(l => l !== undefined && l !== '');

    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  /** Print booking voucher */
  printVoucher() {
    window.print();
  }
}
