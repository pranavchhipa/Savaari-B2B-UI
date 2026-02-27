import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { BookingStateService } from '../services/booking-state.service';
import { map } from 'rxjs';

/**
 * Hardcore Navigation Guard
 * Prevents access to checkout if itinerary or car is missing.
 */
export const bookingGuard: CanActivateFn = () => {
    const router = inject(Router);
    const bookingState = inject(BookingStateService);

    return bookingState.currentItinerary$.pipe(
        map(itinerary => {
            if (!itinerary || !itinerary.fromCity || !itinerary.toCity) {
                console.warn('[BookingGuard] Access denied: Missing itinerary.');
                router.navigate(['/dashboard']);
                return false;
            }
            return true;
        })
    );
};
