import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';

/**
 * Components that want to intercept navigation away from the payment screen
 * implement this. Returning false / an Observable<false> blocks the
 * navigation; the component is responsible for any UI (e.g. opening the
 * Price Proposal modal) and for re-triggering navigation once the user
 * makes a choice.
 */
export interface CanExitPayment {
    canExitPayment(): boolean | Observable<boolean>;
}

export const paymentExitGuard: CanDeactivateFn<CanExitPayment> = (component) => {
    if (!component || typeof component.canExitPayment !== 'function') return true;
    return component.canExitPayment();
};
