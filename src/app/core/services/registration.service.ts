import { Injectable, inject } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

/**
 * Registration Service — API calls for the multi-step registration wizard.
 *
 * ENDPOINTS (backend team, April 2026):
 *   1. POST /partner_api/public/general/gst_verification.php — GST verification
 *   2. POST /partner_api/public/otp/sms/send                 — Send SMS OTP
 *   3. POST /partner_api/public/otp/sms/verify                — Verify SMS OTP (6-digit)
 *   4. POST /partner_api/public/otp/email/send                — Send email OTP
 *   5. POST /partner_api/public/otp/email/verify              — Verify email OTP (6-digit)
 *   6. POST /b2b-api/user (multipart)                         — Register account
 *
 * API failures surface as user-facing errors via the standard error handler.
 */

// ─── Response types ────────────────────────────────────────────────────────

export interface GstVerificationResult {
  success: boolean;
  legalName?: string;
  businessName?: string;
  panNumber?: string;
  address?: string;
  gstinStatus?: string;
  errorMessage?: string;
}

export interface SendOtpResult {
  success: boolean;
  mobileOtpSent: boolean;
  emailOtpSent: boolean;
  expiresInSeconds: number;
  errorMessage?: string;
  errorCode?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  verified: boolean;
  verificationToken?: string;
  attemptsRemaining?: number;
  errorMessage?: string;
  errorCode?: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  countryCode: string;          // '91' for India
  gstNumber?: string;            // Optional — can be empty if user skipped GST
  panNumber: string;
  companyName: string;
  companyAddress: string;
  password: string;
  mobileVerificationToken?: string;
  emailVerificationToken?: string;
  agentCity?: string;            // From place_id API or GST address parsing
  agentState?: string;
  agentCityId?: number;          // Savaari source city ID from place_id API
}

export interface RegisterResult {
  success: boolean;
  userId?: number;
  message?: string;
  errorCode?: string;
}

@Injectable({ providedIn: 'root' })
export class RegistrationService {
  private api = inject(ApiService);

