import { Injectable } from '@angular/core';
import { Observable, of, map } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ErrorHandlerService } from './error-handler.service';
import {
  CreateBookingRequest,
  CreateBookingResponse,
  UpdateInvoicePayerRequest,
  CancelBookingResponse,
  BookingDetails,
} from '../models';

/**
 * Handles booking operations with the Savaari API.
 *
 * Confirmed from live site (March 2026):
 *   POST /booking?token=<partnerJWT>           → 201 Created (partner API)
 *   POST /booking/update_invoice_payer_info     → 200 (partner API)
 *   GET  /booking-details?userEmail&token       → api23 B2B API (lists ALL bookings)
 */
@Injectable({ providedIn: 'root' })
export class BookingApiService {

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private errorHandler: ErrorHandlerService
  ) {}

  /**
   * Create a confirmed booking.
   *
   * Confirmed from live site:
   * POST /booking?token=<partnerJWT>
   * Body: application/x-www-form-urlencoded
   * Response: 201 Created → { booking_id, reservation_id, ... }
   *
   * Immediately followed by update_invoice_payer_info with agent details.
   */
  createBooking(request: CreateBookingRequest): Observable<CreateBookingResponse> {
    const token: string = this.auth.getPartnerToken() ?? '';

    // Build form body with all required fields
    const formBody: Record<string, string | number | boolean | undefined | null> = {
      sourceCity: request.sourceCity,
      tripType: request.tripType,
      subTripType: request.subTripType,
      pickupDateTime: request.pickupDateTime,
      duration: request.duration ?? 1,
      pickupAddress: request.pickupAddress,
      customerLatLong: request.customerLatLong,
      dropAddress: request.dropAddress,
      dropLatLong: request.dropLatLong,
      dropLocality: request.dropLocality,
      selectPlaceId: request.selectPlaceId,
      customerTitle: request.customerTitle || 'Mr',
      customerName: request.customerName,
      customerEmail: request.customerEmail,
      customerMobile: request.customerMobile,
      countryCode: request.countryCode || '91|IND',
      customerSecondaryEmail: request.customerSecondaryEmail,
      carType: request.carType,
      premiumFlag: request.premiumFlag ?? 0,
      destinationCity: request.destinationCity,
      // NOTE: `prePayment` intentionally NOT sent. Verified from live HAR
      // (April 2026) — live site does not send this field. Sending it causes
      // partner API to mark `book_flag = 1` prematurely, breaking
      // confirmation.php update logic. Reported by backend team.
      locality: request.locality,
      // alias_source_city_id / alias_dest_city_id — NEVER sent from this portal.
      //
      // Backend expects these to be LOCALITY IDs (e.g. 414 for Koramangala).
      // Any ID the backend can't find in its locality table triggers an
      // alphabetical-first fallback, so emails render as "Bangalore (Dhanaulti)",
      // "Mysore (Kevadiya)" etc. regardless of which value is sent.
      //
      // The only data source we have for these fields is Savaari's place_id
      // API (`source_city_map_info.city_id` / `destination_city_map_info.city_id`)
      // — and that endpoint returns CANONICAL city IDs, not locality IDs
      // (e.g. 377 for Bangalore, same value as the outstation source-city list).
      // The airport-to-oneway conversion path also only has canonical city
      // IDs to offer. There is no reliable frontend source for a real
      // locality ID here, so any value we send is guaranteed to mis-resolve
      // on the server.
      //
      // Omitting both fields entirely tells the backend to skip the alias
      // lookup and render the plain city name ("Bangalore", "Mysore") across
      // all four trip types (One Way, Round Trip, Local, Airport).
      app_user_id: request.app_user_id,
      couponCode: request.couponCode ?? '',
      agentId: btoa(this.auth.getAgentId()),
      api_source: 'b2b',
      source: request.source || 'WEB',
      device: request.device || 'DESKTOP',
      // Airport-specific
      localityId: request.localityId,
      terminalId: request.terminalId,
      terminalname: request.terminalname,
      airport_id: request.airport_id,
      airport_name: request.airport_name,
      flight_no: request.flight_no,
      custShortAddress: request.custShortAddress,
      Urgent_booking: request.Urgent_booking,
      fixed_amount: request.fixed_amount,
    };

    // Note: update_invoice_payer_info used to be chained onto this call via
    // switchMap(), firing a default "pay_by_customer" update the moment the
    // booking was created. Per backend team guidance (April 2026), that API
    // must fire ONLY after the agent actually picks a payment option on the
    // Step 2 payment page, with the correct invoice_payer value:
    //   Option 1 / 2  → pay_by_customer
    //   Option 3      → pay_by_agent
    // The booking component now calls updateInvoicePayerInfo() directly from
    // setPaymentOption(), so this service stays booking-only.
    return this.api.partnerPostForm<CreateBookingResponse>('booking', formBody, { token }).pipe(
      // Normalize: always expose bookingId at the top level for consumers
      map(response => {
        const raw = response.data as any;
        const dataItem = Array.isArray(raw) ? raw[0] : raw;
        return {
          ...response,
          bookingId: String(dataItem?.booking_id || dataItem?.bookingId || response.booking_id || response.bookingId || ''),
          reservation_id: String(dataItem?.reservation_id || dataItem?.reservationId || response.reservation_id || ''),
        };
      }),
      catchError(err => this.errorHandler.handleApiError(err, 'BookingApiService.createBooking'))
    );
  }

  /**
   * Update invoice payer info after booking creation.
   * POST /booking/update_invoice_payer_info?token=<partnerJWT>
   *
   * Confirmed from Postman (March 2026):
   *   Body: { booking_id, invoice_payer: "pay_by_customer" | "pay_by_agent" }
   *   Token passed in body as urlencoded field.
   */
  updateInvoicePayerInfo(bookingId: string, invoicePayer: string): Observable<unknown> {
    const token: string = this.auth.getPartnerToken() ?? '';
    return this.api.partnerPostForm('booking/update_invoice_payer_info', {
      booking_id: bookingId,
      invoice_payer: invoicePayer,
      token,
    }, { token });
  }

  /**
   * Update VAS (Value Added Services) after booking creation.
   *
   * Per workflow documentation:
   * POST /vas_booking_update?token=<partnerJWT>
   * Body: booking_id, luggage_carrier (0/1), preferred_language_driver (0/1)
   *
   * Called after successful booking if any VAS options were selected.
   */
  updateVasBooking(bookingId: string, options: { luggageCarrier?: boolean; languageDriver?: boolean }): Observable<unknown> {
    const token: string = this.auth.getPartnerToken() ?? '';
    return this.api.partnerPostForm('vas_booking_update', {
      booking_id: bookingId,
      luggage_carrier: options.luggageCarrier ? 1 : 0,
      preferred_language_driver: options.languageDriver ? 1 : 0,
    }, { token }).pipe(
      catchError(err => {
        // VAS update failure should not block the booking flow
        console.warn('[VAS] Failed to update VAS for booking', bookingId, err);
        return of({ status: 'error', message: 'VAS update failed' });
      })
    );
  }

  /**
   * Cancel a previously confirmed booking.
   *
   * Confirmed from live b2bcab.in HAR (April 2026):
   *   POST https://api.betasavaari.com/system_bookings/cancellation.php
   *   Body: application/x-www-form-urlencoded
   *   Fields:
   *     - booking_id          (required)
   *     - reservation_id      (required — e.g. "S0426-2361927")
   *     - reason              (dropdown value: "Customer changed plans" / "Wrong booking created")
   *     - comments            (free-text, can be empty)
   *     - booking_key         (from create-booking response; fallback to '')
   *     - booking_type        (hard-coded to "1")
   *
   *   Response on success:
   *     { status_code: 101, status_description: "SUCCESS", reservation_id, booking_data: {...} }
   */
  cancelBooking(
    bookingId: string,
    reservationId: string,
    reason: string,
    comments: string = '',
    bookingKey: string = ''
  ): Observable<CancelBookingResponse> {
    return this.api.systemBookingsPostForm<any>('cancellation.php', {
      booking_id: bookingId,
      reservation_id: reservationId,
      reason,
      comments,
      booking_key: bookingKey,
      booking_type: 1,
    }).pipe(
      map(response => {
        // Treat status_code 101 + "SUCCESS" as cancellation success
        const code = Number(response?.status_code);
        const desc = String(response?.status_description || '').toUpperCase();
        const ok = code === 101 || desc === 'SUCCESS';
        return {
          ...response,
          status: ok ? 'cancelled' : 'failed',
          message: response?.status_description || (ok ? 'Booking cancelled' : 'Failed to cancel booking'),
        } as CancelBookingResponse;
      }),
      catchError(err => this.errorHandler.handleApiError(err, 'BookingApiService.cancelBooking'))
    );
  }

  /**
   * Send booking confirmation email.
   * POST /email_sent → api.savaari.com/partner_api/public/email_sent
   * Body: { booking_id } (form-encoded)
   *
   * Confirmed from Postman: called after successful booking + payment.
   */
  sendBookingEmail(bookingId: string): Observable<unknown> {
    return this.api.partnerPostForm('email_sent', {
      booking_id: bookingId,
    }).pipe(
      catchError(err => {
        console.warn('[BOOKING] Failed to send booking email for', bookingId, err);
        return of({ status: 'error' }); // Non-blocking
      })
    );
  }

  /**
   * Get ALL bookings for the logged-in user.
   *
   * Confirmed from live site (March 2026):
   * GET /booking-details?userEmail=...&token=... → api23.savaari.com
   *
   * Response shape:
   *   { statusCode, message, bookingDetails: {
   *       bookingUpcoming: [...], bookingCompleted: [...], bookingCancelled: [...]
   *   }}
   *
   * Each booking object uses snake_case fields from the API:
   *   booking_id, pick_city, start_date_time, gross_amount, booking_status,
   *   pick_loc, trip_type, customer_name, car_name, driver_details, etc.
   */
  getAllBookings(): Observable<BookingDetails[]> {
    return this.api.b2bGet<any>('booking-details', {
      userEmail: this.auth.getUserEmail(),
      token: this.auth.getB2bToken(),
    }).pipe(
      map(response => {
        // API returns wrapped object with pre-categorized arrays. We preserve
        // the source bucket on each row as `_bucket` so the UI can categorize
        // by what the backend already decided, rather than re-deriving from
        // the `booking_status` field. Re-deriving was fragile: any status
        // value not in our hardcoded allowlist (e.g. a new backend status,
        // or a row with `status: "1"` and an unfamiliar `booking_status`)
        // would fall through every tab filter and silently disappear.
        const details = response?.bookingDetails;
        if (!details) return [];
        const upcoming: any[] = (details.bookingUpcoming || []).map((b: any) => ({ ...b, _bucket: 'upcoming' }));
        const completed: any[] = (details.bookingCompleted || []).map((b: any) => ({ ...b, _bucket: 'completed' }));
        const cancelled: any[] = (details.bookingCancelled || []).map((b: any) => ({ ...b, _bucket: 'cancelled' }));
        return [...upcoming, ...completed, ...cancelled];
      }),
      catchError(err => this.errorHandler.handleApiError(err, 'BookingApiService.getAllBookings'))
    );
  }

  /**
   * Get a single booking by ID.
   * Filters from the getAllBookings response.
   */
  getBookingDetails(bookingId: string): Observable<BookingDetails> {
    return this.api.b2bGet<any>('booking-details', {
      userEmail: this.auth.getUserEmail(),
      token: this.auth.getB2bToken(),
      bookingId,
    }).pipe(
      map(response => {
        // Same wrapped structure as getAllBookings: { bookingDetails: { bookingUpcoming, bookingCompleted, bookingCancelled } }
        const details = response?.bookingDetails;
        if (!details) return response as BookingDetails;
        const all = [
          ...(details.bookingUpcoming || []),
          ...(details.bookingCompleted || []),
          ...(details.bookingCancelled || []),
        ];
        // Find the specific booking or fall back to first result
        return (all.find((b: any) => String(b.booking_id) === String(bookingId)) || all[0] || response) as BookingDetails;
      }),
      catchError(err => this.errorHandler.handleApiError(err, 'BookingApiService.getBookingDetails'))
    );
  }
}
