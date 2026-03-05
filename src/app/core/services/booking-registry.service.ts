import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { BookingApiService } from './booking-api.service';
import { BookingDetails } from '../models';

/**
 * Tracks booking IDs locally in localStorage.
 *
 * The Savaari API has no "list all bookings" endpoint --
 * only get-by-ID. This service maintains the list of booking IDs
 * so we can fetch their details individually.
 */
@Injectable({ providedIn: 'root' })
export class BookingRegistryService {
  private readonly STORAGE_KEY = 'savaari_b2b_booking_ids';

  /** Add a new booking ID to the registry. */
  addBookingId(bookingId: string): void {
    const ids = this.getBookingIds();
    if (!ids.includes(bookingId)) {
      ids.unshift(bookingId); // newest first
      this.saveBookingIds(ids);
    }
  }

  /** Remove a booking ID from the registry (e.g. after cancellation). */
  removeBookingId(bookingId: string): void {
    const ids = this.getBookingIds().filter(id => id !== bookingId);
    this.saveBookingIds(ids);
  }

  /** Get all stored booking IDs. */
  getBookingIds(): string[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch details for all stored bookings.
   * Returns an array of BookingDetails (failed fetches are filtered out).
   */
  fetchAllBookingDetails(bookingApi: BookingApiService): Observable<BookingDetails[]> {
    const ids = this.getBookingIds();
    if (ids.length === 0) return of([]);

    return forkJoin(
      ids.map(id =>
        bookingApi.getBookingDetails(id).pipe(
          catchError(() => of(null)) // Skip failed fetches
        )
      )
    ).pipe(
      map(results => results.filter((b): b is BookingDetails => b !== null))
    );
  }

  private saveBookingIds(ids: string[]): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(ids));
      } catch (e) {
        console.error('[BookingRegistry] Failed to save booking IDs:', e);
      }
    }
  }
}
