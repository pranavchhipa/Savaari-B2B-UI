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
    if (environment.useMockData) {
      const mockUser: UserProfile = {
        user_id: 983680, email: 'mock@savaari.com', firstname: 'Mock', lastname: 'User',
        phone: '1234567890', mobileno: '911234567890', companyname: 'Mock Corp',
        is_agent: 1, user_type: 2, user_subtype: 1, travel_partner_type: 1,
        user_active: 1, billingaddress: 'Mock', city: 'Bangalore', title: 'Mr.'
      };
      this.b2bToken = 'MOCK_B2B_TOKEN';
      this.partnerToken = 'MOCK_PARTNER_TOKEN';
      this.user = mockUser;
      this.userGst = { user_id: '983680', gst_number: '27AABCU9603R1ZM', pan_number: 'AABCU9603R', company_logo: '', is_agent: '1' };
      return of(mockUser);
    }

    const body: LoginRequest = { userEmail: email, password, isAgent: true };

    return this.api.b2bPost<LoginResponse>('user/login', body).pipe(
      tap(resp => {
        if (resp.statusCode !== 200) throw new Error(resp.message || 'Login failed');
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
    if (environment.useMockData) return of(this.user);
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
   * Fetch the Partner HMAC token (GET /auth/webtoken, no auth required).
   * Also calls /date_time for server time sync (confirmed from Postman).
   */
  fetchPartnerToken(): Observable<string> {
    if (environment.useMockData) return of('MOCK_PARTNER_TOKEN');

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
    console.log('[AUTH] Logged out');
  }

  /** Get the partner API token (HMAC HS512). */
  getPartnerToken(): string | null {
    if (environment.useMockData) return 'MOCK_PARTNER_TOKEN';
    return this.partnerToken;
  }

  /** Get the B2B API token (RSA RS256). */
  getB2bToken(): string | null {
    if (environment.useMockData) return 'MOCK_B2B_TOKEN';
    return this.b2bToken;
  }

  /** Get the logged-in user's email. */
  getUserEmail(): string {
    if (environment.useMockData) return 'mock@savaari.com';
    return this.user?.email ?? '';
  }

  /** Get the logged-in user's profile. */
  getUserProfile(): UserProfile | null {
    return this.user;
  }

  /** Get the agent ID (numeric user_id). */
  getAgentId(): string {
    if (environment.useMockData) return '983680';
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
    if (environment.useMockData) return true;
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
    if (environment.useMockData) return of('MOCK_PARTNER_TOKEN');
    if (this.partnerToken) return of(this.partnerToken);
    return this.fetchPartnerToken();
  }

  /** Load persisted tokens from localStorage on startup. */
  private loadFromStorage(): void {
    if (environment.useMockData) return;
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
