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
import { AnalyticsService } from '../../core/services/analytics.service';
// AvailabilityService removed — fare recalculation is now client-side (Haversine distance)
import { CreateBookingRequest, VasDetail } from '../../core/models';
import { toSavaariDateTime, calculateDuration, toSavaariDate, to24HourTime } from '../../core/utils/date-format.util';
import { decodeGSTIN, GSTINDecodeResult } from '../../core/utils/gstin-decoder';
import { Observable } from 'rxjs';
import { FooterComponent } from '../../components/layout/footer/footer';
import { environment } from '../../../environments/environment';
import { CanExitPayment } from '../../core/guards/payment-exit.guard';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, FormsModule, AutoCompleteModule, FooterComponent],

  templateUrl: './booking.html',
  styleUrl: './booking.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingComponent implements OnInit, OnDestroy, AfterViewChecked, CanExitPayment {
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

  // Shared brand/support info from environment (single source of truth)
  supportPhone = environment.supportPhone;
  supportPhoneTel = environment.supportPhoneTel;
  brandName = environment.brandName;
  companyName = environment.companyName;
  supportEmail = environment.supportEmail;

  itinerary: Itinerary | null = null;
  selectedCar: SelectedCar | null = null;

  // Form Fields
  guestName: string = '';
  guestEmail: string = '';
  agentEmail: string = '';
  agentMobile: string = '';
  pickupAddress: string = '';
  dropAddress: string = '';
  phone: string = '';
  landmark: string = '';
  selectedCountryCode: CountryCodeEntry | null = null;
  countryCodes: CountryCodeEntry[] = [];
  countryDropdownOpen = false;
  countrySearch = '';

  /** Airport route FROM label (locked field on booking page) */
  get airportRouteFrom(): string {
    if (!this.itinerary || this.itinerary.tripType !== 'Airport') return '';
    if (this.itinerary.airportSubType === 'pickup') {
      // Pickup from Airport: FROM = airport
      return this.itinerary.airportName || this.itinerary.dropAirport || '';
    }
    // Drop to Airport: FROM = user's address
    return this.itinerary.pickupAddress || this.itinerary.custShortAddress || '';
  }

  /** Airport route TO label (locked field on booking page) */
  get airportRouteTo(): string {
    if (!this.itinerary || this.itinerary.tripType !== 'Airport') return '';
    if (this.itinerary.airportSubType === 'pickup') {
      // Pickup from Airport: TO = user's address (destination)
      return this.itinerary.pickupAddress || this.itinerary.custShortAddress || '';
    }
    // Drop to Airport: TO = airport
    return this.itinerary.airportName || this.itinerary.dropAirport || '';
  }

  step1Complete = false;
  showRazorpayModal = false;

  // ─── VAS (Value Added Services) — Step 2 "Personalize Your Journey" ────
  // Populated from the booking-create response (vas_details[]) once the
  // agent clicks "Proceed to Next Step" on Step 1. Mirrors what consumer
  // savaari.com offers but rendered inline (not modal) above the B2B
  // payment options.
  //
  // CRITICAL: this feature is fully decoupled from the B2B payment options
  // (Pay Any Amount Now / Pay 25% Auto-Debit / Zero Cash). The VAS update
  // API returns a B2C-style payment_option block which is INTENTIONALLY
  // ignored — we only consume the new total fare and let the existing B2B
  // payment helpers (getPayNowAmount / getDeferredAmount /
  // getOption3BufferAmount) recompute on top of it.
  availableVasServices: VasDetail[] = [];
  /** vas_config_id → user's sub-option pick (only set when customer_input_flag === 'YES'). */
  vasSelections = new Map<string, { customer_input_data?: string; radioIndex?: number }>();
  /** Snapshot of the original car price BEFORE any VAS so we can revert when all are cleared. */
  preVasFare = 0;
  /** Total VAS amount (incl. GST) currently applied — drives the sidebar "Special Services" line. */
  vasAmount = 0;
  /** GST portion of the VAS amount — surfaced separately in the fare breakup. */
  vasGstAmount = 0;
  /** Human-readable list of selected VAS names from the API response. */
  vasNamesList = '';
  /** True while a vas_booking_update call is in flight. */
  vasUpdateLoading = false;
  /** Debounce timer so rapid toggles collapse into a single API call. */
  private vasUpdateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Captured from booking-create response — used for PerKM VAS calc + the
   *  pre_vas_booking_package_km field on the update payload. */
  vasPackageKm = 0;
  /** Same — for the pre_vas_booking_package_hr field (0 for outstation). */
  vasPackageHr = 0;
  /**
   * Toast-style error shown when the agent picks two mutually exclusive VAS
   * services (currently only Diesel Car Guarantee + New Car Promise — matches
   * the B2C "cannot be serviced together due to Govt. Policy" rule). When set,
   * a black banner renders below the VAS list. Cleared by the timer below or
   * by the user clicking the close button.
   */
  vasConflictError: string | null = null;
  /** Auto-dismiss timer for vasConflictError (5s). Cancelled if user closes manually. */
  private vasConflictTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * True after booking is created on Step 1 AND there are VAS options to
   * present. While this flag is true the agent stays on Step 1 — the
   * Proceed button hides, the VAS section appears below the form, and a
   * "Continue to Payment" button advances to Step 2. If the trip has no
   * VAS (vas_flag !== 1 / empty list), we skip this intermediate state
   * entirely and auto-advance to Step 2 as before.
   */
  vasReady = false;

  // 1 = "Pay any amount now" (default), 2 = "Pay 25% now, rest auto-deducted",
  // 3 = "Zero cash". Defaulting to 1 per April 2026 QA direction so the
  // Booking Summary lands on a sensible amount instead of "Select a plan".
  // 0 is still reachable if the agent explicitly toggles the active card off.
  paymentOption = 1;

  /**
   * Feature flag — temporarily hide Payment Option 3 ("Zero Cash for your
   * customer") from the UI. Per business team direction (April 2026) the
   * agent should only see Option 1 (Pay Any Amount Now) and, for non-urgent
   * trips, Option 2 (Pay 25% Now, Rest Auto-Debited).
   *
   * The Option 3 card is the only thing wrapped on this flag — every code
   * path that handles paymentOption === 3 (analytics, settle, refund,
   * buffer math, confirmation view) is left intact so re-enabling is a
   * single one-line flip back to true. No new bookings will reach those
   * branches while this flag is false because the agent can't pick the
   * option from the UI.
   */
  readonly showPaymentOption3 = true;

  // Analytics dedup: tracks the last paymentOption we fired enter-payment for.
  // Prevents duplicate events when the agent re-clicks the same option, while
  // still firing fresh events when they switch options. Set on entry fire and
  // updated inside setPaymentOption() before each fire.
  private lastFiredPaymentOption: number | null = null;

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

  // Full-screen confirmation overlay — shown after payment while waiting for backend
  isConfirmingPayment = false;
  confirmationStage: 'deducting' | 'verifying' | 'confirming' | 'finalizing' = 'deducting';
  confirmationPaidAmount = 0;
  confirmationPaidVia: 'wallet' | 'razorpay' = 'wallet';

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
  // Full paymentOption blob from booking create response — needed because the
  // backend returns multiple pre-computed (amount, encoded) pairs:
  //   amount20per/amount20perEncoded, amount25per/amount25perEncoded,
  //   amount30per/amount30perEncoded, amount50per/amount50perEncoded,
  //   amountFull/amountFullEncoded, amountAdv/amountAdvEncoded
  // razor_createorder.php REQUIRES the matching encoded SHA1 — sending an empty
  // encoded_amount makes the backend respond { order_id: null }, which breaks
  // the entire Razorpay chain (createorder → SDK → checkhash → confirmation).
  private paymentOptionParams: Record<string, number> = {};
  private paymentOptionEncoded: Record<string, string> = {};

  // From place_id API responses — used in booking create
  private pickupPlaceName = '';        // place_name → locality
  private pickupAliasSourceCityId = 0; // source_city_map_info.city_id → alias_source_city_id
  private dropPlaceName = '';          // place_name for drop
  private dropSublocality = '';        // sublocality → dropLocality
  private dropAliasDestCityId = 0;     // destination_city_map_info.city_id → alias_dest_city_id

  // Surge from booking API response (real data, not mockup)
  showSurgeBanner = false;
  surgeDetails: { oldPrice: number; newPrice: number; surge: number; message: string; oldKm: number; newKm: number } | null = null;

  // Fare recalculation (One Way drop address) — kept for state tracking
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
  private analytics = inject(AnalyticsService);

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
    // Pre-fill the AGENT PHONE NUMBER field (top, mandatory, ngModel `phone`)
    // from the logged-in agent's profile so they don't re-type it every booking.
    // This is the field that gets sent to backend as `customerMobile` and
    // therefore receives all trip SMS / driver-allocation alerts. Per April
    // 2026 ask the agent's own number lands here by default. Editable on a
    // per-booking basis if they need a different point-of-contact for the trip.
    //
    // Profile mobile may arrive with the country code already glued on
    // (e.g. "917030343566") — the input has maxlength=10 but ngModel sets
    // bypass that limit, leaving the value invalid. Strip leading "91"/"0"
    // and keep only the last 10 digits to land on a clean 10-digit number.
    //
    // The bottom-row `agentMobile` ngModel is now the optional Customer Phone
    // Number field — it stays empty by default, agent fills it explicitly.
    const profileMobileRaw = this.auth.getUserProfile()?.mobileno
                          || this.auth.getUserProfile()?.phone
                          || '';
    const cleaned = String(profileMobileRaw).replace(/\D+/g, ''); // digits only
    if (cleaned) {
      this.phone = cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
    }

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
      this.needsGstInvoice = true; // Per product feedback: auto-tick if GST filled
      this.gstManualEntry = false;
    }

    // Initial sync
    this.itinerary = this.bookingState.getItinerary();
    this.selectedCar = this.bookingState.getSelectedCar();

    // NOTE: enter-info analytics event is NOT fired here on page load.
    // It fires in proceedToPayment() after the agent fills details and
    // clicks "Proceed to Next" — matching the backend team spec (April 2026)
    // which maps enter-info to the agent completing Step 1 and moving to Step 2.

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

    // Pre-fill address from itinerary (entered on dashboard) when booking page loads fresh
    this.prefillAddressFromItinerary();

    // Intercept browser back button: if on payment step, go back to passenger details instead of leaving
    this.locationSub = this.location.subscribe((event) => {
      if (event.type === 'popstate' && this.step1Complete && !this.bookingConfirmed) {
        // Push state back so we stay on this page
        this.location.go(this.router.url);
        // Same cleanup as goBackFromBooking — coming back to Step 2 lands
        // on Option 1 (Pay any amount now) per April 2026 default-payment
        // direction so the Booking Summary always shows a usable amount.
        this.paymentOption = 1;
        this.paymentMethod = 'wallet';
        this.showWalletConfirm = false;
        this.showTopUpConfirm = false;
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
    // Cancel any pending VAS timers so navigating away doesn't push a stale
    // toast onto a destroyed view (or fire an API call we no longer care about).
    if (this.vasUpdateDebounceTimer) {
      clearTimeout(this.vasUpdateDebounceTimer);
      this.vasUpdateDebounceTimer = null;
    }
    if (this.vasConflictTimer) {
      clearTimeout(this.vasConflictTimer);
      this.vasConflictTimer = null;
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

    // NOTE: enter-info fires in executeBookingOnProceed() success callback
    // (after booking is created) so booking_id is available in the payload.

    // Save passenger details before proceeding
    this.savePassengerState();

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
    const request = this.buildBookingRequest(apiParams);

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
          // Alpha returns 9+ payment gateway entries; only the PayPay entry
          // (payment_gateway_code: 15) carries `parametersEncoded` SHA1 hashes
          // that razor_createorder.php needs. Beta returns just one entry at [0].
          // Find the gateway with parametersEncoded — that's the Razorpay-compatible one.
          const payOpts = dataItem.paymentOptions || [];
          const razorpayOpt = payOpts.find(
            (p: any) => p?.parametersEncoded && Object.keys(p.parametersEncoded).length > 0
          ) || payOpts.find((p: any) => p?.payment_gateway_code === 15 || p?.vendor === 'PayPay')
            || payOpts[0];
          if (razorpayOpt) {
            this.advanceAmount = razorpayOpt?.parameters?.amount25per || razorpayOpt?.parameters?.amountAdv || this.advanceAmount;
            this.encodedAmount = razorpayOpt?.parametersEncoded?.amount25perEncoded || razorpayOpt?.parametersEncoded?.amountAdvEncoded || this.encodedAmount;
            // Cache the full (amount, encoded) pair set so processRazorpayPayment
            // can pick the correct hash when the user pays a non-25% amount
            // (slider 50%, urgent 100%, etc.). razor_createorder.php returns
            // null order_id without the matching encoded SHA1.
            this.paymentOptionParams = (razorpayOpt?.parameters || {}) as Record<string, number>;
            this.paymentOptionEncoded = (razorpayOpt?.parametersEncoded || {}) as Record<string, string>;

            if (!environment.production) {
              const bucketSummary = Object.keys(this.paymentOptionParams)
                .filter(k => this.paymentOptionEncoded[`${k}Encoded`])
                .map(k => `${k}=₹${this.paymentOptionParams[k]}`)
                .join(', ');
              console.log('[Booking] Backend bucket hashes available:', bucketSummary || '(NONE)');
              console.log('[Booking] Total fare:', this.selectedCar?.price || 0);
            }
          }
        }
        // Fallback: generate savaari_payment_id if API didn't return one
        if (!this.savaariPayId) {
          this.savaariPayId = this.paymentService.generateSavaariPaymentId(bkId);
        }

        // ─── Capture VAS list for Step 2 "Personalize Your Journey" section ───
        // The booking-create response carries vas_details[] when vas_flag === 1.
        // We snapshot the pre-VAS fare so we can revert if the agent unchecks
        // every option, and reset any prior selections from a previous booking
        // attempt on this same component instance.
        this.vasSelections.clear();
        this.vasAmount = 0;
        this.vasGstAmount = 0;
        this.vasNamesList = '';
        if (dataItem?.vas_flag === 1 && Array.isArray(dataItem.vas_details) && dataItem.vas_details.length) {
          this.availableVasServices = dataItem.vas_details as VasDetail[];
          // tripKilometer / tripHour come back from the booking response —
          // capture them here so PerKM VAS can compute its own total and the
          // update payload carries the right pre_vas_booking_package_* values.
          this.vasPackageKm = Number(dataItem.tripKilometer) || 0;
          this.vasPackageHr = Number(dataItem.tripHour) || 0;
          this.preVasFare = this.selectedCar?.price || 0;
        } else {
          this.availableVasServices = [];
          this.vasPackageKm = 0;
          this.vasPackageHr = 0;
          this.preVasFare = 0;
        }

        // Handle oneway surge from booking API response (real data, not mockup)
        if (dataItem?.oneway_surge_flag === 1 && dataItem?.oneway_surge_details) {
          const surge = dataItem.oneway_surge_details;
          this.surgeDetails = {
            oldPrice: surge.oldPrice || 0,
            newPrice: surge.newPrice || 0,
            surge: surge.surge || 0,
            message: surge.message || '',
            oldKm: surge.old_km || 0,
            newKm: surge.new_km || 0,
          };
          // Update fare with real surge price from API
          if (surge.newPrice && this.selectedCar) {
            this.previousFare = this.selectedCar.price;
            this.selectedCar.price = surge.newPrice;
            this.bookingState.setSelectedCar(this.selectedCar);
          }
          this.showSurgeBanner = true;
        }

        this.registerBookingData(bkId, response, request, prePayment, 'razorpay');

        // Booking created → show payment page
        this.isCreatingBooking = false;
        // Analytics: enter-info fires here — booking_id now available from API.
        // Fires before enter-payment (Step 1 complete → Step 2 about to show).
        this.analytics.trackEnterInfo({
          booking_id: String(bkId),
          trip_type: this.itinerary?.tripType || '',
          trip_subtype: this.itinerary?.subTripType || this.itinerary?.airportSubType || this.itinerary?.localPackage || '',
          car_type: this.selectedCar?.type || '',
          car_rate: this.selectedCar?.price || 0,
        });
        // Analytics: enter-payment fires here too because Step 2 lands with a
        // pre-selected payment option (default = Option 1). If the agent never
        // changes the radio selection, setPaymentOption() never runs, so
        // enter-payment would otherwise never fire. We mirror the values
        // setPaymentOption() would compute for the current paymentOption.
        const paymentType: 'PARTPAID' | 'FULLPAID' = this.paymentOption === 3 ? 'FULLPAID' : 'PARTPAID';
        const paymentPercentage = this.paymentOption === 3 ? 100 : this.paymentOption === 2 ? 25 : this.option1SliderPercent;
        this.analytics.trackEnterPayment({
          booking_id: String(bkId),
          trip_type: this.itinerary?.tripType || '',
          trip_subtype: this.itinerary?.subTripType || this.itinerary?.airportSubType || this.itinerary?.localPackage || '',
          car_rate: this.selectedCar?.price || 0,
          payment_type: paymentType,
          payment_percentage: paymentPercentage,
        });
        // Remember which option we just fired for so setPaymentOption() can
        // skip duplicate fires when the agent re-clicks the same option.
        this.lastFiredPaymentOption = this.paymentOption;

        // ─── Step 1 → Step 2 transition logic ─────────────────────────
        // If the trip carries any VAS the agent can pick from, stay on
        // Step 1: hide the Proceed button, reveal the "Personalize Your
        // Journey" section below the form, and let the agent select before
        // continuing to payment via the new Continue button.
        // If there's nothing to upsell, auto-advance to Step 2 immediately
        // so the flow feels identical to the pre-VAS behaviour.
        if (this.availableVasServices.length > 0) {
          this.vasReady = true;
          // Scroll to bring the new VAS section into view.
          setTimeout(() => {
            const el = document.getElementById('vas-section');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        } else {
          this.step1Complete = true;
          history.pushState({ step: 'payment' }, '', this.router.url);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
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
    if (!this.itinerary || !this.selectedCar) return;

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
      tot_amt: this.selectedCar.regularPrice || this.selectedCar.price,
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
        this.pickupSuggestions = results.map(r => this.stripCountry(r.description));
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
        this.dropSuggestions = results.map(r => this.stripCountry(r.description));
        this.cdr.markForCheck();
      });
  }

  /** When user selects a pickup address from localities list */
  onPickupAddressSelect(event: any): void {
    const selected: string = event?.value || event;
    const match = this.pickupSuggestionsRaw.find(s => this.stripCountry(s.description) === selected);
    if (!match?.place_id) return;

    // Resolve place_id to get place_name (locality) + lat/lng for fare calc + alias IDs for booking create.
    this.addressAutocomplete.getPlaceDetails(match.place_id, 'from').subscribe(details => {
      if (!details) return;

      this.pickupPlaceName = details.name;
      this.pickupLatLng = { lat: details.lat, lng: details.lng };
      this.pickupAliasSourceCityId = details.aliasSourceCityId;

      this.cdr.markForCheck();
    });
  }

  /** When user selects a drop address from localities list */
  onDropAddressSelect(event: any): void {
    const selected: string = event?.value || event;
    const match = this.dropSuggestionsRaw.find(s => this.stripCountry(s.description) === selected);
    if (!match?.place_id) return;

    // Always use request='from' — request='to' returns empty location/city data from Savaari API.
    // aliasSourceCityId is populated reliably; use as fallback for aliasDestCityId.
    this.addressAutocomplete.getPlaceDetails(match.place_id, 'from').subscribe(details => {
      if (!details) return;

      this.dropPlaceName = details.name;
      this.dropSublocality = details.sublocality;
      this.dropLatLng = { lat: details.lat, lng: details.lng };
      this.dropAliasDestCityId = details.aliasDestCityId || details.aliasSourceCityId;

      // Surge/fare recalculation happens server-side on booking create (not client-side).
      // Real surge data comes from booking API response's oneway_surge_details.

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
    // Airport bookings: addresses are locked (pre-filled from dashboard), only need name + phone
    if (this.itinerary?.tripType === 'Airport') {
      return this.isGuestNameValid() && this.isPhoneValid();
    }
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

  /** Remove trailing ", India" from address suggestions for cleaner display */
  private stripCountry(desc: string): string {
    return desc ? desc.replace(/,\s*India$/i, '') : '';
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

    // Analytics: agent selected a payment option — fire enter-payment.
    // payment_type: Option 3 (full wallet) = FULLPAID, options 1/2 = PARTPAID.
    // payment_percentage: option 1 uses slider value, option 2 = 25%, option 3 = 100%.
    // Dedup: skip if the agent re-clicked the same option we already fired
    // (entry fire on Step 2 sets lastFiredPaymentOption to the default).
    if (this.bookingId && option !== this.lastFiredPaymentOption) {
      const paymentType = option === 3 ? 'FULLPAID' : 'PARTPAID';
      const paymentPercentage = option === 3 ? 100 : option === 2 ? 25 : this.option1SliderPercent;
      this.analytics.trackEnterPayment({
        booking_id: String(this.bookingId),
        trip_type: this.itinerary?.tripType || '',
        trip_subtype: this.itinerary?.subTripType || this.itinerary?.airportSubType || this.itinerary?.localPackage || '',
        car_rate: this.selectedCar?.price || 0,
        payment_type: paymentType,
        payment_percentage: paymentPercentage,
      });
      this.lastFiredPaymentOption = option;
    }

    // Tell the backend who pays the invoice — per backend team guidance
    // (April 2026): this must fire on payment-option selection, NOT on
    // booking creation. Option 1 / 2 → customer eventually pays (slider /
    // auto-debit model), Option 3 → agent pre-pays in full.
    //
    // Guarded on bookingId so we never fire before Step 2 (booking create
    // completed on "Proceed to Next"). Fire-and-forget: a failure here
    // must not block the agent from picking an option, since the next
    // screen (Razorpay / wallet settle) still works without this API
    // succeeding. We just log so anything weird shows up in the console.
    if (this.bookingId) {
      const invoicePayer = option === 3 ? 'pay_by_agent' : 'pay_by_customer';
      this.bookingApi.updateInvoicePayerInfo(this.bookingId, invoicePayer).subscribe({
        next: () => {
          if (!environment.production) {
            console.log('[Booking] invoice_payer updated:', invoicePayer, '(option', option + ')');
          }
        },
        error: (err) => {
          console.warn('[Booking] update_invoice_payer_info failed (non-blocking):', err);
        },
      });
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

  /**
   * Returns true when pickup is < 48 hours away.
   *
   * Used SOLELY for hiding Payment Option 2 ("Pay 25% Now, Rest Auto-Debited")
   * — that option's auto-debit cron runs 48 hours before the trip, so it's
   * pointless / impossible for trips closer than that.
   *
   * NOTE (May 2026): This is no longer wired into Urgent_booking or VAS
   * suppression. Per stakeholder direction, VAS visibility is 100% backend-
   * driven now (we just check `vas_flag === 1` in the booking-create response)
   * and Urgent_booking is forwarded only when backend's own
   * `urgent_booking_flag` is 1 — we don't second-guess that signal client-side.
   */
  isBookingUrgent(): boolean {
    const pickupDt = this.getPickupDateTime();
    if (!pickupDt) return false;

    const now = new Date();
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
    // ALWAYS base slider / percentages on the CURRENT displayed fare
    // (this.selectedCar.price), which may have been updated after pickup/drop
    // lat-lng recalculation on this page. The user sees ₹2,623 → 25% must
    // equal ₹656, not some stale regularPrice-based floor.
    const total = this.selectedCar.price;
    const option = optionOverride !== undefined ? optionOverride : this.paymentOption;
    const isUrgent = this.isBookingUrgent();

    // Option 1: Flexible Agent — slider % of the *current* trip fare.
    if (option === 1) {
      return Math.round(total * (this.option1SliderPercent / 100));
    }

    // Option 2: Pay 25% now, rest auto-deducted
    // Urgent (<48h): 100% now (no time for auto-deduction)
    // Advance (>48h): 25% now, 75% auto-deducted 48h before trip
    if (option === 2) {
      return isUrgent ? total : Math.round(total * 0.25);
    }

    // Option 3: Zero cash
    // Urgent (<48h): 100% + 20% buffer now (buffer refunded post-trip)
    // Advance (>48h): 25% now, (75% + 20% buffer) auto-deducted 48h before trip
    if (option === 3) {
      return isUrgent ? Math.round(total * 1.20) : Math.round(total * 0.25);
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

  /** Professional KMs display — returns "183 km" or "183 (175 + 8) km" or fallback. */
  get displayKms(): string {
    if (!this.selectedCar) return '—';
    const raw = this.selectedCar.kmsIncluded || '';
    if (!raw) return '—';
    // If already in format "183 (175 + 8) km" or "183 km" → normalize and return
    const s = String(raw).trim();
    // Match "NNN (NNN + NN) km"
    const breakdown = s.match(/(\d+)\s*\((\d+)\s*\+\s*(\d+)\)\s*km/i);
    if (breakdown) return `${breakdown[1]} km`;
    // Match leading number + optional suffix
    const num = s.match(/^(\d+)/);
    return num ? `${num[1]} km` : s;
  }

  /** Pickup full address for display in confirmation (prefers selected address, falls back to city). */
  get displayPickupAddress(): string {
    const addr = (this.pickupAddress || '').trim();
    const city = this.itinerary?.fromCity || '';
    if (addr && addr !== city) return `${addr}, ${city}`;
    return city;
  }

  /** Drop full address for display in confirmation. */
  get displayDropAddress(): string {
    const addr = (this.dropAddress || '').trim();
    const city = this.itinerary?.toCity || '';
    if (addr && addr !== city) return `${addr}, ${city}`;
    return city;
  }

  /** Returns formatted pickup date + time for confirmation header. */
  get displayPickupDateTime(): string {
    if (!this.itinerary?.pickupDate) return '';
    const d = new Date(this.itinerary.pickupDate);
    const day = d.getDate();
    const suffix = (n: number) => (n >= 11 && n <= 13) ? 'th' : (['st','nd','rd'][((n - 1) % 10)] || 'th');
    const month = d.toLocaleString('en-US', { month: 'long' });
    const year = d.getFullYear();
    return `${day}${suffix(day)} ${month} ${year} at ${this.itinerary.pickupTime || ''}`;
  }

  bookNow() {
    this.bookingError = '';

    if (this.paymentOption === 0) {
      this.bookingError = 'Please select a payment option.';
      this.cdr.markForCheck();
      return;
    }

    if (!this.bookingId) {
      this.bookingError = 'No booking found. Please go back and try again.';
      this.cdr.markForCheck();
      return;
    }

    const payNow = this.getPayNowAmount();

    // Wallet balance check (early — before hitting server)
    if (this.paymentMethod === 'wallet') {
      const currentBalance = this.walletService.getCurrentBalance();
      if (payNow > 0 && currentBalance < payNow) {
        this.bookingError = `Insufficient wallet balance. You need ₹${payNow.toLocaleString('en-IN')} but have ₹${currentBalance.toLocaleString('en-IN')}. Please top up your wallet or switch to Razorpay.`;
        this.cdr.markForCheck();
        return;
      }
    }

    // Trust the bookingId returned by partner-API POST /booking (the
    // authoritative create response). We previously did a pre-flight call
    // to b2b-api/booking-details to verify the booking existed before
    // charging, but that endpoint runs against the b2b reporting DB which
    // has eventual-consistency lag for freshly-created bookings (returns
    // 204 No Content for several seconds after creation). That was
    // wrongly blocking the Razorpay flow for every new agent — Pay click
    // never reached razor_createorder.php.
    //
    // Both downstream payment APIs perform their own server-side
    // validation, so a fake/invalid bookingId still surfaces a meaningful
    // error from them — no risk of silent money deduction:
    //   - Razorpay: razor_createorder.php rejects bad IDs (modal never
    //     opens, no charge possible)
    //   - Wallet: wallet/pay rejects bad IDs (no deduction)
    if (this.paymentMethod === 'razorpay') {
      this.processRazorpayPayment(payNow);
    } else {
      this.processWalletPayment(payNow);
    }
  }

  /**
   * Build Razorpay prefill object with the AGENT's details (not the customer).
   * Per backend team feedback (April 2026): prefill.name and prefill.contact
   * must be of the logged-in agent, not the passenger being booked.
   *   - name:    firstname + lastname from login response
   *   - email:   agent email
   *   - contact: mobileno (includes country code) or phone as fallback
   */
  private buildRazorpayPrefill(): { name: string; email: string; contact: string } {
    const user = this.auth.getUserProfile();
    const first = (user?.firstname || '').trim();
    const last = (user?.lastname || '').trim();
    const name = [first, last].filter(Boolean).join(' ');
    const contact = String(user?.mobileno || user?.phone || '').replace(/\D/g, '');
    return {
      name,
      email: this.auth.getUserEmail(),
      contact,
    };
  }

  /**
   * Resolve the amount to send to razor_createorder.php.
   *
   * Per backend team (April 2026): send the EXACT slider amount — do NOT
   * send encoded_amount. Backend will re-enable a raw-amount validation
   * path later. Until then, the slider works for all 5% increments
   * (25, 30, … 100) without snapping to a bucket.
   */
  private resolveRazorpayChargePair(requestedAmount: number): { amount: number; encoded: string; matchedKey: string } {
    if (!environment.production) {
      const total = this.selectedCar?.price || 0;
      const pct = total > 0 ? Math.round((requestedAmount / total) * 100) : 0;
      console.log(`[Razorpay] Sending exact slider amount: ₹${requestedAmount} (${pct}% of ₹${total})`);
    }
    return { amount: requestedAmount, encoded: '', matchedKey: 'exact_slider' };
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

    if (environment.demoMode) {
      const bkId = this.bookingId;
      const advanceAmount = amount;
      this.isProcessingRazorpay = true;
      this.isConfirmingPayment = true;
      this.confirmationStage = 'verifying';
      this.confirmationPaidAmount = advanceAmount;
      this.confirmationPaidVia = 'razorpay';
      this.cdr.markForCheck();
      setTimeout(() => {
        this.confirmationStage = 'confirming';
        this.cdr.markForCheck();
        setTimeout(() => {
          this.confirmationStage = 'finalizing';
          this.cdr.markForCheck();
          this.updateRegistryPayment(bkId, advanceAmount, 'razorpay');
          setTimeout(() => {
            this.isProcessingRazorpay = false;
            this.isConfirmingPayment = false;
            this.bookingConfirmed = true;
            this.clearPassengerState();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            this.cdr.markForCheck();
          }, 800);
        }, 800);
      }, 800);
      return;
    }

    this.isProcessingRazorpay = true;
    this.razorpayProcessingStage = 'payment';
    this.bookingError = '';
    this.cdr.markForCheck();

    const bkId = this.bookingId;

    // Resolve the slider amount to the nearest backend bucket so `amount`
    // and `encoded_amount` stay consistent. razor_createorder.php rejects
    // any mismatch with 401 and returns a null order_id.
    const resolved = this.resolveRazorpayChargePair(amount);
    const advanceAmount = resolved.amount;
    const encodedAmount = resolved.encoded;
    const savaariPayId = this.savaariPayId || this.paymentService.generateSavaariPaymentId(bkId);
    this.savaariPayId = savaariPayId;
    this.advanceAmount = advanceAmount;

    if (!environment.production) {
      console.log('[Razorpay] createorder request:', {
        amount: advanceAmount,
        encoded_amount: encodedAmount ? `${encodedAmount.slice(0, 10)}…` : '(empty)',
        savaari_payment_id: savaariPayId,
        requestedAmount: amount,
        matchedKey: resolved.matchedKey,
        totalFare: this.selectedCar?.price || 0,
      });
    }

    // Step 1: Create Razorpay order via PHP (fresh order at current amount)
    // NOTE: encoded_amount intentionally NOT sent — backend team will
    // re-enable a raw-amount path later. See payment.service comment.
    void encodedAmount;
    this.paymentService.createRazorpayOrder({
      amount: advanceAmount,
      savaari_payment_id: savaariPayId,
      // Initial booking — first advance payment, NOT a settle-balance call.
      // Backend keys off this to INSERT a fresh sv_advance_payment row instead
      // of UPDATEing the latest one (which would overwrite a prior payment).
      settlement_flag: 0,
    }).subscribe({
      next: (orderResp) => {
        const razorpayOrderId = orderResp?.razorpay_order_id || orderResp?.order_id || '';
        if (!orderResp || !razorpayOrderId) {
          this.isProcessingRazorpay = false;
          this.bookingError = 'Failed to create payment order. Please try again.';
          if (!environment.production) console.error('[Razorpay] createorder returned empty order_id:', orderResp);
          this.cdr.markForCheck();
          return;
        }

        // Step 2: Open Razorpay SDK
        const options: any = {
          key: environment.razorpayKeyId,
          amount: advanceAmount * 100, // Razorpay expects paise
          currency: 'INR',
          name: environment.brandName,
          description: `Booking ${bkId} - INR ${advanceAmount}`,
          order_id: razorpayOrderId,
          handler: (rzpResponse: any) => {
            // Post-payment flow (HAR-confirmed):
            //   1. razor_checkhash.php → verify payment signature
            //   2. autologin → refresh B2B JWT
            //   3. email_sent × 2 → send confirmation emails
            //   4. confirmation.php → mark booking as paid (writes db rows)
            //
            // NOTE: settlement-payment is intentionally NOT called here. Per the
            // user's flow (April 2026), settlement should only fire when the agent
            // clicks "Settle Now" from the Manage Bookings page — handled by
            // bookings.ts confirmSettle(). Auto-calling it here was prematurely
            // marking the booking as fully paid.

            const razorpayPaymentId = rzpResponse.razorpay_payment_id || '';
            const rzpOrderId = rzpResponse.razorpay_order_id || razorpayOrderId;
            const razorpaySignature = rzpResponse.razorpay_signature || '';

            // Guard: Razorpay SDK should always return these. If any is empty
            // (e.g. because razor_createorder returned a null order_id and we
            // opened the modal anyway), checkhash will fail and confirmation
            // must NOT happen.
            if (!razorpayPaymentId || !rzpOrderId || !razorpaySignature) {
              this.isProcessingRazorpay = false;
              this.bookingError = 'Payment response incomplete. Please contact support with your transaction details.';
              if (!environment.production) console.error('[Razorpay] SDK callback missing fields:', rzpResponse);
              this.cdr.markForCheck();
              return;
            }

            /** Show full-screen overlay and finalize */
            const showBookingConfirmed = () => {
              this.confirmationStage = 'finalizing';
              this.cdr.markForCheck();

              this.auth.autoLogin().subscribe();
              this.paymentService.sendConfirmationEmail(bkId).subscribe();
              this.updateRegistryPayment(bkId, advanceAmount, 'razorpay');

              // Brief pause on "finalizing" then show confirmation
              setTimeout(() => {
                this.isProcessingRazorpay = false;
                this.isConfirmingPayment = false;
                this.bookingConfirmed = true;
                // Analytics: booking successfully confirmed via Razorpay.
                this.analytics.trackBookingConfirmed({
                  booking_id: String(bkId),
                  payment_type: this.paymentOption === 3 ? 'FULLPAID' : 'PARTPAID',
                  payment_percentage: this.paymentOption === 3 ? 100 : this.paymentOption === 2 ? 25 : this.option1SliderPercent,
                  payment_amount: advanceAmount,
                  car_rate: this.selectedCar?.price || 0,
                  booking_amount: this.selectedCar?.price || 0,
                  booking_type: 'Confirmed booking',
                  ...this.buildBookingTripContext(),
                });
                this.clearPassengerState();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                this.cdr.markForCheck();
              }, 1200);
            };

            // Show full-screen overlay as soon as Razorpay modal closes
            this.isConfirmingPayment = true;
            this.confirmationStage = 'verifying';
            this.confirmationPaidAmount = advanceAmount;
            this.confirmationPaidVia = 'razorpay';
            this.cdr.markForCheck();

            // Step 1: Verify payment hash (razor_checkhash.php)
            this.paymentService.verifyRazorpayPayment({
              razorpay_order_id: rzpOrderId,
              razorpay_payment_id: razorpayPaymentId,
              razorpay_signature: razorpaySignature,
              savaari_pay_id: savaariPayId,
              selectedAmount: advanceAmount,
            }).subscribe({
              next: (verified) => {
                if (!verified) {
                  this.isProcessingRazorpay = false;
                  this.isConfirmingPayment = false;
                  this.bookingError = 'Payment verification failed. Please contact support with payment ID: ' + razorpayPaymentId;
                  this.cdr.markForCheck();
                  return;
                }

                // Step 2: confirmation.php — the slow part (~12s)
                this.confirmationStage = 'confirming';
                this.cdr.markForCheck();

                this.paymentService.confirmPayment({
                  source: 'B2B_RAZORPAY',
                  booking_id: bkId,
                  payment_option: this.paymentOption,
                  transaction_id: razorpayPaymentId,
                  totalAmount: this.selectedCar?.price || 0,
                  bufferAmount: this.paymentOption === 3 ? this.getOption3BufferAmount() : 0,
                  advancedAmount: advanceAmount,
                  orderId: savaariPayId,
                  paymentId: razorpayPaymentId,
                  paymentmode: 'savaariwebsite',
                } as any).subscribe({
                  next: (confirmed) => {
                    if (confirmed) {
                      showBookingConfirmed();
                    } else {
                      // confirmation.php returned failure but payment was taken
                      // Still show success — booking exists, just record may be incomplete
                      showBookingConfirmed();
                    }
                  },
                  error: () => {
                    // confirmation.php network error — payment was taken, show success anyway
                    showBookingConfirmed();
                  },
                });
              },
              error: () => {
                this.isProcessingRazorpay = false;
                this.isConfirmingPayment = false;
                this.bookingError = 'Payment signature verification failed. Please contact support with payment ID: ' + razorpayPaymentId;
                this.cdr.markForCheck();
              },
            });
          },
          modal: {
            ondismiss: () => {
              this.isProcessingRazorpay = false;
              this.cdr.markForCheck();
            }
          },
          prefill: this.buildRazorpayPrefill(),
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
   * NOTE: `prePayment` is intentionally NOT included — see comment below.
   */
  private buildBookingRequest(apiParams: { tripType: string; subTripType: string }): CreateBookingRequest {
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
      customerLatLong: this.pickupLatLng ? `${this.pickupLatLng.lat},${this.pickupLatLng.lng}` : (this.itinerary?.customerLatLong || ''),
      locality,
      // alias_source_city_id / alias_dest_city_id — populated on the request
      // object for completeness, but booking-api.service DROPS them before
      // hitting the network across all four trip types (One Way / Round Trip
      // / Local / Airport). Reason: Savaari's place_id API returns CANONICAL
      // city IDs (e.g. 377 for Bangalore) not LOCALITY IDs — sending those
      // mis-resolves on the server and emails come out as "Bangalore
      // (Dhanaulti)" or "Mysore (Kevadiya)". See the long comment in
      // booking-api.service.ts for the full rationale.
      alias_source_city_id: this.pickupAliasSourceCityId || undefined,
      dropAddress: this.dropAddress || '',
      dropLatLong: this.dropLatLng ? `${this.dropLatLng.lat},${this.dropLatLng.lng}` : '',
      dropLocality,
      alias_dest_city_id: this.dropAliasDestCityId || this.itinerary!.aliasDestCityId || undefined,
      customerTitle: 'Mr',
      customerName: this.guestName,
      // Per backend team (April 2026): customerEmail must hold AGENT email, and
      // customerSecondaryEmail must hold the CUSTOMER (guest) email — backend
      // mailers/notifications rely on this convention.
      customerEmail: this.agentEmail || undefined,
      customerMobile: this.phone,
      countryCode: this.selectedCountryCode ? `${this.selectedCountryCode.isdCode}|${this.selectedCountryCode.key?.split('|')[1] || 'IND'}` : '91|IND',
      customerSecondaryEmail: this.guestEmail || undefined,
      carType: this.selectedCar!.carTypeId || 4,
      premiumFlag: 0,
      // NOTE: `prePayment` is intentionally NOT sent in the booking creation request.
      // Verified from live b2bcab.betasavaari.com HAR (April 2026) — the live site
      // does NOT include this field in the POST /booking payload. Sending it causes
      // the partner API backend to mark `book_flag = 1` prematurely, which then
      // makes confirmation.php skip its update logic (it has `if (book_flag == 0)`
      // guard). Reported by backend team (April 2026). Payment amount is communicated to
      // the backend later via confirmation.php (totalAmount + advancedAmount).
      app_user_id: Number(this.auth.getAgentId()) || undefined,
      couponCode: '',
      device: 'DESKTOP',
      invoicePayer: this.commissionService.getInvoicePayer(),
      // destinationCity: for round trip MULTICITY, must match what we sent to
      // /availabilities — comma-separated list `<toCityId>,<stop1>,<stop2>,...`.
      // Previously we sent only toCityId here, so backend lost all intermediate
      // stops (Pune, Lonavala, Mumbai etc.) and re-priced the trip as a simple
      // round trip to the final destination — causing payment-page and
      // confirmation-page totals to drift from what the user picked. Reads
      // both `id` (City model from dashboard) and `cityId` (ItineraryStop
      // model) so it survives either shape in itinerary.extraDestinations.
      ...(this.itinerary!.toCityId && {
        destinationCity: (() => {
          const isRoundTrip = apiParams.subTripType === 'roundTrip';
          const stopIds: number[] = (this.itinerary?.extraDestinations || [])
            .map((s: any) => Number(s?.id ?? s?.cityId))
            .filter((id: number) => Number.isFinite(id) && id > 0);
          if (isRoundTrip && stopIds.length > 0) {
            return [this.itinerary!.toCityId!, ...stopIds].join(',');
          }
          return this.itinerary!.toCityId!;
        })(),
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
      // Urgent booking: forward the flag ONLY when backend's availability
      // response set urgent_booking_flag = 1 for the chosen car. Per May 2026
      // stakeholder direction, the frontend no longer second-guesses the
      // backend's urgency call (the earlier `|| this.isBookingUrgent()` OR
      // was removed). VAS visibility is also 100% backend-driven now — if
      // the backend wants to suppress VAS for an urgent trip, it does so via
      // its own logic + we just render whatever vas_details[] comes back.
      ...(this.selectedCar!.urgentBookingFlag === 1 && { Urgent_booking: '1' }),
      ...(this.needsGstInvoice && this.agentGstNumber && { gst_invoice_required: '1', gst_number: this.agentGstNumber }),
    };
  }

  /** Register booking data in the local registry for history page */
  private registerBookingData(bkId: string, response: any, request: CreateBookingRequest, prePaymentAmount: number, paymentMethod: string) {
    // Extract numeric km from selectedCar.kmsIncluded ("145 KMs" or "260 (145 + 115) km")
    // so the bookings page can show "145 km" without waiting for the API to sync.
    const kmsRaw = String(this.selectedCar?.kmsIncluded || '');
    const kmsMatch = kmsRaw.match(/(\d+)/);
    const packageKms = kmsMatch ? kmsMatch[1] : '';

    // Pull booking_key out of the create-booking response. The API returns it
    // either at the top level or nested inside `data` (array or object form).
    // Needed by POST /system_bookings/cancellation.php when the user cancels.
    const rawData = response?.data as any;
    const dataItem = Array.isArray(rawData) ? rawData[0] : rawData;
    const bookingKey = String(
      response?.booking_key || dataItem?.booking_key || dataItem?.bookingKey || ''
    );

    // Build the canonical intermediate-cities list ONCE and store it in two
    // shapes so downstream consumers don't have to re-parse:
    //   - intermediate_cities_array → string[] (preferred — bookings.ts reads this)
    //   - intermediate_cities       → comma-separated string (legacy fallback)
    // We also pre-compute the human-readable itinerary string with the round-trip
    // return leg so the bookings list shows "BLR → Pune → Lonavala → Mumbai → HYD → BLR"
    // instead of the backend's stripped "BLR → HYD → BLR" while data is fresh.
    const stopNames: string[] = (this.itinerary?.extraDestinations || [])
      .map(s => (s as any)?.cityOnly || (s as any)?.cityName || (s as any)?.name)
      .filter((n: string) => typeof n === 'string' && n.trim().length > 0);
    const isRoundTrip = (request.subTripType || '').toLowerCase() === 'roundtrip' ||
                        (this.itinerary?.tripType || '').toLowerCase() === 'round trip';
    const itineraryString = (() => {
      const parts: string[] = [];
      if (this.itinerary?.fromCity) parts.push(this.itinerary.fromCity);
      parts.push(...stopNames);
      if (this.itinerary?.toCity) parts.push(this.itinerary.toCity);
      if (isRoundTrip && this.itinerary?.fromCity) parts.push(this.itinerary.fromCity);
      return parts.join(' → ');
    })();

    this.bookingRegistry.addBookingId(bkId);
    this.bookingRegistry.storeBookingData(bkId, {
      ...response,
      booking_key: bookingKey,
      pick_city: this.itinerary?.fromCity || '',
      drop_city: this.itinerary?.toCity || '',
      source_city: this.itinerary?.fromCity || '',
      destination_city: this.itinerary?.toCity || '',
      ...(stopNames.length && {
        intermediate_cities_array: stopNames,
        intermediate_cities: stopNames.join(', '),
      }),
      is_round_trip: isRoundTrip,
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
      // Match the live B2B API field name so toBookingCard() picks it up
      // through the same `package_kms` path used for synced bookings.
      package_kms: packageKms,
      min_km_quota_per_day: packageKms,
      // Airport-specific fields — required by bookings.ts toBookingCard()
      // to build the correct route line (e.g. "Bangalore → Kempegowda Airport, T2")
      // instead of a generic "pick_city → drop_city" which is semantically wrong
      // for airport trips. Populated from the itinerary state; empty for non-airport.
      airport_name: this.itinerary?.airportName || '',
      terminalname: this.itinerary?.terminalId || '',
      airport_id: this.itinerary?.airportId ? String(this.itinerary.airportId) : '',
      custShortAddress: this.itinerary?.custShortAddress || this.pickupAddress || '',
      airport_sub_type: this.itinerary?.airportSubType || '',
      // Local-specific field
      local_package: this.itinerary?.localPackage || '',
      booking_status: 'CONFIRMED',
      car_name: this.selectedCar?.name || '',
      gross_amount: this.selectedCar?.price || 0,
      total_amount: this.selectedCar?.price || 0,
      customer_name: this.guestName || '',
      customer_mobile: this.phone || '',
      customer_email: this.guestEmail || '',
      itinerary: itineraryString,
      prePayment: prePaymentAmount,
      cashToCollect: (this.selectedCar?.price || 0) - prePaymentAmount,
      carType: this.selectedCar?.carTypeId || request.carType || 0,
      paymentOption: this.paymentOption,
      paymentMethod,
    });

    // VAS update no longer fires here — the new flow drives it from the
    // dynamic Step 2 "Personalize Your Journey" section via toggleVas() →
    // pushVasUpdate(), which handles arbitrary selections from vas_details[].
  }

  /**
   * Update the booking registry with the correct payment option and amount
   * AFTER the user has completed payment. registerBookingData() runs earlier
   * in the flow and stamps the registry with the current paymentOption at
   * that moment (which may be the April 2026 default of 1, or whatever the
   * agent picked). If the agent then switched options or the actual paid
   * amount differs from the default-slider amount, this keeps the registry
   * aligned with what was really paid.
   */
  private updateRegistryPayment(bkId: string, paidAmount: number, method: 'wallet' | 'razorpay') {
    const existing = this.bookingRegistry.getStoredBookingData(bkId);
    if (existing) {
      this.bookingRegistry.storeBookingData(bkId, {
        ...existing,
        paymentOption: this.paymentOption,
        paymentMethod: method,
        prePayment: paidAmount,
        cashToCollect: Math.max(0, (this.selectedCar?.price || 0) - paidAmount),
      });
    }
  }

  /**
   * Build the trip-context fields shared by every booking-confirmed analytics
   * payload. Backend INSERT (per consumer site reference payload, April 2026)
   * requires the trip_type / pickup_city_id / car_type / customer_country_code
   * fields below — sending UI labels or missing FKs caused "Error while data
   * insert" responses. Mirrors the consumer site's shape, trimmed to fields
   * available in the B2B booking flow (per backend team: don't send what we
   * don't have — fuel_type, hatchback_rate, whatsapp_optin, etc).
   *
   * Key value conventions:
   *   - trip_type: backend enum 'outstation' / 'local' / 'airport'
   *     (NOT the UI label like 'One Way' that lives on itinerary.tripType).
   *   - trip_subtype: API value from itinerary.subTripType — already the right
   *     string ('oneWay', 'roundTrip', '880', '440', '12120', 'pick_airport',
   *     'drop_airport'). UI fallbacks (airportSubType, localPackage) are NOT
   *     used here because they hold display strings, not the API enum.
   *   - drop_city / drop_address / drop_city_id blank for Local & Round Trip.
   *   - customer_country_code: '91|IND' style — same shape as booking create.
   *   - hours_to_trip: integer hours from now to pickup (negative if past).
   */
  private buildBookingTripContext() {
    const uiTripType = this.itinerary?.tripType || '';
    const isLocalOrRound = uiTripType === 'Local' || uiTripType === 'Round Trip';

    // Map UI trip type label → backend enum value.
    let backendTripType = 'outstation';
    if (uiTripType === 'Local') backendTripType = 'local';
    else if (uiTripType === 'Airport') backendTripType = 'airport';
    // 'One Way' and 'Round Trip' both map to 'outstation' (backend convention).

    // Country code: mirror the booking-create convention ('91|IND').
    const cc = this.selectedCountryCode;
    let countryCode = '91|IND';
    if (cc?.isdCode) {
      const iso = cc.key?.split('|')[1] || 'IND';
      countryCode = `${cc.isdCode}|${iso}`;
    }

    // Date/time in API format.
    let startDate = '';
    let startTime = '';
    let hoursToTrip = 0;
    if (this.itinerary?.pickupDate) {
      const d = new Date(this.itinerary.pickupDate);
      if (!isNaN(d.getTime())) {
        startDate = toSavaariDate(d);
        // Combine date + time to compute hours_to_trip from now.
        const timeStr = this.itinerary.pickupTime || '12:00 PM';
        const ampmMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        const h24Match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
        let hours = 12;
        let minutes = 0;
        if (ampmMatch) {
          hours = parseInt(ampmMatch[1], 10);
          minutes = parseInt(ampmMatch[2], 10);
          const period = ampmMatch[3].toUpperCase();
          if (period === 'PM' && hours < 12) hours += 12;
          if (period === 'AM' && hours === 12) hours = 0;
        } else if (h24Match) {
          hours = parseInt(h24Match[1], 10);
          minutes = parseInt(h24Match[2], 10);
        }
        const pickup = new Date(d);
        pickup.setHours(hours, minutes, 0, 0);
        hoursToTrip = Math.round((pickup.getTime() - Date.now()) / (1000 * 60 * 60));
      }
    }
    if (this.itinerary?.pickupTime) {
      startTime = to24HourTime(this.itinerary.pickupTime);
    }

    // Itinerary route string (only meaningful for outstation).
    let itineraryRoute = '';
    if (backendTripType === 'outstation' && this.itinerary?.fromCity) {
      const stops = (this.itinerary.extraDestinations || [])
        .map(s => (s as any)?.cityName || (s as any)?.name)
        .filter((n): n is string => !!n);
      const parts = [this.itinerary.fromCity];
      if (stops.length) parts.push(...stops);
      if (this.itinerary.toCity) parts.push(this.itinerary.toCity);
      itineraryRoute = parts.join('-');
    }

    return {
      trip_type: backendTripType,
      trip_subtype: this.itinerary?.subTripType || '',
      pickup_city: this.itinerary?.fromCity || '',
      drop_city: isLocalOrRound ? '' : (this.itinerary?.toCity || ''),
      pickup_city_id: this.itinerary?.fromCityId ? String(this.itinerary.fromCityId) : '',
      //drop_city_id: (isLocalOrRound || !this.itinerary?.toCityId) ? '' : String(this.itinerary.toCityId),
      car_type: this.selectedCar?.carTypeId || 0,
      itinerary: itineraryRoute,
      hours_to_trip: hoursToTrip,
      start_date: startDate,
      start_time: startTime,
      customer_name: this.guestName || '',
      customer_email: this.guestEmail || '',
      customer_country_code: countryCode,
      customer_phone: this.phone || '',
      pickup_address: this.pickupAddress || '',
      drop_address: isLocalOrRound ? '' : (this.dropAddress || ''),
    };
  }

  /**
   * Process wallet payment for already-created booking.
   * Booking was already created on "Proceed to Next" — just deduct wallet + confirm.
   *
   * Flow (per backend team confirmation callback doc, April 2026):
   *   1. POST /wallet/pay-booking → deduct wallet, get transaction_id
   *   2. POST /confirmation.php → source=B2B_WALLET, booking_id, payment_option, transaction_id
   *   3. email_sent × 2 → confirmation emails
   *
   * NOTE: settlement-payment is NOT called here. It runs only when the agent
   * clicks "Settle Now" from Manage Bookings (bookings.ts confirmSettle()).
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
      // Show full-screen overlay immediately
      this.isConfirmingPayment = true;
      this.confirmationStage = 'deducting';
      this.confirmationPaidAmount = payNow;
      this.confirmationPaidVia = 'wallet';
      this.cdr.markForCheck();

      // Step 1: Deduct wallet balance
      this.walletService.payForBooking(bkId, payNow, this.paymentOption as 1 | 2 | 3).subscribe({
        next: (result) => {
          if (result.success) {
            const txnId = result.transactionId || '';

            // Step 2: Update stage → confirming (this is the slow part ~12s)
            this.confirmationStage = 'confirming';
            this.cdr.markForCheck();

            this.paymentService.confirmPayment({
              source: 'B2B_WALLET',
              booking_id: bkId,
              payment_option: this.paymentOption,
              transaction_id: txnId,
              totalAmount: this.selectedCar?.price || 0,
              bufferAmount: this.paymentOption === 3 ? this.getOption3BufferAmount() : 0,
              advancedAmount: payNow,
            } as any).subscribe({
              next: () => {
                // Step 3: Finalizing
                this.confirmationStage = 'finalizing';
                this.cdr.markForCheck();

                // Send confirmation email (fire-and-forget)
                this.paymentService.sendConfirmationEmail(bkId).subscribe();

                // Update registry with correct payment option + amount
                this.updateRegistryPayment(bkId, payNow, 'wallet');

                // Brief pause on "finalizing" then show confirmation
                setTimeout(() => {
                  this.isProcessingWallet = false;
                  this.isConfirmingPayment = false;
                  this.bookingConfirmed = true;
                  // Analytics: booking successfully confirmed via wallet.
                  this.analytics.trackBookingConfirmed({
                    booking_id: String(bkId),
                    payment_type: this.paymentOption === 3 ? 'FULLPAID' : 'PARTPAID',
                    payment_percentage: this.paymentOption === 3 ? 100 : this.paymentOption === 2 ? 25 : this.option1SliderPercent,
                    payment_amount: payNow,
                    car_rate: this.selectedCar?.price || 0,
                    booking_amount: this.selectedCar?.price || 0,
                    booking_type: 'Confirmed booking',
                    ...this.buildBookingTripContext(),
                  });
                  this.clearPassengerState();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  this.cdr.markForCheck();
                }, 1200);
              },
              error: () => {
                // confirmation.php failed but payment was taken — still show success
                // (booking exists in system, just confirmation record may be incomplete)
                this.paymentService.sendConfirmationEmail(bkId).subscribe();
                this.updateRegistryPayment(bkId, payNow, 'wallet');
                this.isProcessingWallet = false;
                this.isConfirmingPayment = false;
                this.bookingConfirmed = true;
                // Analytics: booking confirmed (wallet path, confirmation.php errored but payment taken).
                this.analytics.trackBookingConfirmed({
                  booking_id: String(bkId),
                  payment_type: this.paymentOption === 3 ? 'FULLPAID' : 'PARTPAID',
                  payment_percentage: this.paymentOption === 3 ? 100 : this.paymentOption === 2 ? 25 : this.option1SliderPercent,
                  payment_amount: payNow,
                  car_rate: this.selectedCar?.price || 0,
                  booking_amount: this.selectedCar?.price || 0,
                  booking_type: 'Confirmed booking',
                  ...this.buildBookingTripContext(),
                });
                this.clearPassengerState();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                this.cdr.markForCheck();
              },
            });
          } else {
            this.isProcessingWallet = false;
            this.isConfirmingPayment = false;
            this.bookingError = 'Wallet payment failed. Please try again or switch to Razorpay.';
            this.cdr.markForCheck();
          }
        },
        error: () => {
          this.isProcessingWallet = false;
          this.isConfirmingPayment = false;
          this.bookingError = 'Wallet payment failed. Please try again.';
          this.cdr.markForCheck();
        }
      });
    } else {
      // Zero payment — just confirm
      this.paymentService.sendConfirmationEmail(bkId).subscribe();
      this.updateRegistryPayment(bkId, 0, 'wallet');
      this.isProcessingWallet = false;
      this.bookingConfirmed = true;
      // Analytics: zero-amount wallet path (no money moved, booking confirmed).
      this.analytics.trackBookingConfirmed({
        booking_id: String(bkId),
        payment_type: this.paymentOption === 3 ? 'FULLPAID' : 'PARTPAID',
        payment_percentage: this.paymentOption === 3 ? 100 : this.paymentOption === 2 ? 25 : this.option1SliderPercent,
        payment_amount: 0,
        car_rate: this.selectedCar?.price || 0,
        booking_amount: this.selectedCar?.price || 0,
        booking_type: 'Confirmed booking',
        ...this.buildBookingTripContext(),
      });
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
      // Restored state may carry a stale 12-digit number with country code
      // glued on (cached from before the May 2026 strip fix). Re-clean here so
      // a returning agent sees a 10-digit value that passes isPhoneValid().
      if (state.phone) {
        const cleanedPhone = String(state.phone).replace(/\D+/g, '');
        this.phone = cleanedPhone.length > 10 ? cleanedPhone.slice(-10) : cleanedPhone;
      }
      // Pickup and drop address are intentionally NOT restored — they should always
      // start cleared for each new "Explore Cabs" flow so the agent enters them fresh.
      this.pickupAddress = '';
      this.dropAddress = '';
      if (state.landmark) this.landmark = state.landmark;
      if (state.needsGstInvoice !== undefined) this.needsGstInvoice = state.needsGstInvoice;
      // paymentOption / paymentMethod are intentionally NOT restored from
      // sessionStorage. The class-level default of paymentOption = 1
      // (Pay any amount now, per April 2026 direction) takes over instead,
      // so re-entering Step 2 always lands on the canonical default rather
      // than carrying a stale selection forward from an earlier visit.
      if (state.selectedCountryCode) this.selectedCountryCode = state.selectedCountryCode;
      this.cdr.markForCheck();
    } catch {}
  }

  /** Pre-fill pickup/drop address from itinerary data (entered on dashboard).
   *  Only fills if the field is currently empty — doesn't overwrite user edits. */
  private prefillAddressFromItinerary(): void {
    if (!this.itinerary) return;

    if (this.itinerary.tripType === 'Airport') {
      if (this.itinerary.airportSubType === 'drop') {
        // Drop to Airport: pickup = user's home address (entered as "Pickup Address" on dashboard)
        if (!this.pickupAddress) {
          this.pickupAddress = this.itinerary.pickupAddress || this.itinerary.custShortAddress || '';
        }
      } else if (this.itinerary.airportSubType === 'pickup') {
        // Pickup from Airport: pickup = airport terminal (entered as "Pickup Airport" on dashboard)
        if (!this.pickupAddress) {
          this.pickupAddress = this.itinerary.airportName || this.itinerary.dropAirport || '';
        }
      }
      // Carry over resolved lat/lng from dashboard place_id resolution
      if (!this.pickupLatLng && this.itinerary.customerLatLong) {
        const parts = this.itinerary.customerLatLong.split(',');
        if (parts.length === 2) {
          this.pickupLatLng = { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
        }
      }
    } else {
      // Non-airport bookings: carry over pickupAddress from itinerary if available
      if (!this.pickupAddress && this.itinerary.pickupAddress) {
        this.pickupAddress = this.itinerary.pickupAddress;
      }
    }
    this.cdr.markForCheck();
  }

  /** Clear passenger state after successful booking */
  private clearPassengerState(): void {
    sessionStorage.removeItem(this.PASSENGER_STATE_KEY);
  }

  /** Navigate back: payment → passenger details → select-car → dashboard */
  /**
   * Advance from the Step 1 VAS phase to Step 2 (Payment Selection).
   * Called by the "Continue to Payment" button that appears below the VAS
   * section once the booking is created and VAS options are available.
   * Distinct from proceedToPayment() above — that handles the initial form
   * submit + booking creation; this just toggles the Step 1 → Step 2 view.
   */
  continueToPayment(): void {
    this.step1Complete = true;
    history.pushState({ step: 'payment' }, '', this.router.url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.markForCheck();
  }

  /** Called by paymentExitGuard — always allow navigation. */
  canExitPayment(): boolean | Observable<boolean> {
    return true;
  }

  goBackFromBooking() {
    this.performGoBack();
  }

  private performGoBack() {
    if (this.step1Complete) {
      // ─── Step 2 (Payment) → Step 1 (VAS-edit mode) ─────────────────────
      // Reset the payment option to 1 (Pay any amount now) so when the
      // agent moves forward again, Step 2 lands on the new April 2026
      // default instead of a stale selection from a prior pass. We
      // intentionally do NOT carry the previous option forward — agents
      // should re-confirm their choice each time they re-enter Step 2.
      this.paymentOption = 1;
      this.paymentMethod = 'wallet';
      this.showWalletConfirm = false;
      this.showTopUpConfirm = false;
      this.step1Complete = false;
      // ⚠ PRESERVE the existing booking + VAS selections. Earlier this
      // method nuked vasReady / vasSelections / vasAmount, which forced
      // the agent to click Proceed again — that created a brand-new
      // booking and orphaned the previous one in backend. Per QA April
      // 2026 ("VAS me kuch change karna he to back jake firse edit kar
      // sake"), we now keep the booking intact and re-show the VAS
      // section so the agent can simply tweak add-ons. The form stays
      // locked (vasReady is still true). To actually re-enter pickup
      // details, the agent must press back ONE MORE TIME — see the
      // `else if (this.vasReady)` branch below which routes to /select-car.
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.cdr.markForCheck();
    } else if (this.vasReady) {
      // ─── Step 1 (VAS phase, form locked) → /select-car ─────────────────
      // Agent wants to actually change pickup details — abandon the
      // current booking shell. Wipe VAS state + bookingId so the next
      // Proceed creates a fresh booking instead of resuming this one.
      this.vasReady = false;
      this.vasSelections.clear();
      this.vasAmount = 0;
      this.vasGstAmount = 0;
      this.vasNamesList = '';
      this.dismissVasConflict();
      this.bookingId = '';
      const itinerary = this.bookingState.getItinerary();
      if (itinerary?.fromCityId) {
        this.router.navigate(['/select-car']);
      } else {
        this.router.navigate(['/dashboard']);
      }
    } else {
      // ─── Step 1 (form, no booking yet) → /select-car ────────────────────
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

  // ─── VAS (Value Added Services) — Step 2 selection helpers ────────────
  //
  // The "Personalize Your Journey" card on Step 2 renders one tile per
  // entry in this.availableVasServices (populated from booking-create).
  // Selection state lives in this.vasSelections (vas_config_id → sub-option).
  // Every toggle / sub-option change debounces 500ms then POSTs the full
  // selection set to vas_booking_update. The response's
  // post_vas_total_amount becomes the new selectedCar.price so the
  // existing payment helpers (getPayNowAmount etc.) recompute on top.

  /** True when the agent has checked this VAS card. */
  isVasSelected(vas: VasDetail): boolean {
    return this.vasSelections.has(vas.vas_config_id);
  }

  /**
   * Flat list of VAS items the agent has actually picked, in the same order
   * they appear in availableVasServices, with the chosen sub-option attached.
   * Used by the Booking Confirmed page + Receipt page (and any future view)
   * to render an "Enhance Your Ride — selected" summary without each template
   * having to re-do the filter+map dance. Returns an empty array when nothing
   * is picked so *ngIf="selectedVasList.length" reads cleanly.
   */
  get selectedVasList(): Array<{ name: string; subOption: string; priceLabel: string }> {
    if (!this.vasSelections.size) return [];
    return this.availableVasServices
      .filter(v => this.vasSelections.has(v.vas_config_id))
      .map(v => ({
        name: v.vas,
        subOption: this.getVasInputValue(v),
        priceLabel: this.getVasDisplayPrice(v),
      }));
  }

  /** Currently picked sub-option value (e.g. "English") — empty if not selected. */
  getVasInputValue(vas: VasDetail): string {
    return this.vasSelections.get(vas.vas_config_id)?.customer_input_data ?? '';
  }

  /**
   * Display string for the price column.
   *   FlatRate → "₹149"
   *   PerKM    → "₹1.1/km · ~₹1,585"   (rate × tripKilometer rounded)
   * The "~" hints that the per-km charge could vary if the trip itself
   * is re-quoted later.
   *
   * Safety net (April 2026): If the backend doesn't return tripKilometer
   * (e.g. some Local / Airport trips return hour-packages without km), the
   * "~₹0" total would mislead the agent into thinking it's free. In that
   * case we drop the suffix and show only the per-km rate so the agent
   * understands the charge is variable.
   */
  getVasDisplayPrice(vas: VasDetail): string {
    if (vas.vas_rate_type === 'PerKM') {
      const perKm = parseFloat(vas.customer_rate_perkm || '0');
      const rateLabel = vas.customer_rate_perkm || '0';
      if (this.vasPackageKm > 0 && perKm > 0) {
        const total = Math.round(perKm * this.vasPackageKm);
        const totalFmt = total.toLocaleString('en-IN');
        return `₹${rateLabel}/km · ~₹${totalFmt}`;
      }
      // No tripKilometer available → show rate only, suppress misleading "~₹0".
      return `₹${rateLabel}/km`;
    }
    return `₹${vas.customer_rate}`;
  }

  /** Description text from tnc_data — falls back to empty string. */
  getVasDescription(vas: VasDetail): string {
    return vas.tnc_data?.tnc?.[0] || '';
  }

  /**
   * Toggle a VAS tile. Sub-option (when present) auto-defaults to the first value.
   *
   * Mutual-exclusion rule (matches the B2C live-site behaviour):
   *   "Diesel Car Guarantee" + "New Car Promise" cannot be selected together
   *   (Govt. Policy — diesel cars are typically older fleet, new-car guarantee
   *   is petrol/CNG-only fleet). When the agent tries to enable the second
   *   one while the first is already on, BOTH get cleared and a warning toast
   *   appears. This is the only known VAS conflict per April 2026 QA pass.
   */
  toggleVas(vas: VasDetail): void {
    const id = vas.vas_config_id;
    const isSelecting = !this.vasSelections.has(id);

    // Conflict check fires only on selection (deselect always allowed).
    if (isSelecting) {
      const conflictWith = this.findVasConflict(vas);
      if (conflictWith) {
        // Clear BOTH (the existing one + we never add the new one) and warn.
        this.vasSelections.delete(conflictWith.vas_config_id);
        this.showVasConflictError(vas.vas, conflictWith.vas);
        this.scheduleVasUpdate();
        this.cdr.markForCheck();
        return;
      }
    }

    if (!isSelecting) {
      this.vasSelections.delete(id);
    } else {
      const init: { customer_input_data?: string; radioIndex?: number } = {};
      if (vas.customer_input_flag === 'YES' && Array.isArray(vas.rate_input_value) && vas.rate_input_value.length) {
        init.customer_input_data = vas.rate_input_value[0];
        init.radioIndex = 0;
      }
      this.vasSelections.set(id, init);
    }
    this.scheduleVasUpdate();
    this.cdr.markForCheck();
  }

  /**
   * Detect a mutually-exclusive VAS already in the cart for the one being toggled on.
   * Returns the conflicting VasDetail or null. Match is by case-insensitive name
   * substring so the rule survives small backend label changes (e.g. "New Car Promise"
   * vs "New Car Promise - Model that is 2023 or newer").
   */
  private findVasConflict(candidate: VasDetail): VasDetail | null {
    const name = (candidate.vas || '').toLowerCase();
    const isDiesel = name.includes('diesel');
    const isNewCar = name.includes('new car promise') || name.includes('new car');

    if (!isDiesel && !isNewCar) return null;

    const lookFor = isDiesel ? 'new car' : 'diesel';
    for (const v of this.availableVasServices) {
      if (v.vas_config_id === candidate.vas_config_id) continue;
      if (!this.vasSelections.has(v.vas_config_id)) continue;
      if ((v.vas || '').toLowerCase().includes(lookFor)) {
        return v;
      }
    }
    return null;
  }

  /** Set the conflict error and start the 5s auto-dismiss timer. */
  private showVasConflictError(a: string, b: string): void {
    this.vasConflictError = `${a} & ${b} cannot be serviced together due to Govt. Policy. Please select one of the two special services.`;
    if (this.vasConflictTimer) clearTimeout(this.vasConflictTimer);
    this.vasConflictTimer = setTimeout(() => {
      this.vasConflictError = null;
      this.cdr.markForCheck();
    }, 5000);
  }

  /** User clicked the × on the conflict banner. */
  dismissVasConflict(): void {
    if (this.vasConflictTimer) {
      clearTimeout(this.vasConflictTimer);
      this.vasConflictTimer = null;
    }
    this.vasConflictError = null;
    this.cdr.markForCheck();
  }

  /** Sub-option pick (radio click for "English" / "Hindi" etc). */
  setVasInput(vas: VasDetail, value: string, index: number): void {
    if (!this.vasSelections.has(vas.vas_config_id)) return;
    this.vasSelections.set(vas.vas_config_id, {
      customer_input_data: value,
      radioIndex: index,
    });
    this.scheduleVasUpdate();
    this.cdr.markForCheck();
  }

  /** Debounce so rapid clicks collapse into one API call. */
  private scheduleVasUpdate(): void {
    if (this.vasUpdateDebounceTimer) {
      clearTimeout(this.vasUpdateDebounceTimer);
    }
    this.vasUpdateDebounceTimer = setTimeout(() => this.pushVasUpdate(), 500);
  }

  /**
   * Send the current selection to the backend and absorb the new total fare.
   * If nothing is selected, restore the original (pre-VAS) fare and zero out
   * the sidebar VAS line — no API call needed in that case.
   */
  private pushVasUpdate(): void {
    if (!this.bookingId) return;

    // Build the selected-VAS array. Each entry carries the original config
    // PLUS the user's selection state so the backend has everything it needs
    // in one shot (matches the consumer-site payload shape verified April 2026).
    const selectedVas: VasDetail[] = this.availableVasServices
      .filter(v => this.vasSelections.has(v.vas_config_id))
      .map(v => {
        const sel = this.vasSelections.get(v.vas_config_id)!;
        const out: VasDetail = { ...v };
        if (sel.customer_input_data !== undefined) {
          out.customer_input_data = sel.customer_input_data;
        }
        if (sel.radioIndex !== undefined) {
          out.radioIndex = sel.radioIndex;
        }
        return out;
      });

    // ⚠ IMPORTANT — we MUST call the API even when selectedVas is empty.
    // Earlier this method short-circuited on an empty selection and only
    // reverted the local price, which left stale VAS attached to the booking
    // on the backend (reported via QA April 2026: "VAS is not working in case
    // of remove/edit after adding VAS"). Sending an empty vas_data array tells
    // the backend to clear all VAS for this booking, keeping FE + BE in sync.
    const isClearAll = selectedVas.length === 0;

    this.vasUpdateLoading = true;
    this.cdr.markForCheck();

    this.bookingApi.updateVasBooking({
      bookingId: this.bookingId,
      preVasTotalAmount: this.preVasFare,
      preVasPackageKm: this.vasPackageKm,
      preVasPackageHr: this.vasPackageHr,
      selectedVas,
    }).subscribe(response => {
      this.vasUpdateLoading = false;
      const update = response?.data?.vas_update;

      if (isClearAll) {
        // Clear-all path: trust backend's reset OR fall back to preVasFare
        // locally if backend didn't echo a usable total. Either way, the
        // VAS sidebar line resets to zero so the agent sees a clean state.
        const echoed = parseFloat(String(update?.pre_vas_total_amount || update?.post_vas_total_amount || '0'));
        const restoreTo = echoed > 0 ? Math.round(echoed) : this.preVasFare;
        if (this.selectedCar && restoreTo > 0 && this.selectedCar.price !== restoreTo) {
          this.selectedCar.price = restoreTo;
          this.bookingState.setSelectedCar(this.selectedCar);
        }
        this.vasAmount = 0;
        this.vasGstAmount = 0;
        this.vasNamesList = '';
        this.cdr.markForCheck();
        return;
      }

      if (update) {
        // post_vas_total_amount is the canonical new total. Mutate
        // selectedCar.price so the existing B2B payment helpers
        // (getPayNowAmount / getDeferredAmount / getOption3BufferAmount)
        // pick it up automatically on next change-detection pass.
        const newTotal = parseFloat(String(update.post_vas_total_amount || '0'));
        if (newTotal > 0 && this.selectedCar) {
          this.selectedCar.price = Math.round(newTotal);
          this.bookingState.setSelectedCar(this.selectedCar);
        }
        this.vasAmount = Number(update.fare_breakup?.total_vas_amount || update.vas_total_amount || 0);
        this.vasGstAmount = Number(update.fare_breakup?.total_vas_gst_amount || 0);
        this.vasNamesList = update.fare_breakup?.vas_list || update.vas || '';
      }
      this.cdr.markForCheck();
    });
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
          description: `Wallet Top-up INR ${savedAmount}`,
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
          prefill: this.buildRazorpayPrefill(),
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
      const pkg = this.itinerary.localPackage ? ` - ${this.itinerary.localPackage}` : '';
      itineraryText = `${this.itinerary.fromCity} (Local${pkg})`;
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
      this.selectedCar.name ? `Car: ${this.selectedCar.name}` : '',
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
