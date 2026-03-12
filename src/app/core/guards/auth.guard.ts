import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

/**
 * Auth guard — redirects to /login if not authenticated.
 * Bypassed when useMockData is true.
 */
export const authGuard: CanActivateFn = () => {
  if (environment.useMockData) return true;

  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  console.warn('[AuthGuard] Not authenticated, redirecting to /');
  router.navigate(['/'], { replaceUrl: true });
  return false;
};
