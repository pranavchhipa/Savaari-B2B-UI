import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { CouponValidationRequest, CouponValidationResponse } from '../models';
import { environment } from '../../../environments/environment';

/**
 * Validates coupon codes via the Partner API.
 *
 * Endpoint: GET /apply_coupon → api.savaari.com/partner_api/public/apply_coupon
 * (Per workflow documentation — previously used /coupon-code)
 *
 * Params: couponCode, sourceCity, tripType, subTripType, bookingAmount,
 *         duration, carType, pickupDateTime, token
 *
 * Success: 200 { status: "success", data: { discountAmount, ... } }
 * Invalid coupon: 400 { status: "failure", errors: [{ internalMessage: "Coupon code is not valid" }] }
 * Missing params: 400 { status: "failure", errors: [{ internalMessage: "X Is missing" }] }
 */
@Injectable({ providedIn: 'root' })
export class CouponService {

  constructor(
    private api: ApiService,
    private auth: AuthService,
  ) {}

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
        status: 'failure',
        valid: false,
        message: 'Invalid coupon code.',
      });
    }

    return this.api.partnerGet<any>('apply_coupon', {
      couponCode: request.couponCode,
      sourceCity: request.sourceCity,
      tripType: request.tripType,
      subTripType: request.subTripType,
      bookingAmount: request.bookingAmount,
      duration: request.duration,
      carType: request.carType,
      pickupDateTime: request.pickupDateTime,
      token: this.auth.getPartnerToken(),
    }).pipe(
      map(response => {
        // Success response: extract discount details
        if (response?.status === 'success') {
          const data = response.data || response;
          return {
            status: 'success',
            valid: true,
            discountAmount: parseFloat(data.discountAmount) || 0,
            discountedFare: parseFloat(data.discountedFare) || request.bookingAmount,
            message: data.message || 'Coupon applied successfully!',
          } as CouponValidationResponse;
        }
        // Failure response that still came through as 200
        return {
          status: 'failure',
          valid: false,
          message: response?.message || 'Coupon could not be applied.',
        } as CouponValidationResponse;
      }),
      catchError((err: HttpErrorResponse) => {
        // Extract specific error message from API 400 response
        const apiError = err.error;
        let message = 'Invalid coupon code.';

        if (apiError?.errors?.length) {
          // API returns errors array: [{ errroCode, errroMessage, internalMessage }]
          message = apiError.errors
            .map((e: any) => e.internalMessage || e.errroMessage)
            .join('. ');
        } else if (apiError?.message) {
          message = apiError.message;
        }

        console.warn('[COUPON] Validation failed:', message);

        // Return as a "failed" response, not an error — UI can display the message
        return of({
          status: 'failure',
          valid: false,
          message,
        } as CouponValidationResponse);
      })
    );
  }
}
