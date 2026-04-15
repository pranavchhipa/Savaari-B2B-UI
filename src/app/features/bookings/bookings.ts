import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';
import { BookingApiService } from '../../core/services/booking-api.service';
import { BookingRegistryService } from '../../core/services/booking-registry.service';
import { WalletService } from '../../core/services/wallet.service';
import { PaymentService } from '../../core/services/payment.service';
import { AuthService } from '../../core/services/auth.service';
import { BookingDetails } from '../../core/models';
import { environment } from '../../../environments/environment';

export type BookingTab = 'upcoming' | 'cancelled' | 'completed';

/** View-model for a booking card (confirmed from live API March 2026) */
export interface BookingCard {
    bookingId: string;
    reservationId: string;
    sourceCity: string;
    destinationCity: string;
    /** Round-trip / multi-stop intermediate cities (Pune, Lonavala, Mumbai...). Empty for one-way / local / airport. */
    intermediateCities: string[];
    /** Whether the cab returns to the pickup city (Round Trip). When true, fromCity is appended after destinationCity. */
    isRoundTrip: boolean;
    /** Pre-built single-line route string used in the card heading. Computed once so the template stays simple. */
    routeLine: string;
    /** Optional second line "via Pune, Lonavala, Mumbai" — empty for single-leg trips. Truncates intelligently for many stops. */
    viaLine: string;
    tripType: string;
    usageName: string;
    /** Airport-specific: 'drop' (to airport) | 'pickup' (from airport) | '' (non-airport) */
    airportSubType?: string;
    /** Airport/terminal full name — e.g. "Terminal 2, Kempegowda International Airport, Bangalore" */
    airportName?: string;
    /** Customer's short address label for airport trips — e.g. "Koramangala, Bangalore" */
    custShortAddress?: string;
    /** Local trip package label — e.g. "8hr/80km" | "12hr/120km" */
    localPackage?: string;
    pickupAddress: string;
    dropAddress: string;
    pickupDate: Date | null;
    pickupTime: string;
    status: string;
    fare: number;
    customerName: string;
    customerMobile: string;
    customerEmail: string;
    carName: string;
    itinerary: string;
    driverName?: string;
    driverMobile?: string;
    carNumber?: string;
    // Payment details
    prePayment?: number;
    cashToCollect?: number;
    paymentMethod?: string;
    paymentOption?: number;
    paidVia?: string; // 'wallet' or 'razorpay'
    // Trip details
    kmsIncluded?: string;
    duration?: number;
    extraKmRate?: number;
    // Booking metadata
    bookedAt?: Date | null;
    pickupCountdown?: string;
    // Invoice
    billFlag?: number;
    billUrl?: string;
    // Cancellation
    cancelFlag?: boolean;
    bookingKey?: string;
    /** Backend-computed cancellation deadline ("DD-MM-YYYY HH:MM") — shown as tooltip when button is hidden. */
    cancelDateTime?: string;
}

/** Calendar day model for the week strip */
export interface CalendarDay {
    date: Date;
    dateNum: string;
    dayLabel: string;
    isToday: boolean;
    hasPendingPayment: boolean;
    pendingAmount: number;
}

