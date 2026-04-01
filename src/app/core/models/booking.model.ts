/**
 * Booking models — confirmed from live API (March 2026).
 *
 * POST /booking?token=<partnerJWT>  → api.savaari.com/partner_api/public/booking → 201
 * POST /booking/update_invoice_payer_info?token=<partnerJWT> → 200
 * GET  /booking-details → api23.savaari.com/booking-details (lists ALL bookings)
 */

/**
 * POST /booking request body (form-encoded).
 *
 * Confirmed fields extracted from b2bcab.in Angular 4 source.
 * Token is passed as query param, NOT in the body.
 */
export interface CreateBookingRequest {
  // Trip details
  sourceCity: number;
  tripType: string;              // 'outstation' | 'local' | 'airport'
  subTripType: string;           // 'oneWay' | 'roundTrip' | '880' etc.
  destinationCity?: number;      // Required for outstation
  multicityId?: string;          // Comma-separated intermediate city IDs for round trip multicity
  pickupDateTime: string;        // DD-MM-YYYY HH:MM
  duration?: number;             // Days (1 for oneWay)

  // Address details
  pickupAddress: string;
  customerLatLong?: string;      // "lat,lng"
  dropAddress?: string;
  dropLatLong?: string;          // "lat,lng"
  dropLocality?: string;
  selectPlaceId?: string;        // Google Place ID

  // Locality (area name, e.g. "HAL 2nd Stage-Indiranagar")
  locality?: string;

  // Airport-specific
  localityId?: number;
  terminalId?: string;           // Terminal ID
  terminalname?: string;
  airport_id?: string;           // Airport locality ID
  airport_name?: string;         // Full airport/terminal name
  flight_no?: string;
  custShortAddress?: string;     // Short address label for customer location

  // Customer details
  customerTitle?: string;        // 'Mr' | 'Mrs' | 'Ms'
  customerName: string;
  customerEmail?: string;
  customerMobile: string;        // 10-digit mobile number
  countryCode?: string;          // '91|IND' format (NOT '+91' — causes 402 error)
  customerSecondaryEmail?: string; // Agent email

  // Car details
  carType: number;               // Car type ID from availability response
  premiumFlag?: number;          // 0 or 1

  // Payment
  prePayment?: number;           // Amount paid upfront
  couponCode?: string;
  fixed_amount?: number;

  // Destination alias & user
  alias_dest_city_id?: number;   // Alias destination city ID (0 for most bookings)
  app_user_id?: number;          // Agent/user ID (numeric)

  // Agent/source
  agentId?: string;              // Base64-encoded agent ID
  api_source?: string;           // 'b2b'
  source?: string;               // Booking source
  device?: string;               // Device type
  affiliateId?: string;
  Urgent_booking?: string;       // Urgent booking flag

  // Invoice payer (from commission settings)
  invoicePayer?: string;         // 'pay_by_customer' | 'pay_by_agent'
}

/**
 * POST /booking → 201 Created response.
 *
 * Confirmed shape from live Savaari Partner API (March 2026):
 *   { "status": "success", "data": [{ "booking_id": "...", "reservation_id": "...", ... }] }
 *
 * The booking_id and reservation_id are nested inside data[0], NOT at the top level.
 * Error responses (still 201) look like:
 *   { "status": "success", "data": [{ "status_code": 402, "status_error": "..." }] }
 */
export interface CreateBookingResponseData {
  booking_id?: string;
  reservation_id?: string;
  booking_key?: string;
  // Error fields (present when booking fails despite 201)
  status_code?: number;
  status_description?: string;
  status_error?: string;
  [key: string]: unknown;
}

export interface CreateBookingResponse {
  status?: string;
  data?: CreateBookingResponseData[];
  // Legacy top-level fields (kept for safety, not present in real API)
  booking_id?: string;
  bookingId?: string;
  reservation_id?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * POST /booking/update_invoice_payer_info request body (form-encoded).
 * Confirmed from Postman: only booking_id and invoice_payer are needed.
 */
export interface UpdateInvoicePayerRequest {
  booking_id: string;
  invoice_payer: string;  // 'pay_by_customer' | 'pay_by_agent'
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
