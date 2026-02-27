import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BookingStateService, Itinerary, SelectedCar } from '../../core/services/booking-state.service';
import { WalletService } from '../../core/services/wallet.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
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

  getPayNowAmount(): number {
    if (!this.selectedCar) return 0;
    // Option 4 (100% Wallet) requires full payment upfront
    if (this.paymentOption === 4) {
      return this.selectedCar.price;
    }
    // All other options require 25% upfront
    return Math.round(this.selectedCar.price * 0.25);
  }

  hasSufficientWalletBalance(balance: number | null): boolean {
    if (balance === null) return false;
    const required = this.getPayNowAmount();
    return balance >= required;
  }

  bookNow() {
    if (this.paymentOption === 3 || this.paymentOption === 4) {
      // Wallet Payment Mode
      let balance = 0;
      this.walletBalance$.subscribe(b => balance = b).unsubscribe();
      if (this.hasSufficientWalletBalance(balance)) {
        this.processWalletPayment();
      }
    } else {
      // Gateway Payment Mode
      this.showRazorpayModal = true;
    }
    this.cdr.markForCheck();
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

  simulateGatewayPayment() {
    this.showRazorpayModal = false;
    this.isProcessingWallet = true; // Reuse the same loading overlay
    this.cdr.markForCheck();

    setTimeout(() => {
      this.isProcessingWallet = false;
      this.bookingId = 'B2B' + Math.floor(100000 + Math.random() * 900000);
      this.bookingConfirmed = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.cdr.markForCheck();
    }, 1500);
  }

  closeModal() {
    this.showRazorpayModal = false;
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
