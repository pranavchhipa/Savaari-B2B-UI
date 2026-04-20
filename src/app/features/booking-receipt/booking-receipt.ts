import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { BookingCard } from '../bookings/bookings';

@Component({
  selector: 'app-booking-receipt',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  templateUrl: './booking-receipt.html',
  styleUrl: './booking-receipt.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingReceiptComponent implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthService);

  booking: BookingCard | null = null;
  agentName = '';
  agentEmail = '';
  agentGst = '';
  agentCompany = '';
  receiptDate = new Date();

  ngOnInit() {
    // Booking data passed via router state (history.state is available after navigation completes)
    const histState = history.state as { booking?: BookingCard };
    if (histState?.booking?.bookingId) {
      this.booking = histState.booking;
    } else {
      this.router.navigate(['/bookings']);
      return;
    }

    const profile = this.auth.getUserProfile();
    this.agentName = profile ? `${profile.firstname || ''} ${profile.lastname || ''}`.trim() : '';
    this.agentEmail = this.auth.getUserEmail();
    this.agentGst = this.auth.getGstNumber();
    this.agentCompany = profile?.companyname || '';
  }

  /**
   * Total amount the agent has actually been charged at this point.
   *
   * For Options 1 and 2 (and Option 3 advance bookings before the 48h cron
   * has run) this equals `prePayment` — the trip-fare portion the agent
   * paid up front. For Option 3 (Zero Cash) bookings where the full fare
   * has been collected — urgent at booking time, or advance after the
   * auto-debit — the 20% refundable buffer was charged in the same swipe,
   * so it must be added back to match what the agent actually saw on
   * their card / wallet statement and what the booking confirmation page
   * computed via getPayNowAmount().
   *
   * Mirrors getCardPaidNow() in bookings.ts so the receipt's
   * "Total Charged to Agent" line and the bookings list "Paid Now" line
   * agree on a single canonical figure.
   */
  get totalChargedToAgent(): number {
    if (!this.booking) return 0;
    const paid = this.booking.prePayment || 0;
    if (this.booking.paymentOption !== 3) return paid;
    const buffer = this.booking.bufferAmount || 0;
    if (buffer === 0) return paid;
    const fullyPaid = this.booking.balancePaidStatus === 1
      || (this.booking.fare > 0 && paid >= this.booking.fare);
    return fullyPaid ? paid + buffer : paid;
  }

  get walletPaid(): number {
    if (!this.booking) return 0;
    if (this.booking.paidVia === 'wallet') return this.totalChargedToAgent;
    return 0;
  }

  get razorpayPaid(): number {
    if (!this.booking) return 0;
    if (this.booking.paidVia === 'razorpay') return this.totalChargedToAgent;
    return 0;
  }

  get cashToDriver(): number {
    return this.booking?.cashToCollect || 0;
  }

  get tripTypeLabel(): string {
    const t = this.booking?.tripType?.toLowerCase() || '';
    if (t.includes('round') || t === 'roundtrip') return 'Round Trip';
    if (t.includes('airport') || t === 'transfer') return 'Airport Transfer';
    if (t.includes('local')) return 'Local Rental';
    return 'One Way';
  }

  print() {
    window.print();
  }
}
