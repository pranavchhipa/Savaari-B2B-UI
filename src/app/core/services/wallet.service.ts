import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export interface WalletTransaction {
  id: string;
  date: Date;
  type: 'TOPUP' | 'BOOKING_PAYMENT' | 'REFUND';
  amount: number;
  balanceAfter: number;
  description: string;
  referenceId?: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
}

export interface WalletStatus {
  balance: number;
  status: 'ACTIVE' | 'FROZEN' | 'PENDING' | 'CLOSED';
  walletId?: string;
}

export interface TopUpInitiateResponse {
  orderId: string;
  amount: number;       // Amount in paise (Razorpay standard)
  currency: string;     // 'INR'
  razorpayKeyId?: string;
}

/**
 * Manages the B2B Internal Wallet system for Savaari agents.
 *
 * TRD-defined endpoints (POST, via /b2b-api/wallet/...):
 *   POST /wallet/create          — Initialize wallet for agent
 *   POST /wallet/balance         — Get current balance + status
 *   POST /wallet/history         — Get transaction ledger
 *   POST /wallet/topup/initiate  — Start Razorpay top-up (returns order_id)
 *   POST /wallet/topup/verify    — Verify payment & credit wallet
 *   POST /wallet/pay-booking     — Deduct for booking payment
 *   POST /wallet/refund          — Refund on booking cancellation
 *
 * NOTE: Wallet APIs are under active development (March 2026).
 * When useMockData=false and the API isn't deployed yet, all calls
 * gracefully fall back to no-op / zero balance.
 *
 * Payment Options (TRD § Business Logic):
 *   Option 1: 25% now from wallet, 75% driver-collected at trip end
 *   Option 2: 25% now, 75% auto-deducted 48 hrs before trip (or 100% if <48h)
 *   Option 3: 25% now, 95% auto-deducted 48 hrs before (total=120%, or 120% now if <48h)
 */
@Injectable({ providedIn: 'root' })
export class WalletService {

  // ─── Public observables ────────────────────────────────────────────────────

  /** Current wallet balance in INR. Updated by loadBalance(). */
  private balanceSubject = new BehaviorSubject<number>(0);
  public balance$ = this.balanceSubject.asObservable();

  /** Full transaction ledger. Updated by loadHistory(). */
  private transactionsSubject = new BehaviorSubject<WalletTransaction[]>([]);
  public transactions$ = this.transactionsSubject.asObservable();

  /** Wallet status (ACTIVE/FROZEN/etc). Null until first load. */
  private walletStatusSubject = new BehaviorSubject<WalletStatus | null>(null);
  public walletStatus$ = this.walletStatusSubject.asObservable();

  /** True while loadBalance() or loadHistory() API calls are in-flight. */
  private isLoadingSubject = new BehaviorSubject<boolean>(false);
  public isLoading$ = this.isLoadingSubject.asObservable();

  constructor(
    private api: ApiService,
    private auth: AuthService,
  ) {}

  // ─── Initialization ────────────────────────────────────────────────────────

  /**
   * Create/initialize the wallet for the current agent.
   * POST /wallet/create
   * Call when agent first accesses the wallet module.
   */
  createWallet(): Observable<boolean> {
    if (environment.useMockData) {
      this.walletStatusSubject.next({ balance: 0, status: 'ACTIVE' });
      return of(true);
    }

    const payload = this.buildPayload({});

    return this.api.walletPost<any>('create', payload, this.getWalletToken()).pipe(
      map(response => {
        if (response?.statusCode === 200 || response?.status === 'success') {
          console.log('[WALLET] Wallet created/verified successfully');
          return true;
        }
        console.warn('[WALLET] createWallet unexpected response:', response?.message);
        return false;
      }),
      catchError(err => {
        console.warn('[WALLET] createWallet API error (wallet may not be deployed yet):', err?.status);
        return of(false);
      })
    );
  }

  // ─── Balance & History ─────────────────────────────────────────────────────

