import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { BookingApiService } from './booking-api.service';
import { BookingDetails } from '../models';

/**
 * Tracks bookings locally in localStorage.
 *
 * Stores full booking data from the create-booking API response so that
 * new bookings appear in the "Upcoming" list immediately — even when the
 * B2B listing API hasn't synced yet (common on beta servers).
 */
@Injectable({ providedIn: 'root' })
export class BookingRegistryService {
  private readonly STORAGE_KEY = 'savaari_b2b_booking_ids';
  private readonly DATA_KEY = 'savaari_b2b_booking_data';

  /** Add a new booking ID to the registry. */
  addBookingId(bookingId: string): void {
    const ids = this.getBookingIds();
    if (!ids.includes(bookingId)) {
      ids.unshift(bookingId); // newest first
      this.saveBookingIds(ids);
    }
  }

  /** Store full booking data from the create-booking API response. */
  storeBookingData(bookingId: string, data: any): void {
    if (!bookingId) return;
    try {
      const all = this.getAllStoredData();
      all[bookingId] = { ...data, _storedAt: new Date().toISOString() };
      localStorage.setItem(this.DATA_KEY, JSON.stringify(all));
    } catch (e) {
      console.error('[BookingRegistry] Failed to store booking data:', e);
    }
  }

  /** Get stored booking data for a specific ID. */
  getStoredBookingData(bookingId: string): any | null {
    const all = this.getAllStoredData();
    return all[bookingId] || null;
  }

  /** Get all locally-stored booking details as BookingDetails-compatible objects. */
  getLocalBookings(): BookingDetails[] {
    const all = this.getAllStoredData();
    return Object.entries(all).map(([id, data]: [string, any]) => this.toBookingDetails(id, data));
  }

  /** Remove a booking ID from the registry. */
  removeBookingId(bookingId: string): void {
    const ids = this.getBookingIds().filter(id => id !== bookingId);
    this.saveBookingIds(ids);
    // Also remove stored data
    const all = this.getAllStoredData();
    delete all[bookingId];
    try { localStorage.setItem(this.DATA_KEY, JSON.stringify(all)); } catch {}
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
   * First tries the API, then falls back to locally stored data.
   */
  fetchAllBookingDetails(bookingApi: BookingApiService): Observable<BookingDetails[]> {
    const ids = this.getBookingIds();
    if (ids.length === 0) return of([]);

    return forkJoin(
      ids.map(id =>
        bookingApi.getBookingDetails(id).pipe(
          catchError(() => {
            // API failed — use locally stored data as fallback
            const local = this.getStoredBookingData(id);
            if (local) {
              return of(this.toBookingDetails(id, local));
            }
            return of(null);
          })
        )
      )
    ).pipe(
      map(results => results.filter((b): b is BookingDetails => b !== null))
    );
  }

  /** Convert stored create-booking response to BookingDetails format. */
  private toBookingDetails(bookingId: string, data: any): BookingDetails {
    return {
      booking_id: bookingId,
      bookingId: bookingId,
      reservation_id: data.reservationId || data.reservation_id || '',
      source_city: data.source_city || data.sourceCity || '',
      destination_city: data.destination_city || data.destinationCity || '',
      pick_city: data.pick_city || data.source_city || data.sourceCity || '',
      drop_city: data.drop_city || data.destination_city || data.destinationCity || '',
      trip_type: data.trip_type || data.tripType || '',
      usage_name: data.usage_name || data.subTripType || '',
      pickup_address: data.pickup_address || data.pickupAddress || '',
      drop_address: data.drop_address || data.dropAddress || '',
      start_date_time: data.start_date_time || data.pickupDateTime || '',
      pickup_date: data.pickup_date || data.pickupDate || '',
      pickup_time: data.pickup_time || data.pickupTime || '',
      booking_status: 'CONFIRMED',
      gross_amount: data.gross_amount || data.total_amount || data.totalFare || 0,
      total_amount: data.total_amount || data.totalFare || 0,
      customer_name: data.customer_name || data.customer?.name || '',
      customer_mobile: data.customer_mobile || data.customer?.mobile || '',
      customer_email: data.customer_email || data.customer?.email || '',
      car_name: data.car_name || data.package || '',
      itinerary: data.itinerary || '',
      prePayment: data.prePayment || 0,
      cashToCollect: data.cashToCollect || 0,
      carType: data.carType || 0,
    } as any;
  }

  private getAllStoredData(): Record<string, any> {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    try {
      const data = localStorage.getItem(this.DATA_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
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
