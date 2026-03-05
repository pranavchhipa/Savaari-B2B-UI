import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { switchMap, catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Angular 21 functional HTTP interceptor for Savaari API authentication.
 *
 * - Skips the authenticate.php endpoint itself (prevents circular calls)
 * - If a valid token exists, attaches it as a Bearer header AND as a query/body param
 * - If no valid token exists, authenticates first then retries the original request
 * - On 401 response: re-authenticates and retries the request once
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authService = inject(AuthService);

  // Never intercept the auth endpoint itself
  if (req.url.includes('authenticate.php')) {
    return next(req);
  }

  // If token is valid, attach it and proceed
  if (authService.isTokenValid()) {
    return next(addToken(req, authService.getToken()!)).pipe(
      catchError(error => handle401(error, req, next, authService))
    );
  }

  // No valid token -- authenticate first, then retry the original request
  return authService.authenticate().pipe(
    switchMap(token => next(addToken(req, token))),
    catchError(error => handle401(error, req, next, authService))
  );
};

/**
 * Clone the request with the Bearer token attached.
 *
 * The token is added as an Authorization header. Some Savaari GET endpoints
 * also require the token as a query parameter -- individual services handle
 * that by including `token` in their params.
 */
function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * If we get a 401, re-authenticate and retry the request once.
 * Any other error is passed through.
 */
function handle401(
  error: unknown,
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService
) {
  if (error instanceof HttpErrorResponse && error.status === 401) {
    console.warn('[SAVAARI-AUTH] 401 received, re-authenticating...');
    authService.clearToken();
    return authService.authenticate().pipe(
      switchMap(token => next(addToken(req, token)))
    );
  }
  return throwError(() => error);
}
