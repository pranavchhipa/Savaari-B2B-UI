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
 *
 * ============================================================================
 * USER-SCOPED STORAGE (added 2026-04-14)
 * ============================================================================
 * Storage keys are namespaced by the logged-in agent's user_id so one agent's
 * booking registry can NEVER be read by another agent on the same browser.
 * A fresh account logging in on a device that previously had another agent
 * signed in will see an empty registry — even if auto-login races the
 * clearUserScopedStorage() wipe or a previous session never logged out.
 *
 * The legacy unscoped keys (savaari_b2b_booking_ids / savaari_b2b_booking_data)
 * are wiped on first access so any pre-migration data can't leak.
 * ============================================================================
 */
@Injectable({ providedIn: 'root' })
export class BookingRegistryService {
  private static readonly LEGACY_IDS_KEY = 'savaari_b2b_booking_ids';
  private static readonly LEGACY_DATA_KEY = 'savaari_b2b_booking_data';
  private legacyCleaned = false;

  /** Current user's id from the login response (falsy = no scoped storage). */
  private getCurrentUserId(): string {
    if (typeof window === 'undefined' || !window.localStorage) return '';
    try {
      const raw = localStorage.getItem('loggedUserDetail');
      if (!raw) return '';
      const u = JSON.parse(raw);
      const id = u?.user_id ?? u?.userId ?? u?.email ?? '';
      return id ? String(id) : '';
    } catch {
      return '';
    }
  }

  /** Per-user storage key for the ordered list of booking IDs. */
  private get storageKey(): string {
    const uid = this.getCurrentUserId();
    return uid ? `savaari_b2b_booking_ids_${uid}` : '';
  }

  /** Per-user storage key for the booking-id → detail map. */
  private get dataKey(): string {
    const uid = this.getCurrentUserId();
    return uid ? `savaari_b2b_booking_data_${uid}` : '';
  }

  /**
   * Remove the legacy unscoped registry keys once per session.
   * Any booking IDs that actually belong to the current user will come back
   * on the next /booking-details API call (server-side filtered by email).
   */
  private cleanLegacyKeysOnce(): void {
    if (this.legacyCleaned) return;
    this.legacyCleaned = true;
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.removeItem(BookingRegistryService.LEGACY_IDS_KEY);
      localStorage.removeItem(BookingRegistryService.LEGACY_DATA_KEY);
    } catch { /* non-fatal */ }
  }

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
    const key = this.dataKey;
    if (!key) return;  // no logged-in user → don't persist
    try {
      const all = this.getAllStoredData();
      // Tag the entry with the owning user so a stray read by another agent
      // (e.g. mid-login race) can still be filtered defensively.
      const uid = this.getCurrentUserId();
      all[bookingId] = { ...data, _storedAt: new Date().toISOString(), _userId: uid };
      localStorage.setItem(key, JSON.stringify(all));
    } catch (e) {
      console.error('[BookingRegistry] Failed to store booking data:', e);
    }
  }

  /** Get stored booking data for a specific ID (only for the current user). */
  getStoredBookingData(bookingId: string): any | null {
    const all = this.getAllStoredData();
    return all[bookingId] || null;
  }

  /** Get all locally-stored booking details as BookingDetails-compatible objects. */
  getLocalBookings(): BookingDetails[] {
    const all = this.getAllStoredData();
    const uid = this.getCurrentUserId();
    return Object.entries(all)
      // Defense-in-depth: even within a scoped bucket, skip entries whose
      // stamped _userId doesn't match — protects against any cross-write.
      .filter(([, data]: [string, any]) => !data?._userId || !uid || String(data._userId) === uid)
      .map(([id, data]: [string, any]) => this.toBookingDetails(id, data));
  }

  /** Remove a booking ID from the registry. */
  removeBookingId(bookingId: string): void {
    const idsKey = this.storageKey;
    const dKey = this.dataKey;
    if (!idsKey || !dKey) return;
    const ids = this.getBookingIds().filter(id => id !== bookingId);
    this.saveBookingIds(ids);
    // Also remove stored data
    const all = this.getAllStoredData();
    delete all[bookingId];
    try { localStorage.setItem(dKey, JSON.stringify(all)); } catch {}
  }

  /** Get all stored booking IDs (current user only). */
  getBookingIds(): string[] {
    this.cleanLegacyKeysOnce();
    const key = this.storageKey;
    if (!key) return [];
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const data = localStorage.getItem(key);
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
      // Preserve package KM so the bookings page can show "145 km"
      // for newly-created bookings before they sync to the B2B API.
      package_kms: data.package_kms || data.packageKms || data.kms_included || data.kmsIncluded || '',
      min_km_quota_per_day: data.min_km_quota_per_day || data.package_kms || '',
      prePayment: data.prePayment || 0,
      cashToCollect: data.cashToCollect || 0,
      carType: data.carType || 0,
      // Preserve booking_key — required by POST /system_bookings/cancellation.php
      // when the user cancels a booking from the Bookings page.
      booking_key: data.booking_key || data.bookingKey || '',
    } as any;
  }

  private getAllStoredData(): Record<string, any> {
    this.cleanLegacyKeysOnce();
    const key = this.dataKey;
    if (!key) return {};
    if (typeof window === 'undefined' || !window.localStorage) return {};
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  private saveBookingIds(ids: string[]): void {
    const key = this.storageKey;
    if (!key) return;  // no logged-in user → don't persist
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(key, JSON.stringify(ids));
      } catch (e) {
        console.error('[BookingRegistry] Failed to save booking IDs:', e);
      }
    }
  }
}
