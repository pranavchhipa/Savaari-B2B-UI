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
  VasDetail,
  VasUpdateResponse,
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
   * Update VAS (Value Added Services) for an existing booking.
   *
   * POST /vas_booking_update?token=<partnerJWT>   (partner-api → api.betasavaari.com)
   * Content-Type: application/x-www-form-urlencoded
   *
   * Body shape (April 2026 backend team confirmation):
   *   booking_id                       — the just-created booking
   *   pre_vas_booking_total_amount     — original total fare (before any VAS)
   *   pre_vas_booking_package_km       — trip kilometre allowance (used for PerKM VAS calc)
   *   pre_vas_booking_package_hr       — trip hour allowance (0 for outstation)
   *   vas_data                         — JSON-stringified array of selected VAS items
   *                                       (PLAIN JSON, NOT base64-encoded — confirmed
   *                                       by backend team April 2026).
   *
   * Each entry in vas_data must include the original VAS detail fields
   * (vas_config_id, vas_id, vas, customer_rate, vas_rate_type, etc.) plus
   * the user's selection state:
   *   isChecked: true
   *   toggle_flag: true
   *   customer_input_data: "<chosen sub-option>"   (when customer_input_flag === "YES")
   *   radioIndex: <index of the chosen sub-option>
   *
   * Returns updated fare totals via response.data.vas_update — the B2B
   * portal then feeds post_vas_total_amount into its OWN payment-option
   * helpers (Pay Any Amount Now / Pay 25% Auto-Debit / Zero Cash). The
   * payment_option block embedded in the VAS response is B2C-only and is
   * intentionally ignored — see VasUpdateResponseData docstring.
   */
  updateVasBooking(payload: {
    bookingId: string;
    preVasTotalAmount: number;
    preVasPackageKm: number;
    preVasPackageHr: number;
    selectedVas: VasDetail[];
  }): Observable<VasUpdateResponse> {
    const token: string = this.auth.getPartnerToken() ?? '';
    // Each item we ship back marks its selection state explicitly so the
    // backend doesn't have to infer it from key presence.
    const vasData = payload.selectedVas.map(v => ({
      ...v,
      isChecked: true,
      toggle_flag: true,
    }));
    return this.api.partnerPostForm<VasUpdateResponse>('vas_booking_update', {
      booking_id: payload.bookingId,
      pre_vas_booking_total_amount: payload.preVasTotalAmount,
      pre_vas_booking_package_km: payload.preVasPackageKm,
      pre_vas_booking_package_hr: payload.preVasPackageHr,
      vas_data: JSON.stringify(vasData),
    }, { token }).pipe(
      catchError(err => {
        // VAS update failure must NEVER block the booking flow — fall back
        // to the original totals; the agent can still complete payment.
        console.warn('[VAS] Failed to update VAS for booking', payload.bookingId, err);
        return of({ status: 'error', data: undefined } as VasUpdateResponse);
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
