import { Injectable } from '@angular/core';
import { Observable, of, switchMap, map } from 'rxjs';
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
import { environment } from '../../../environments/environment';
import { MOCK_BOOKING_DETAILS, MOCK_BOOKINGS_LIST } from '../mocks/mock-bookings';

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
    if (environment.useMockData) {
      const mockId = 'MOCK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      return of({ bookingId: mockId, booking_id: mockId, status: 'confirmed', message: 'Mock booking created' });
    }

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
      countryCode: request.countryCode || '91',
      customerSecondaryEmail: request.customerSecondaryEmail,
      carType: request.carType,
      premiumFlag: request.premiumFlag ?? 0,
      destinationCity: request.destinationCity,
      prePayment: request.prePayment,
      couponCode: request.couponCode,
      agentId: btoa(this.auth.getAgentId()),
      api_source: 'b2b',
      source: request.source || 'b2b',
      device: request.device || 'web',
      // Airport-specific
      localityId: request.localityId,
      terminalname: request.terminalname,
      airport_id: request.airport_id,
      airport_name: request.airport_name,
      flight_no: request.flight_no,
      Urgent_booking: request.Urgent_booking,
      fixed_amount: request.fixed_amount,
    };

    return this.api.partnerPostForm<CreateBookingResponse>('booking', formBody, { token }).pipe(
      switchMap(response => {
        // API returns data as array (prePayment=0): { data: [{ booking_id, reservation_id }] }
        // OR as object (prePayment>0):              { data: { bookingId, reservationId, ... } }
        const raw = response.data as any;
        const dataItem = Array.isArray(raw) ? raw[0] : raw;
        const bookingId = dataItem?.booking_id || dataItem?.bookingId || response.booking_id || response.bookingId || '';
        const reservationId = dataItem?.reservation_id || dataItem?.reservationId || response.reservation_id || '';

        if (bookingId && reservationId) {
          return this.updateInvoicePayerInfo({
            booking_id: String(bookingId),
            reservation_id: String(reservationId),
            invoice_payer_name: request.customerSecondaryEmail ? request.customerName : undefined,
            invoice_payer_email: request.customerSecondaryEmail,
          }).pipe(
            map(() => response),
            catchError(() => of(response)) // Don't fail booking if invoice update fails
          );
        }
        return of(response);
      }),
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
   */
  private updateInvoicePayerInfo(request: UpdateInvoicePayerRequest): Observable<unknown> {
    const token: string = this.auth.getPartnerToken() ?? '';
    return this.api.partnerPostForm('booking/update_invoice_payer_info', {
      booking_id: request.booking_id,
      reservation_id: request.reservation_id,
      invoice_payer_name: request.invoice_payer_name,
      invoice_payer_email: request.invoice_payer_email,
      invoice_payer_phone: request.invoice_payer_phone,
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
    if (environment.useMockData) {
      return of({ status: 'success', message: 'Mock VAS updated' });
    }

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
   * NOTE: The live B2B portal (b2bcab.in) does NOT have a cancel endpoint.
   * B2B agents contact Savaari support directly to cancel bookings.
   * This uses the Partner API's booking/cancel endpoint as a best guess,
   * which may or may not work for B2B agents.
   */
  cancelBooking(bookingId: string, reason?: string): Observable<CancelBookingResponse> {
    if (environment.useMockData) {
      return of({ status: 'cancelled', message: 'Mock booking cancelled' });
    }

    const token: string = this.auth.getPartnerToken() ?? '';
    return this.api.partnerPostForm<CancelBookingResponse>('booking/cancel', {
      bookingId,
      reason,
      agentId: btoa(this.auth.getAgentId()),
    }, { token }).pipe(
      catchError(err => this.errorHandler.handleApiError(err, 'BookingApiService.cancelBooking'))
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
    if (environment.useMockData) {
      return of(MOCK_BOOKINGS_LIST);
    }

    return this.api.b2bGet<any>('booking-details', {
      userEmail: this.auth.getUserEmail(),
      token: this.auth.getB2bToken(),
    }).pipe(
      map(response => {
        // API returns wrapped object with pre-categorized arrays
        const details = response?.bookingDetails;
        if (!details) return [];
        const upcoming: any[] = details.bookingUpcoming || [];
        const completed: any[] = details.bookingCompleted || [];
        const cancelled: any[] = details.bookingCancelled || [];
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
    if (environment.useMockData) {
      return of({ ...MOCK_BOOKING_DETAILS, bookingId });
    }

    return this.api.b2bGet<BookingDetails>('booking-details', {
      userEmail: this.auth.getUserEmail(),
      token: this.auth.getB2bToken(),
      bookingId,
    }).pipe(
      catchError(err => this.errorHandler.handleApiError(err, 'BookingApiService.getBookingDetails'))
    );
  }
}
