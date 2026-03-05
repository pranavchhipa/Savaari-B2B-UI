import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { tap, map, shareReplay, finalize, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthResponse } from '../models';

/**
 * Manages authentication with the Savaari Partner API.
 *
 * - Calls POST /authenticate.php with apiKey + appId
 * - Caches the Bearer token in memory
 * - Tracks token expiry and refreshes proactively
 * - Used by the auth interceptor -- other services never touch this directly
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private token: string | null = null;
  private tokenExpiry = 0;
  private refreshInProgress$: Observable<string> | null = null;

  // Default token lifetime if the API doesn't return expiresIn (1 hour)
  private readonly DEFAULT_TOKEN_LIFETIME_S = 3600;

  constructor(private http: HttpClient) {}

  /**
   * Authenticate with the Savaari API and obtain a Bearer token.
   * If a request is already in flight, returns the same observable
   * (prevents concurrent duplicate auth requests).
   */
  authenticate(): Observable<string> {
    if (environment.useMockData) {
      this.token = 'MOCK_TOKEN_FOR_DEVELOPMENT';
      this.tokenExpiry = Date.now() + this.DEFAULT_TOKEN_LIFETIME_S * 1000;
      return of(this.token);
    }

    if (this.refreshInProgress$) {
      return this.refreshInProgress$;
    }

    const body = new HttpParams()
      .set('apiKey', environment.apiKey)
      .set('appId', environment.appId);

    this.refreshInProgress$ = this.http.post<AuthResponse>(
      `${environment.apiBaseUrl}/authenticate.php`,
      body.toString(),
      {
        headers: new HttpHeaders({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      }
    ).pipe(
      tap(response => {
        this.token = response.token;
        const lifetimeS = response.expiresIn ?? this.DEFAULT_TOKEN_LIFETIME_S;
        this.tokenExpiry = Date.now() + lifetimeS * 1000;
        console.log('[SAVAARI-AUTH] Token obtained, expires in', lifetimeS, 'seconds');
      }),
      map(response => response.token),
      shareReplay(1),
      finalize(() => {
        this.refreshInProgress$ = null;
      }),
      catchError(err => {
        console.error('[SAVAARI-AUTH] Authentication failed:', err);
        this.refreshInProgress$ = null;
        return throwError(() => err);
      })
    );

    return this.refreshInProgress$;
  }

  /** Get the current cached token (may be null if not yet authenticated). */
  getToken(): string | null {
    return this.token;
  }

  /** Check if the token is valid and not about to expire. */
  isTokenValid(): boolean {
    return (
      !!this.token &&
      Date.now() < this.tokenExpiry - environment.tokenRefreshBufferMs
    );
  }

  /** Clear the cached token (e.g. on logout). */
  clearToken(): void {
    this.token = null;
    this.tokenExpiry = 0;
  }
}
