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
   * What actually left the agent's account at booking time.
   * Option 3 = fare + 20% buffer (paid upfront from wallet);
   * Options 1 / 2 = just `prePayment` (no buffer).
   * Mirrors getDisplayedPaidNow() in bookings.ts so the receipt total agrees
   * with the bookings list "Paid Now" line.
   */
  get totalChargedToAgent(): number {
    if (!this.booking) return 0;
    const paid = this.booking.prePayment || 0;
    if (this.booking.paymentOption === 3 && this.booking.bufferAmount) {
      return paid + this.booking.bufferAmount;
    }
    return paid;
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