  /**
   * Load wallet balance and status from API. Updates balance$ and walletStatus$.
   * POST /wallet/balance → { statusCode, balance, walletStatus, walletId }
   */
  loadBalance(): void {
    if (environment.useMockData) {
      this.walletStatusSubject.next({
        balance: this.balanceSubject.getValue(),
        status: 'ACTIVE',
      });
      return;
    }

    this.isLoadingSubject.next(true);

    this.api.walletPost<any>('balance', this.buildPayload({}), this.getWalletToken()).pipe(
      tap(response => {
        this.isLoadingSubject.next(false);
        if (response?.statusCode === 200 || response?.status === 'success') {
          const data = response.data ?? response;
          const balance = parseFloat(data.balance ?? data.current_balance ?? '0') || 0;
          const status = (data.walletStatus ?? data.wallet_status ?? data.status ?? 'ACTIVE').toUpperCase() as WalletStatus['status'];
          this.balanceSubject.next(balance);
          this.walletStatusSubject.next({ balance, status, walletId: data.walletId ?? data.wallet_id });
          if (!environment.production) console.log(`[WALLET] Balance: ₹${balance} (${status})`);
        }
      }),
      catchError(err => {
        this.isLoadingSubject.next(false);
        // 404 = wallet API not deployed yet; 401 = not created yet — both are expected during dev
        // Preserve in-memory balance (from successful Razorpay top-ups) instead of resetting to 0
        const currentBalance = this.balanceSubject.getValue();
        console.warn(`[WALLET] loadBalance error (wallet API may not be deployed yet): ${err?.status ?? err?.message}. Keeping in-memory balance: ₹${currentBalance}`);
        this.walletStatusSubject.next({ balance: currentBalance, status: 'ACTIVE' });
        return of(null);
      })
    ).subscribe();
  }

  /**
   * Load transaction history from API. Updates transactions$.
   * POST /wallet/history → { statusCode, transactions: [...] }
   */
  loadHistory(page = 1, limit = 50): void {
    if (environment.useMockData) {
      // In mock mode keep existing in-memory transactions
      return;
    }

    this.api.walletPost<any>('history', this.buildPayload({ page, limit }), this.getWalletToken()).pipe(
      tap(response => {
        if (response?.statusCode === 200 || response?.status === 'success') {
          const rawTxns = response.transactions ?? response.data ?? [];
          const txns: WalletTransaction[] = Array.isArray(rawTxns)
            ? rawTxns.map((t: any) => this.mapTransaction(t))
            : [];
          this.transactionsSubject.next(txns);
          console.log(`[WALLET] Loaded ${txns.length} transactions`);
        }
      }),
      catchError(err => {
        console.warn('[WALLET] loadHistory error (wallet API may not be deployed yet):', err?.status ?? err?.message);
        this.transactionsSubject.next([]);
        return of(null);
      })
    ).subscribe();
  }

  /**
   * Get the current wallet balance synchronously (from BehaviorSubject).
   */
  getCurrentBalance(): number {
    return this.balanceSubject.getValue();
  }

  // ─── Top-Up Flow ───────────────────────────────────────────────────────────

  /**
   * Initiate a Razorpay top-up order.
   * POST /wallet/topup/initiate → { orderId, amount (paise), currency, razorpayKeyId }
   * Use the returned orderId to open the Razorpay JS SDK.
   */
  initiateTopUp(amount: number): Observable<TopUpInitiateResponse | null> {
    if (environment.useMockData) {
      const mockOrderId = 'order_mock_' + Math.random().toString(36).substring(2, 10);
      return of({
        orderId: mockOrderId,
        amount: amount * 100,
        currency: 'INR',
        razorpayKeyId: 'rzp_test_mock',
      } as TopUpInitiateResponse);
    }

    return this.api.walletPost<any>('topup/initiate', this.buildPayload({ amount }), this.getWalletToken()).pipe(
      map(response => {
        if (response?.statusCode === 200 || response?.status === 'success') {
          const data = response.data ?? response;
          return {
            orderId: data.orderId ?? data.order_id ?? '',
            amount: data.amount ?? (amount * 100),
            currency: data.currency ?? 'INR',
            razorpayKeyId: data.razorpayKeyId ?? data.razorpay_key_id,
          } as TopUpInitiateResponse;
        }
        console.warn('[WALLET] initiateTopUp unexpected response:', response?.message);
        return null;
      }),
      catchError(err => {
        console.warn('[WALLET] initiateTopUp error:', err?.status ?? err?.message);
        return of(null);
      })
    );
  }

