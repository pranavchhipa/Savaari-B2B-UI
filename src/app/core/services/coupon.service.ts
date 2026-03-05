import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { ErrorHandlerService } from './error-handler.service';
import { CouponValidationRequest, CouponValidationResponse } from '../models';
import { environment } from '../../../environments/environment';

/**
 * Validates and applies coupon codes.
 * POST /coupon-code.php
 */
@Injectable({ providedIn: 'root' })
export class CouponService {

  constructor(
    private api: ApiService,
    private errorHandler: ErrorHandlerService
  ) {}

  /**
   * Validate a coupon code against a specific trip context.
   * Returns discount info if valid.
   */
  validateCoupon(request: CouponValidationRequest): Observable<CouponValidationResponse> {
    if (environment.useMockData) {
      if (request.couponCode.toUpperCase() === 'TESTDISCOUNT') {
        return of({
          status: 'success',
          valid: true,
          discountAmount: Math.round(request.bookingAmount * 0.1),
          discountedFare: Math.round(request.bookingAmount * 0.9),
          message: 'Mock 10% discount applied!',
        });
      }
      return of({
        status: 'error',
        valid: false,
        message: 'Invalid coupon code.',
      });
    }

    return this.api.post<CouponValidationResponse>('coupon-code.php', {
      couponCode: request.couponCode,
      sourceCity: request.sourceCity,
      tripType: request.tripType,
      subTripType: request.subTripType,
      bookingAmount: request.bookingAmount,
      duration: request.duration,
      carType: request.carType,
      pickupDateTime: request.pickupDateTime,
    }).pipe(
      catchError(err => this.errorHandler.handleApiError(err, 'CouponService'))
    );
  }
}
