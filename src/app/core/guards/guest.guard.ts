import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

/**
 * Guest guard — redirects to /dashboard if already authenticated.
 * Used on landing, login, and register pages.
 *
 * In mock mode, always allow access to landing/login/register
 * so the full flow can be demoed (landing → login → dashboard).
 */
export const guestGuard: CanActivateFn = () => {
  // Mock mode: always show guest pages (landing, login, register)
  if (environment.useMockData) {
    return true;
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    router.navigate(['/dashboard'], { replaceUrl: true });
    return false;
  }

  return true;
};
