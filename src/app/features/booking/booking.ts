import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { AuthService } from '../../core/services/auth.service';
import { BookingStateService, Itinerary, SelectedCar } from '../../core/services/booking-state.service';
import { BookingApiService } from '../../core/services/booking-api.service';
import { BookingRegistryService } from '../../core/services/booking-registry.service';
import { CouponService } from '../../core/services/coupon.service';
import { TripTypeService } from '../../core/services/trip-type.service';
import { WalletService } from '../../core/services/wallet.service';
import { CountryCodeService, CountryCodeEntry } from '../../core/services/country-code.service';
import { LocalityService } from '../../core/services/locality.service';
import { CreateBookingRequest, CouponValidationResponse } from '../../core/models';
import { toSavaariDateTime, calculateDuration } from '../../core/utils/date-format.util';
import { Observable } from 'rxjs';
import { FooterComponent } from '../../components/layout/footer/footer';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, FormsModule, AutoCompleteModule, FooterComponent],

  templateUrl: './booking.html',
  styleUrl: './booking.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingComponent implements OnInit {
  public router = inject(Router);
  private auth = inject(AuthService);
  private bookingState = inject(BookingStateService);
  private bookingApi = inject(BookingApiService);
  private bookingRegistry = inject(BookingRegistryService);
  private couponService = inject(CouponService);
  private tripTypeService = inject(TripTypeService);
  private countryCodeService = inject(CountryCodeService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

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

  // --- Option 1: Flexible Agent Payment Slider ---
  option1SliderPercent: number = 25;   // Agent-chosen percentage (25% to 100%)
  readonly SLIDER_MIN = 25;
  readonly SLIDER_MAX = 100;
  readonly SLIDER_STEP = 5;            // 5% increments for clean amounts

  isProcessingWallet = false;
  bookingConfirmed = false;
  bookingId = '';

  // Coupon
  couponCode = '';
  couponApplied = false;
  couponDiscount = 0;
  couponMessage = '';
  isValidatingCoupon = false;

  // Error display
  bookingError = '';
  formSubmitAttempted = false;

  // Inline wallet top-up
  topUpAmount: number = 0;
  isProcessingTopUp = false;
  topUpSuccess = false;
  topUpPresets = [5000, 10000, 25000, 50000];

  walletBalance$!: Observable<number>;
  private walletService = inject(WalletService);
  private localityService = inject(LocalityService);

  // Locality autocomplete suggestions (string arrays for direct ngModel binding)
  pickupSuggestions: string[] = [];
  dropSuggestions: string[] = [];

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

    // Initial sync
    this.itinerary = this.bookingState.getItinerary();
    this.selectedCar = this.bookingState.getSelectedCar();

    // Pre-fetch localities for source and destination cities (cached after first load).
    // For drop city, only pre-fetch when toCitySourceId is set — it means the destination
    // also exists as a source city and has registered localities. Destination-only cities
    // (like small towns) have no localities so we skip the API call and allow free text entry.
    if (this.itinerary?.fromCityId) {
      this.localityService.getLocalities(this.itinerary.fromCityId).subscribe();
    }
    if (this.itinerary?.toCitySourceId) {
      this.localityService.getLocalities(this.itinerary.toCitySourceId).subscribe();
    }

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
  }

  proceedToPayment() {
    this.formSubmitAttempted = true;
    this.cdr.markForCheck();

    if (!this.isPickupDetailsValid()) {
      return;
    }

    this.step1Complete = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.markForCheck();
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

  /** PrimeNG AutoComplete: search pickup address localities (source city) */
  searchPickupAddress(event: AutoCompleteCompleteEvent): void {
    const cityId = this.itinerary?.fromCityId;
    console.log('[BOOKING] searchPickupAddress called, cityId:', cityId, 'query:', event.query);
    if (!cityId || !event.query) { this.pickupSuggestions = []; return; }
    this.localityService.searchLocalities(cityId, event.query).subscribe(results => {
      this.pickupSuggestions = results.map(l => l.name);
      console.log('[BOOKING] Pickup suggestions:', this.pickupSuggestions.length, 'results');
      this.cdr.markForCheck();
    });
  }

  /** PrimeNG AutoComplete: search drop address localities (destination city).
   *  Uses toCitySourceId — only set when the destination is also a valid source city
   *  with registered localities. Falls back to empty (free text) for destination-only cities.
   */
  searchDropAddress(event: AutoCompleteCompleteEvent): void {
    const cityId = this.itinerary?.toCitySourceId;
    console.log('[BOOKING] searchDropAddress called, cityId:', cityId, 'query:', event.query);
    if (!cityId || !event.query) { this.dropSuggestions = []; return; }
    this.localityService.searchLocalities(cityId, event.query).subscribe(results => {
      this.dropSuggestions = results.map(l => l.name);
      console.log('[BOOKING] Drop suggestions:', this.dropSuggestions.length, 'results');
      this.cdr.markForCheck();
    });
  }

  /** Check if all mandatory pickup fields are filled */
  isPickupDetailsValid(): boolean {
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

  setPaymentOption(option: number) {
    this.paymentOption = option;
    // Reset slider to minimum when switching to Option 1
    if (option === 1) {
      this.option1SliderPercent = 25;
    }
    this.cdr.markForCheck();
  }

  /** Called when the Option 1 slider value changes */
  onSliderChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    let val = parseInt(target.value, 10);
    if (val < this.SLIDER_MIN) val = this.SLIDER_MIN;
    if (val > this.SLIDER_MAX) val = this.SLIDER_MAX;
    this.option1SliderPercent = val;
    this.cdr.markForCheck();
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
    // Use the regular (non-discounted) fare as the prePayment basis.
    // The Savaari booking API validates prePayment >= 25% of its internal
    // totalFare, which is based on the regular rate — not the discounted rate
    // we display. Using regularPrice ensures we always clear the minimum.
    const prePayBase = this.selectedCar.regularPrice || total;
    const option = optionOverride !== undefined ? optionOverride : this.paymentOption;
    const isUrgent = this.isBookingUrgent();

    // Option 1: Flexible Agent — slider % of regular fare (API minimum compliance)
    if (option === 1) {
      return Math.round(prePayBase * (this.option1SliderPercent / 100));
    }

    // Option 2: Full Agent (25/75)
    if (option === 2) {
      return isUrgent ? total : Math.round(prePayBase * 0.25);
    }

    // Option 3: Full Agent + 20% Buffer
    if (option === 3) {
      return isUrgent ? Math.round(prePayBase * 1.20) : Math.round(prePayBase * 0.25);
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

    // Option 2: 75% deferred
    if (option === 2) return Math.round(total * 0.75);

    // Option 3: 75% + 20% buffer = 95% deferred
    if (option === 3) return Math.round(total * 0.95);

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

  /** Apply coupon code */
  applyCoupon() {
    if (!this.couponCode.trim() || !this.itinerary || !this.selectedCar) return;

    this.isValidatingCoupon = true;
    this.couponMessage = '';
    this.cdr.markForCheck();

    const apiParams = this.tripTypeService.mapUiTabToApiParams(this.itinerary.tripType, {
      localPackage: this.itinerary.localPackage,
      airportSubType: this.itinerary.airportSubType,
    });

    this.couponService.validateCoupon({
      couponCode: this.couponCode.trim(),
      sourceCity: this.itinerary.fromCityId || 377,
      tripType: apiParams.tripType,
      subTripType: apiParams.subTripType,
      bookingAmount: this.selectedCar.originalPrice || this.selectedCar.price,
      carType: this.selectedCar.carTypeId || 4,
      pickupDateTime: toSavaariDateTime(
        new Date(this.itinerary.pickupDate),
        this.itinerary.pickupTime
      ),
      ...(this.itinerary.duration && { duration: this.itinerary.duration }),
    }).subscribe({
      next: (res: CouponValidationResponse) => {
        this.isValidatingCoupon = false;
        if (res.valid) {
          this.couponApplied = true;
          this.couponDiscount = res.discountAmount || 0;
          this.couponMessage = res.message || 'Coupon applied!';
        } else {
          this.couponApplied = false;
          this.couponDiscount = 0;
          this.couponMessage = res.message || 'Invalid coupon code.';
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isValidatingCoupon = false;
        this.couponMessage = 'Failed to validate coupon. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  /** Remove applied coupon */
  removeCoupon() {
    this.couponCode = '';
    this.couponApplied = false;
    this.couponDiscount = 0;
    this.couponMessage = '';
    this.cdr.markForCheck();
  }

  /** Effective price after coupon discount */
  getEffectivePrice(): number {
    if (!this.selectedCar) return 0;
    return this.selectedCar.price - this.couponDiscount;
  }

  bookNow() {
    this.bookingError = '';

    if (!this.isPickupDetailsValid()) {
      this.bookingError = 'Please fill in all required pickup details.';
      this.cdr.markForCheck();
      return;
    }

    if (!this.isBookingWindowValid()) {
      this.bookingError = 'Bookings must be made at least 6 hours before pickup time.';
      this.cdr.markForCheck();
      return;
    }

    // TODO: Re-enable wallet balance check once wallet APIs are deployed.
    // Wallet APIs currently return 404, so balance is always ₹0.
    // Bypassing for demo — booking goes through with prePayment=0.
    this.processBooking();
  }

  /** Build API request and create booking — refreshes partner token first */
  private processBooking() {
    if (!this.itinerary || !this.selectedCar) return;

    this.isProcessingWallet = true;
    this.bookingError = '';
    this.cdr.markForCheck();

    // Always refresh the partner token before booking to avoid 404 from expired tokens
    this.auth.fetchPartnerToken().subscribe({
      next: () => {
        console.log('[BOOKING] Partner token refreshed, proceeding with booking...');
        this.executeBookingRequest();
      },
      error: (err) => {
        console.error('[BOOKING] Failed to refresh partner token:', err);
        // Try anyway with existing token
        this.executeBookingRequest();
      }
    });
  }

  /** Actually send the booking request to the API */
  private executeBookingRequest() {
    if (!this.itinerary || !this.selectedCar) return;

    const apiParams = this.tripTypeService.mapUiTabToApiParams(this.itinerary.tripType, {
      localPackage: this.itinerary.localPackage,
      airportSubType: this.itinerary.airportSubType,
    });

    // Use the actual computed prePayment amount based on the selected payment option.
    // The Savaari API requires prePayment >= 25% of fare — sending 0 causes 404 "Invalid pre payment".
    const prePaymentAmount = this.getPayNowAmount();

    const request: CreateBookingRequest = {
      // Trip details
      sourceCity: this.itinerary.fromCityId || 377,
      tripType: apiParams.tripType,
      subTripType: apiParams.subTripType,
      pickupDateTime: toSavaariDateTime(
        new Date(this.itinerary.pickupDate),
        this.itinerary.pickupTime
      ),
      duration: this.itinerary.duration || 1,

      // Addresses
      pickupAddress: this.pickupAddress || this.itinerary.pickupAddress || '',
      dropAddress: this.dropAddress || '',

      // Customer details
      customerTitle: 'Mr',
      customerName: this.guestName,
      customerEmail: this.guestEmail || this.agentEmail || undefined,
      customerMobile: this.phone,
      countryCode: this.selectedCountryCode?.isdCode || '91',
      customerSecondaryEmail: this.agentEmail || undefined,

      // Car & pricing
      carType: this.selectedCar.carTypeId || 4,
      premiumFlag: 0,
      prePayment: prePaymentAmount,

      // Destination (outstation)
      ...(this.itinerary.toCityId && { destinationCity: this.itinerary.toCityId }),

      // Airport-specific
      ...(this.itinerary.localityId && { localityId: this.itinerary.localityId }),

      // Coupon
      ...(this.couponApplied && this.couponCode && { couponCode: this.couponCode.trim() }),

      // Urgent booking flag (< 48h before pickup)
      ...(this.isBookingUrgent() && { Urgent_booking: '1' }),
    };

    console.log('[BOOKING] Sending request:', JSON.stringify(request, null, 2));

    this.bookingApi.createBooking(request).subscribe({
      next: (response) => {
        const bkId = response.bookingId || response.booking_id || '';
        this.bookingId = bkId;

        // Register booking ID for the bookings history page
        this.bookingRegistry.addBookingId(bkId);

        // TODO: Re-enable wallet deduction once wallet APIs are deployed.
        // this.walletService.deductForBooking(prePaymentAmount, bkId);

        // Update VAS (Value Added Services) if any were selected
        if (bkId && (this.vasLuggageCarrier || this.vasLanguageDriver)) {
          this.bookingApi.updateVasBooking(bkId, {
            luggageCarrier: this.vasLuggageCarrier,
            languageDriver: this.vasLanguageDriver,
          }).subscribe(); // Fire-and-forget — don't block confirmation
        }

        this.isProcessingWallet = false;
        this.bookingConfirmed = true;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isProcessingWallet = false;
        this.bookingError = err?.message || 'Booking failed. Please try again.';
        this.cdr.markForCheck();
      }
    });
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

  /** Set top-up amount from preset button */
  setTopUpAmount(amount: number) {
    this.topUpAmount = amount;
    this.topUpSuccess = false;
    this.cdr.markForCheck();
  }

  /** Process mock wallet top-up */
  processTopUp() {
    if (this.topUpAmount <= 0) return;
    this.isProcessingTopUp = true;
    this.topUpSuccess = false;
    this.cdr.markForCheck();

    // Simulate 2-second payment processing
    setTimeout(() => {
      this.walletService.addTopUp(this.topUpAmount, 'topup_' + Date.now());
      this.isProcessingTopUp = false;
      this.topUpSuccess = true;
      this.topUpAmount = 0;
      this.cdr.markForCheck();

      // Clear success message after 3 seconds
      setTimeout(() => {
        this.topUpSuccess = false;
        this.cdr.markForCheck();
      }, 3000);
    }, 2000);
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
      itineraryText = `${this.itinerary.fromCity} → ${this.itinerary.toCity} → ${this.itinerary.fromCity} (Round Trip)`;
    } else {
      itineraryText = `${this.itinerary.fromCity} → ${this.itinerary.toCity} (One Way)`;
    }

    const lines = [
      `*Booking Confirmation - Savaari*`,
      ``,
      `Booking ID: ${this.bookingId}`,
      `Trip: ${itineraryText}`,
      `Pickup: ${pickupDate}, ${this.itinerary.pickupTime || ''}`,
      this.pickupAddress ? `Address: ${this.pickupAddress}` : '',
      `Car: ${this.selectedCar.name || 'Sedan'}`,
      `Fare: ₹${(this.selectedCar.price || 0).toLocaleString('en-IN')}`,
      ``,
      `_Powered by Savaari - India's #1 Cab Service since 2006_`,
    ].filter(l => l !== undefined && l !== '');

    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  /** Print booking voucher */
  printVoucher() {
    window.print();
  }
}