@Component({
    selector: 'app-bookings',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, FooterComponent],
    templateUrl: './bookings.html',
    styleUrl: './bookings.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingsComponent implements OnInit {
    activeTab: BookingTab = 'upcoming';
    isLoading = false;
    private router = inject(Router);
    private location = inject(Location);
    cdr = inject(ChangeDetectorRef);
    private bookingApi = inject(BookingApiService);
    private bookingRegistry = inject(BookingRegistryService);
    private walletService = inject(WalletService);
    private paymentService = inject(PaymentService);
    private authService = inject(AuthService);

    // Categorized booking lists
    upcomingBookings: BookingCard[] = [];
    cancelledBookings: BookingCard[] = [];
    completedBookings: BookingCard[] = [];

    // Search
    searchQuery = '';

    // Expanded booking detail view
    expandedBookingId: string | null = null;

    // Settle panel
    settleBookingId: string | null = null;
    settledBookingId: string | null = null;
    settleConfirmStep = false;
    settleProcessing = false;
    settlePaymentMethod: 'wallet' | 'razorpay' = 'wallet';

    // Cancel modal — reasons match the live b2bcab.in portal (April 2026 HAR).
    cancelModalBooking: BookingCard | null = null;
    cancelReason = '';
    cancelComments = '';
    cancelProcessing = false;
    cancelError = '';
    cancelReasons = [
        'Customer changed plans',
        'Wrong booking created',
    ];
    /**
     * Booking card stashed after a successful cancel so the success popup
     * can show the route/id. Cleared by dismissCancelSuccess().
     * Backend's cancellation.php is synchronous (sends the email before
     * returning), so the in-flight spinner can sit for 20–30s — the
     * success popup is what finally confirms it worked.
     */
    cancelSuccessBooking: BookingCard | null = null;

    // Pagination
    currentPage = 1;
    readonly pageSize = 10;

    // Tab counts (used in sidebar badges)
    get upcomingCount(): number { return this.upcomingBookings.length; }
    get cancelledCount(): number { return this.cancelledBookings.length; }
    get completedCount(): number { return this.completedBookings.length; }

    // Calendar strip
    calendarDays: CalendarDay[] = [];

    // Wallet
    walletBalance = 0;

    // Top-up modal (inline on bookings page)
    showTopUpModal = false;
    topUpAmount = 5000;
    topUpError = '';
    isTopUpProcessing = false;

    // Weekly stats
    weeklyCharges = 0;
    weeklyShortfall = 0;

    // Date filter
    dateFilter: Date | null = null;

    // Calendar start offset (days from today)
    calendarStartOffset = 0;

    // Month picker
    showMonthPicker = false;
    pickerYear = new Date().getFullYear();
    readonly monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    /**
     * City → primary airport display name (+ IATA code).
     *
     * The /booking-details API does not return `airport_name` for airport
     * bookings — only the customer's `pick_city` / `pick_loc`. To show
     * "Bangalore → Kempegowda Airport (BLR)" instead of a generic
     * "Bangalore → Airport" we resolve the airport ourselves from the
     * pick city.
     *
     * Covers the 25 busiest Indian airports (AAI traffic, 2024). Keys are
     * lower-cased city names; both common spellings (Bangalore/Bengaluru,
     * Calcutta/Kolkata) are registered so older bookings match too.
     */
    private readonly CITY_TO_AIRPORT_MAP: Record<string, string> = {
        'bangalore': 'Kempegowda Airport (BLR)',
        'bengaluru': 'Kempegowda Airport (BLR)',
        'mumbai': 'CSM Airport (BOM)',
        'bombay': 'CSM Airport (BOM)',
        'delhi': 'Indira Gandhi Airport (DEL)',
        'new delhi': 'Indira Gandhi Airport (DEL)',
        'kolkata': 'NSC Bose Airport (CCU)',
        'calcutta': 'NSC Bose Airport (CCU)',
        'chennai': 'Chennai Airport (MAA)',
        'madras': 'Chennai Airport (MAA)',
        'hyderabad': 'RGIA Airport (HYD)',
        'pune': 'Pune Airport (PNQ)',
        'ahmedabad': 'SVP Airport (AMD)',
        'goa': 'Dabolim Airport (GOI)',
        'panaji': 'Dabolim Airport (GOI)',
        'kochi': 'Cochin Airport (COK)',
        'cochin': 'Cochin Airport (COK)',
        'ernakulam': 'Cochin Airport (COK)',
        'jaipur': 'Jaipur Airport (JAI)',
        'lucknow': 'CC Airport (LKO)',
        'chandigarh': 'Chandigarh Airport (IXC)',
        'thiruvananthapuram': 'Trivandrum Airport (TRV)',
        'trivandrum': 'Trivandrum Airport (TRV)',
        'bhubaneswar': 'Biju Patnaik Airport (BBI)',
        'guwahati': 'LGB Airport (GAU)',
        'nagpur': 'Nagpur Airport (NAG)',
        'coimbatore': 'Coimbatore Airport (CJB)',
        'indore': 'Devi Ahilya Bai Airport (IDR)',
        'patna': 'Patna Airport (PAT)',
        'visakhapatnam': 'Vizag Airport (VTZ)',
        'vizag': 'Vizag Airport (VTZ)',
        'mangalore': 'Mangaluru Airport (IXE)',
        'mangaluru': 'Mangaluru Airport (IXE)',
        'mysore': 'Mysuru Airport (MYQ)',
        'mysuru': 'Mysuru Airport (MYQ)',
        'varanasi': 'LBS Airport (VNS)',
        'amritsar': 'SGR Dev Ji Airport (ATQ)',
        'srinagar': 'Srinagar Airport (SXR)',
        'dehradun': 'Jolly Grant Airport (DED)',
        'udaipur': 'Maharana Pratap Airport (UDR)',
        'jodhpur': 'Jodhpur Airport (JDH)',
        'raipur': 'Swami Vivekananda Airport (RPR)',
        'ranchi': 'Birsa Munda Airport (IXR)',
    };

    ngOnInit() {
        this.wipeLegacyLocalStorage();
        this.buildCalendarStrip();
        this.loadWalletBalance();
        this.loadBookings();
    }

    /**
     * One-time wipe of the legacy localStorage keys that used to enrich /
     * override the bookings list: the per-user booking registry and the
     * client-side "settled payments" map.
     *
     * Why: the bookings page now renders strictly what /booking-details
     * returns. Any leftover registry / settled-payment entry from older
     * builds would otherwise pollute the display (wrong "Paid Now",
     * synthesized "Wallet Pay" label, ghost upcoming rows for bookings
     * the agent never actually paid for).
     *
     * The wipe runs once per browser (sentinel key persists), so a fresh
     * deploy auto-cleans existing users without nagging on every load.
     */
    private wipeLegacyLocalStorage() {
        if (typeof window === 'undefined' || !window.localStorage) return;
        const sentinel = 'b2b_bookings_pure_api_wipe_v1';
        try {
            if (localStorage.getItem(sentinel)) return;
            const drop: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i) || '';
                if (
                    k.startsWith('savaari_b2b_booking_data_') ||
                    k.startsWith('savaari_b2b_booking_ids_') ||
                    k === 'savaari_b2b_booking_data' ||
                    k === 'savaari_b2b_booking_ids' ||
                    k === 'b2b_settled_payments'
                ) {
                    drop.push(k);
                }
            }
            for (const k of drop) localStorage.removeItem(k);
            localStorage.setItem(sentinel, new Date().toISOString());
        } catch { /* non-fatal */ }
    }

    private loadWalletBalance() {
        this.walletBalance = this.walletService.getCurrentBalance();
        // Also subscribe for updates
        this.walletService.balance$.subscribe(balance => {
            this.walletBalance = balance;
            this.updateCalendarWithBookings();
            this.cdr.markForCheck();
        });
    }

    // ─── Inline Top-up ──────────────────────────────────────────

    openTopUpModal(prefilledAmount?: number) {
        this.showTopUpModal = true;
        this.topUpAmount = prefilledAmount || 5000;
        this.topUpError = '';
        this.isTopUpProcessing = false;
        this.cdr.markForCheck();
    }

    closeTopUpModal() {
        if (this.isTopUpProcessing) return;
        this.showTopUpModal = false;
        this.topUpError = '';
        this.cdr.markForCheck();
    }

    processTopUp() {
        if (this.topUpAmount < 100) {
            this.topUpError = 'Minimum top-up is ₹100';
            this.cdr.markForCheck();
            return;
        }

        this.isTopUpProcessing = true;
        this.topUpError = '';
        this.cdr.markForCheck();

        this.walletService.initiateTopUp(this.topUpAmount).subscribe({
            next: (orderDetails) => {
                if (!orderDetails?.orderId) {
                    this.isTopUpProcessing = false;
                    this.topUpError = 'Unable to initiate payment. Please try again.';
                    this.cdr.markForCheck();
                    return;
                }

                const rzp = new (window as any).Razorpay({
                    key: orderDetails.razorpayKeyId || environment.razorpayKeyId,
                    amount: orderDetails.amount,
                    currency: orderDetails.currency,
                    order_id: orderDetails.orderId,
                    name: 'B2Bcab Wallet',
                    description: 'Wallet Top-Up',
                    handler: (response: any) => {
                        this.walletService.verifyTopUp(
                            response.razorpay_order_id,
                            response.razorpay_payment_id,
                            response.razorpay_signature,
                            this.topUpAmount
                        ).subscribe(success => {
                            this.isTopUpProcessing = false;
                            if (success) {
                                this.showTopUpModal = false;
                            } else {
                                this.topUpError = 'Payment verification failed. Please contact support.';
                            }
                            this.cdr.markForCheck();
                        });
                    },
                    modal: {
                        ondismiss: () => {
                            this.isTopUpProcessing = false;
                            this.cdr.markForCheck();
                        }
                    }
                });
                rzp.open();
            },
            error: () => {
                this.isTopUpProcessing = false;
                this.topUpError = 'Failed to initiate top-up. Please try again.';
                this.cdr.markForCheck();
            }
        });
    }

    /** Month/year label derived from the first visible calendar day */
    get calendarMonthLabel(): string {
        if (!this.calendarDays.length) return '';
        const first = this.calendarDays[0].date;
        const last = this.calendarDays[this.calendarDays.length - 1].date;
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        if (first.getMonth() === last.getMonth()) {
            return `${months[first.getMonth()]} ${first.getFullYear()}`;
        }
        // Spans two months
        return `${months[first.getMonth()].slice(0, 3)} – ${months[last.getMonth()].slice(0, 3)} ${last.getFullYear()}`;
    }

    /** Shift the 7-day calendar strip forward or backward */
    shiftCalendar(days: number) {
        this.calendarStartOffset += days;
        this.buildCalendarStrip();
        this.updateCalendarWithBookings();
        this.cdr.markForCheck();
    }

    /** Close month picker on outside click */
    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (this.showMonthPicker && !target.closest('.month-picker-area')) {
            this.showMonthPicker = false;
            this.cdr.markForCheck();
        }
    }

    /** Toggle month picker overlay */
    toggleMonthPicker() {
        this.showMonthPicker = !this.showMonthPicker;
        if (this.showMonthPicker && this.calendarDays.length) {
            this.pickerYear = this.calendarDays[0].date.getFullYear();
        }
        this.cdr.markForCheck();
    }

    /** Jump calendar to 1st of chosen month */
    jumpToMonth(monthIndex: number) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(this.pickerYear, monthIndex, 1);
        const diffMs = target.getTime() - today.getTime();
        this.calendarStartOffset = Math.round(diffMs / 86400000);
        this.showMonthPicker = false;
        this.buildCalendarStrip();
        this.updateCalendarWithBookings();
        this.cdr.markForCheck();
    }

    /** Check if a month in the picker is the currently visible month */
    isCurrentMonth(monthIndex: number): boolean {
        if (!this.calendarDays.length) return false;
        const first = this.calendarDays[0].date;
        return first.getMonth() === monthIndex && first.getFullYear() === this.pickerYear;
    }

    /** Reset calendar to today */
    goToToday() {
        this.calendarStartOffset = 0;
        this.buildCalendarStrip();
        this.updateCalendarWithBookings();
        this.cdr.markForCheck();
    }

    /** Clear date filter without toggling */
    clearDateFilter() {
        this.dateFilter = null;
        this.currentPage = 1;
        this.cdr.markForCheck();
    }

    private buildCalendarStrip() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days: CalendarDay[] = [];
        const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + this.calendarStartOffset + i);
            const isToday = d.getTime() === today.getTime();
            days.push({
                date: d,
                dateNum: String(d.getDate()),
                dayLabel: dayNames[d.getDay()],
                isToday,
                hasPendingPayment: false,
                pendingAmount: 0,
            });
        }
        this.calendarDays = days;
    }

    private updateCalendarWithBookings() {
        // Reset
        this.calendarDays.forEach(d => {
            d.hasPendingPayment = false;
            d.pendingAmount = 0;
        });

        this.weeklyCharges = 0;

        for (const booking of this.upcomingBookings) {
            if (!booking.pickupDate) continue;
            const pickupDay = new Date(booking.pickupDate);
            pickupDay.setHours(0, 0, 0, 0);

            const balanceDue = this.getBalanceDue(booking);

            for (const day of this.calendarDays) {
                if (day.date.getTime() === pickupDay.getTime()) {
                    if (balanceDue > 0) {
                        day.hasPendingPayment = true;
                        day.pendingAmount += balanceDue;
                        this.weeklyCharges += balanceDue;
                    }
                    break;
                }
            }
        }

        // Calculate shortfall
        this.weeklyShortfall = Math.max(0, this.weeklyCharges - this.walletBalance);
    }

    /**
     * Fetch the bookings list from the B2B API and categorize into tabs.
     *
     * SOURCE OF TRUTH = backend API — strictly.
     *   - No rows are added from the local booking registry or localStorage.
     *     Earlier versions merged registry entries on top of the API response
     *     so a just-created booking would show up instantly. That worked for
     *     the happy path but also surfaced "Potential" bookings — entries
     *     where the booking was created server-side but the agent never
     *     completed payment (back-pressed, closed the tab, etc.). Those kept
     *     appearing on the Upcoming tab labelled "Wallet Pay" with phantom
     *     balance-due amounts, even after the server had filtered them out.
     *   - `toBookingCard()` no longer reads the registry to enrich rows. If a
     *     field is absent from the API response it stays absent in the UI —
     *     that is the correct signal that the backend didn't categorize /
     *     attach it yet, and it prevents stale client state from contradicting
     *     the authoritative backend view (e.g. showing Paid = full fare while
     *     Balance Due was also the full fare).
     */
    private loadBookings() {
        this.isLoading = true;
        this.cdr.markForCheck();

        // Pure API mode: the bookings list is rendered strictly from
        // /booking-details. No registry enrichment, no localStorage
        // override. Anything the backend categorizes into bookingUpcoming
        // / bookingCompleted / bookingCancelled is what the agent sees.
        this.bookingApi.getAllBookings().subscribe({
            next: (bookings: BookingDetails[]) => {
                this.categorizeBookings(bookings);
                this.updateCalendarWithBookings();
                this.isLoading = false;
                this.cdr.markForCheck();
            },
            error: () => {
                // API failed — show empty state rather than stale local data.
                // User can pull-to-refresh / retry; this matches the product
                // directive that all displayed booking data must come from
                // the backend with fresh metrics.
                this.upcomingBookings = [];
                this.completedBookings = [];
                this.cancelledBookings = [];
                this.isLoading = false;
                this.cdr.markForCheck();
            }
        });
    }

    private categorizeBookings(bookings: BookingDetails[]) {
        const seen = new Set<string>();
        const unique = bookings.filter((b: any) => {
            const id = String(b.booking_id || b.bookingId || '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        // Defence-in-depth against "Potential" bookings. The backend should
        // already omit these, but if anything ever leaks through we still
        // want to hide them — their paymentOption is blank, so they'd
        // otherwise render with a misleading "Wallet Pay" fallback label.
        const real = unique.filter((b: any) => {
            const raw = String(b.booking_status || b.status || '').toLowerCase().trim();
            return raw !== 'potential';
        });

        const cards = real.map(b => this.toBookingCard(b));

        this.upcomingBookings = cards.filter(c =>
            c.status === 'confirmed' || c.status === 'assigned' || c.status === 'pending'
        );
        this.cancelledBookings = cards.filter(c => c.status === 'cancelled');
        this.completedBookings = cards.filter(c => c.status === 'completed' || c.status === 'billed');
    }

    /**
     * Parse intermediate stops from whatever shape the data comes in.
     *
     * Source preference:
     *   1. `intermediate_cities_array` — explicit string[] (we set this when storing the booking locally)
     *   2. `intermediate_cities` — comma- or pipe-separated string ("Pune, Lonavala, Mumbai")
     *   3. `via_cities` / `multi_city_destinations` — defensive fallbacks if backend ever surfaces them
     *   4. parse from the backend `itinerary` HTML string ("BLR &rarr; Pune &rarr; Lonavala &rarr; HYD")
     *
     * Returns at most 20 stops (matches the dashboard's stop-add cap).
     */
    private extractIntermediateCities(b: any, sourceCity: string, destinationCity: string): string[] {
        // 1. Explicit array (locally registered)
        if (Array.isArray(b?.intermediate_cities_array)) {
            return b.intermediate_cities_array
                .map((s: any) => String(s || '').trim())
                .filter((s: string) => s.length > 0)
                .slice(0, 20);
        }

        // 2. Comma / pipe / semicolon separated string from any of the known field names
        const raw = b?.intermediate_cities || b?.via_cities || b?.multi_city_destinations || '';
        if (typeof raw === 'string' && raw.trim()) {
            return raw
                .split(/[,|;]/)
                .map((s: string) => s.trim())
                .filter((s: string) => s.length > 0 && s.toLowerCase() !== sourceCity.toLowerCase() && s.toLowerCase() !== destinationCity.toLowerCase())
                .slice(0, 20);
        }

        // 3. Parse from itinerary string ("Bangalore → Pune → Lonavala → Hyderabad").
        //    Handles → ↔ ⇒ ⟶ -> hyphen and the HTML entity &rarr;
        const itin = (b?.itinerary || '').toString().replace(/&rarr;|&#8594;|&#x2192;/gi, '→');
        if (itin.includes('→') || /\s->\s/.test(itin)) {
            const parts = itin
                .split(/→|->/)
                .map((s: string) => s.trim())
                .filter((s: string) => s.length > 0);
            // Drop source (first) and destination (last); collapse duplicates of either
            const middle = parts.slice(1, -1).filter((s: string) =>
                s.toLowerCase() !== sourceCity.toLowerCase() &&
                s.toLowerCase() !== destinationCity.toLowerCase()
            );
            return middle.slice(0, 20);
        }

        return [];
    }

    /**
     * Build the visible route line for the card heading.
     * Round trip: source → (vias) → destination → source
     * One way / outstation: source → (vias) → destination
     * Local / airport: handled outside this helper (single point + label).
     *
     * If too many stops would overflow the line, the middle ones get folded
     * into "+N stops" with the full list available via `viaLine` below the heading.
     */
    private buildRouteLine(sourceCity: string, intermediates: string[], destinationCity: string, isRoundTrip: boolean): string {
        if (!sourceCity && !destinationCity) return '';
        const segments: string[] = [];
        if (sourceCity) segments.push(sourceCity);

        // Show up to 2 intermediate stops inline; the rest move into viaLine.
        // Keeps the heading readable for 20-stop trips while still hinting at the route shape.
        if (intermediates.length <= 2) {
            segments.push(...intermediates);
        } else {
            segments.push(intermediates[0], `+${intermediates.length - 1} stops`);
        }

        if (destinationCity) segments.push(destinationCity);
        if (isRoundTrip && sourceCity) segments.push(sourceCity);
        return segments.join(' → ');
    }

    /** "via Pune, Lonavala, Mumbai" — empty when there are no extra stops. */
    private buildViaLine(intermediates: string[]): string {
        if (!intermediates.length) return '';
        return 'via ' + intermediates.join(', ');
    }

    /**
     * Build the route line for an **Airport** booking.
     *
     * Why this exists: the generic `buildRouteLine()` joins pick_city → drop_city,
     * which for airport bookings wrongly reads "Bangalore → Mysore" (two city names)
     * instead of the expected "Bangalore → Kempegowda Airport, Terminal 2".
     * Airport bookings need the airport/terminal name rendered in the correct
     * direction based on `airportSubType`.
     *
     *   drop (to airport):   customer address/city  →  airport name
     *   pickup (from airport): airport name         →  customer address/city
     *
     * Fallback order (per side):
     *   1. airportName / terminal full string from API (preferred)
     *   2. itinerary-derived airport segment (when backend only stores it in the itinerary string)
     *   3. empty string — template will fall back to `itinerary` / `sourceCity → destinationCity`
     */
    private buildAirportRouteLine(
        sourceCity: string,
        destinationCity: string,
        airportName: string,
        custShortAddress: string,
        airportSubType: string,
        itinerary: string,
    ): string {
        const trimmedAirport = (airportName || '').trim();
        const subType = (airportSubType || '').toLowerCase();

        // Resolve the customer-side city (strip any ", <state>" suffix so we
        // get "Bangalore" not "Bangalore, Karnataka").
        const rawCity = (sourceCity || destinationCity || '').trim();
        const customerCity = rawCity.split(',')[0].trim();

        // Resolve the airport display name:
        //   1. Backend-provided `airport_name` (rare — beta doesn't return it)
        //   2. Our CITY_TO_AIRPORT_MAP lookup for the pick city
        //   3. Plain "Airport" fallback
        const mappedAirport = this.CITY_TO_AIRPORT_MAP[customerCity.toLowerCase()] || '';
        const airportLabel = trimmedAirport || mappedAirport || 'Airport';

        // Customer-side label: show the pickup landmark (first comma-separated
        // segment of pick_loc) when it's meaningful. Example:
        //   pick_loc = "Savaari Car Rentals, 100 Feet Road, Bangalore, Karnataka"
        //   landmark = "Savaari Car Rentals"
        // This is more descriptive than the bare city name and stays compact.
        // Falls back to the city when pick_loc is missing or starts with the
        // city itself.
        const landmark = this.extractPickupLandmark(custShortAddress, customerCity);
        const customerLabel = landmark || customerCity;

        // Itinerary is useful only when it actually contains airport/terminal
        // tokens. "N/A" or plain city → city strings are noise here.
        const itin = (itinerary || '').toString().replace(/&rarr;|&#8594;|&#x2192;/gi, '→');
        const itineraryHasAirport = itin.toLowerCase().includes('airport') ||
            itin.toLowerCase().includes('terminal');

        if (subType === 'pickup') {
            // From airport: Airport → customer landmark
            return customerLabel ? `${airportLabel} → ${customerLabel}` : airportLabel;
        }
        if (subType === 'drop') {
            // To airport: customer landmark → Airport
            return customerLabel ? `${customerLabel} → ${airportLabel}` : airportLabel;
        }

        // Unknown direction — prefer itinerary when it mentions an airport,
        // otherwise default to drop-style (customer → airport) since that's
        // the more common airport booking shape.
        if (itineraryHasAirport && itin.includes('→')) {
            return itin.split('→').map(s => s.trim()).filter(Boolean).join(' → ');
        }
        if (customerLabel) return `${customerLabel} → ${airportLabel}`;
        return airportLabel;
    }

    /**
     * Pull the most meaningful "landmark" from a customer address string so
     * the card heading reads "Savaari Car Rentals → Kempegowda Airport"
     * instead of "Bangalore → Kempegowda Airport" (ambiguous) or the
     * full-length address (wraps two lines).
     *
     * Strategy: use the FIRST comma-separated segment, unless that segment
     * is just the city name (in which case there's no landmark to extract
     * and we return empty, letting the caller fall back to the city).
     */
    private extractPickupLandmark(fullAddress: string, city: string): string {
        const addr = (fullAddress || '').trim();
        if (!addr) return '';
        const first = addr.split(',')[0].trim();
        if (!first) return '';
        // If the first segment IS the city, there's no real landmark.
        if (city && first.toLowerCase() === city.toLowerCase()) return '';
        // Keep the landmark reasonably short so the header fits one line.
        return first.length > 35 ? first.slice(0, 33).trim() + '…' : first;
    }

    /**
     * Build the route line for a **Local** booking.
     *
     * Local trips don't have a destination city — the cab stays within the pickup
     * city for the package duration (8hr/80km, 12hr/120km). Rendering "Bangalore →"
     * with an empty second side looks broken, so we show a single-city pill
     * with the package label appended.
     *
     * Format: "Bangalore · Local (8hr/80km)"
     * Falls back to just the city when package isn't known.
     */
    private buildLocalRouteLine(city: string, localPackage: string, usageName: string): string {
        const base = (city || '').trim();
        if (!base) return '';
        const pkg = (localPackage || usageName || '').toString().trim();
        // Extract only the package portion if usageName is "Local (8hr/80km)" or similar
        const pkgMatch = pkg.match(/(\d+\s*hr[^)]*\d+\s*km)/i);
        const cleanPkg = pkgMatch ? pkgMatch[1] : pkg;
        return cleanPkg ? `${base} · Local (${cleanPkg})` : `${base} · Local`;
    }

    /**
     * Map one /booking-details API row to the BookingCard view-model.
     *
     * Pure API mode: every field is read from the API row `b` only. No
     * localStorage registry, no settled-payment overrides, no synthesized
     * "Wallet Pay" labels. If the backend doesn't surface a value, the
     * card simply shows what the API said (often empty / zero) — that's
     * the truth the agent needs to act on.
     */
    private toBookingCard(b: any): BookingCard {
        let pickupDate: Date | null = null;
        const dateStr = b.start_date_time || b.pickupDateTime;
        if (dateStr) {
            const normalized = dateStr.toString().replace(' ', 'T');
            pickupDate = new Date(normalized);
            if (isNaN(pickupDate.getTime())) pickupDate = null;
        }

        const rawStatus = String(b.booking_status || b.status || 'pending').toLowerCase().trim();
        let status = rawStatus;
        if (rawStatus === '1' || rawStatus === 'confirmed' || rawStatus === 'upcoming') status = 'confirmed';
        else if (rawStatus === '2' || rawStatus === 'assigned' || rawStatus === 'in_progress') status = 'assigned';
        else if (rawStatus === '3' || rawStatus === 'completed' || rawStatus === 'billed') status = 'completed';
        else if (rawStatus === '4' || rawStatus === 'cancel' || rawStatus === 'cancelled') status = 'cancelled';
        else if (rawStatus === 'pending') status = 'pending';

        const driver = Array.isArray(b.driver_details) ? null : b.driver_details;
        const pickupTime = dateStr ? dateStr.toString().substring(11, 16) : '';

        let itinerary = b.itinerary || '';
        if (itinerary && typeof document !== 'undefined') {
            const parser = new DOMParser();
            const doc = parser.parseFromString(itinerary, 'text/html');
            itinerary = doc.body.textContent || itinerary;
        }

        // Payment plan derivation.
        //
        // /booking-details does not return an explicit `payment_option` field
        // (verified from live beta response, April 2026 — the row exposes
        // `pay_now_amt`, `pay_bal_amt`, `cashtocollect`, `gross_amount` and
        // nothing else that maps to the UI's three payment plans).
        //
        // We infer the plan from the ratio of what the agent has already paid
        // to the total fare:
        //   ratio ≥ 0.99   → Option 3 (Zero Cash — full wallet upfront)
        //   0.20 ≤ r ≤ 0.35 → Option 2 (Pay 25% now, rest auto-deduct)
        //   0 < r < 0.20    → Option 1 (Pay Any Amount Now — custom %)
        //   r === 0         → unpaid / potential (leave option = 0)
        //
        // If a backend revision later surfaces `payment_option` directly we
        // honour it over the ratio heuristic.
        let paymentMethod = '';
        let paymentOption = 0;
        const explicitOpt = b.payment_option || b.paymentOption || b.prePaymentType || '';
        if (explicitOpt === '1' || explicitOpt === 1) { paymentMethod = 'Pay Any Amount Now'; paymentOption = 1; }
        else if (explicitOpt === '2' || explicitOpt === 2) { paymentMethod = 'Pay 25% Now, Rest Auto-Deducted'; paymentOption = 2; }
        else if (explicitOpt === '3' || explicitOpt === 3) { paymentMethod = 'Zero Cash'; paymentOption = 3; }

        const paidVia = String(b.paidVia || b.paid_via || '').toLowerCase();

        let pickupCountdown = '';
        if (pickupDate && status !== 'completed' && status !== 'cancelled') {
            const diff = pickupDate.getTime() - Date.now();
            if (diff > 0) {
                const days = Math.floor(diff / 86400000);
                const hrs = Math.floor((diff % 86400000) / 3600000);
                if (days > 0) pickupCountdown = `in ${days}d ${hrs}h`;
                else if (hrs > 0) pickupCountdown = `in ${hrs}h`;
                else pickupCountdown = 'Soon';
            } else {
                pickupCountdown = 'Pickup time passed';
            }
        }

        // Resolve route information — API only.
        const sourceCity = b.pick_city || b.source_city || b.sourceCity || '';
        const destinationCity = b.drop_city || b.destination_city || b.destinationCity || '';

        // Trip-type detection — backend uses several names interchangeably
        const tripTypeRaw = (b.trip_type || b.tripType || '').toString().toLowerCase();
        const usageNameRaw = (b.usage_name || b.usagename || b.usageName || '').toString().toLowerCase();
        const isRoundTrip = tripTypeRaw === 'round trip' ||
            tripTypeRaw === 'roundtrip' ||
            usageNameRaw === 'roundtrip' ||
            usageNameRaw.includes('round');
        const isAirport = tripTypeRaw.includes('airport') || usageNameRaw.includes('airport');
        const isLocal = tripTypeRaw.includes('local') || usageNameRaw.includes('local');

        // Airport-specific fields — API only.
        //
        // The /booking-details response uses `trip_sub_type_name` (values:
        // "drop_airport" / "pickup_airport") to indicate direction. It does
        // NOT populate `airport_name`, `terminal_name`, or `drop_city` for
        // airport rows — only `pick_city` and `pick_loc` (customer address).
        // Older API revisions used `airport_sub_type` / `sub_trip_type`, so
        // those fallbacks are kept for compatibility.
        const airportName = b.airport_name || b.airportName || b.airportname || '';
        const terminalName = b.terminalname || b.terminal_name || '';
        const airportSubTypeRaw = b.trip_sub_type_name || b.airport_sub_type ||
            b.airportSubType || b.sub_trip_type || b.subTripType || '';
        const rawSubTypeStr = String(airportSubTypeRaw || '').toLowerCase();
        // Normalise: "drop_airport" / "to_airport" / "drop" → "drop"
        //            "pickup_airport" / "from_airport" / "pickup" → "pickup"
        let airportSubType = '';
        if (rawSubTypeStr.includes('drop') || rawSubTypeStr.includes('to_air') || rawSubTypeStr.includes('toair')) {
            airportSubType = 'drop';
        } else if (rawSubTypeStr.includes('pickup') || rawSubTypeStr.includes('from_air') || rawSubTypeStr.includes('fromair')) {
            airportSubType = 'pickup';
        }
        // custShortAddress = the customer's long-form address. For airport
        // bookings this goes into the EXPANDED-details pane only; the card
        // header uses pick_city so the title stays short.
        //   - drop (to airport):   pick_loc = customer address, drop_loc = airport
        //   - pickup (from airport): pick_loc = airport,         drop_loc = customer address
        const pickupLocStr = b.pick_loc || b.pickup_address || b.pickupAddress || '';
        const dropLocStr = b.drop_loc || b.drop_address || b.dropAddress || '';
        const isPickupFromAirport = airportSubType === 'pickup';
        const custShortAddress = b.custShortAddress || b.cust_short_address ||
            (isPickupFromAirport ? dropLocStr : pickupLocStr);
        const airportFullName = airportName && terminalName && !airportName.includes(terminalName)
            ? `${airportName}, ${terminalName}`
            : (airportName || terminalName || '');

        const localPackage = b.local_package || b.localPackage || b.package_name || '';

        // Intermediate stops only apply to outstation — airport/local don't have vias.
        const intermediateCities = (isAirport || isLocal) ? [] : this.extractIntermediateCities(
            b,
            sourceCity,
            destinationCity
        );

        // Dispatch route-line construction by trip type so the card heading shows
        // semantically correct text instead of a generic "source → destination".
        let routeLine: string;
        if (isAirport) {
            routeLine = this.buildAirportRouteLine(
                sourceCity,
                destinationCity,
                airportFullName,
                custShortAddress,
                airportSubType,
                itinerary,
            );
        } else if (isLocal) {
            routeLine = this.buildLocalRouteLine(sourceCity || destinationCity, localPackage, usageNameRaw);
        } else {
            routeLine = this.buildRouteLine(sourceCity, intermediateCities, destinationCity, isRoundTrip);
        }
        const viaLine = this.buildViaLine(intermediateCities);

        // Paid-amount derivation — API only.
        //
        // Field names confirmed from the live /booking-details response
        // (api23.betasavaari.com, April 2026):
        //   gross_amount   → total fare (string, e.g. "41184")
        //   pay_now_amt    → amount the agent has already paid (string)
        //   pay_bal_amt    → balance still owed by the agent
        //   cashtocollect  → amount the driver will collect in cash at pickup
        //
        // Earlier drafts looked for `cash_to_collect` / `cash_to_driver` with
        // underscores and fell back to 0 when the real field (`cashtocollect`,
        // no underscores) was not matched. That produced prePayment = fare on
        // every booking, which rendered as a false "Fully Paid" badge.
        //
        // Canonical mapping:
        //   prePayment     = pay_now_amt       (authoritative paid amount)
        //   cashToCollect  = cashtocollect     (driver's collection at pickup)
        // pay_bal_amt is kept for the template's Balance Due line so we don't
        // have to re-derive it — pay_now + pay_bal = gross for every row we
        // have seen (potential, Option 1, 2, 3, settled).
        const fare = parseFloat(b.gross_amount) || parseFloat(b.total_amount) || b.totalFare || b.fare || 0;
        const cashToCollect = parseFloat(
            b.cashtocollect ?? b.cashToCollect ?? b.cash_to_collect ?? b.cash_to_driver ?? b.cashToDriver
        ) || 0;
        const payNow = parseFloat(b.pay_now_amt ?? b.payNowAmt) || 0;
        const apiPrePayment = parseFloat(b.prePayment || b.pre_payment);
        // Preference order: explicit prePayment → pay_now_amt → derive from
        // fare & cashtocollect. We only fall back to the derivation when
        // neither of the first two is available; never when they exist and
        // are 0 (0 is meaningful — it means "unpaid", not "use fare").
        let prePayment: number;
        if (!isNaN(apiPrePayment) && apiPrePayment > 0) {
            prePayment = apiPrePayment;
        } else if (b.pay_now_amt !== undefined || b.payNowAmt !== undefined) {
            prePayment = payNow;
        } else {
            prePayment = Math.max(0, fare - cashToCollect);
        }

        // Balance the agent still owes (as opposed to what the driver
        // collects from the customer). This is the key signal that
        // distinguishes Option 1 from Option 2:
        //   Option 1 — agent paid X, driver collects (fare - X) from CUSTOMER.
        //              pay_bal = 0, cashtocollect > 0.
        //   Option 2 — agent paid 25%, cron debits 75% from AGENT's wallet.
        //              pay_bal > 0, cashtocollect > 0 (same value).
        //   Option 3 — agent paid everything upfront.
        //              pay_bal = 0, cashtocollect = 0.
        const agentOwes = parseFloat(b.pay_bal_amt ?? b.payBalAmt) || 0;

        // If the backend didn't give us an explicit payment_option, infer it
        // from (prePayment, agentOwes, cashToCollect). This powers the
        // auto-debit countdown (Option 2 only) and the settle-button label.
        if (paymentOption === 0 && fare > 0 && prePayment >= 0) {
            if (prePayment >= fare * 0.99 && cashToCollect === 0) {
                paymentOption = 3; paymentMethod = 'Zero Cash';
            } else if (agentOwes > 0) {
                // Agent still owes money — auto-debit plan.
                paymentOption = 2; paymentMethod = 'Pay 25% Now, Rest Auto-Deducted';
            } else if (prePayment > 0 && cashToCollect > 0 && agentOwes === 0) {
                // Agent paid advance, driver collects the rest from customer.
                paymentOption = 1; paymentMethod = 'Pay Any Amount Now';
            }
            // Otherwise (prePayment === 0 or all three zero) → leave paymentOption = 0
            // so the UI falls back to the neutral "—" label instead of inventing one.
        }

        return {
            bookingId: String(b.booking_id || b.bookingId || ''),
            reservationId: String(b.reservation_id || b.reservationId || ''),
            sourceCity,
            destinationCity,
            intermediateCities,
            isRoundTrip,
            routeLine,
            viaLine,
            tripType: b.trip_type || b.tripType || '',
            usageName: b.usage_name || b.usagename || b.usageName || '',
            airportSubType,
            airportName: airportFullName,
            custShortAddress,
            localPackage,
            pickupAddress: b.pick_loc || b.pickup_address || b.pickupAddress || '',
            dropAddress: b.drop_loc || b.drop_address || b.dropAddress || '',
            pickupDate,
            pickupTime,
            status,
            fare,
            customerName: b.customer_name || b.customerName || '',
            customerMobile: b.customer_mobile || b.customerMobile || '',
            customerEmail: b.customer_email || b.customerEmail || '',
            carName: b.car_name || b.carName || '',
            itinerary,
            driverName: driver?.driver_name || b.driverName || '',
            driverMobile: driver?.driver_number || b.driverMobile || '',
            carNumber: driver?.car_number || b.carNumber || '',
            prePayment,
            cashToCollect,
            paymentMethod,
            paymentOption,
            paidVia,
            kmsIncluded: b.package_kms || b.min_km_quota_per_day || b.kms_included || b.kmsIncluded || '',
            duration: parseInt(b.duration) || 0,
            extraKmRate: parseFloat(b.extra_km_rate || b.extraKmRate) || 0,
            bookedAt: b.created_at ? new Date(b.created_at) : b.createdAt ? new Date(b.createdAt) : null,
            pickupCountdown,
            billFlag: Number(b.bill_flag) || 0,
            billUrl: b.bill_url || '',
            cancelFlag: b.cancel_flag === '1' || b.cancel_flag === 1 || b.cancel_flag_web === '1' || b.cancel_flag_web === 1,
            bookingKey: String(b.booking_key || b.bookingKey || ''),
            cancelDateTime: String(b.cancel_date_time || b.cancelDateTime || ''),
        };
    }

    /**
     * Decide whether the Cancel button should be visible for this booking.
     *
     * Business rule (per product requirement, April 2026):
     *   "Booking cancellation trip shuru hone ke 1 ghante pehle tak ho sakti hai"
     *   → if pickup is less than 1 hour away, cancellation is not allowed.
     *
     * We only enforce this client-side gate. The backend still applies its own
     * rules on POST /system_bookings/cancellation.php (invalid booking_key,
     * already-cancelled, driver-in-transit, etc.) and those surface via the
     * error handler in `confirmCancel()`.
     */
    canCancelBooking(booking: BookingCard): boolean {
        if (!booking || !booking.pickupDate) return false;
        const msUntilPickup = booking.pickupDate.getTime() - Date.now();
        const ONE_HOUR_MS = 60 * 60 * 1000;
        return msUntilPickup >= ONE_HOUR_MS;
    }

    openReceipt(booking: BookingCard) {
        this.router.navigate(['/receipt'], { state: { booking } });
    }

    // ─── Payment Helpers ───────────────────────────────────────

    /** Balance remaining to be paid (fare - what was already paid) */
    getBalanceDue(booking: BookingCard): number {
        if (!booking.fare) return 0;
        // Option 1: remaining is paid by customer to driver — no agent balance due
        if (booking.paymentOption === 1) return 0;
        const paid = booking.prePayment || 0;
        return Math.max(0, booking.fare - paid);
    }

    /** Short label for payment method — matches payment page option names exactly. */
    getPaymentMethodShort(booking: BookingCard): string {
        if (booking.paymentOption === 1) return 'Pay Any Amount Now';
        if (booking.paymentOption === 2) return 'Pay 25% Now';
        if (booking.paymentOption === 3) return 'Zero Cash';
        if (booking.prePayment && booking.fare && booking.prePayment >= booking.fare) return 'Fully Paid';
        return booking.paymentMethod || '—';
    }

    /** Full label for payment method (used in expanded detail view). */
    getPaymentMethodLabel(booking: BookingCard): string {
        if (booking.paymentOption === 1) return 'Pay Any Amount Now — Customer pays driver';
        if (booking.paymentOption === 2) return 'Pay 25% Now, Rest Auto-Deducted';
        if (booking.paymentOption === 3) return 'Zero Cash';
        if (booking.prePayment && booking.fare && booking.prePayment >= booking.fare) return 'Fully Paid';
        return booking.paymentMethod || '—';
    }

    /**
     * Auto-debit countdown text — shown only for Option 2 bookings where the
     * agent paid 25% upfront and the backend cron debits the remaining 75%
     * 48 hours before pickup. For every other payment plan (or unknown
     * option) the countdown is meaningless, so we return empty.
     */
    getAutoDebitCountdown(booking: BookingCard): string {
        if (!booking.pickupDate) return '';
        if (booking.paymentOption !== 2) return '';
        const balanceDue = this.getBalanceDue(booking);
        if (balanceDue <= 0) return '';

        const debitTime = new Date(booking.pickupDate.getTime() - 48 * 3600000);
        const now = Date.now();
        const diff = debitTime.getTime() - now;

        if (diff <= 0) return 'Due now';
        const hrs = Math.floor(diff / 3600000);
        if (hrs < 24) return `in ${hrs} hrs`;
        const days = Math.floor(hrs / 24);
        return `in ${days}d ${hrs % 24}h`;
    }

    /** Human-readable trip type label (Outstation / Local / Airport). */
    getTripTypeLabel(tripType: string | undefined): string {
        const t = (tripType || '').toLowerCase().trim();
        if (!t) return '';
        if (t.includes('outstation')) return 'Outstation';
        if (t.includes('local')) return 'Local';
        if (t.includes('airport')) return 'Airport';
        // Fallback: Title-case whatever we got
        return t.charAt(0).toUpperCase() + t.slice(1);
    }

    /** Formatted package KM string, e.g. "145 km" — empty when not present.
     *  Falls back to extracting km from usageName like "Outstation (145 km)" /
     *  "Local (8hr/80 km)" when the dedicated field is missing.
     */
    getPackageKmLabel(booking: BookingCard): string {
        const raw = booking.kmsIncluded;
        const str = (raw === undefined || raw === null) ? '' : String(raw).trim();
        if (str && str !== '0') {
            // Already-formatted string ("145 km", "8hr/80 km") → return as-is
            if (/km|hr/i.test(str)) return str;
            // Pure numeric → append " km"
            return `${str} km`;
        }
        // Fallback: pull "<digits> km" out of usageName / itinerary
        const sources = [booking.usageName, booking.itinerary];
        for (const src of sources) {
            if (!src) continue;
            const m = String(src).match(/(\d+)\s*km/i);
            if (m) return `${m[1]} km`;
        }
        return '';
    }

    // ─── Calendar ──────────────────────────────────────────────

    filterByDate(date: Date) {
        if (this.dateFilter && this.dateFilter.getTime() === date.getTime()) {
            this.dateFilter = null; // Toggle off
        } else {
            this.dateFilter = date;
        }
        this.currentPage = 1;
        this.cdr.markForCheck();
    }

    // ─── Tab / Pagination ──────────────────────────────────────

    private get baseList(): BookingCard[] {
        let list: BookingCard[];
        switch (this.activeTab) {
            case 'upcoming': list = this.upcomingBookings; break;
            case 'cancelled': list = this.cancelledBookings; break;
            case 'completed': list = this.completedBookings; break;
            default: list = [];
        }
        // Search filter
        if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase();
            list = list.filter(b =>
                b.bookingId.toLowerCase().includes(q) ||
                b.sourceCity.toLowerCase().includes(q) ||
                b.destinationCity.toLowerCase().includes(q) ||
                b.customerName.toLowerCase().includes(q) ||
                b.reservationId.toLowerCase().includes(q)
            );
        }
        // Date filter
        if (this.dateFilter) {
            list = list.filter(b => {
                if (!b.pickupDate) return false;
                const d = new Date(b.pickupDate);
                d.setHours(0, 0, 0, 0);
                return d.getTime() === this.dateFilter!.getTime();
            });
        }
        return list;
    }

    get filteredBookings(): BookingCard[] {
        const start = (this.currentPage - 1) * this.pageSize;
        return this.baseList.slice(start, start + this.pageSize);
    }

    get totalInCurrentTab(): number { return this.baseList.length; }
    get totalPages(): number { return Math.ceil(this.totalInCurrentTab / this.pageSize); }
    get pageNumbers(): number[] {
        const total = this.totalPages;
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
        const pages: number[] = [];
        const start = Math.max(2, this.currentPage - 2);
        const end = Math.min(total - 1, this.currentPage + 2);
        pages.push(1);
        if (start > 2) pages.push(-1);
        for (let i = start; i <= end; i++) pages.push(i);
        if (end < total - 1) pages.push(-1);
        pages.push(total);
        return pages;
    }

    goToPage(page: number) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.cdr.markForCheck();
    }

    get tabTitle(): string {
        switch (this.activeTab) {
            case 'upcoming': return 'Upcoming Bookings';
            case 'cancelled': return 'Cancelled Bookings';
            case 'completed': return 'Completed Bookings';
            default: return 'Bookings';
        }
    }

    getStatusClass(status: string): Record<string, boolean> {
        const s = (status || '').toUpperCase();
        return {
            'bg-emerald-50 text-emerald-700 border-emerald-200': s === 'CONFIRMED' || s === 'COMPLETED',
            'bg-amber-50 text-amber-700 border-amber-200': s === 'PENDING' || s === 'ASSIGNED',
            'bg-red-50 text-red-700 border-red-200': s === 'CANCELLED' || s === 'FAILED',
            'bg-sky-50 text-sky-700 border-sky-200': s === 'IN_PROGRESS' || s === 'STARTED',
        };
    }

    setActiveTab(tab: BookingTab) {
        if (this.activeTab === tab) return;
        this.activeTab = tab;
        this.currentPage = 1;
        this.dateFilter = null;
        this.cdr.markForCheck();
    }

    toggleDetails(bookingId: string) {
        if (this.expandedBookingId === bookingId) {
            // Collapse
            this.expandedBookingId = null;
            this.settleBookingId = null;
        } else {
            // Expand — auto-open settle panel if balance due
            this.expandedBookingId = bookingId;
            const booking = this.upcomingBookings.find(b => b.bookingId === bookingId);
            if (booking && this.getBalanceDue(booking) > 0) {
                this.settleBookingId = bookingId;
            }
        }
        this.settledBookingId = null;
        this.cdr.markForCheck();
    }

    goBack() {
        this.location.back();
    }

    refreshBookings() {
        this.loadBookings();
    }

    // ─── Settle ────────────────────────────────────────────────

    openSettlePanel(booking: BookingCard) {
        this.expandedBookingId = booking.bookingId;
        this.settleBookingId = booking.bookingId;
        this.cdr.markForCheck();
    }

    /** Step 1: Show confirmation popup */
    settleBooking(booking: BookingCard) {
        const amount = this.getBalanceDue(booking);
        if (amount <= 0) return;
        // For wallet payment, block if insufficient balance (unless Razorpay selected)
        if (this.settlePaymentMethod === 'wallet' && (booking.paymentOption === 2 || booking.paymentOption === 3) && this.walletBalance < amount) {
            return;
        }
        this.settleConfirmStep = true;
        this.cdr.markForCheck();
    }

    /** Step 2: User confirmed — show processing then settle */
    confirmSettle(booking: BookingCard) {
        const amount = this.getBalanceDue(booking);
        if (amount <= 0) return;

        this.settleConfirmStep = false;
        this.settleProcessing = true;
        this.cdr.markForCheck();

        /**
         * After payment succeeds, call backend APIs to persist settlement, then update UI.
         *
         * The two IDs are NOT the same for Razorpay — per backend team's
         * "B2B Settlement Payment API" doc (April 2026):
         *   - confirmation.php wants the razorpay PAYMENT id (matches how the
         *     new-booking flow calls confirmation.php in booking.ts).
         *   - settlement-payment wants `transactionId` = razorpay ORDER id
         *     and `paymentId` = razorpay PAYMENT id.
         * For Wallet both IDs collapse to the single wallet transaction id.
         */
        const onSuccess = (params: {
            paymentMethod: 'Wallet' | 'Razorpay';
            /** Goes to confirmation.php `transaction_id` — razorpay payment id OR wallet txn id */
            confirmationTxnId: string;
            /** Goes to settlement-payment `transactionId` — razorpay ORDER id OR wallet txn id */
            settlementTxnId: string;
            /** Goes to settlement-payment `paymentId` — razorpay payment id only (optional for wallet) */
            paymentId?: string;
        }) => {
            // Step 1: confirmation.php — record the payment in sv_advance_payment
            this.paymentService.confirmPayment({
                source: params.paymentMethod === 'Wallet' ? 'B2B_WALLET' : 'B2B_RAZORPAY',
                booking_id: booking.bookingId,
                payment_option: booking.paymentOption || 2,
                transaction_id: params.confirmationTxnId,
                totalAmount: booking.fare || 0,
                bufferAmount: 0,
                advancedAmount: amount,
            } as any).subscribe({
                next: () => {
                    // Step 2: settlement-payment — sets pay_bal_amt=0, payment_status='Pre Paid'
                    this.paymentService.settlementPayment({
                        bookingId: booking.bookingId,
                        paymentAmount: amount,
                        paymentMethod: params.paymentMethod,
                        transactionId: params.settlementTxnId,
                        paymentId: params.paymentId,
                    }).subscribe({
                        next: (settled) => {
                            if (!environment.production) console.log('[BOOKINGS] Settlement API result:', settled);
                        },
                        error: (err) => {
                            if (!environment.production) console.warn('[BOOKINGS] settlement-payment API error:', err);
                        },
                    });
                },
                error: (err) => {
                    if (!environment.production) console.warn('[BOOKINGS] confirmation.php error:', err);
                },
            });

            // Update UI immediately (don't block on API calls)
            // Note: settlement persistence is handled by the backend (confirmation.php + settlement-payment API);
            // on next reload, toBookingCard() re-derives prePayment from the API response.
            booking.prePayment = (booking.prePayment || 0) + amount;
            booking.cashToCollect = 0;
            this.settleProcessing = false;
            this.settleBookingId = null;
            this.settledBookingId = booking.bookingId;
            this.settlePaymentMethod = 'wallet'; // Reset for next settle
            this.updateCalendarWithBookings();
            this.cdr.markForCheck();
            setTimeout(() => { this.settledBookingId = null; this.expandedBookingId = null; this.cdr.markForCheck(); }, 30000);
        };

        const onError = () => {
            this.settleProcessing = false;
            this.settleConfirmStep = false;
            this.cdr.markForCheck();
        };

        // Flexible (option 1) — guest pays driver, just mark settled with a brief delay for UX
        // Note: for option 1 there is no backend settle call, so this flip is session-only
        // and will revert on reload unless the backend eventually reflects it.
        if (booking.paymentOption === 1) {
            booking.prePayment = booking.fare;
            setTimeout(() => {
                // No wallet/razorpay involved — just update UI
                this.settleProcessing = false;
                this.settleBookingId = null;
                this.settledBookingId = booking.bookingId;
                this.settlePaymentMethod = 'wallet';
                this.updateCalendarWithBookings();
                this.cdr.markForCheck();
                setTimeout(() => { this.settledBookingId = null; this.expandedBookingId = null; this.cdr.markForCheck(); }, 30000);
            }, 1500);
            return;
        }

        // Razorpay settlement — open Razorpay modal
        if (this.settlePaymentMethod === 'razorpay') {
            this.walletService.createBookingOrder(amount).subscribe({
                next: (order) => {
                    if (!order || !order.orderId) {
                        onError();
                        return;
                    }
                    // Razorpay key: prefer server-supplied (lets backend rotate without
                    // redeploy), fall back to the imported environment value. The old
                    // `window.environment` lookup was a no-op — the env is never attached
                    // to window, so the fallback silently collapsed to '' and the SDK
                    // threw "Authentication key was missing". Mirrors the wallet top-up
                    // pattern at line 263 which has always worked.
                    const razorpayKey = order.razorpayKeyId || environment.razorpayKeyId;
                    const options: any = {
                        key: razorpayKey,
                        amount: order.amount,
                        currency: order.currency || 'INR',
                        name: environment.brandName,
                        description: `Settle Booking #${booking.bookingId} — ₹${amount}`,
                        order_id: order.orderId,
                        handler: (response: any) => {
                            const rzpPaymentId = response.razorpay_payment_id || '';
                            const rzpOrderId = response.razorpay_order_id || '';
                            this.walletService.verifyBookingPayment(
                                rzpOrderId,
                                rzpPaymentId,
                                response.razorpay_signature,
                                amount,
                                booking.bookingId
                            ).subscribe({
                                // Per B2B Settlement Payment API doc (April 2026):
                                // settlement-payment's `transactionId` must be the razorpay
                                // ORDER id (not payment id). `paymentId` carries the payment id.
                                // confirmation.php still takes payment id (unchanged — matches
                                // new-booking flow in booking.ts).
                                next: () => setTimeout(() => onSuccess({
                                    paymentMethod: 'Razorpay',
                                    confirmationTxnId: rzpPaymentId,
                                    settlementTxnId: rzpOrderId,
                                    paymentId: rzpPaymentId,
                                }), 800),
                                error: () => onError()
                            });
                        },
                        modal: {
                            ondismiss: () => {
                                this.settleProcessing = false;
                                this.cdr.markForCheck();
                            }
                        },
                        prefill: { email: this.authService.getUserEmail() },
                        theme: { color: '#00ace6' },
                    };
                    const rzp = new (window as any).Razorpay(options);
                    rzp.open();
                },
                error: () => onError()
            });
            return;
        }

        // Wallet settlement — pay from wallet, then call backend APIs
        this.walletService.payForBooking(booking.bookingId, amount, (booking.paymentOption || 2) as 1 | 2 | 3).subscribe({
            next: (result) => {
                if (result.success) {
                    const txnId = result.transactionId || '';
                    // Wallet path: both IDs collapse to the single wallet transaction id.
                    // Per B2B Settlement Payment API doc, `paymentMethod=Wallet` →
                    // `transactionId` = Wallet Transaction ID, `paymentId` omitted.
                    setTimeout(() => onSuccess({
                        paymentMethod: 'Wallet',
                        confirmationTxnId: txnId,
                        settlementTxnId: txnId,
                    }), 1200);
                } else {
                    onError();
                }
            },
            error: () => onError()
        });
    }

    /** Cancel confirmation step */
    cancelSettleConfirm() {
        this.settleConfirmStep = false;
        this.cdr.markForCheck();
    }

    // ─── Cancel ────────────────────────────────────────────────

    openCancelModal(booking: BookingCard) {
        this.cancelModalBooking = booking;
        this.cancelReason = '';
        this.cancelComments = '';
        this.cancelError = '';
        this.cancelProcessing = false;
        this.cdr.markForCheck();
    }

    closeCancelModal() {
        if (this.cancelProcessing) return;
        this.cancelModalBooking = null;
        this.cancelReason = '';
        this.cancelComments = '';
        this.cancelError = '';
        this.cancelProcessing = false;
        this.cdr.markForCheck();
    }

    /** Free-cancellation deadline text for the cancel modal — same format as the live portal. */
    getFreeCancellationText(booking: BookingCard | null): string {
        if (!booking || !booking.pickupDate) return '';
        // Live portal shows the pickup datetime as the free-cancellation cutoff.
        const d = booking.pickupDate;
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${booking.pickupTime || ''}`.trim();
    }

    confirmCancel() {
        if (!this.cancelModalBooking || !this.cancelReason) return;
        this.cancelProcessing = true;
        this.cancelError = '';
        this.cdr.markForCheck();

        const booking = this.cancelModalBooking;

        // Last-mile sanity: backend requires booking_key on cancellation.php.
        // Newly-created bookings sometimes reach this page before the
        // booking-details API has surfaced the key, in which case we refetch
        // that one booking to grab the key before attempting cancellation.
        if (!booking.bookingKey) {
            this.bookingApi.getBookingDetails(booking.bookingId).subscribe({
                next: (details: any) => {
                    const freshKey = String(
                        details?.booking_key || details?.bookingKey || ''
                    );
                    if (!freshKey) {
                        this.cancelProcessing = false;
                        this.cancelError = 'Booking is still syncing. Please try again in a few seconds.';
                        this.cdr.markForCheck();
                        return;
                    }
                    booking.bookingKey = freshKey;
                    this.sendCancelRequest(booking);
                },
                error: () => {
                    this.cancelProcessing = false;
                    this.cancelError = 'Could not verify booking for cancellation. Please refresh and try again.';
                    this.cdr.markForCheck();
                }
            });
            return;
        }

        this.sendCancelRequest(booking);
    }

    /** Issue the actual cancel API call — extracted so we can retry after refetching booking_key. */
    private sendCancelRequest(booking: BookingCard) {
        this.bookingApi.cancelBooking(
            booking.bookingId,
            booking.reservationId || '',
            this.cancelReason,
            this.cancelComments || '',
            booking.bookingKey || ''
        ).subscribe({
            next: (response: any) => {
                const code = Number(response?.status_code);
                const desc = String(response?.status_description || '').toUpperCase();
                const ok = code === 101 || desc === 'SUCCESS' || response?.status === 'cancelled';
                if (!ok) {
                    this.cancelProcessing = false;
                    this.cancelError = response?.message || response?.status_description || 'Failed to cancel booking.';
                    this.cdr.markForCheck();
                    return;
                }
                // Move the card from upcoming → cancelled instead of just removing it.
                const id = booking.bookingId;
                const cancelled = this.upcomingBookings.find(b => b.bookingId === id);
                this.upcomingBookings = this.upcomingBookings.filter(b => b.bookingId !== id);
                if (cancelled) {
                    cancelled.status = 'cancelled';
                    this.cancelledBookings = [cancelled, ...this.cancelledBookings];
                }
                this.bookingRegistry.removeBookingId(id);
                this.updateCalendarWithBookings();
                // Show the success popup BEFORE closing the cancel modal so the
                // user always gets a visual confirmation that the booking was
                // cancelled (backend can take 20–30s to reply, so the email
                // sometimes arrives before this response reaches the browser).
                this.cancelSuccessBooking = cancelled || booking;
                this.cancelProcessing = false;
                this.cancelModalBooking = null;
                this.cancelReason = '';
                this.cancelComments = '';
                this.cdr.markForCheck();
            },
            error: (err) => {
                this.cancelProcessing = false;
                this.cancelError = err?.message || 'Failed to cancel booking. Please contact support.';
                this.cdr.markForCheck();
            }
        });
    }

    /** Close the "Booking Cancelled Successfully" confirmation popup. */
    dismissCancelSuccess() {
        this.cancelSuccessBooking = null;
        this.cdr.markForCheck();
    }

    // ─── Share / Copy / Call ────────────────────────────────────

    callCustomer(mobile: string) {
        window.open(`tel:${mobile}`, '_self');
    }

    copyBookingDetails(booking: BookingCard) {
        const pickupDate = booking.pickupDate
            ? booking.pickupDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : '';
        const route = booking.itinerary || (booking.destinationCity ? `${booking.sourceCity} → ${booking.destinationCity}` : booking.sourceCity);
        const lines = [
            `Booking ID: ${booking.bookingId}`,
            `Route: ${route}`,
            booking.carName ? `Vehicle: ${booking.carName}` : '',
            `Pickup: ${pickupDate}${booking.pickupTime ? ', ' + booking.pickupTime : ''}`,
            booking.pickupAddress ? `Pickup: ${booking.pickupAddress}` : '',
            booking.customerName ? `Customer: ${booking.customerName}` : '',
            booking.customerMobile ? `Mobile: ${booking.customerMobile}` : '',
            booking.fare ? `Fare: ₹${booking.fare.toLocaleString('en-IN')}` : '',
            booking.prePayment ? `Paid: ₹${booking.prePayment.toLocaleString('en-IN')}` : '',
            booking.paymentMethod ? `Payment: ${booking.paymentMethod}` : '',
            booking.reservationId ? `Reservation: ${booking.reservationId}` : '',
        ].filter(l => l !== '');

        navigator.clipboard.writeText(lines.join('\n')).then(() => {
            console.log('[BOOKINGS] Copied to clipboard');
        });
    }

    shareOnWhatsApp(booking: BookingCard) {
        const pickupDate = booking.pickupDate
            ? booking.pickupDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : '';
        const route = booking.itinerary || (booking.destinationCity ? `${booking.sourceCity} → ${booking.destinationCity}` : booking.sourceCity);
        const lines = [
            `*Booking Confirmation - ${environment.brandName}*`,
            ``,
            `Booking ID: ${booking.bookingId}`,
            `Route: ${route}`,
            booking.carName ? `Vehicle: ${booking.carName}` : '',
            `Pickup: ${pickupDate}${booking.pickupTime ? ', ' + booking.pickupTime : ''}`,
            booking.customerName ? `Customer: ${booking.customerName}` : '',
            booking.fare ? `Fare: ₹${booking.fare.toLocaleString('en-IN')}` : '',
            ``,
            `_Powered by ${environment.brandName}_`,
        ].filter(l => l !== '' && l !== undefined);

        const text = encodeURIComponent(lines.join('\n'));
        window.open(`https://wa.me/?text=${text}`, '_blank');
    }

    // ─── Status Helpers ────────────────────────────────────────

    getStatusLabel(status: string): string {
        switch (status) {
            case 'confirmed': return 'Confirmed';
            case 'assigned': return 'Driver Assigned';
            case 'cancelled': return 'Cancelled';
            case 'completed': return 'Completed';
            case 'billed': return 'Completed';
            case 'pending': return 'Pending';
            default: return status.charAt(0).toUpperCase() + status.slice(1);
        }
    }
}
