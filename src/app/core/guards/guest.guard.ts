import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guest guard — redirects to /dashboard if already authenticated.
 * Used on landing, login, and register pages.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    router.navigate(['/dashboard'], { replaceUrl: true });
    return false;
  }

  return true;
};
