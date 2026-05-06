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

  /** Agent's uploaded company logo (from Account Settings). When present, replaces B2B CAB logo on wallet card. */
  get agentLogo(): string | null {
    return localStorage.getItem('agentLogo');
  }

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

  // Pagination
  currentPage = 1;
  pageSize = 10;
  Math = Math;

  get totalPages(): number {
    return Math.ceil(this.filteredTransactions.length / this.pageSize);
  }

  // Quick stats — computed from the full (unfiltered) transaction set
  get totalCredits(): number {
    return this.allTransactions
      .filter(tx => tx.type === 'TOPUP' || tx.type === 'REFUND')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  }

  get totalDebits(): number {
    return this.allTransactions
      .filter(tx => tx.type === 'BOOKING_PAYMENT')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  }

  get totalTransactions(): number {
    return this.allTransactions.length;
  }

  get paginatedTransactions(): WalletTransaction[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredTransactions.slice(start, start + this.pageSize);
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    for (let i = 1; i <= this.totalPages; i++) pages.push(i);
    return pages;
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.cdr.markForCheck();
  }

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

    // Max-wait cap — hide skeleton after 1500ms no matter what
    const loadCap = setTimeout(() => {
      if (this.isLoadingWallet) {
        this.isLoadingWallet = false;
        this.cdr.markForCheck();
      }
    }, 1500);

    // Subscribe to transactions to keep local filtered list in sync.
    // Hide skeleton as soon as real data arrives (non-empty OR second emission)
    // so the stable min-height skeleton swaps straight into real rows without flicker.
    let emissionCount = 0;
    this.transactions$.subscribe(txs => {
      emissionCount++;
      this.allTransactions = txs;
      this.applyFilter(this.activeFilter);

      // First emission is usually the BehaviorSubject seed ([]). Wait for the
      // second emission (real API result) OR any non-empty set before hiding.
      if (this.isLoadingWallet && (txs.length > 0 || emissionCount >= 2)) {
        clearTimeout(loadCap);
        this.isLoadingWallet = false;
        this.cdr.markForCheck();
      }
    });
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
          // Always prefer environment key — wallet API returns an older test
          // key that is now inactive on Razorpay, while environment holds the
          // current active key shared by backend team (April 2026).
          key: environment.razorpayKeyId || orderDetails.razorpayKeyId,
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
    this.currentPage = 1;
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
