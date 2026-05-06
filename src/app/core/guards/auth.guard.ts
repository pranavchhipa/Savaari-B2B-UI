import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Auth guard — redirects to landing when the user is not authenticated.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  console.warn('[AuthGuard] Not authenticated, redirecting to /');
  router.navigate(['/'], { replaceUrl: true });
  return false;
};
