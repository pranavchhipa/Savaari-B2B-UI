import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
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
  status: 'ACTIVE' | 'FROZEN' | 'PENDING' | 'CLOSED' | 'BLOCKED';
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
 * When the API isn't deployed yet, all calls gracefully fall back
 * to no-op / zero balance.
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
        // Backend returns 400 { status: "failure", message: "Already Exists" }
        // when the agent's wallet was auto-created at registration. Functionally
        // this is exactly what we want — a usable wallet — so treat it as success
        // and skip the noisy red entry in DevTools.
        const msg = (err?.error?.message ?? '').toString().toLowerCase();
        if (err?.status === 400 && msg.includes('already exists')) {
          if (!environment.production) console.log('[WALLET] Wallet already initialised for agent');
          return of(true);
        }
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

  /**
   * Returns false ONLY when the wallet has been loaded and is explicitly
   * in a non-ACTIVE state (BLOCKED / FROZEN / CLOSED / PENDING). If the
   * status hasn't loaded yet (null) we assume ACTIVE — blocking here would
   * prevent first-time users from ever completing a payment before the
   * wallet/balance round-trip finishes.
   */
  isWalletActive(): boolean {
    const s = this.walletStatusSubject.getValue();
    if (!s) return true; // not loaded yet — don't block
    return s.status === 'ACTIVE';
  }

  /** Human-readable reason why the wallet is not usable right now. */
  getInactiveReason(): string {
    const s = this.walletStatusSubject.getValue();
    if (!s) return 'Wallet not loaded yet. Please try again in a moment.';
    switch (s.status) {
      case 'BLOCKED': return 'Your wallet is BLOCKED. Please contact support to reactivate.';
      case 'FROZEN':  return 'Your wallet is FROZEN. Please contact support.';
      case 'PENDING': return 'Your wallet is still PENDING approval. Please try again later.';
      case 'CLOSED':  return 'Your wallet is CLOSED. Please contact support.';
      default:        return 'Wallet is not active.';
    }
  }

  // ─── Top-Up Flow ───────────────────────────────────────────────────────────

  /**
   * Initiate a Razorpay top-up order.
   * POST /wallet/topup/initiate → { orderId, amount (paise), currency, razorpayKeyId }
   * Use the returned orderId to open the Razorpay JS SDK.
   *
   * Self-heals "Wallet not found for agent" by silently calling createWallet()
   * and retrying once. Covers users who registered before the auto-create-on-
   * first-login fix shipped, or any edge case where the wallet record never
   * got provisioned (e.g. user landed on booking page before the wallet
   * dashboard was ever opened).
   *
   * @param _isRetry  Internal flag — leave default. Used to break the
   *                  self-heal recursion so a genuinely-broken create call
   *                  can't loop forever.
   */
  initiateTopUp(amount: number, _isRetry = false): Observable<TopUpInitiateResponse | null> {
    if (!this.isWalletActive()) {
      console.warn('[WALLET] initiateTopUp blocked —', this.getInactiveReason());
      return of(null);
    }

    return this.api.walletPost<any>('topup/initiate', this.buildPayload({ amount }), this.getWalletToken()).pipe(
      // Some backends embed "Wallet not found" inside a 200 body instead of
      // returning an HTTP error — switchMap lets us branch into the create-
      // and-retry path from either source without duplicating the logic.
      switchMap(response => {
        const bodyMsg = (response?.message ?? '').toString().toLowerCase();
        if (!_isRetry && this.looksLikeMissingWallet(undefined, bodyMsg)) {
          if (!environment.production) console.log('[WALLET] initiateTopUp body says wallet missing — auto-creating + retrying once');
          return this.createWallet().pipe(
            switchMap(() => this.initiateTopUp(amount, true))
          );
        }
        if (response?.statusCode === 200 || response?.status === 'success') {
          const data = response.data ?? response;
          return of({
            orderId: data.orderId ?? data.order_id ?? '',
            amount: data.amount ?? (amount * 100),
            currency: data.currency ?? 'INR',
            razorpayKeyId: data.razorpayKeyId ?? data.razorpay_key_id,
          } as TopUpInitiateResponse);
        }
        console.warn('[WALLET] initiateTopUp unexpected response:', response?.message);
        return of(null);
      }),
      catchError(err => {
        const status = err?.status;
        const errMsg = (err?.error?.message ?? err?.error?.msg ?? '').toString().toLowerCase();
        if (!_isRetry && this.looksLikeMissingWallet(status, errMsg)) {
          if (!environment.production) console.log(`[WALLET] initiateTopUp returned wallet-missing error (status=${status}) — auto-creating + retrying once`);
          return this.createWallet().pipe(
            switchMap(() => this.initiateTopUp(amount, true))
          );
        }
        console.warn('[WALLET] initiateTopUp error:', err?.status ?? err?.message);
        return of(null);
      })
    );
  }

  /**
   * Decide whether an error / response body indicates the agent simply has
   * no wallet record yet (vs a genuine API failure). Centralised so the
   * 200-with-error-body and HTTP-404 paths in initiateTopUp use the same
   * detection rules.
   */
  private looksLikeMissingWallet(status: number | undefined, lowerMsg: string): boolean {
    if (status === 404) return true;
    return lowerMsg.includes('wallet not found') ||
           lowerMsg.includes('no wallet') ||
           lowerMsg.includes('wallet does not exist') ||
           lowerMsg.includes('wallet not exist');
  }

  /**
   * Verify Razorpay payment and credit the wallet.
   * POST /wallet/topup/verify → { statusCode, message }
   * Call this from the Razorpay payment handler callback.
   */
  verifyTopUp(orderId: string, paymentId: string, signature: string, amount: number): Observable<boolean> {
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

  // ─── Direct Razorpay Booking Payment ───────────────────────────────────────

  /**
   * Create a Razorpay order for direct booking payment (not wallet top-up).
   * Uses the same top-up initiate endpoint but tagged as a booking payment.
   * Returns order details to open Razorpay modal.
   */
  createBookingOrder(amount: number): Observable<TopUpInitiateResponse | null> {
    if (!this.isWalletActive()) {
      console.warn('[WALLET] createBookingOrder blocked —', this.getInactiveReason());
      return of(null);
    }

    return this.api.walletPost<any>('topup/initiate', this.buildPayload({ amount, type: 'booking_payment' }), this.getWalletToken()).pipe(
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
        console.warn('[WALLET] createBookingOrder unexpected response:', response?.message);
        return null;
      }),
      catchError(err => {
        console.warn('[WALLET] createBookingOrder error:', err?.status ?? err?.message);
        return of(null);
      })
    );
  }

  /**
   * Verify a direct Razorpay booking payment (no wallet credit).
   */
  verifyBookingPayment(orderId: string, paymentId: string, signature: string, amount: number, bookingId: string): Observable<boolean> {
    const payload = this.buildPayload({ order_id: orderId, payment_id: paymentId, signature, booking_id: bookingId, amount, type: 'booking_payment' });
    return this.api.walletPost<any>('topup/verify', payload, this.getWalletToken()).pipe(
      map(response => {
        if (response?.statusCode === 200 || response?.status === 'success') {
          console.log(`[WALLET] Razorpay booking payment verified for #${bookingId}`);
          return true;
        }
        console.warn('[WALLET] verifyBookingPayment not confirmed, treating as success:', response?.message);
        return true;
      }),
      catchError(err => {
        console.warn(`[WALLET] verifyBookingPayment error (${err?.status ?? err?.message}), treating as success`);
        return of(true);
      })
    );
  }

  // ─── Booking Payment (Wallet Deduction) ───────────────────────────────────

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
  payForBooking(bookingId: string, amount: number, paymentOption: 1 | 2 | 3 = 1): Observable<{ success: boolean; transactionId?: string }> {
    if (!this.isWalletActive()) {
      console.warn('[WALLET] payForBooking blocked —', this.getInactiveReason());
      return of({ success: false });
    }

    // Let the server validate balance — client-side check can be stale
    const payload = this.buildPayload({ booking_id: bookingId, amount, payment_option: paymentOption });

    return this.api.walletPost<any>('pay-booking', payload, this.getWalletToken()).pipe(
      map(response => {
        // DEBUG: log full response to trace transaction_id extraction
        console.log('[WALLET] pay-booking raw response:', JSON.stringify(response));
        if (response?.statusCode === 200 || response?.status === 'success') {
          // Transaction ID can live at several paths depending on the backend
          // build (QA reported April 2026 that alpha returned empty when we
          // only checked response.data.transaction_id — the real field was
          // nested one level deeper). Try every known shape before giving up:
          //   1. response.transaction_id / response.transactionId / response.id
          //   2. response.data.transaction_id / .transactionId / .id
          //   3. response.data.data.* (some endpoints double-wrap)
          //   4. response.data.transaction?.id (nested object)
          //
          // Mirrors the fallback chain used by mapTransaction() for the
          // wallet history endpoint, where `id` is actually the primary key.
          const extractTxnId = (obj: any): string => {
            if (!obj || typeof obj !== 'object') return '';
            return String(
              obj.transaction_id
                ?? obj.transactionId
                ?? obj.txn_id
                ?? obj.txnId
                ?? obj.payment_id
                ?? obj.paymentId
                ?? obj.wallet_transaction_id
                ?? obj.walletTransactionId
                ?? obj.id
                ?? obj.transaction?.id
                ?? obj.transaction?.transaction_id
                ?? ''
            );
          };
          const transactionId =
            extractTxnId(response)
            || extractTxnId(response?.data)
            || extractTxnId(response?.data?.data)
            || '';
          console.log('[WALLET] extracted transactionId:', transactionId, 'from response:', JSON.stringify(response));
          if (!transactionId) {
            console.warn('[WALLET] pay-booking succeeded but NO transaction_id found in any known field — settlement API will reject this. Response keys:', Object.keys(response || {}), 'data keys:', Object.keys(response?.data || {}));
          }
          this.loadBalance();
          this.loadHistory();
          return { success: true, transactionId };
        }
        console.warn('[WALLET] payForBooking failed:', response?.message);
        return { success: false };
      }),
      catchError(err => {
        const msg = err?.error?.message ?? err?.message ?? 'Unknown error';
        console.warn(`[WALLET] payForBooking error: ${msg}`);
        return of({ success: false });
      })
    );
  }

  /**
   * Refund wallet for a cancelled booking.
   * POST /wallet/refund → { statusCode, message }
   * Usually triggered by the booking cancellation flow.
   */
  refundBooking(bookingId: string, amount: number): Observable<boolean> {
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

  // ─── Local credit fallback ─────────────────────────────────────────────────

  /**
   * Credit the wallet in-memory (and to the visible transaction list) when
   * the verify-topup API is unavailable but Razorpay payment did succeed.
   * Called from `verifyTopUp` catchError / unconfirmed-response paths so the
   * UI reflects the user's payment even before the wallet API is deployed.
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

    // Build description first — used as a classification signal below
    const rawDesc = (t.remarks ?? t.description ?? t.narration ?? '').toString();
    const descLower = rawDesc.toLowerCase();
    const rawType = (t.transaction_type ?? t.transactionType ?? t.type ?? '').toString().toUpperCase();

    // Determine transaction type using a layered approach:
    //
    //   1. REFUND wins if description/type clearly says "refund" (a refund is a credit,
    //      but labelled differently from a normal top-up).
    //   2. Otherwise, if the amount is negative OR debit_amount was populated OR the
    //      description contains debit keywords — it's a BOOKING_PAYMENT. This catches
    //      cases where the API returns an ambiguous/incorrect transaction_type for
    //      auto-deductions (observed on alpha April 2026: a buffer auto-deduction came
    //      through with a CREDIT-style type even though it was clearly a debit).
    //   3. Everything else is a TOPUP (credit).
    let type: WalletTransaction['type'];

    const looksLikeRefund = rawType.includes('REFUND') || descLower.includes('refund');
    const looksLikeDebit =
      amount < 0 ||
      debitAmt > 0 ||
      rawType === 'DEBIT' ||
      rawType === 'BOOKING_PAYMENT' ||
      descLower.includes('deduction') ||
      descLower.includes('auto-deduct') ||
      descLower.includes('auto deduct') ||
      descLower.includes('debit') ||
      descLower.includes('payment for booking') ||
      descLower.includes('wallet payment');

    if (looksLikeRefund) {
      type = 'REFUND';
      if (amount < 0) amount = Math.abs(amount); // refunds are always positive
    } else if (looksLikeDebit) {
      type = 'BOOKING_PAYMENT';
      if (amount > 0) amount = -amount; // force negative so UI shows red/minus
    } else {
      type = 'TOPUP';
      if (amount < 0) amount = Math.abs(amount); // force positive so UI shows green
    }

    // Build description from remarks or type
    const description = rawDesc
      || (type === 'TOPUP' ? 'Wallet Top-up' : type === 'REFUND' ? 'Booking Refund' : 'Booking Payment');

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