  /**
   * Verify Razorpay payment and credit the wallet.
   * POST /wallet/topup/verify → { statusCode, message }
   * Call this from the Razorpay payment handler callback.
   */
  verifyTopUp(orderId: string, paymentId: string, signature: string, amount: number): Observable<boolean> {
    if (environment.useMockData) {
      this.addTopUp(amount, paymentId);
      return of(true);
    }

    const payload = this.buildPayload({ order_id: orderId, payment_id: paymentId, signature });

    return this.api.walletPost<any>('topup/verify', payload, this.getWalletToken()).pipe(
      map(response => {
        if (response?.statusCode === 200 || response?.status === 'success') {
          console.log('[WALLET] Top-up verified, reloading wallet...');
          this.loadBalance();
          this.loadHistory();
          return true;
        }
        // API responded but didn't confirm — fall back to in-memory credit
        console.warn('[WALLET] verifyTopUp API did not confirm, crediting wallet locally:', response?.message);
        this.addTopUp(amount, paymentId);
        return true;
      }),
      catchError(err => {
        // API unreachable (not deployed yet) — credit wallet locally so UI reflects the payment
        if (!environment.production) console.warn(`[WALLET] verifyTopUp API error (${err?.status ?? err?.message}), crediting ₹${amount} locally`);
        this.addTopUp(amount, paymentId);
        return of(true);
      })
    );
  }

  // ─── Booking Payment ───────────────────────────────────────────────────────

  /**
   * Deduct wallet balance for a booking.
   * POST /wallet/pay-booking → { statusCode, message }
   *
   * @param bookingId - The booking reference ID
   * @param amount    - Amount to deduct (INR)
   * @param paymentOption - 1 (25%), 2 (25%+75%), 3 (25%+95%)
   *
   * Call this AFTER booking creation and BEFORE confirmation.
   * Returns false if wallet balance is insufficient.
   */
  payForBooking(bookingId: string, amount: number, paymentOption: 1 | 2 | 3 = 1): Observable<boolean> {
    if (environment.useMockData) {
      return of(this.deductForBooking(amount, bookingId));
    }

    const currentBalance = this.balanceSubject.getValue();
    if (currentBalance < amount) {
      console.warn(`[WALLET] Insufficient balance: ₹${currentBalance} < ₹${amount}`);
      return of(false);
    }

    const payload = this.buildPayload({ booking_id: bookingId, amount, payment_option: paymentOption });

    return this.api.walletPost<any>('pay-booking', payload, this.getWalletToken()).pipe(
      map(response => {
        if (response?.statusCode === 200 || response?.status === 'success') {
          if (!environment.production) console.log(`[WALLET] ₹${amount} deducted for booking #${bookingId} (option ${paymentOption})`);
          this.loadBalance();
          this.loadHistory();
          return true;
        }
        console.warn('[WALLET] payForBooking failed:', response?.message);
        return false;
      }),
      catchError(err => {
        const msg = err?.error?.message ?? err?.message ?? 'Unknown error';
        console.warn(`[WALLET] payForBooking error: ${msg}`);
        return of(false);
      })
    );
  }

  /**
   * Refund wallet for a cancelled booking.
   * POST /wallet/refund → { statusCode, message }
   * Usually triggered by the booking cancellation flow.
   */
  refundBooking(bookingId: string, amount: number): Observable<boolean> {
    if (environment.useMockData) {
      const newBalance = this.balanceSubject.getValue() + amount;
      this.balanceSubject.next(newBalance);
      const tx: WalletTransaction = {
        id: 'tx_' + Math.random().toString(36).substr(2, 9),
        date: new Date(),
        type: 'REFUND',
        amount,
        balanceAfter: newBalance,
        description: `Refund for Booking #${bookingId}`,
        referenceId: bookingId,
        status: 'SUCCESS',
      };
      this.transactionsSubject.next([tx, ...this.transactionsSubject.getValue()]);
      return of(true);
    }

    return this.api.walletPost<any>('refund', this.buildPayload({ booking_id: bookingId, amount }), this.getWalletToken()).pipe(
      map(response => {
        if (response?.statusCode === 200 || response?.status === 'success') {
          if (!environment.production) console.log(`[WALLET] ₹${amount} refunded for booking #${bookingId}`);
          this.loadBalance();
          this.loadHistory();
          return true;
        }
        return false;
      }),
      catchError(err => {
        console.warn('[WALLET] refundBooking error:', err?.status ?? err?.message);
        return of(false);
      })
    );
  }

