import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

/**
 * Payment service for Razorpay integration via PHP backend endpoints.
 *
 * Confirmed from Postman (Shubhendu's extraction, March 2026):
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
  encoded_amount: string;          // SHA1 encoded amount from advance_payment_check
  savaari_payment_id: string;      // Format: SW{agentId}S{mmYY}-{bookingId}
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
  // Wallet flow params (from Jibin's confirmation callback doc)
  source?: string;                 // 'B2B_WALLET' for wallet payments
  booking_id?: string;             // booking ID
  payment_option?: number;         // 1=25% driver collects, 2=25% auto-deduct, 3=100% full
  transaction_id?: string;         // wallet transaction ID from pay-booking response
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
    if (environment.useMockData) {
      const advanceAmount = Math.round(request.tot_amt * 0.2); // 20% advance
      return of({
        status: 'success',
        advance_amount: advanceAmount,
        advance_percentage: 20,
      });
    }

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
    if (environment.useMockData) {
      return of({
        order_id: 'order_mock_' + Math.random().toString(36).substring(2, 10),
        amount: request.amount,
        status: 'created',
      });
    }

    return this.api.paymentPost<RazorpayOrderResponse>(
      'razor_createorder.php',
      {
        amount: request.amount,
        encoded_amount: request.encoded_amount,
        savaari_payment_id: request.savaari_payment_id,
      }
    ).pipe(
      map(response => {
        if (!environment.production) console.log('[PAYMENT] Razorpay order created:', response);
        return response;
      }),
      catchError(err => {
        console.error('[PAYMENT] razor_createorder failed:', err);
        return of(null);
      })
    );
  }

  /**
   * Step 3: Verify Razorpay payment signature.
   * POST /razor_checkhash.php (multipart/form-data)
   *
   * Called after Razorpay payment success callback.
   */
  verifyRazorpayPayment(request: RazorpayVerifyRequest): Observable<boolean> {
    if (environment.useMockData) {
      return of(true);
    }

    // Postman shows this as multipart/form-data
    const formData = new FormData();
    formData.append('razorpay_order_id', request.razorpay_order_id);
    formData.append('razorpay_payment_id', request.razorpay_payment_id);
    formData.append('razorpay_signature', request.razorpay_signature);
    formData.append('savaari_pay_id', request.savaari_pay_id);
    formData.append('selectedAmount', String(request.selectedAmount));

    return this.api.paymentPostFormData<any>('razor_checkhash.php', formData).pipe(
      map(response => {
        if (!environment.production) console.log('[PAYMENT] Razorpay hash verified:', response);
        return true;
      }),
      catchError(err => {
        console.error('[PAYMENT] razor_checkhash failed:', err);
        return of(false);
      })
    );
  }

  /**
   * Step 4: Confirm payment in backend.
   * POST /payment_confirmation/confirmation.php
   *
   * Two flows:
   *   Razorpay: advancedAmount, orderId, paymentId, paymentmode
   *   Wallet:   source=B2B_WALLET, booking_id, payment_option, transaction_id
   */
  confirmPayment(request: PaymentConfirmationRequest): Observable<boolean> {
    if (environment.useMockData) {
      return of(true);
    }

    // Build params based on flow type (wallet vs razorpay)
    const body: Record<string, any> = request.source === 'B2B_WALLET'
      ? {
          source: 'B2B_WALLET',
          booking_id: request.booking_id,
          payment_option: request.payment_option,
          transaction_id: request.transaction_id,
          advancedAmount: request.advancedAmount,
        }
      : {
          advancedAmount: request.advancedAmount,
          orderId: request.orderId,
          paymentId: request.paymentId,
          paymentmode: request.paymentmode || 'savaariwebsite',
        };

    return this.api.paymentPost<any>(
      'payment_confirmation/confirmation.php',
      body
    ).pipe(
      map(response => {
        if (!environment.production) console.log('[PAYMENT] Payment confirmed:', response);
        return true;
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
    if (environment.useMockData) {
      return of({ status: 'success', data: { sentemail: '', payment_gateway: '16' } });
    }

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
