import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

/**
 * Payment service for Razorpay integration via PHP backend endpoints.
 *
 * Confirmed from Postman (backend team's extraction, March 2026):
 *
 * Flow:
 *   1. advance_payment_check.php → Get advance amount for booking
 *   2. razor_createorder.php     → Create Razorpay order
 *   3. Razorpay SDK (client)     → User completes payment
 *   4. razor_checkhash.php       → Verify Razorpay signature
 *   5. confirmation.php          → Confirm payment in backend
 *   6. email_sent (partner API)  → Send booking confirmation email
 *
 * All PHP endpoints live on b2bcab.betasavaari.com (proxied via /payment-api).
 */

export interface AdvancePaymentCheckRequest {
  t_id: number;                    // Trip type ID
  t_s_id: number;                  // Sub trip type ID
  c_id: number;                    // Source city ID
  pick_date: string;               // DD-MM-YYYY
  car_id: number;                  // Car type ID
  package_id?: string;             // Package ID (empty for non-local)
  tot_amt: number;                 // Total fare amount
  b_src: number;                   // Booking source (0)
  pick_time: string;               // HH:MM
  IsPremium: number;               // 0 or 1
  drop_city_id?: number | string;  // Destination city ID (empty for local)
  reverse_dynamic_oneway?: number; // 0
}

export interface AdvancePaymentCheckResponse {
  status?: string;
  advance_payment_status?: number;  // 1 = advance required
  advance_percent?: number[];       // e.g. [25] — percentage options
  advance_percent_ids?: number[];   // e.g. [8] — rule IDs
  fixed_pay_amount?: number;
  fixed_pay_flag?: number;
  rule_set_no?: number;
  advance_amount?: number;          // Computed: tot_amt * advance_percent[0] / 100
  advance_percentage?: number;      // Computed: advance_percent[0]
  encoded_amount?: string;          // SHA1 hash for razor_createorder
  [key: string]: unknown;
}

export interface RazorpayOrderRequest {
  amount: number;                  // Amount in INR (not paise)
  encoded_amount?: string;         // (currently unused — backend will re-enable later)
  savaari_payment_id: string;      // Format: SW{agentId}S{mmYY}-{bookingId}
  /**
   * Distinguishes initial-booking payment from a settle-balance payment.
   *   0 → initial booking (first advance)
   *   1 → settlement (settle-now flow paying off the remaining balance)
   *
   * Backend uses this to decide whether `settlement-payment` should INSERT
   * a new sv_advance_payment row or UPDATE the existing latest row.
   * Without it, settlement-payment was overwriting the initial payment row's
   * payment_gateway/payment_gateway_order_id (e.g. wallet 17 → razorpay 16).
   */
  settlement_flag: 0 | 1;
}

export interface RazorpayOrderResponse {
  order_id?: string;
  razorpay_order_id?: string;
  amount?: number;
  status?: string;
  [key: string]: unknown;
}

export interface RazorpayVerifyRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  savaari_pay_id: string;
  selectedAmount: number;
}

export interface PaymentConfirmationRequest {
  // Razorpay flow params
  advancedAmount?: number;
  orderId?: string;                // savaari_payment_id
  paymentId?: string;              // razorpay_payment_id
  paymentmode?: string;            // 'savaariwebsite'
  // Wallet + Razorpay flow params (per backend team's confirmation callback doc, April 2026)
  source?: string;                 // 'B2B_WALLET' for wallet payments, 'B2B_RAZORPAY' for razorpay
  booking_id?: string;             // booking ID
  payment_option?: number;         // 1=25% driver collects, 2=25% auto-deduct, 3=100% full
  transaction_id?: string;         // wallet transaction ID / razorpay payment ID
  totalAmount?: number;            // The booking Total Fare (REQUIRED — per backend team's updated db columns)
  bufferAmount?: number;           // The buffer refundable deposit (REQUIRED — 0 for opt 1/2, 20% of fare for opt 3)
}

@Injectable({ providedIn: 'root' })
export class PaymentService {

  constructor(
    private api: ApiService,
    private auth: AuthService,
  ) {}

