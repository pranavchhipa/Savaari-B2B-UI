import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { WalletService, WalletTransaction, WalletStatus } from '../../core/services/wallet.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { FooterComponent } from '../../components/layout/footer/footer';

@Component({
  selector: 'app-wallet-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, FooterComponent],
  templateUrl: './wallet-dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WalletDashboardComponent implements OnInit {
  private walletService = inject(WalletService);
  private router = inject(Router);
  private location = inject(Location);
  private cdr = inject(ChangeDetectorRef);
  private auth = inject(AuthService);

  get agentId(): string { return this.auth.getAgentId(); }

  // Observables bound to template via async pipe
  balance$: Observable<number> = this.walletService.balance$;
  transactions$: Observable<WalletTransaction[]> = this.walletService.transactions$;
  walletStatus$: Observable<WalletStatus | null> = this.walletService.walletStatus$;

  // UI state: separate initial load vs top-up processing
  isLoadingWallet = true;   // Shows table skeleton on first load
  isProcessing = false;      // Shows spinner inside top-up modal only
  showTopUpModal = false;
  topUpAmount = 10000;
  topUpError = '';

  // Filter state
  showFilterDropdown = false;
  activeFilter: 'ALL' | 'TOPUP' | 'BOOKING_PAYMENT' | 'REFUND' = 'ALL';
  filteredTransactions: WalletTransaction[] = [];
  private allTransactions: WalletTransaction[] = [];

  filterOptions = [
    { label: 'All', value: 'ALL' as const },
    { label: 'Credits', value: 'TOPUP' as const },
    { label: 'Debits', value: 'BOOKING_PAYMENT' as const },
    { label: 'Refunds', value: 'REFUND' as const },
  ];

  ngOnInit(): void {
    // Ensure wallet exists (creates if not yet initialized), then load data
    this.walletService.createWallet().subscribe(() => {
      this.walletService.loadBalance();
      this.walletService.loadHistory();
    });

    // Subscribe to transactions to keep local filtered list in sync
    this.transactions$.subscribe(txs => {
      this.allTransactions = txs;
      this.applyFilter(this.activeFilter);
    });

    // Hide skeleton after brief loading window
    setTimeout(() => {
      this.isLoadingWallet = false;
      this.cdr.markForCheck();
    }, 1200);
  }

  openTopUpModal(): void {
    this.showTopUpModal = true;
    this.topUpAmount = 10000;
    this.topUpError = '';
  }

  closeTopUpModal(): void {
    if (this.isProcessing) return;
    this.showTopUpModal = false;
    this.topUpError = '';
  }

  /**
   * Initiate a wallet top-up via Razorpay.
   *   1. POST /wallet/topup/initiate → Razorpay order details
   *   2. Open Razorpay SDK → user completes payment
   *   3. POST /wallet/topup/verify → balance updated via API
   */
  processTopUp(): void {
    if (this.topUpAmount < 100) return;

    this.isProcessing = true;
    this.topUpError = '';
    this.cdr.markForCheck();

    this.walletService.initiateTopUp(this.topUpAmount).subscribe({
      next: (orderDetails) => {
        if (!orderDetails?.orderId) {
          this.isProcessing = false;
          this.topUpError = 'Unable to initiate payment. Please try again.';
          this.cdr.markForCheck();
          return;
        }

        console.log('[WALLET-UI] Razorpay order initiated:', orderDetails.orderId);

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
              this.isProcessing = false;
              if (success) { this.showTopUpModal = false; }
              else { this.topUpError = 'Payment verification failed. Please contact support.'; }
              this.cdr.markForCheck();
            });
          },
          modal: { ondismiss: () => { this.isProcessing = false; this.cdr.markForCheck(); } }
        });
        rzp.open();
      },
      error: () => {
        this.isProcessing = false;
        this.topUpError = 'Failed to initiate top-up. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  applyFilter(filter: 'ALL' | 'TOPUP' | 'BOOKING_PAYMENT' | 'REFUND'): void {
    this.activeFilter = filter;
    this.showFilterDropdown = false;
    if (filter === 'ALL') {
      this.filteredTransactions = [...this.allTransactions];
    } else {
      this.filteredTransactions = this.allTransactions.filter(tx => tx.type === filter);
    }
    this.cdr.markForCheck();
  }

  exportCSV(): void {
    const txs = this.filteredTransactions;
    if (txs.length === 0) return;

    const headers = ['Date', 'Description', 'Type', 'Reference ID', 'Amount', 'Balance After'];
    const rows = txs.map(tx => [
      new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      `"${tx.description}"`,
      tx.type,
      tx.referenceId || 'N/A',
      tx.amount.toString(),
      tx.balanceAfter.toString()
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  goBack(): void {
    this.location.back();
  }
}
