/**
 * Coupon models.
 *
 * POST /coupon-code.php -- validate and apply a coupon
 */

export interface CouponValidationRequest {
  couponCode: string;
  sourceCity: number;
  tripType: string;
  subTripType: string;
  bookingAmount: number;
  duration?: number;
  carType: number;
  pickupDateTime: string;   // DD-MM-YYYY HH:MM
}

export interface CouponValidationResponse {
  status: string;
  valid?: boolean;
  discountAmount?: number;
  discountedFare?: number;
  message?: string;
  [key: string]: unknown;
}