  // ──────────────────────────────────────────────────────────────────────
  // 1. GST VERIFICATION
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Verify a GSTIN via the alpha gst_verification.php endpoint.
   * Returns legalName, panNumber, address for auto-fill on success.
   *
   * On any API error (endpoint not deployed, 404, network failure) we log a
   * warning and surface a failure result — caller decides whether to show an
   * error or fall back to manual entry.
   */
  verifyGst(gstNumber: string): Observable<GstVerificationResult> {
    return this.api.regPostForm<any>('general/gst_verification.php', { gstNumber }).pipe(
      map(response => {
        if (response?.status === true && response?.data?.fields) {
          const f = response.data.fields;
          const status = (f.gstin_status ?? '').toString().trim();
          if (status.toLowerCase() !== 'active') {
            return {
              success: false,
              gstinStatus: status,
              errorMessage: status
                ? `GSTIN is ${status}. Only Active GSTINs can be used for registration.`
                : 'GSTIN status could not be verified. Please contact support.',
            } as GstVerificationResult;
          }
          return {
            success: true,
            legalName: f.legal_name ?? f.business_name ?? '',
            businessName: f.business_name ?? f.legal_name ?? '',
            panNumber: f.pan_number ?? '',
            address: f.address ?? '',
            gstinStatus: status,
          } as GstVerificationResult;
        }
        const msg = response?.data?.message ?? response?.message ?? 'Invalid GST Number';
        return { success: false, errorMessage: msg };
      }),
      catchError(err => {
        if (!environment.production) {
          console.warn('[REGISTRATION] verifyGst API error:', err?.status ?? err?.message);
        }
        // Surface a meaningful message based on HTTP status. Generic err.message
        // (e.g. "Http failure response for /reg-api/...") is useless to a user.
        const status = err?.status;
        let errorMessage: string;
        if (status === 404) {
          errorMessage = 'GST verification service is unavailable right now. Please try again in a moment, or skip GST and proceed manually.';
        } else if (status === 0 || status === 502 || status === 503 || status === 504) {
          errorMessage = 'Could not reach the GST verification service. Check your internet and try again.';
        } else if (status === 400 || status === 422) {
          errorMessage = err?.error?.message ?? err?.error?.msg ?? 'Invalid GST Number. Please check and try again.';
        } else {
          errorMessage = err?.error?.message ?? err?.error?.msg ?? `GST verification failed (${status || 'network error'}). Please try again.`;
        }
        return of({ success: false, errorMessage });
      })
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // 2. SEND OTP (initial — both channels)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Send OTPs to both mobile and email via separate endpoints (forkJoin).
   *
   * POST /otp/sms/send   { mobile }      @noauth
   * POST /otp/email/send  { email }      @noauth
   */
  sendOtps(mobile: string, email: string): Observable<SendOtpResult> {
    const sms$ = this.api.regPostForm<any>('partner_api/public/otp/sms/send', { mobile }).pipe(
      map(res => this.parseSendResponse(res)),
      catchError(err => of({ ok: false, error: this.extractErrorMsg(err) }))
    );

    const email$ = this.api.regPostForm<any>('partner_api/public/otp/email/send', { email }).pipe(
      map(res => this.parseSendResponse(res)),
      catchError(err => of({ ok: false, error: this.extractErrorMsg(err) }))
    );

    return forkJoin([sms$, email$]).pipe(
      map(([smsRes, emailRes]) => {
        // Mobile OTP is mandatory; email OTP is optional (backend may not support it)
        if (!smsRes.ok) {
          return {
            success: false,
            mobileOtpSent: false,
            emailOtpSent: emailRes.ok,
            expiresInSeconds: 0,
            errorMessage: smsRes.error || 'Failed to send mobile OTP.',
          } as SendOtpResult;
        }
        // Mobile sent — proceed even if email failed
        const result = this.buildSendOtpSuccess();
        result.mobileOtpSent = true;
        result.emailOtpSent = emailRes.ok;
        return result;
      })
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // 3. RESEND OTP (single channel)
  // ──────────────────────────────────────────────────────────────────────

  /** Resend OTP for a single channel (5/day rate limit per backend spec). */
  resendOtp(channel: 'mobile' | 'email', contact: string): Observable<SendOtpResult> {
    const endpoint = channel === 'mobile' ? 'partner_api/public/otp/sms/send' : 'partner_api/public/otp/email/send';
    const body: Record<string, string> = {};
    if (channel === 'mobile') body['mobile'] = contact;
    else body['email'] = contact;

    return this.api.regPostForm<any>(endpoint, body).pipe(
      map(res => {
        const parsed = this.parseSendResponse(res);
        if (!parsed.ok) return { success: false, mobileOtpSent: false, emailOtpSent: false, expiresInSeconds: 0, errorMessage: parsed.error } as SendOtpResult;
        return this.buildSendOtpSuccess();
      }),
      catchError(err => of({
        success: false,
        mobileOtpSent: false,
        emailOtpSent: false,
        expiresInSeconds: 0,
        errorMessage: this.extractErrorMsg(err),
      } as SendOtpResult))
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // 4. VERIFY OTP (one channel at a time)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Verify a 6-digit OTP for a single channel.
   *
   * POST /otp/sms/verify    { mobile, otp }    @noauth
   * POST /otp/email/verify   { email, otp }    @noauth
   *
   * No verificationToken returned — backend records status in DB.
   */
  verifyOtp(channel: 'mobile' | 'email', contact: string, otp: string): Observable<VerifyOtpResult> {
    const endpoint = channel === 'mobile' ? 'partner_api/public/otp/sms/verify' : 'partner_api/public/otp/email/verify';
    const body: Record<string, string> = { otp };
    if (channel === 'mobile') body['mobile'] = contact;
    else body['email'] = contact;

    return this.api.regPostForm<any>(endpoint, body).pipe(
      map(res => {
        // Backend wraps response: { status: "success", data: { success: true, msg: "..." } }
        const inner = res?.data ?? res;
        const isOk = inner?.success === true || res?.status === 'success';
        if (isOk) {
          return { success: true, verified: true } as VerifyOtpResult;
        }
        return {
          success: false,
          verified: false,
          errorMessage: inner?.msg || res?.msg || 'OTP verification failed',
        } as VerifyOtpResult;
      }),
      catchError(err => {
        if (!environment.production) {
          console.warn(`[REGISTRATION] verifyOtp (${channel}) error:`, err?.status ?? err?.message);
        }
        return of({
          success: false,
          verified: false,
          errorMessage: this.extractErrorMsg(err),
        } as VerifyOtpResult);
      })
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // 5. REGISTER ACCOUNT (final step — existing /user endpoint, extended)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Create the account via the existing B2B `/user` endpoint (multipart/form-data).
   * The endpoint already supports name, email, phone, company, GST, PAN, password.
   * We add 2 new fields that the backend will validate:
   *   - mobileVerificationToken
   *   - emailVerificationToken
   * When the backend hasn't added those fields yet, they'll be silently ignored
   * and the registration will still succeed based on the current validation.
   */
  registerAccount(payload: RegisterPayload): Observable<RegisterResult> {
    // Use application/x-www-form-urlencoded (NOT multipart/form-data).
    // Alpha's PHP proxy reads the body via php://input; multipart is auto-parsed
    // by PHP into $_POST and php://input returns empty — body never reaches
    // the upstream backend and validation fails ("Please enter your name").
    // URL-encoded body survives the proxy intact, like every other B2B endpoint.
    const body: Record<string, string> = {
      referer: location.hostname + '/',
      userName: `${payload.firstName} ${payload.lastName}`.trim(),
      userEmail: payload.email,
      userPhone: payload.mobile,
      countryCode: payload.countryCode,
      agentCompanyName: payload.companyName,
      agentCompanyAddress: payload.companyAddress,
      agentPAN: payload.panNumber,
      agentGST: payload.gstNumber ?? '',
      password: payload.password,
      // City/state extracted from place_id API (autocomplete path) or GST address
      agentCity: payload.agentCity || '',
      agentState: payload.agentState || '',
      agentcityId: String(payload.agentCityId || 0),
      agentLogo: '',
      asAgent: '0',
      agentLocalCommission: '5',
      agentAirportCommission: '5',
      agentOutstationCommission: '5',
      clienttip: '',
      isAgent: 'true',
    };

    // New fields — ignored by backend until the extension ships, then validated
    if (payload.mobileVerificationToken) {
      body['mobileVerificationToken'] = payload.mobileVerificationToken;
    }
    if (payload.emailVerificationToken) {
      body['emailVerificationToken'] = payload.emailVerificationToken;
    }

    return this.api.b2bPostForm<any>('user', body).pipe(
      map(response => {
        if (response?.statusCode === 200 || response?.status === 'success' || response?.status === true) {
          const data = response?.data ?? response;
          return {
            success: true,
            userId: data?.userId ?? data?.user_id,
            message: response?.message ?? 'Account created successfully',
          } as RegisterResult;
        }
        return {
          success: false,
          message: response?.message ?? 'Registration failed. Please try again.',
          errorCode: response?.errorCode ?? response?.error_code,
        } as RegisterResult;
      }),
      catchError(err => {
        if (!environment.production) {
          console.warn('[REGISTRATION] registerAccount API error:', err?.status ?? err?.message, err?.error);
        }
        return of({
          success: false,
          message: err?.error?.message ?? err?.message ?? 'Registration failed. Please try again.',
        } as RegisterResult);
      })
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Parse a 200 OK send-otp response into a simple ok/error shape.
   * Backend wraps: { status: "success", data: { success: true, msg: "..." } }
   * Doc shape:     { success: true, msg: "..." }
   * Handles both.
   */
  private parseSendResponse(res: any): { ok: boolean; error: string } {
    const inner = res?.data ?? res;
    const isOk = inner?.success === true || res?.status === 'success';
    if (isOk) return { ok: true, error: '' };
    return { ok: false, error: inner?.msg || res?.msg || 'Failed to send OTP' };
  }

  /**
   * Extract a user-facing error message from an HTTP error response.
   * Handles the backend's two error shapes:
   *   { success: false, msg: "..." }
   *   { success: false, errors: ["...", "..."] }
   */
  private extractErrorMsg(err: any): string {
    const body = err?.error || {};
    if (body.msg) return body.msg;
    // Backend wraps errors as object: { errors: { success: false, msg: "..." } }
    if (body.errors && !Array.isArray(body.errors) && body.errors.msg) return body.errors.msg;
    if (Array.isArray(body.errors) && body.errors.length) return body.errors.join(', ');
    return err?.message || 'Something went wrong. Please try again.';
  }

  /** Build a SendOtpResult representing a successful send (used by both
   *  bulk and resend paths once the underlying API call succeeds). */
  private buildSendOtpSuccess(): SendOtpResult {
    return {
      success: true,
      mobileOtpSent: true,
      emailOtpSent: true,
      expiresInSeconds: 300, // 5 minutes per backend spec
    };
  }
}
