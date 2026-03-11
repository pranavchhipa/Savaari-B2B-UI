import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';
import { BookingApiService } from '../../core/services/booking-api.service';
import { BookingRegistryService } from '../../core/services/booking-registry.service';
import { BookingDetails } from '../../core/models';

export type BookingTab = 'upcoming' | 'cancelled' | 'completed';

/** View-model for a booking card (confirmed from live API March 2026) */
export interface BookingCard {
    bookingId: string;
    reservationId: string;
    sourceCity: string;
    tripType: string;
    usageName: string;
    pickupAddress: string;
    pickupDate: Date | null;
    pickupTime: string;
    status: string;
    fare: number;
    customerName: string;
    driverName?: string;
    driverMobile?: string;
    carNumber?: string;
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
    private location = inject(Location);
    private cdr = inject(ChangeDetectorRef);
    private bookingApi = inject(BookingApiService);
    private bookingRegistry = inject(BookingRegistryService);

    // Categorized booking lists
    upcomingBookings: BookingCard[] = [];
    cancelledBookings: BookingCard[] = [];
    completedBookings: BookingCard[] = [];

    // Search
    searchQuery = '';

    ngOnInit() {
        this.loadBookings();
    }

    private loadBookings() {
        this.isLoading = true;
        this.cdr.markForCheck();

        this.bookingApi.getAllBookings().subscribe({
            next: (bookings: BookingDetails[]) => {
                this.categorizeBookings(bookings);
                // Also merge locally-registered bookings (recently created via app)
                this.mergeRegistryBookings();
                this.isLoading = false;
                this.cdr.markForCheck();
            },
            error: () => {
                // Even if API fails, show locally-registered bookings
                this.mergeRegistryBookings();
                this.isLoading = false;
                this.cdr.markForCheck();
            }
        });
    }

    private categorizeBookings(bookings: BookingDetails[]) {
        const cards = bookings.map(b => this.toBookingCard(b));

        // Only pull upcoming from API; cancelled & completed use demo data
        this.upcomingBookings = cards.filter(c =>
            c.status === 'confirmed' || c.status === 'assigned' || c.status === 'pending'
        );
        this.cancelledBookings = this.getDemoCancelledBookings();
        this.completedBookings = this.getDemoCompletedBookings();
    }

    private getDemoCancelledBookings(): BookingCard[] {
        return [
            {
                bookingId: '9589756', reservationId: 'R-9589756', sourceCity: 'Bangalore, Karnataka',
                tripType: 'Local', usageName: 'Local (8hr/80km)', pickupAddress: 'Deepanjali Nagar, Bengaluru, Karnataka',
                pickupDate: new Date('2025-12-22T14:30:00'), pickupTime: '14:30', status: 'cancelled',
                fare: 2144, customerName: 'Amit Verma', driverName: 'Krishna - Test Driver', carNumber: 'KA-43-DC-4321'
            },
            {
                bookingId: '9292589', reservationId: 'R-9292589', sourceCity: 'Bangalore, Karnataka',
                tripType: 'Local', usageName: 'Local (8hr/80km)', pickupAddress: 'Bengaluru, Karnataka',
                pickupDate: new Date('2025-11-20T03:15:00'), pickupTime: '03:15', status: 'cancelled',
                fare: 2144, customerName: 'Priya Sharma'
            }
        ];
    }

    private getDemoCompletedBookings(): BookingCard[] {
        return [
            {
                bookingId: '7823901', reservationId: 'R-7823901', sourceCity: 'Hyderabad, Telangana',
                tripType: 'Local', usageName: 'Local (12hr/120km)', pickupAddress: 'Madhapur, Hyderabad, Telangana 500081',
                pickupDate: new Date('2025-12-05T09:00:00'), pickupTime: '09:00', status: 'completed',
                fare: 3850, customerName: 'Rajesh Kumar', driverName: 'Srinivas', carNumber: 'TS-09-AB-1234'
            },
            {
                bookingId: '7823902', reservationId: 'R-7823902', sourceCity: 'Chennai, Tamil Nadu',
                tripType: 'Airport', usageName: 'Airport Pickup (SUV)', pickupAddress: 'Chennai International Airport, Meenambakkam',
                pickupDate: new Date('2025-11-28T16:45:00'), pickupTime: '16:45', status: 'completed',
                fare: 1800, customerName: 'Sunita Patel', driverName: 'Ravi', carNumber: 'TN-01-CD-5678'
            }
        ];
    }

    /** Fetch individually-registered bookings and merge into upcoming (deduped) */
    private mergeRegistryBookings() {
        this.bookingRegistry.fetchAllBookingDetails(this.bookingApi).subscribe({
            next: (registryBookings) => {
                const existingIds = new Set(this.upcomingBookings.map(b => b.bookingId));
                const completedIds = new Set(this.completedBookings.map(b => b.bookingId));
                for (const b of registryBookings) {
                    const card = this.toBookingCard(b);
                    // Skip if already in lists or if cancelled
                    if (existingIds.has(card.bookingId) || completedIds.has(card.bookingId)) continue;
                    if (card.status === 'cancelled') continue;
                    if (card.status === 'completed') {
                        this.completedBookings.unshift(card);
                    } else {
                        this.upcomingBookings.unshift(card);
                    }
                }
                this.cdr.markForCheck();
            }
        });
    }

