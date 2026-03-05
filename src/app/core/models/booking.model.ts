/**
 * Booking models.
 *
 * POST /booking-create.php   -- create a confirmed booking
 * POST /booking-cancel.php   -- cancel a booking
 * GET  /booking-get.php      -- get booking details by ID
 */

export interface CreateBookingRequest {
  sourceCity: number;
  tripType: string;
  subTripType: string;
  destinationCity?: number;
  pickupDateTime: string;       // DD-MM-YYYY HH:MM
  duration?: number;            // Days for roundTrip
  pickupAddress: string;
  localityId?: number;          // For airport transfers
  customerName: string;
  customerEmail?: string;
  customerMobile: string;       // 10-digit mobile number
  carType: number;              // Car type ID from availability response
  prePayment?: number;          // Amount already collected
  couponCode?: string;
}

export interface CreateBookingResponse {
  bookingId: string;
  status: string;
  message?: string;
  [key: string]: unknown;
}

export interface CancelBookingRequest {
  bookingId: string;
  cancellationReason?: string;
}

export interface CancelBookingResponse {
  status: string;
  cancellationCharge?: number;
  message?: string;
  [key: string]: unknown;
}

export interface BookingDetails {
  bookingId: string;
  status: string;
  sourceCity?: string;
  destinationCity?: string;
  tripType?: string;
  subTripType?: string;
  pickupDateTime?: string;
  pickupAddress?: string;
  carType?: string;
  carModel?: string;
  customerName?: string;
  customerMobile?: string;
  customerEmail?: string;
  driverName?: string;
  driverMobile?: string;
  carNumber?: string;
  fare?: number;
  extraCharges?: number;
  totalFare?: number;
  prePayment?: number;
  postPayment?: number;
  [key: string]: unknown;
}

/**
 * Webhook callback payloads (received from Savaari).
 * These are NOT sent by our app -- they are pushed to our callback URL.
 */
export interface DriverAssignmentPayload {
  bookingId: string;
  carModel: string;
  carNumber: string;
  driverName: string;
  driverMobile: string;
  message: string;
}

export interface SavaariCancellationPayload {
  bookingId: string;
  reason: string;
  message: string;
}

export interface CustomerNoShowPayload {
  bookingId: string;
  status: string;
  penalty: number;
  message: string;
}

export interface TripCompletedPayload {
  bookingId: string;
  status: string;
  totalFare: number;
  extra: number;
  driverAllowance: number;
  prePayment: number;
  postPayment: number;
  message: string;
}
