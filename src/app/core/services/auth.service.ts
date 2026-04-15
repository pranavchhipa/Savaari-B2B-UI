import { Injectable, inject } from '@angular/core';
import { Observable, of, tap, switchMap, map, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiService } from './api.service';
import { LoginRequest, LoginResponse, UserProfile, UserGst, WebTokenResponse } from '../models/auth.model';


/**
 * Manages authentication for the Savaari B2B portal.
 *
 * Login flow (matches live b2bcab.in):
 *  1. POST /user/login → B2B RSA token + user profile
 *  2. GET  /auth/webtoken → Partner HMAC token (no auth required)
 *  3. Both tokens stored in localStorage and used as ?token= query params
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);

  private static readonly STORAGE_B2B_TOKEN = 'loginUserToken';
  private static readonly STORAGE_PARTNER_TOKEN = 'SavaariToken';
  private static readonly STORAGE_USER = 'loggedUserDetail';
  private static readonly STORAGE_GST = 'userGst';

  // In-memory cache (populated from localStorage on init)
  private b2bToken: string | null = null;
  private partnerToken: string | null = null;
  private user: UserProfile | null = null;
  private userGst: UserGst | null = null;

  constructor() {
    this.loadFromStorage();
  }

  /** Full login: calls login API then fetches partner token. */
  login(email: string, password: string): Observable<UserProfile> {
    const body: LoginRequest = { userEmail: email, password, isAgent: true };

    // Beta site HAR (FLOW.md): login body is raw JSON sent as Content-Type: text/plain.
    // application/json works for simple passwords but silently rejects when the
    // password contains special chars like '@' — backend's JSON parser differs
    // from how it reads the text/plain body. Matching the HAR-confirmed behavior.
    return this.api.b2bPostRaw<LoginResponse>('user/login', JSON.stringify(body), 'text/plain').pipe(
      tap(resp => {
        if (resp.statusCode !== 200) throw new Error(resp.message || 'Login failed');
        // Clear any stale per-user state left over from a previous session on
        // this browser (e.g. agent logged out without clicking Logout, or a
        // different agent is signing in on a shared device). Without this,
        // the booking registry leaks the previous user's bookings into the
        // new user's "Upcoming" list and reveals their customer PII.
        this.clearUserScopedStorage();
        this.b2bToken = resp.token;
        this.user = resp.user;
        this.userGst = resp.userGst || null;
        localStorage.setItem(AuthService.STORAGE_B2B_TOKEN, resp.token);
        localStorage.setItem(AuthService.STORAGE_USER, JSON.stringify(resp.user));
        if (resp.userGst) localStorage.setItem(AuthService.STORAGE_GST, JSON.stringify(resp.userGst));
        if (!environment.production) console.log('[AUTH] B2B token obtained for', resp.user.email);
      }),
      switchMap(() => this.fetchPartnerToken()),
      map(() => this.user!)
    );
  }

  /**
   * Auto-login with stored token (session restore).
   * POST /user/autologin → api23.betasavaari.com
   * Body: { userEmail, logintoken, isAgent: true }
   * Content-Type: text/plain (confirmed from Postman)
   */
  autoLogin(): Observable<UserProfile | null> {
    if (!this.b2bToken || !this.user?.email) return of(null);

    return this.api.b2bPostRaw<LoginResponse>('user/autologin', JSON.stringify({
      userEmail: this.user.email,
      logintoken: this.b2bToken,
      isAgent: true,
    }), 'text/plain').pipe(
      tap(resp => {
        if (resp.statusCode === 200 && resp.token) {
          this.b2bToken = resp.token;
          this.user = resp.user;
          this.userGst = resp.userGst || null;
          localStorage.setItem(AuthService.STORAGE_B2B_TOKEN, resp.token);
          localStorage.setItem(AuthService.STORAGE_USER, JSON.stringify(resp.user));
          if (resp.userGst) localStorage.setItem(AuthService.STORAGE_GST, JSON.stringify(resp.userGst));
          if (!environment.production) console.log('[AUTH] Auto-login successful for', resp.user.email);
        }
      }),
      switchMap(() => this.fetchPartnerToken()),
      map(() => this.user),
      catchError(err => {
        console.warn('[AUTH] Auto-login failed:', err?.status ?? err?.message);
        return of(null);
      })
    );
  }

  /**
   * Forgot password — sends a freshly-generated password to the agent's
   * registered email address. Matches the legacy b2bbetasavaari flow:
   *   POST /partner_api/public/forgot_password?token=<partnerJWT>
   *   Body: user_email=<email>&is_agent=1  (application/x-www-form-urlencoded)
   *   Response: { status: "success", data: "{\"passwordsend\":true}" }
   *
   * Partner token is fetched on-demand (the user is not yet logged in).
   * Backend emails a new password directly — no OTP, no reset link.
   */
  forgotPassword(email: string): Observable<{ success: boolean; message: string }> {
    const ensureToken$: Observable<string> = this.partnerToken
      ? of(this.partnerToken)
      : this.fetchPartnerToken();

    return ensureToken$.pipe(
      switchMap(token =>
        this.api.partnerPostForm<any>(
          'forgot_password',
          { user_email: email, is_agent: '1' },
          { token }
        )
      ),
      map(resp => {
        // Response shape: { status: "success", data: "{\"passwordsend\":true}" }
        // `data` is a JSON-encoded string — parse defensively.
        let dataObj: any = resp?.data;
        if (typeof dataObj === 'string') {
          try { dataObj = JSON.parse(dataObj); } catch { /* keep as string */ }
        }
        const sent = dataObj?.passwordsend === true || dataObj?.passwordsend === 'true';
        if (resp?.status === 'success' && sent) {
          return {
            success: true,
            message: 'A new password has been sent to your email address.',
          };
        }
        return {
          success: false,
          message: resp?.message || dataObj?.message || 'Email not registered. Please check and try again.',
        };
      }),
      catchError(err => {
        if (!environment.production) console.warn('[AUTH] forgotPassword failed:', err?.status ?? err?.message);
        // Prefer a user-facing message from the response body; fall back to a
        // status-aware default. Never surface the raw "Http failure response..."
        // string — it leaks the internal URL and scares the user.
        const body = err?.error;
        const bodyMsg =
          (body && typeof body === 'object' && (body.message || body.msg)) ||
          (body?.data && typeof body.data === 'object' && (body.data.message || body.data.msg)) ||
          '';
        const status = err?.status;
        const friendly =
          bodyMsg ||
          (status === 400 || status === 404
            ? 'Email not registered. Please check and try again.'
            : 'Could not send reset email. Please try again later.');
        return of({ success: false, message: friendly });
      })
    );
  }

  /**
   * Fetch the Partner HMAC token (GET /auth/webtoken, no auth required).
   * Also calls /date_time for server time sync (confirmed from Postman).
   */
  fetchPartnerToken(): Observable<string> {
    return this.api.partnerGetNoParams<WebTokenResponse>('auth/webtoken').pipe(
      tap(resp => {
        this.partnerToken = resp.data.token;
        localStorage.setItem(AuthService.STORAGE_PARTNER_TOKEN, resp.data.token);
        if (!environment.production) console.log('[AUTH] Partner token obtained');
      }),
      // Also fetch server date_time (non-blocking, for time sync)
      tap(() => {
        this.api.partnerGetNoParams<any>('date_time').subscribe({
          next: dt => {
            if (!environment.production) console.log('[AUTH] Server time:', dt);
          },
          error: () => {} // Ignore date_time errors
        });
      }),
      map(resp => resp.data.token)
    );
  }

  /** Clear all auth state and localStorage. */
  logout(): void {
    this.b2bToken = null;
    this.partnerToken = null;
    this.user = null;
    this.userGst = null;
    localStorage.removeItem(AuthService.STORAGE_B2B_TOKEN);
    localStorage.removeItem(AuthService.STORAGE_PARTNER_TOKEN);
    localStorage.removeItem(AuthService.STORAGE_USER);
    localStorage.removeItem(AuthService.STORAGE_GST);
    localStorage.removeItem('commission');
    localStorage.removeItem('commission_amt');
    this.clearUserScopedStorage();
    console.log('[AUTH] Logged out');
  }

  /**
   * Wipe per-user cached data that is NOT part of the auth payload but still
   * belongs to the signed-in agent. Called from both `login()` (before
   * applying new tokens) and `logout()` so the next user never inherits the
   * previous one's booking registry, settled-payment state, or logo.
   *
   * Keys intentionally NOT cleared here:
   *   - `theme`                 — UI preference, device-level
   *   - `SavaariUserDeviceID`   — device fingerprint, not per-user
   */
  private clearUserScopedStorage(): void {
    try {
      localStorage.removeItem('savaari_b2b_booking_ids');
      localStorage.removeItem('savaari_b2b_booking_data');
      localStorage.removeItem('b2b_settled_payments');
      localStorage.removeItem('agentLogo');
      localStorage.removeItem('b2bcab.pendingLogin');
      localStorage.removeItem('b2b_analytics_session');
    } catch (e) {
      console.warn('[AUTH] Failed to clear user-scoped storage:', e);
    }
  }

  /** Get the partner API token (HMAC HS512). */
  getPartnerToken(): string | null {
    return this.partnerToken;
  }

  /** Get the B2B API token (RSA RS256). */
  getB2bToken(): string | null {
    return this.b2bToken;
  }

  /** Get the logged-in user's email. */
  getUserEmail(): string {
    return this.user?.email ?? '';
  }

  /** Get the logged-in user's profile. */
  getUserProfile(): UserProfile | null {
    return this.user;
  }

  /** Get the agent ID (numeric user_id). */
  getAgentId(): string {
    return String(this.user?.user_id ?? '');
  }

  /** Get the agent's GST details (from login response). */
  getUserGst(): UserGst | null {
    return this.userGst;
  }

  /** Get the agent's GST number (empty string if not set). */
  getGstNumber(): string {
    return this.userGst?.gst_number || '';
  }

  /** Update the cached GST number (after profile save). */
  setGstNumber(gst: string): void {
    if (!this.userGst) {
      this.userGst = { user_id: String(this.user?.user_id ?? ''), gst_number: gst, pan_number: '', company_logo: '', is_agent: '1' };
    } else {
      this.userGst.gst_number = gst;
    }
    localStorage.setItem(AuthService.STORAGE_GST, JSON.stringify(this.userGst));
  }

  /** Check if the user is authenticated (has both tokens). */
  isAuthenticated(): boolean {
    return !!this.b2bToken && !!this.partnerToken;
  }

  // Legacy compatibility
  getToken(): string | null { return this.getPartnerToken(); }
  isTokenValid(): boolean { return !!this.getPartnerToken(); }
  clearToken(): void { this.logout(); }
  clearTokens(): void { this.logout(); }

  setPartnerToken(token: string): void {
    this.partnerToken = token;
    localStorage.setItem(AuthService.STORAGE_PARTNER_TOKEN, token);
  }

  setB2bToken(token: string, email: string): void {
    this.b2bToken = token;
    localStorage.setItem(AuthService.STORAGE_B2B_TOKEN, token);
  }

  authenticate(): Observable<string> {
    if (this.partnerToken) return of(this.partnerToken);
    return this.fetchPartnerToken();
  }

  /** Load persisted tokens from localStorage on startup. */
  private loadFromStorage(): void {
    try {
      this.b2bToken = localStorage.getItem(AuthService.STORAGE_B2B_TOKEN);
      this.partnerToken = localStorage.getItem(AuthService.STORAGE_PARTNER_TOKEN);
      const userJson = localStorage.getItem(AuthService.STORAGE_USER);
      if (userJson) this.user = JSON.parse(userJson);
      const gstJson = localStorage.getItem(AuthService.STORAGE_GST);
      if (gstJson) this.userGst = JSON.parse(gstJson);
      if (this.b2bToken && !environment.production) console.log('[AUTH] Restored session for', this.user?.email);
    } catch {
      console.warn('[AUTH] Failed to restore session from localStorage');
    }
  }
}
