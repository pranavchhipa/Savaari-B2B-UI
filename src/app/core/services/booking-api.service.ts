import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ErrorHandlerService } from './error-handler.service';
import {
  CreateBookingRequest,
  CreateBookingResponse,
  CancelBookingRequest,
  CancelBookingResponse,
  BookingDetails,
} from '../models';
import { environment } from '../../../environments/environment';
import { MOCK_BOOKING_DETAILS } from '../mocks/mock-bookings';

/**
 * Handles booking CRUD operations with the Savaari API.
 *
 * POST /booking-create.php
 * POST /booking-cancel.php
 * GET  /booking-get.php
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
   * The carType ID must come from the availability response.
   */
  createBooking(request: CreateBookingRequest): Observable<CreateBookingResponse> {
    if (environment.useMockData) {
      const mockId = 'MOCK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      return of({ bookingId: mockId, status: 'confirmed', message: 'Mock booking created' });
    }

    return this.api.post<CreateBookingResponse>('booking-create.php', {
      sourceCity: request.sourceCity,
      tripType: request.tripType,
      subTripType: request.subTripType,
      destinationCity: request.destinationCity,
      pickupDateTime: request.pickupDateTime,
      duration: request.duration,
      pickupAddress: request.pickupAddress,
      localityId: request.localityId,
      customerName: request.customerName,
      customerEmail: request.customerEmail,
      customerMobile: request.customerMobile,
      carType: request.carType,
      prePayment: request.prePayment,
      couponCode: request.couponCode,
    }).pipe(
      catchError(err => this.errorHandler.handleApiError(err, 'BookingApiService.createBooking'))
    );
  }

  /**
   * Cancel a previously confirmed booking.
   */
  cancelBooking(bookingId: string, reason?: string): Observable<CancelBookingResponse> {
    if (environment.useMockData) {
      return of({ status: 'cancelled', message: 'Mock booking cancelled' });
    }

    return this.api.post<CancelBookingResponse>('booking-cancel.php', {
      bookingId,
      cancellationReason: reason,
    }).pipe(
      catchError(err => this.errorHandler.handleApiError(err, 'BookingApiService.cancelBooking'))
    );
  }

  /**
   * Get full details of a booking by ID.
   *
   * Note: The GET endpoint requires token as a query param.
   */
  getBookingDetails(bookingId: string): Observable<BookingDetails> {
    if (environment.useMockData) {
      return of({ ...MOCK_BOOKING_DETAILS, bookingId });
    }

    return this.api.get<BookingDetails>('booking-get.php', {
      bookingId,
      token: this.auth.getToken(),
    }).pipe(
      catchError(err => this.errorHandler.handleApiError(err, 'BookingApiService.getBookingDetails'))
    );
  }
}