    private toBookingCard(b: any): BookingCard {
        let pickupDate: Date | null = null;
        // API returns start_date_time in "YYYY-MM-DD HH:MM:SS" format
        const dateStr = b.start_date_time || b.pickupDateTime;
        if (dateStr) {
            pickupDate = new Date(dateStr);
            if (isNaN(pickupDate.getTime())) pickupDate = null;
        }

        // Map booking_status from API: "CANCEL", "COMPLETED", "CONFIRMED", etc.
        const rawStatus = (b.booking_status || b.status || 'pending').toLowerCase();
        const status = rawStatus === 'cancel' ? 'cancelled' : rawStatus;

        // Driver details come as a nested object or empty array
        const driver = Array.isArray(b.driver_details) ? null : b.driver_details;

        // Extract HH:MM time from "YYYY-MM-DD HH:MM:SS"
        const pickupTime = dateStr ? dateStr.toString().substring(11, 16) : '';

        return {
            bookingId: b.booking_id || b.bookingId || '',
            reservationId: b.reservation_id || b.reservationId || '',
            sourceCity: b.pick_city || b.sourceCity || 'Unknown City',
            tripType: b.trip_type || b.tripType || 'Outstation',
            usageName: b.usagename || b.usageName || b.trip_type || b.tripType || '',
            pickupAddress: b.pick_loc || b.pickupAddress || '',
            pickupDate,
            pickupTime,
            status,
            fare: parseFloat(b.gross_amount) || b.totalFare || b.fare || 0,
            customerName: b.customer_name || b.customerName || '',
            driverName: driver?.driver_name || b.driverName,
            driverMobile: driver?.driver_number || b.driverMobile,
            carNumber: driver?.car_number || b.carNumber,
        };
    }

    /** Get bookings for the active tab, filtered by search */
    get filteredBookings(): BookingCard[] {
        let list: BookingCard[];
        switch (this.activeTab) {
            case 'upcoming': list = this.upcomingBookings; break;
            case 'cancelled': list = this.cancelledBookings; break;
            case 'completed': list = this.completedBookings; break;
            default: list = [];
        }

        if (!this.searchQuery.trim()) return list;
        const q = this.searchQuery.toLowerCase();
        return list.filter(b =>
            b.bookingId.toLowerCase().includes(q) ||
            b.sourceCity.toLowerCase().includes(q)
        );
    }

    /** Tab counts for sidebar badges */
    get upcomingCount(): number { return this.upcomingBookings.length; }
    get cancelledCount(): number { return this.cancelledBookings.length; }
    get completedCount(): number { return this.completedBookings.length; }

    /** Status badge color class */
    getStatusClass(status: string): string {
        switch (status) {
            case 'confirmed':
            case 'assigned':
                return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800';
            case 'cancelled':
                return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
            case 'completed':
                return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800';
            default:
                return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
        }
    }

    /** Status display label */
    getStatusLabel(status: string): string {
        switch (status) {
            case 'confirmed': return 'Confirmed';
            case 'assigned': return 'Driver Assigned';
            case 'cancelled': return 'Cancelled';
            case 'completed': return 'Completed';
            case 'pending': return 'Pending';
            default: return status.charAt(0).toUpperCase() + status.slice(1);
        }
    }

    /** Tab heading */
    get tabTitle(): string {
        switch (this.activeTab) {
            case 'upcoming': return 'Upcoming Bookings';
            case 'cancelled': return 'Cancelled Bookings';
            case 'completed': return 'Completed Bookings';
            default: return 'Bookings';
        }
    }

    setActiveTab(tab: BookingTab) {
        if (this.activeTab === tab) return;
        this.activeTab = tab;
        this.cdr.markForCheck();
    }

    goBack() {
        this.location.back();
    }

    /** Refresh booking data from API */
    refreshBookings() {
        this.loadBookings();
    }

    /** Cancel a booking */
    cancelBooking(bookingId: string) {
        if (!confirm('Are you sure you want to cancel this booking?')) return;

        this.bookingApi.cancelBooking(bookingId).subscribe({
            next: () => {
                // Remove from upcoming list
                this.upcomingBookings = this.upcomingBookings.filter(b => b.bookingId !== bookingId);
                this.cdr.markForCheck();
            },
            error: (err) => {
                alert(err?.message || 'Failed to cancel booking.');
            }
        });
    }

    /** Share booking details via WhatsApp */
    shareOnWhatsApp(booking: BookingCard) {
        const pickupDate = booking.pickupDate
            ? booking.pickupDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            : '';

        const lines = [
            `*Booking Confirmation - Savaari*`,
            ``,
            `Booking ID: ${booking.bookingId}`,
            `Trip: ${booking.sourceCity} (${booking.usageName || booking.tripType})`,
            `Pickup: ${pickupDate}${booking.pickupTime ? ', ' + booking.pickupTime : ''}`,
            booking.pickupAddress ? `Address: ${booking.pickupAddress}` : '',
            booking.fare ? `Fare: ₹${booking.fare.toLocaleString('en-IN')}` : '',
            `Status: ${this.getStatusLabel(booking.status)}`,
            booking.driverName ? `Driver: ${booking.driverName}${booking.driverMobile ? ' - ' + booking.driverMobile : ''}` : '',
            booking.carNumber ? `Car No: ${booking.carNumber}` : '',
            ``,
            `_Powered by Savaari - India's #1 Cab Service since 2006_`,
        ].filter(l => l !== '' && l !== undefined);

        const text = encodeURIComponent(lines.join('\n'));
        window.open(`https://wa.me/?text=${text}`, '_blank');
    }
}
