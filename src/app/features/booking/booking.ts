import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BookingStateService, Itinerary, SelectedCar } from '../../core/services/booking-state.service';
import { WalletService } from '../../core/services/wallet.service';
import { Observable } from 'rxjs';
import { FooterComponent } from '../../components/layout/footer/footer';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, FormsModule, FooterComponent],

  templateUrl: './booking.html',
  styleUrl: './booking.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingComponent implements OnInit {
  public router = inject(Router);
  private bookingState = inject(BookingStateService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  itinerary: Itinerary | null = null;
  selectedCar: SelectedCar | null = null;

  // Form Fields
  guestName: string = 'John Smith';
  guestEmail: string = '';
  agentEmail: string = 'pranav@savaari.in';
  pickupAddress: string = 'Bengaluru International Airport';
  dropAddress: string = 'Mysore City Center';
  phone: string = '9876543210';
  landmark: string = 'Gate 5, Arrival Hall';

  step1Complete = false;
  showRazorpayModal = false;
  showVASModal = false;

  // VAS Selections
  vasLuggageCarrier = false;
  vasLanguageDriver = false;

  // 1, 2, 3, or 4 corresponding to B2B payment choices
  paymentOption = 1;

  isProcessingWallet = false;
  bookingConfirmed = false;
  bookingId = '';

  walletBalance$!: Observable<number>;
  private walletService = inject(WalletService);

  ngOnInit() {
    this.walletBalance$ = this.walletService.balance$;

    // Initial sync
    this.itinerary = this.bookingState.getItinerary();
    this.selectedCar = this.bookingState.getSelectedCar();

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
    this.step1Complete = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.markForCheck();
  }

  setPaymentOption(option: number) {
    this.paymentOption = option;
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
    const diffInHours = (pickupDt.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diffInHours < 48;
  }

  isBookingWindowValid(): boolean {
    const pickupDt = this.getPickupDateTime();
    if (!pickupDt) return false;

    const now = new Date();
    const diffInHours = (pickupDt.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diffInHours >= 6;
  }

  getPayNowAmount(optionOverride?: number): number {
    if (!this.selectedCar) return 0;
    const total = this.selectedCar.price;
    const option = optionOverride !== undefined ? optionOverride : this.paymentOption;

    const isUrgent = this.isBookingUrgent();

    // Option 1: Partial Agent | Rest to Driver
    // This option ALWAYS involves paying 25% now to Savaari. 
    // The rest is handled by the customer directly to the driver, 
    // so the "48h wallet deduction" rule does not apply here.
    if (option === 1) {
      return Math.round(total * 0.25);
    }

    // Options 2 & 3: Full Agent (Wallet)
    // If booking within 48 Hours, 100% amount must be deducted upon confirmation 
    // because the "48h before trip" deadline has already passed.
    if (isUrgent) {
      return total;
    }

    // Standard Booking Logic (>48h) for Options 2 & 3
    // Standard upfront is 25%, rest deferred via Wallet auto-deduction.
    return Math.round(total * 0.25);
  }

  getOption3BufferAmount(): number {
    if (!this.selectedCar) return 0;
    // Rule 3: 25% now + (remaining 75% + 20% buffer) later
    return Math.round(this.selectedCar.price * 0.20);
  }

  hasSufficientWalletBalance(balance: number | null): boolean {
    if (balance === null) return false;
    return balance >= this.getPayNowAmount();
  }

  bookNow() {
    if (!this.isBookingWindowValid()) {
      alert('Bookings must be made at least 6 hours before pickup time.');
      return;
    }

    let balance = 0;
    this.walletBalance$.subscribe(b => balance = b).unsubscribe();

    if (this.hasSufficientWalletBalance(balance)) {
      this.processWalletPayment();
    } else {
      alert('Insufficient wallet balance. Please add funds to your wallet to proceed.');
    }
  }

  processWalletPayment() {
    this.isProcessingWallet = true;
    this.cdr.markForCheck();

    setTimeout(() => {
      const deduction = this.getPayNowAmount();
      this.bookingId = 'B2B' + Math.floor(100000 + Math.random() * 900000);

      this.walletService.deductForBooking(deduction, this.bookingId);

      this.isProcessingWallet = false;
      this.bookingConfirmed = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.cdr.markForCheck();
    }, 1500);
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
}