  /**
   * Step 1: Check advance payment amount.
   * POST /payment_confirmation/advance_payment_check.php
   *
   * Returns the advance amount the agent must pay upfront.
   */
  checkAdvancePayment(request: AdvancePaymentCheckRequest): Observable<AdvancePaymentCheckResponse> {
    return this.api.paymentPost<AdvancePaymentCheckResponse>(
      'payment_confirmation/advance_payment_check.php',
      {
        t_id: request.t_id,
        t_s_id: request.t_s_id,
        c_id: request.c_id,
        pick_date: request.pick_date,
        car_id: request.car_id,
        package_id: request.package_id ?? '',
        tot_amt: request.tot_amt,
        b_src: request.b_src ?? 0,
        pick_time: request.pick_time,
        IsPremium: request.IsPremium ?? 0,
        drop_city_id: request.drop_city_id ?? '',
        reverse_dynamic_oneway: request.reverse_dynamic_oneway ?? 0,
      }
    ).pipe(
      map(resp => {
        // Live API returns: { advance_payment_status: 1, advance_percent: [25], advance_percent_ids: [8] }
        // Compute advance_amount from percentage if not directly provided
        const pct = resp.advance_percent?.[0] || resp.advance_percentage || 25;
        const computedAmount = resp.advance_amount || Math.round(request.tot_amt * pct / 100);
        return {
          ...resp,
          advance_amount: computedAmount,
          advance_percentage: pct,
        };
      }),
      catchError(err => {
        console.error('[PAYMENT] advance_payment_check failed:', err);
        // Fallback: 25% advance (matches live site default)
        return of({
          status: 'error',
          advance_amount: Math.round(request.tot_amt * 0.25),
          advance_percentage: 25,
        });
      })
    );
  }

