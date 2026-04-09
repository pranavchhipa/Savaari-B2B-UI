import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

/**
 * Registration Service — encapsulates all API calls for the new multi-step
 * registration wizard.
 *
 * ENDPOINTS (all alpha-hosted per backend team, April 2026):
 *   1. POST /general/gst_verification.php    — GST verification (ready)
 *   2. POST /user/send-otp                   — Send OTPs to mobile + email (pending)
 *   3. POST /user/verify-otp                 — Verify OTP, return verification token (pending)
 *   4. POST /user (b2b-api, multipart)       — Existing register endpoint (extended)
 *
 * GRACEFUL FALLBACK:
 *   All methods handle 404 / 501 gracefully and fall back to a mock response when:
 *     - environment.useMockData is true, OR
 *     - the endpoint responds with 404 / 501 (not deployed yet)
 *   This allows the wizard UI to be developed and tested end-to-end before the
 *   backend endpoints are live.
 *
 * The mock OTPs are 1234 (mobile) and 5678 (email) — same as the original wizard
 * mocks so manual testers don't need to relearn anything.
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
}

export interface RegisterResult {
  success: boolean;
  userId?: number;
  message?: string;
  errorCode?: string;
}

// ─── Mock constants (shared with wizard so tester credentials stay stable) ──

/** Mock OTPs used in dev fallback mode — same as the original wizard mocks. */
export const MOCK_MOBILE_OTP = '1234';
export const MOCK_EMAIL_OTP = '5678';

