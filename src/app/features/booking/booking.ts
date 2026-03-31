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
import { AvailabilityService } from '../../core/services/availability.service';
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
  private availabilityService = inject(AvailabilityService);

  // Confetti canvas
  @ViewChild('confettiCanvas') confettiCanvas!: ElementRef<HTMLCanvasElement>;
  private confettiFired = false;

  // Browser back button interception
  private locationSub: any;

  // Session storage key for passenger details
  private readonly PASSENGER_STATE_KEY = 'b2b_passenger_state';

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

    // Pre-fetch localities for source and destination cities (cached after first load).
    // Pre-fetch localities for pickup and drop cities
    if (this.itinerary?.fromCityId) {
      this.localityService.getLocalities(this.itinerary.fromCityId).subscribe();
    }
    const dropCityId = this.itinerary?.toCitySourceId || this.itinerary?.toCityId;
    if (dropCityId) {
      this.localityService.getLocalities(dropCityId).subscribe();
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

    this.step1Complete = true;
    // Push history state so browser back button can be intercepted
    history.pushState({ step: 'payment' }, '', this.router.url);
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
    // Try toCitySourceId first (confirmed source city with localities), fall back to toCityId
    const cityId = this.itinerary?.toCitySourceId || this.itinerary?.toCityId;
    console.log('[BOOKING] searchDropAddress called, cityId:', cityId, 'query:', event.query);
    if (!cityId || !event.query) { this.dropSuggestions = []; return; }
    this.localityService.searchLocalities(cityId, event.query).subscribe(results => {
      this.dropSuggestions = results.map(l => l.name);
      console.log('[BOOKING] Drop suggestions:', this.dropSuggestions.length, 'results');
      this.cdr.markForCheck();
    });
  }

  /** Triggered when user selects a drop address from autocomplete (One Way) */
  onDropAddressSelected(_event: any): void {
    this.recalculateFareForDrop();
  }

  /** Triggered when drop address field loses focus (One Way) — catches free-text entry */
  onDropAddressBlur(): void {
    const addr = (typeof this.dropAddress === 'string' ? this.dropAddress : String(this.dropAddress || '')).trim();
    if (addr.length >= 3 && addr !== this.dropAddressProcessed) {
      this.recalculateFareForDrop();
    }
  }

  /**
   * Recalculate fare based on drop address for One Way trips.
   * Uses the availability API to get updated pricing with the drop location.
   * If the API returns a different fare, shows a popup to inform the user.
   */
  private recalculateFareForDrop(): void {
    if (!this.selectedCar || !this.itinerary || this.itinerary.tripType !== 'One Way') return;
    const addr = (typeof this.dropAddress === 'string' ? this.dropAddress : String(this.dropAddress || '')).trim();
    if (addr.length < 3 || addr === this.dropAddressProcessed) return;

    this.dropAddressProcessed = addr;
    this.isRecalculatingFare = true;
    this.previousFare = this.selectedCar.price;
    this.cdr.markForCheck();

    // Re-check availability with the same parameters to get updated fare
    const apiParams = this.tripTypeService.mapUiTabToApiParams(this.itinerary.tripType, {
      localPackage: this.itinerary.localPackage,
      airportSubType: this.itinerary.airportSubType,
    });

    this.availabilityService.checkAvailability({
      sourceCity: this.itinerary.fromCityId || 377,
      tripType: apiParams.tripType,
      subTripType: apiParams.subTripType,
      destinationCity: this.itinerary.toCityId,
      pickupDateTime: toSavaariDateTime(
        new Date(this.itinerary.pickupDate),
        this.itinerary.pickupTime
      ),
      duration: this.itinerary.duration || 1,
    }).subscribe({
      next: (response) => {
        this.isRecalculatingFare = false;
        // Find the same car type in the response
        const updatedCar = response.cars.find(c => String(c.carId) === String(this.selectedCar!.id) || c.carTypeId === this.selectedCar!.carTypeId);
        if (updatedCar && updatedCar.fare !== this.previousFare) {
          const oldPrice = this.previousFare;
          // Update the selectedCar price
          this.selectedCar!.price = updatedCar.fare;
          this.selectedCar!.originalPrice = updatedCar.fare;
          if (updatedCar.originalFare) {
            this.selectedCar!.regularPrice = updatedCar.originalFare;
          }
          // Update booking state
          this.bookingState.setSelectedCar(this.selectedCar!);

          // Show fare change popup
          this.fareChangeAmount = updatedCar.fare - oldPrice;
          this.showFareChangePopup = true;
          // Re-calculate wallet top-up shortfall
          this.autoFillTopUpShortfall();
        } else {
          // Fare unchanged — show brief confirmation
          this.fareChangeAmount = 0;
          this.showFareChangePopup = true;
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isRecalculatingFare = false;
        // Silently continue with existing fare if recalculation fails
        console.warn('[BOOKING] Fare recalculation failed, keeping original fare');
        this.cdr.markForCheck();
      }
    });
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

    if (this.paymentOption === 0) {
      this.bookingError = 'Please select a payment option.';
      this.cdr.markForCheck();
      return;
    }

    const payNow = this.getPayNowAmount();

    if (this.paymentMethod === 'razorpay') {
      // Direct Razorpay payment — no wallet balance check needed
      this.processRazorpayBooking(payNow);
    } else {
      // Wallet payment — check balance
      const currentBalance = this.walletService.getCurrentBalance();
      if (payNow > 0 && currentBalance < payNow) {
        this.bookingError = `Insufficient wallet balance. You need ₹${payNow.toLocaleString('en-IN')} but have ₹${currentBalance.toLocaleString('en-IN')}. Please top up your wallet or switch to Razorpay.`;
        this.cdr.markForCheck();
        return;
      }
      this.processBooking();
    }
  }

  /**
   * Process booking with Razorpay payment via PHP endpoints.
   *
   * Confirmed flow from Postman (Shubhendu's extraction):
   *   1. Create booking → get booking_id
   *   2. advance_payment_check.php → get advance amount + encoded_amount
   *   3. razor_createorder.php → get Razorpay order_id
   *   4. Open Razorpay SDK → user pays
   *   5. razor_checkhash.php → verify signature
   *   6. confirmation.php → confirm payment in backend
   *   7. email_sent → send booking confirmation email
   */
  private processRazorpayBooking(amount: number) {
    if (!this.itinerary || !this.selectedCar) return;

    this.isProcessingRazorpay = true;
    this.razorpayProcessingStage = 'booking';
    this.bookingError = '';
    this.cdr.markForCheck();

    // Mock mode: skip Razorpay, simulate payment success
    if (environment.useMockData) {
      setTimeout(() => {
        this.onRazorpayBookingSuccess(
          { razorpay_order_id: 'mock_order', razorpay_payment_id: 'mock_pay', razorpay_signature: 'mock_sig' },
          amount
        );
      }, 1500);
      return;
    }

    // Step 1: First create the booking, then handle payment
    this.auth.fetchPartnerToken().subscribe({
      next: () => this.executeRazorpayFlow(amount),
      error: () => this.executeRazorpayFlow(amount),
    });
  }

  /** Execute the full Razorpay payment flow after booking creation */
  private executeRazorpayFlow(prePaymentAmount: number) {
    if (!this.itinerary || !this.selectedCar) return;

    const apiParams = this.tripTypeService.mapUiTabToApiParams(this.itinerary.tripType, {
      localPackage: this.itinerary.localPackage,
      airportSubType: this.itinerary.airportSubType,
    });

    const request = this.buildBookingRequest(apiParams, prePaymentAmount);

    // Step 1: Create booking
    this.bookingApi.createBooking(request).subscribe({
      next: (response) => {
        const bkId = response.bookingId || response.booking_id || '';
        if (!bkId) {
          this.isProcessingRazorpay = false;
          this.bookingError = 'Booking creation failed. Please try again.';
          this.cdr.markForCheck();
          return;
        }

        this.bookingId = bkId;
        this.registerBookingData(bkId, response, request, prePaymentAmount, 'razorpay');

        // Step 2: Get advance payment details from PHP
        this.razorpayProcessingStage = 'payment';
        this.cdr.markForCheck();

        const tripTypeMap: Record<string, number> = { outstation: 1, local: 3, airport: 5 };
        const subTripTypeMap: Record<string, number> = { oneWay: 2, roundTrip: 1, '880': 4 };

        this.paymentService.checkAdvancePayment({
          t_id: tripTypeMap[apiParams.tripType] || 3,
          t_s_id: subTripTypeMap[apiParams.subTripType] || 4,
          c_id: this.itinerary!.fromCityId || 377,
          pick_date: request.pickupDateTime?.split(' ')[0] || '',
          car_id: this.selectedCar!.carTypeId || 43,
          tot_amt: this.selectedCar!.price,
          b_src: 0,
          pick_time: request.pickupDateTime?.split(' ')[1] || '12:00',
          IsPremium: 0,
          drop_city_id: this.itinerary!.toCityId || '',
        }).subscribe({
          next: (advanceResp) => {
            const advanceAmount = advanceResp.advance_amount || prePaymentAmount;
            const encodedAmount = (advanceResp as any).encoded_amount || '';
            const savaariPayId = this.paymentService.generateSavaariPaymentId(bkId);

            // Step 3: Create Razorpay order via PHP
            this.paymentService.createRazorpayOrder({
              amount: advanceAmount,
              encoded_amount: encodedAmount,
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

                // Step 4: Open Razorpay SDK
                const options: any = {
                  key: environment.razorpayKeyId,
                  amount: advanceAmount * 100, // Razorpay expects paise
                  currency: 'INR',
                  name: environment.brandName,
                  description: `Booking #${bkId} - ₹${advanceAmount}`,
                  order_id: razorpayOrderId,
                  handler: (rzpResponse: any) => {
                    // Step 5: Verify hash via PHP
                    this.paymentService.verifyRazorpayPayment({
                      razorpay_order_id: rzpResponse.razorpay_order_id,
                      razorpay_payment_id: rzpResponse.razorpay_payment_id,
                      razorpay_signature: rzpResponse.razorpay_signature,
                      savaari_pay_id: savaariPayId,
                      selectedAmount: advanceAmount,
                    }).subscribe({
                      next: (verified) => {
                        if (!verified) {
                          this.isProcessingRazorpay = false;
                          this.bookingError = 'Payment verification failed. Contact support.';
                          this.cdr.markForCheck();
                          return;
                        }

                        // Step 6: Confirm payment in backend
                        this.paymentService.confirmPayment({
                          advancedAmount: advanceAmount,
                          orderId: savaariPayId,
                          paymentId: rzpResponse.razorpay_payment_id,
                          paymentmode: 'savaariwebsite',
                        }).subscribe({
                          next: () => {
                            // Step 7: Send booking email (fire-and-forget)
                            this.bookingApi.sendBookingEmail(bkId).subscribe();

                            this.isProcessingRazorpay = false;
                            this.bookingConfirmed = true;
                            this.clearPassengerState();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            this.cdr.markForCheck();
                          },
                          error: () => {
                            // Payment confirmed but confirmation API failed — still show success
                            this.bookingApi.sendBookingEmail(bkId).subscribe();
                            this.isProcessingRazorpay = false;
                            this.bookingConfirmed = true;
                            this.clearPassengerState();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            this.cdr.markForCheck();
                          }
                        });
                      },
                      error: () => {
                        this.isProcessingRazorpay = false;
                        this.bookingError = 'Payment verification error. Contact support if money was deducted.';
                        this.cdr.markForCheck();
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
          },
          error: () => {
            this.isProcessingRazorpay = false;
            this.bookingError = 'Failed to check advance payment.';
            this.cdr.markForCheck();
          }
        });
      },
      error: (err) => {
        this.isProcessingRazorpay = false;
        this.bookingError = err?.message || 'Booking creation failed.';
        this.cdr.markForCheck();
      }
    });
  }

  /** Called after mock Razorpay payment succeeds in mock mode */
  private onRazorpayBookingSuccess(_razorpayResponse: any, prePaymentAmount: number) {
    const mockId = 'MOCK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    this.bookingId = mockId;
    this.bookingRegistry.addBookingId(mockId);
    this.isProcessingRazorpay = false;
    this.bookingConfirmed = true;
    this.clearPassengerState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.markForCheck();
  }

  /** Build a CreateBookingRequest from current form state */
  private buildBookingRequest(apiParams: { tripType: string; subTripType: string }, prePaymentAmount: number): CreateBookingRequest {
    const pickupLocality = typeof this.pickupAddress === 'string' ? this.pickupAddress : String(this.pickupAddress || '');
    const isAirport = apiParams.tripType === 'airport';

    return {
      sourceCity: this.itinerary!.fromCityId || 377,
      tripType: apiParams.tripType,
      subTripType: apiParams.subTripType,
      pickupDateTime: toSavaariDateTime(new Date(this.itinerary!.pickupDate), this.itinerary!.pickupTime),
      duration: this.itinerary!.duration || 1,
      pickupAddress: pickupLocality || this.itinerary!.pickupAddress || '',
      customerLatLong: '',
      locality: pickupLocality,
      dropAddress: this.dropAddress || '',
      customerTitle: 'Mr',
      customerName: this.guestName,
      customerEmail: this.guestEmail || this.agentEmail || undefined,
      customerMobile: this.phone,
      countryCode: this.selectedCountryCode ? `${this.selectedCountryCode.isdCode}|${this.selectedCountryCode.key?.split('|')[1] || 'IND'}` : '91|IND',
      customerSecondaryEmail: this.agentEmail || undefined,
      carType: this.selectedCar!.carTypeId || 4,
      premiumFlag: 0,
      prePayment: prePaymentAmount,
      invoicePayer: this.commissionService.getInvoicePayer(),
      ...(this.itinerary!.toCityId && { destinationCity: this.itinerary!.toCityId }),
      ...(this.itinerary!.localityId && { localityId: this.itinerary!.localityId }),
      // Airport-specific params (confirmed missing by Shubhendu — required for airport flow)
      ...(isAirport && {
        airport_id: this.itinerary!.airportId ? String(this.itinerary!.airportId) : '',
        airport_name: this.itinerary!.airportName || '',
        terminalId: this.itinerary!.terminalId || '',
        selectPlaceId: this.itinerary!.selectPlaceId || '',
        custShortAddress: pickupLocality || this.itinerary!.pickupAddress || '',
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
      itinerary: (this.itinerary?.fromCity || '') + ' → ' + (this.itinerary?.toCity || ''),
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

  /** Actually send the booking request to the API (wallet payment flow) */
  private executeBookingRequest() {
    if (!this.itinerary || !this.selectedCar) return;

    const apiParams = this.tripTypeService.mapUiTabToApiParams(this.itinerary.tripType, {
      localPackage: this.itinerary.localPackage,
      airportSubType: this.itinerary.airportSubType,
    });

    const prePaymentAmount = this.getPayNowAmount();
    const request = this.buildBookingRequest(apiParams, prePaymentAmount);

    console.log('[BOOKING] Sending request:', JSON.stringify(request, null, 2));

    this.bookingApi.createBooking(request).subscribe({
      next: (response) => {
        const bkId = response.bookingId || response.booking_id || '';
        this.bookingId = bkId;

        this.registerBookingData(bkId, response, request, prePaymentAmount, 'wallet');

        // Deduct wallet balance for booking payment
        if (bkId && prePaymentAmount > 0) {
          this.walletService.payForBooking(bkId, prePaymentAmount, this.paymentOption as 1 | 2 | 3).subscribe({
            next: (success) => {
              if (success) {
                console.log(`[BOOKING] Wallet deducted ₹${prePaymentAmount} for booking #${bkId}`);
              } else {
                console.warn(`[BOOKING] Wallet deduction failed for booking #${bkId}`);
              }
              this.walletService.loadBalance();
            },
            error: (err) => {
              console.warn('[BOOKING] Wallet deduction error:', err);
              this.walletService.loadBalance();
            }
          });
        } else {
          this.walletService.loadBalance();
        }

        // Send booking confirmation email (fire-and-forget)
        if (bkId) {
          this.bookingApi.sendBookingEmail(bkId).subscribe();
        }

        this.isProcessingWallet = false;
        this.bookingConfirmed = true;
        this.clearPassengerState();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isProcessingWallet = false;
        this.bookingError = err?.message || 'Booking failed. Please try again.';
        console.error('[BOOKING] Failed:', err?.status, err?.message);
        this.cdr.markForCheck();
      }
    });
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
      itineraryText = `${this.itinerary.fromCity} → ${this.itinerary.toCity} → ${this.itinerary.fromCity} (Round Trip)`;
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
