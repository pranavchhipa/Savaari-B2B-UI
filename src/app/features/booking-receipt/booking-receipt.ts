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
    // Booking data passed via router state
    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state as { booking: BookingCard } | undefined;
    if (state?.booking) {
      this.booking = state.booking;
    } else {
      // Fallback: try history.state (already navigated)
      const histState = history.state as { booking?: BookingCard };
      if (histState?.booking) {
        this.booking = histState.booking;
      } else {
        this.router.navigate(['/bookings']);
        return;
      }
    }

    const profile = this.auth.getUserProfile();
    this.agentName = profile ? `${profile.firstname || ''} ${profile.lastname || ''}`.trim() : '';
    this.agentEmail = this.auth.getUserEmail();
    this.agentGst = this.auth.getGstNumber();
    this.agentCompany = profile?.companyname || '';
  }

  get walletPaid(): number {
    if (!this.booking) return 0;
    if (this.booking.paidVia === 'wallet') return this.booking.prePayment || 0;
    return 0;
  }

  get razorpayPaid(): number {
    if (!this.booking) return 0;
    if (this.booking.paidVia === 'razorpay') return this.booking.prePayment || 0;
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