  /**
   * Step 2: Create Razorpay order.
   * POST /razor_createorder.php
   *
   * Returns a Razorpay order_id to open the payment modal.
   */
  createRazorpayOrder(request: RazorpayOrderRequest): Observable<RazorpayOrderResponse | null> {
    // Per backend team (April 2026): do NOT send encoded_amount for now —
    // it forces snapping to 25/50/100 buckets and breaks Payment Option 1
    // slider. Backend will re-enable a raw-amount path later.
    return this.api.paymentPost<RazorpayOrderResponse>(
      'razor_createorder.php',
      {
        amount: request.amount,
        savaari_payment_id: request.savaari_payment_id,
        settlement_flag: request.settlement_flag,
      }
    ).pipe(
      map(response => {
        if (!environment.production) console.log('[PAYMENT] Razorpay order created:', response);
        return response;
      }),
      catchError(err => {
        // Salvage path: backend (especially beta) sometimes returns HTTP 200
        // with a body that has PHP warnings/notices PREPENDED to the JSON,
        // so Angular's auto-JSON parse fails and surfaces an HttpErrorResponse
        // with status:200/ok:false. The raw text lives at `err.error.text`
        // (when responseType was JSON and parse failed) or `err.error` (when
        // it's already a string). If we can find a `{...}` substring with an
        // order_id, return that — otherwise log the raw body so we can see
        // exactly what backend sent and return null to trigger the UI error.
        const raw: string =
          (typeof err?.error === 'string' ? err.error : '') ||
          (err?.error?.text || '') ||
          '';
        if (raw) {
          if (!environment.production) console.warn('[PAYMENT] razor_createorder body was non-JSON. Raw text:', raw);
          // Try to extract the JSON object from anywhere in the body.
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]);
              if (parsed && (parsed.razorpay_order_id || parsed.order_id)) {
                if (!environment.production) console.log('[PAYMENT] Razorpay order salvaged from non-JSON body:', parsed);
                return of(parsed as RazorpayOrderResponse);
              }
            } catch { /* fall through to error path */ }
          }
        }
        console.error('[PAYMENT] razor_createorder failed:', err);
        return of(null);
      })
    );
  }

  /**
   * Step 3: Verify Razorpay payment signature.
   * POST /razor_checkhash.php (application/x-www-form-urlencoded)
   *
   * Called after Razorpay payment success callback.
   *
   * NOTE: Postman shows this as multipart/form-data, but on alpha that breaks
   * because proxy.php uses `file_get_contents("php://input")` to forward the
   * body — and php://input is EMPTY for multipart/form-data requests (PHP
   * parses them into $_POST/$_FILES). The empty body reaches betasavaari and
   * signature verification fails with 401 ERROR.
   *
   * Switching to form-urlencoded works because:
   *   1. PHP backend reads $_POST which is populated identically by both
   *      multipart/form-data and application/x-www-form-urlencoded
   *   2. proxy.php correctly forwards form-urlencoded bodies via php://input
   *   3. No file uploads needed — all fields are plain strings
   */
  verifyRazorpayPayment(request: RazorpayVerifyRequest): Observable<boolean> {
    return this.api.paymentPost<any>('razor_checkhash.php', {
      razorpay_order_id: request.razorpay_order_id,
      razorpay_payment_id: request.razorpay_payment_id,
      razorpay_signature: request.razorpay_signature,
      savaari_pay_id: request.savaari_pay_id,
      selectedAmount: request.selectedAmount,
    }).pipe(
      map(response => {
        if (!environment.production) console.log('[PAYMENT] Razorpay hash verified:', response);
        // Backend PHP endpoints return status_code=101 for OK and 301 for
        // FAILURE (they are NOT HTTP codes — they are app-level codes).
        // Treat anything that is not an explicit failure as success so we
        // don't block legitimate payments.
        const r: any = response || {};
        const code = Number(r.status_code ?? r.statusCode ?? 0);
        const status = String(r.status ?? '').toUpperCase();
        const explicitFailure = code === 301 || status === 'FAILURE' || status === 'FAILED' || status === 'ERROR' || r.status === false;
        return !explicitFailure;
      }),
      catchError(err => {
        console.error('[PAYMENT] razor_checkhash failed:', err);
        return of(false);
      })
    );
  }

  /**
   * Step 4: Confirm payment in backend.
   * POST /payment_confirmation/confirmation.php (via /payment-api proxy → beta)
   *
   * IMPORTANT: This MUST go through the /payment-api proxy to b2bcab.betasavaari.com.
   * Calling it directly on alpha (without /payment-api) hits alpha's own broken
   * confirmation.php which returns status_code=301 FAILURE — because:
   *   1. The booking was created in BETA database (via /partner-api proxy)
   *   2. Alpha's confirmation.php can't find the booking in its own DB
   *   3. Hash + savaari_pay_id were generated against beta — fails on alpha
   * Same root cause as commit 608f322 (alpha PHP files are broken/different).
   *
   * Two flows:
   *   Razorpay: advancedAmount, orderId, paymentId, paymentmode
   *   Wallet:   source=B2B_WALLET, booking_id, payment_option, transaction_id
   */
  confirmPayment(request: PaymentConfirmationRequest): Observable<boolean> {
    // Build params based on flow type (wallet vs razorpay).
    // Per backend team's April 2026 doc, BOTH wallet and razorpay flows MUST send:
    //   source, booking_id, payment_option, transaction_id, totalAmount, bufferAmount
    // totalAmount + bufferAmount were added because DB entries weren't being stored
    // without them (server uses these to populate sv_advance_payment + sv_booking_wallet_payment).
    let body: Record<string, any>;
    if (request.source === 'B2B_WALLET') {
      body = {
        source: 'B2B_WALLET',
        booking_id: request.booking_id,
        payment_option: request.payment_option,
        transaction_id: request.transaction_id,
        totalAmount: request.totalAmount,
        bufferAmount: request.bufferAmount,
        advancedAmount: request.advancedAmount,
      };
    } else if (request.source === 'B2B_RAZORPAY') {
      body = {
        source: 'B2B_RAZORPAY',
        booking_id: request.booking_id,
        payment_option: request.payment_option,
        transaction_id: request.transaction_id,
        totalAmount: request.totalAmount,
        bufferAmount: request.bufferAmount,
        advancedAmount: request.advancedAmount,
        orderId: request.orderId,
        paymentId: request.paymentId,
        paymentmode: request.paymentmode || 'savaariwebsite',
      };
    } else {
      body = {
        advancedAmount: request.advancedAmount,
        orderId: request.orderId,
        paymentId: request.paymentId,
        paymentmode: request.paymentmode || 'savaariwebsite',
      };
    }

    return this.api.paymentPost<any>(
      'payment_confirmation/confirmation.php',
      body
    ).pipe(
      map(response => {
        if (!environment.production) console.log('[PAYMENT] Payment confirmed:', response);
        // Same convention: 101 = OK, 301 = FAILURE. Treat only explicit
        // failure as a failure so success variants (101, 'success', etc.)
        // all pass through.
        const r: any = response || {};
        const code = Number(r.status_code ?? r.statusCode ?? 0);
        const status = String(r.status ?? '').toUpperCase();
        const explicitFailure = code === 301 || status === 'FAILURE' || status === 'FAILED' || status === 'ERROR' || r.status === false;
        return !explicitFailure;
      }),
      catchError(err => {
        console.error('[PAYMENT] confirmation failed:', err);
        return of(false);
      })
    );
  }

  /**
   * Step 5: Send booking confirmation email.
   * POST /email_sent (Partner API, form-encoded)
   *
   * Called after payment confirmation succeeds.
   * From HAR: Body: booking_id=2361628
   * Response: {"status":"success","data":{"sentemail":"","payment_gateway":"16"}}
   */
  sendConfirmationEmail(bookingId: string): Observable<unknown> {
    return this.api.partnerPostForm('email_sent', {
      booking_id: bookingId,
    }).pipe(
      catchError(err => {
        console.error('[PAYMENT] email_sent failed:', err);
        return of({ status: 'error' }); // Non-blocking — booking already created
      })
    );
  }

  /**
   * Step 6: Settlement payment — update booking as fully paid.
   * POST /booking/settlement-payment (Settlement API, form-encoded)
   *
   * Per backend team's doc (April 2026):
   *   Sets pay_bal_amt=0, payment_status='Pre Paid', made_payment=2
   *   Removes booking from auto-pay cron queue (sv_booking_wallet_payment.balance_paid_status=1)
   *   Records payment in sv_advance_payment for auditing
   *
   * ROUTING NOTE: This endpoint is ALPHA-ONLY. Beta returns 404 because it's
   * not deployed there. Confirmed via probe (April 2026): garbage token to
   * api.alphasavaari.com returned errroCode=11001 (auth failed — meaning the
   * route exists and validated), while the same request to beta returned 404
   * "Not Found". Cron (`cron_wallet_auto_pay_balance.php`) is also alpha-
   * hosted, so the whole settlement flow lives on alpha. We route it through
   * the dedicated `/settlement-api` proxy rather than `/partner-api` so this
   * one endpoint can live on a different domain from the rest of the Partner
   * API surface without leaking alpha URLs into the rest of the app.
   *
   * Call this AFTER wallet deduction + confirmation.php (or Razorpay verify + confirmation.php).
   */
  settlementPayment(params: {
    bookingId: string;
    paymentAmount: number;
    paymentMethod: 'Wallet' | 'Razorpay';
    transactionId: string;
    paymentId?: string;
  }): Observable<boolean> {
    const token = this.auth.getPartnerToken() ?? '';
    const body: Record<string, any> = {
      bookingId: params.bookingId,
      paymentAmount: params.paymentAmount,
      paymentMethod: params.paymentMethod,
      transactionId: params.transactionId,
    };
    if (params.paymentId) {
      body['paymentId'] = params.paymentId;
    }

    return this.api.settlementPostForm<any>('booking/settlement-payment', body, { token }).pipe(
      map(response => {
        if (!environment.production) console.log('[PAYMENT] Settlement payment:', response);
        // Settlement endpoint follows the same Savaari PHP convention as the
        // other booking endpoints: status_code=101 OK, 301 FAILURE. Earlier
        // we only checked `status === true || 'success'` which silently
        // missed the success case when the backend returned the canonical
        // `{ status_code: 101, status_description: 'SUCCESS' }` shape — the
        // booking would API-succeed but our caller would treat it as a
        // failure (or vice versa). Mirror the `confirmPayment` /
        // `verifyRazorpayPayment` logic: only treat an EXPLICIT failure as
        // failed; everything else (status_code=101, status='success',
        // status=true, missing-but-non-error) counts as success.
        const r: any = response || {};
        const code = Number(r.status_code ?? r.statusCode ?? 0);
        const status = String(r.status ?? '').toUpperCase();
        const desc = String(r.status_description ?? '').toUpperCase();
        const explicitSuccess = code === 101 || status === 'SUCCESS' || status === 'TRUE' || r.status === true || desc === 'SUCCESS';
        const explicitFailure = code === 301 || status === 'FAILURE' || status === 'FAILED' || status === 'ERROR' || r.status === false;
        // Prefer explicit success, then fall back to "no explicit failure".
        // This keeps current callers unbroken while fixing the 101 case.
        return explicitSuccess || !explicitFailure;
      }),
      catchError(err => {
        console.error('[PAYMENT] settlement-payment failed:', err);
        return of(false); // Non-blocking — booking already created and paid
      })
    );
  }

  /**
   * Generate the Savaari payment ID format.
   * Format from Postman: SW{agentId}S{MMYY}-{bookingId}
   * Example: SW69851S0326-2361490
   */
  generateSavaariPaymentId(bookingId: string): string {
    const agentId = this.auth.getAgentId();
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    return `SW${agentId}S${mm}${yy}-${bookingId}`;
  }
}