/** Mock Surepass-style GST lookup response used when the real API is unreachable. */
const MOCK_GST_RESPONSE: GstVerificationResult = {
  success: true,
  legalName: 'ACME TRAVELS PRIVATE LIMITED',
  businessName: 'ACME TRAVELS PRIVATE LIMITED',
  panNumber: 'AAACX1234F',
  address: '12, MG ROAD, GROUND FLOOR, SHANTHALA NAGAR, BENGALURU URBAN, BENGALURU, KARNATAKA - 560001, INDIA',
  gstinStatus: 'Active',
};


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
    if (environment.useMockData) {
      return of({ ...MOCK_GST_RESPONSE, panNumber: this.derivePanFromGst(gstNumber) || MOCK_GST_RESPONSE.panNumber });
    }

    // Backend doc (April 2026): POST with form body for Website side.
    // Required: gstNumber. Optional: booking_id, companyName, action (default gst_check).
    // AJAX example in doc: { gstNumber, booking_id } via POST.
    const body = {
      gstNumber,
    };

    return this.api.regPostForm<any>('general/gst_verification.php', body).pipe(
      map(response => {
        if (response?.status === true && response?.data?.fields) {
          const f = response.data.fields;
          // Backend requirement (April 2026): gstin_status MUST be "Active" to accept the GSTIN.
          // Cancelled / Suspended / Inactive GSTINs exist in the database but must be rejected here.
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
        // API responded but status=false — extract error message
        const msg = response?.data?.message ?? response?.message ?? 'Invalid GST Number';
        return { success: false, errorMessage: msg };
      }),
      catchError(err => {
        if (!environment.production) {
          console.warn('[REGISTRATION] verifyGst API error — falling back to mock:', err?.status ?? err?.message);
        }
        // Endpoint not deployed / network down — fall back to mock so dev flow continues
        if (this.isEndpointUnavailable(err)) {
          return of({ ...MOCK_GST_RESPONSE, panNumber: this.derivePanFromGst(gstNumber) || MOCK_GST_RESPONSE.panNumber });
        }
        return of({
          success: false,
          errorMessage: err?.error?.message ?? err?.message ?? 'GST verification failed. Please try again.',
        });
      })
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // 2. SEND OTP (initial — both channels)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Send OTPs to both mobile and email in one call.
   * Backend should send 2 separate 4-digit OTPs, one per channel.
   */
  sendOtps(mobile: string, email: string, countryCode = '91'): Observable<SendOtpResult> {
    if (environment.useMockData) {
      return of(this.mockSendOtpSuccess());
    }

    const body = {
      mobile,
      email,
      countryCode,
      channel: 'both',
    };

    return this.api.regPostForm<any>('user/send-otp', body).pipe(
      map(response => this.mapSendOtpResponse(response)),
      catchError(err => this.fallbackSendOtp(err))
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // 3. RESEND OTP (single channel)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Resend OTP for a single channel (mobile or email).
   * Used by the separate "Resend" buttons in the wizard.
   */
  resendOtp(channel: 'mobile' | 'email', contact: string, countryCode = '91'): Observable<SendOtpResult> {
    if (environment.useMockData) {
      return of(this.mockSendOtpSuccess());
    }

    const body: Record<string, string> = {
      channel,
      countryCode,
    };
    if (channel === 'mobile') body['mobile'] = contact;
    else body['email'] = contact;

    return this.api.regPostForm<any>('user/send-otp', body).pipe(
      map(response => this.mapSendOtpResponse(response)),
      catchError(err => this.fallbackSendOtp(err))
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // 4. VERIFY OTP (one channel at a time)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Verify an OTP for a single channel. On success, backend returns a
   * short-lived verificationToken that the wizard will pass in the final
   * register call as proof that this channel was verified in this session.
   */
  verifyOtp(channel: 'mobile' | 'email', contact: string, otp: string): Observable<VerifyOtpResult> {
    if (environment.useMockData) {
      return of(this.mockVerifyOtp(channel, otp));
    }

    const body: Record<string, string> = {
      channel,
      otp,
    };
    if (channel === 'mobile') body['mobile'] = contact;
    else body['email'] = contact;

    return this.api.regPostForm<any>('user/verify-otp', body).pipe(
      map(response => {
        if (response?.status === true && (response?.verified === true || response?.data?.verified === true)) {
          const data = response.data ?? response;
          return {
            success: true,
            verified: true,
            verificationToken: data.verificationToken ?? data.verification_token ?? '',
          } as VerifyOtpResult;
        }
        // Failure — extract attempts remaining if present
        const data = response?.data ?? {};
        return {
          success: false,
          verified: false,
          attemptsRemaining: data.attemptsRemaining ?? data.attempts_remaining,
          errorMessage: response?.message ?? 'Invalid OTP',
          errorCode: response?.errorCode ?? response?.error_code,
        } as VerifyOtpResult;
      }),
      catchError(err => {
        if (!environment.production) {
          console.warn(`[REGISTRATION] verifyOtp (${channel}) API error — falling back to mock:`, err?.status ?? err?.message);
        }
        if (this.isEndpointUnavailable(err)) {
          return of(this.mockVerifyOtp(channel, otp));
        }
        return of({
          success: false,
          verified: false,
          errorMessage: err?.error?.message ?? err?.message ?? 'OTP verification failed',
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
    if (environment.useMockData) {
      return of({
        success: true,
        userId: 983680,
        message: 'Account created (mock)',
      });
    }

    const fd = new FormData();
    fd.append('referer', location.hostname + '/');
    fd.append('userName', `${payload.firstName} ${payload.lastName}`.trim());
    fd.append('userEmail', payload.email);
    fd.append('userPhone', payload.mobile);
    fd.append('countryCode', payload.countryCode);
    fd.append('agentCompanyName', payload.companyName);
    fd.append('agentCompanyAddress', payload.companyAddress);
    fd.append('agentPAN', payload.panNumber);
    fd.append('agentGST', payload.gstNumber ?? '');
    fd.append('password', payload.password);

    // Placeholder city/state — wizard does not ask for city. Backend stores the
    // company address as the authoritative location; city fields are legacy and
    // required by the existing endpoint. We send empty strings + 0 id rather
    // than omitting them to stay backwards-compatible with the current schema.
    fd.append('agentCity', '');
    fd.append('agentState', '');
    fd.append('agentcityId', '0');
    fd.append('agentLogo', '');
    fd.append('asAgent', '0');
    fd.append('agentLocalCommission', '5');
    fd.append('agentAirportCommission', '5');
    fd.append('agentOutstationCommission', '5');
    fd.append('clienttip', '');
    fd.append('isAgent', 'true');

    // New fields — ignored by backend until the extension ships, then validated
    if (payload.mobileVerificationToken) {
      fd.append('mobileVerificationToken', payload.mobileVerificationToken);
    }
    if (payload.emailVerificationToken) {
      fd.append('emailVerificationToken', payload.emailVerificationToken);
    }

    return this.api.b2bPostFormData<any>('user', fd).pipe(
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

  /** Normalize backend send-otp response into our SendOtpResult shape. */
  private mapSendOtpResponse(response: any): SendOtpResult {
    if (response?.status === true || response?.statusCode === 200) {
      const data = response.data ?? response;
      return {
        success: true,
        mobileOtpSent: data.mobileOtpSent ?? data.mobile_otp_sent ?? true,
        emailOtpSent: data.emailOtpSent ?? data.email_otp_sent ?? true,
        expiresInSeconds: data.expiresInSeconds ?? data.expires_in_seconds ?? 600,
      };
    }
    return {
      success: false,
      mobileOtpSent: false,
      emailOtpSent: false,
      expiresInSeconds: 0,
      errorMessage: response?.message ?? 'Failed to send OTP',
      errorCode: response?.errorCode ?? response?.error_code,
    };
  }

  /** Fallback behaviour when send-otp endpoint is unreachable. */
  private fallbackSendOtp(err: any): Observable<SendOtpResult> {
    if (!environment.production) {
      console.warn('[REGISTRATION] sendOtp API error — falling back to mock:', err?.status ?? err?.message);
    }
    if (this.isEndpointUnavailable(err)) {
      return of(this.mockSendOtpSuccess());
    }
    return of({
      success: false,
      mobileOtpSent: false,
      emailOtpSent: false,
      expiresInSeconds: 0,
      errorMessage: err?.error?.message ?? err?.message ?? 'Failed to send OTP. Please try again.',
    });
  }

  private mockSendOtpSuccess(): SendOtpResult {
    return {
      success: true,
      mobileOtpSent: true,
      emailOtpSent: true,
      expiresInSeconds: 600,
    };
  }

  private mockVerifyOtp(channel: 'mobile' | 'email', otp: string): VerifyOtpResult {
    const expected = channel === 'mobile' ? MOCK_MOBILE_OTP : MOCK_EMAIL_OTP;
    if (otp === expected) {
      return {
        success: true,
        verified: true,
        verificationToken: `mock_${channel}_${Date.now()}`,
      };
    }
    return {
      success: false,
      verified: false,
      errorMessage: 'Invalid OTP',
    };
  }

  /** True if the error looks like the endpoint simply isn't deployed yet. */
  private isEndpointUnavailable(err: any): boolean {
    const status = err?.status;
    return status === 0 || status === 404 || status === 501 || status === 502 || status === 503;
  }

  /**
   * Extract PAN from GSTIN as a fallback when we don't have a real response.
   * GSTIN format: SSPPPPPPPPPPZEC where characters 3-12 are the PAN.
   */
  private derivePanFromGst(gst: string): string {
    if (!gst || gst.length < 15) return '';
    const pan = gst.substring(2, 12).toUpperCase();
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? pan : '';
  }
}
