import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';
import { BookingApiService } from '../../core/services/booking-api.service';
import { BookingRegistryService } from '../../core/services/booking-registry.service';
import { WalletService } from '../../core/services/wallet.service';
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
    tripType: string;
    usageName: string;
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

    /** Map of bookingId → settled amount, persisted in localStorage */
    private settledPayments: Record<string, number> = {};
    private readonly SETTLED_STORAGE_KEY = 'b2b_settled_payments';

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

    ngOnInit() {
        this.loadSettledPayments();
        this.buildCalendarStrip();
        this.loadWalletBalance();
        this.loadBookings();
    }

    /** Load settled payments map from localStorage */
    private loadSettledPayments() {
        try {
            const raw = localStorage.getItem(this.SETTLED_STORAGE_KEY);
            this.settledPayments = raw ? JSON.parse(raw) : {};
        } catch { this.settledPayments = {}; }
    }

    /** Save settled payments map to localStorage */
    private saveSettledPayment(bookingId: string, amount: number) {
        this.settledPayments[bookingId] = (this.settledPayments[bookingId] || 0) + amount;
        try { localStorage.setItem(this.SETTLED_STORAGE_KEY, JSON.stringify(this.settledPayments)); } catch {}
    }

    /** Apply persisted settlements to booking cards after API data loads */
    private applySettledPayments(cards: BookingCard[]) {
        for (const card of cards) {
            const settled = this.settledPayments[card.bookingId];
            if (settled && settled > 0) {
                card.prePayment = Math.max(card.prePayment || 0, settled);
                if (card.prePayment >= (card.fare || 0)) {
                    card.cashToCollect = 0;
                }
            }
        }
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

    private loadBookings() {
        this.isLoading = true;
        this.cdr.markForCheck();

        this.bookingApi.getAllBookings().subscribe({
            next: (bookings: BookingDetails[]) => {
                this.categorizeBookings(bookings);
                this.mergeRegistryBookings();
                this.updateCalendarWithBookings();
                this.isLoading = false;
                this.cdr.markForCheck();
            },
            error: () => {
                this.mergeRegistryBookings();
                this.updateCalendarWithBookings();
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

        const cards = unique.map(b => this.toBookingCard(b));

        // Apply any locally-persisted settlements before categorizing
        this.applySettledPayments(cards);

        this.upcomingBookings = cards.filter(c =>
            c.status === 'confirmed' || c.status === 'assigned' || c.status === 'pending'
        );
        this.cancelledBookings = cards.filter(c => c.status === 'cancelled');
        this.completedBookings = cards.filter(c => c.status === 'completed' || c.status === 'billed');
    }

    private mergeRegistryBookings() {
        const storedIds = this.bookingRegistry.getBookingIds();
        if (storedIds.length === 0) return;

        const localBookings = this.bookingRegistry.getLocalBookings();
        const existingIds = new Set(this.upcomingBookings.map(b => b.bookingId));
        const completedIds = new Set(this.completedBookings.map(b => b.bookingId));
        const cancelledIds = new Set(this.cancelledBookings.map(b => b.bookingId));

        for (const b of localBookings) {
            const card = this.toBookingCard(b);
            if (!card.bookingId) continue;
            if (existingIds.has(card.bookingId) || completedIds.has(card.bookingId) || cancelledIds.has(card.bookingId)) continue;
            if (card.status === 'cancelled') continue;
            if (card.status === 'completed') {
                this.completedBookings.unshift(card);
            } else {
                this.upcomingBookings.unshift(card);
            }
        }

        // Background API fetch
        this.bookingRegistry.fetchAllBookingDetails(this.bookingApi).subscribe({
            next: (registryBookings) => {
                const nowIds = new Set([
                    ...this.upcomingBookings.map(b => b.bookingId),
                    ...this.completedBookings.map(b => b.bookingId),
                ]);
                for (const b of registryBookings) {
                    const card = this.toBookingCard(b);
                    if (!card.bookingId || nowIds.has(card.bookingId)) continue;
                    if (card.status === 'cancelled') continue;
                    if (card.status === 'completed') {
                        this.completedBookings.unshift(card);
                    } else {
                        this.upcomingBookings.unshift(card);
                    }
                }
                this.updateCalendarWithBookings();
                this.cdr.markForCheck();
            },
            error: () => {}
        });
    }

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
        if (rawStatus === '1' || rawStatus === 'confirmed') status = 'confirmed';
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

        // Check bookingRegistry first — it has the accurate data from when we created the booking
        const bookingId = String(b.booking_id || b.bookingId || '');
        const registryData = bookingId ? this.bookingRegistry.getStoredBookingData(bookingId) : null;

        let paymentMethod = '';
        let paymentOption = 0;
        let paidVia = '';

        if (registryData) {
            // Registry has the truth — use it
            paymentOption = registryData.paymentOption || 0;
            paidVia = registryData.paymentMethod || 'wallet'; // 'wallet' or 'razorpay'
            if (paymentOption === 1) paymentMethod = 'Pay any amount now';
            else if (paymentOption === 2) paymentMethod = 'Pay 25% now, rest auto-deducted';
            else if (paymentOption === 3) paymentMethod = 'Zero cash — full wallet';
        } else {
            // Fallback: try API fields
            const paymentOpt = b.payment_option || b.paymentOption || b.prePaymentType || '';
            if (paymentOpt === '1' || paymentOpt === 1) { paymentMethod = 'Pay any amount now'; paymentOption = 1; }
            else if (paymentOpt === '2' || paymentOpt === 2) { paymentMethod = 'Pay 25% now, rest auto-deducted'; paymentOption = 2; }
            else if (paymentOpt === '3' || paymentOpt === 3) { paymentMethod = 'Zero cash — full wallet'; paymentOption = 3; }
            else { paymentMethod = 'Wallet Pay'; paymentOption = 0; }
        }

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

        return {
            bookingId: String(b.booking_id || b.bookingId || ''),
            reservationId: String(b.reservation_id || b.reservationId || ''),
            sourceCity: b.pick_city || b.source_city || b.sourceCity || '',
            destinationCity: b.drop_city || b.destination_city || b.destinationCity || '',
            tripType: b.trip_type || b.tripType || '',
            usageName: b.usage_name || b.usagename || b.usageName || '',
            pickupAddress: b.pick_loc || b.pickup_address || b.pickupAddress || '',
            dropAddress: b.drop_loc || b.drop_address || b.dropAddress || '',
            pickupDate,
            pickupTime,
            status,
            fare: parseFloat(b.gross_amount) || parseFloat(b.total_amount) || b.totalFare || b.fare || 0,
            customerName: b.customer_name || b.customerName || '',
            customerMobile: b.customer_mobile || b.customerMobile || '',
            customerEmail: b.customer_email || b.customerEmail || '',
            carName: b.car_name || b.carName || '',
            itinerary,
            driverName: driver?.driver_name || b.driverName || '',
            driverMobile: driver?.driver_number || b.driverMobile || '',
            carNumber: driver?.car_number || b.carNumber || '',
            prePayment: parseFloat(b.prePayment || b.pre_payment) || 0,
            cashToCollect: parseFloat(b.cashToCollect || b.cash_to_collect || b.cash_to_driver) || 0,
            paymentMethod,
            paymentOption,
            paidVia: paidVia || (b.paidVia) || 'wallet',
            kmsIncluded: b.kms_included || b.kmsIncluded || '',
            duration: parseInt(b.duration) || 0,
            extraKmRate: parseFloat(b.extra_km_rate || b.extraKmRate) || 0,
            bookedAt: b._storedAt ? new Date(b._storedAt) : null,
            pickupCountdown,
        };
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

    /** Short label for payment method — matches payment page option names exactly */
    getPaymentMethodShort(booking: BookingCard): string {
        if (booking.paymentOption === 1) return 'Pay any amount now';
        if (booking.paymentOption === 2) return 'Pay 25% now';
        if (booking.paymentOption === 3) return 'Zero cash — full wallet';
        if (booking.prePayment && booking.fare && booking.prePayment >= booking.fare) return 'Fully Paid';
        if (booking.prePayment && booking.cashToCollect && booking.cashToCollect > 0) return 'Pay 25% now';
        return booking.paymentMethod || 'Wallet Pay';
    }

    /** Full label for payment method (used in expanded detail view) */
    getPaymentMethodLabel(booking: BookingCard): string {
        if (booking.paymentOption === 1) return 'Pay any amount now — Customer pays driver';
        if (booking.paymentOption === 2) return 'Pay 25% now, rest auto-deducted';
        if (booking.paymentOption === 3) return 'Zero cash — full wallet';
        if (booking.prePayment && booking.fare && booking.prePayment >= booking.fare) return 'Fully Paid';
        return booking.paymentMethod || 'Wallet Pay';
    }

    /** Auto-debit countdown text */
    getAutoDebitCountdown(booking: BookingCard): string {
        if (!booking.pickupDate || booking.paymentOption === 1) return '';
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
                b.sourceCity.toLowerCase().includes(q)
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

        const onSuccess = () => {
            booking.prePayment = (booking.prePayment || 0) + amount;
            booking.cashToCollect = 0;
            this.saveSettledPayment(booking.bookingId, booking.prePayment);
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
        if (booking.paymentOption === 1) {
            booking.prePayment = booking.fare;
            this.saveSettledPayment(booking.bookingId, booking.fare);
            setTimeout(() => onSuccess(), 1500);
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
                    const razorpayKey = order.razorpayKeyId || (window as any).environment?.razorpayKeyId || '';
                    const options: any = {
                        key: razorpayKey,
                        amount: order.amount,
                        currency: order.currency || 'INR',
                        name: 'B2B CAB',
                        description: `Settle Booking #${booking.bookingId} — ₹${amount}`,
                        order_id: order.orderId,
                        handler: (response: any) => {
                            this.walletService.verifyBookingPayment(
                                response.razorpay_order_id,
                                response.razorpay_payment_id,
                                response.razorpay_signature,
                                amount,
                                booking.bookingId
                            ).subscribe({
                                next: () => setTimeout(() => onSuccess(), 800),
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

        // Wallet settlement — pay from wallet
        this.walletService.payForBooking(booking.bookingId, amount, (booking.paymentOption || 2) as 1 | 2 | 3).subscribe({
            next: (success) => {
                if (success) {
                    setTimeout(() => onSuccess(), 1200);
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

    cancelBooking(bookingId: string) {
        const reason = prompt('Why do you want to cancel this booking?', 'Customer request');
        if (!reason) return;

        this.bookingApi.cancelBooking(bookingId, reason).subscribe({
            next: () => {
                this.upcomingBookings = this.upcomingBookings.filter(b => b.bookingId !== bookingId);
                this.bookingRegistry.removeBookingId(bookingId);
                this.updateCalendarWithBookings();
                this.cdr.markForCheck();
            },
            error: (err) => {
                alert(err?.message || 'Failed to cancel booking.');
            }
        });
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
            `*Booking Confirmation - B2B CAB*`,
            ``,
            `Booking ID: ${booking.bookingId}`,
            `Route: ${route}`,
            booking.carName ? `Vehicle: ${booking.carName}` : '',
            `Pickup: ${pickupDate}${booking.pickupTime ? ', ' + booking.pickupTime : ''}`,
            booking.customerName ? `Customer: ${booking.customerName}` : '',
            booking.fare ? `Fare: ₹${booking.fare.toLocaleString('en-IN')}` : '',
            ``,
            `_Powered by B2B CAB_`,
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