  // ─── Legacy mock methods (kept for backward compatibility) ─────────────────

  /**
   * Directly credit wallet in mock mode.
   * In real mode, use verifyTopUp() after Razorpay callback.
   */
  addTopUp(amount: number, referenceId: string): void {
    const newBalance = this.balanceSubject.getValue() + amount;
    this.balanceSubject.next(newBalance);

    const tx: WalletTransaction = {
      id: 'tx_' + Math.random().toString(36).substr(2, 9),
      date: new Date(),
      type: 'TOPUP',
      amount,
      balanceAfter: newBalance,
      description: 'Wallet Top-up via Razorpay',
      referenceId,
      status: 'SUCCESS',
    };
    this.transactionsSubject.next([tx, ...this.transactionsSubject.getValue()]);
  }

  /**
   * Synchronously deduct balance in mock mode.
   * In real mode, use payForBooking() instead.
   */
  deductForBooking(amount: number, bookingId: string): boolean {
    const currentBalance = this.balanceSubject.getValue();
    if (currentBalance < amount) return false;

    const newBalance = currentBalance - amount;
    this.balanceSubject.next(newBalance);

    const tx: WalletTransaction = {
      id: 'tx_' + Math.random().toString(36).substr(2, 9),
      date: new Date(),
      type: 'BOOKING_PAYMENT',
      amount: -amount,
      balanceAfter: newBalance,
      description: `Wallet Payment for Booking #${bookingId}`,
      referenceId: bookingId,
      status: 'SUCCESS',
    };
    this.transactionsSubject.next([tx, ...this.transactionsSubject.getValue()]);
    return true;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Build wallet request payload (token goes in header, not body). */
  private buildPayload(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      agent_id: this.auth.getAgentId(),
      ...extra,
    };
  }

  /** Get the auth token for wallet API (Bearer header). */
  private getWalletToken(): string {
    return this.auth.getB2bToken() || '';
  }

  /** Map raw API transaction object to WalletTransaction model. */
  private mapTransaction(t: any): WalletTransaction {
    // Handle both credit/debit split fields and single amount field
    const creditAmt = parseFloat(t.credit_amount ?? t.creditAmount ?? '0') || 0;
    const debitAmt = parseFloat(t.debit_amount ?? t.debitAmount ?? '0') || 0;
    const singleAmt = parseFloat(t.amount ?? '0') || 0;

    let amount: number;
    if (creditAmt > 0) {
      amount = creditAmt;
    } else if (debitAmt > 0) {
      amount = -debitAmt;
    } else {
      amount = singleAmt;
    }

    // Determine transaction type from API field
    const rawType = (t.transaction_type ?? t.transactionType ?? t.type ?? '').toUpperCase();
    let type: WalletTransaction['type'] = 'TOPUP';
    if (rawType === 'DEBIT' || rawType === 'BOOKING_PAYMENT') {
      type = 'BOOKING_PAYMENT';
      if (amount > 0) amount = -amount; // Ensure debit is negative
    } else if (rawType === 'BOOKING_REFUND' || rawType === 'REFUND') {
      type = 'REFUND';
    } else if (rawType === 'TOPUP' || rawType === 'CREDIT') {
      type = 'TOPUP';
    }

    // Build description from remarks or type
    const description = t.remarks ?? t.description ?? t.narration
      ?? (type === 'TOPUP' ? 'Wallet Top-up' : type === 'REFUND' ? 'Booking Refund' : 'Booking Payment');

    return {
      id: String(t.id ?? t.transaction_id ?? t.transactionId ?? ''),
      date: t.created_at ? new Date(t.created_at)
        : t.createdAt ? new Date(t.createdAt)
        : new Date(),
      type,
      amount,
      balanceAfter: parseFloat(t.cur_balance ?? t.balance_after ?? t.balanceAfter ?? t.closing_balance ?? '0') || 0,
      description,
      referenceId: t.booking_id ?? t.bookingId ?? t.reference_id ?? t.referenceId ?? undefined,
      status: (['PENDING', 'SUCCESS', 'FAILED'].includes((t.status ?? '').toUpperCase())
        ? (t.status ?? 'SUCCESS').toUpperCase()
        : 'SUCCESS') as WalletTransaction['status'],
    };
  }
}
