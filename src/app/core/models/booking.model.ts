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
  destinationCity?: number | string;  // Required for outstation. number for one-way, comma-separated string ("237,2342,3424") for multicity round trip — backend accepts both per live HAR.
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
  /** @deprecated DO NOT SEND in booking creation request.
   * Verified from live b2bcab.betasavaari.com HAR (April 2026) — the live site
   * does NOT include this field. Sending it causes the partner API backend to
   * mark `book_flag = 1` prematurely, which then makes confirmation.php skip
   * its update logic (it has `if (book_flag == 0)` guard). Reported by backend team.
   * Payment amount is communicated to backend via confirmation.php afterwards.
   */
  prePayment?: number;
  couponCode?: string;
  fixed_amount?: number;

  // City alias IDs (from place_id API response)
  alias_source_city_id?: number; // source_city_map_info.city_id (e.g. 414 for Koramangala)
  alias_dest_city_id?: number;   // destination_city_map_info.city_id (e.g. 280 for Mysore)
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
 * Value Added Service (VAS) item as returned by the partner_api booking
 * response (April 2026 beta sample). One entry per service the agent can
 * upsell (luggage carrier, language driver, diesel guarantee, new car
 * promise, etc).
 *
 * Two pricing modes via vas_rate_type:
 *   - "FlatRate" — customer_rate is the absolute INR amount (e.g. "149")
 *   - "PerKM"    — customer_rate is per-km (e.g. "1.1/km") and
 *                  customer_rate_perkm holds the numeric rate ("1.1");
 *                  total = customer_rate_perkm * tripKilometer.
 *
 * customer_input_flag === "YES" means the service has a sub-option the
 * agent must pick (e.g. preferred language). The choices live in
 * rate_input_value, the input type in rate_input_type ("radio" so far).
 */
export interface VasDetail {
  vas_config_id: string;
  vas_congfig_id?: string;       // legacy typo'd field — kept for forward compat
  vas: string;                   // display name e.g. "Cab with Luggage Carrier"
  vas_id: string;
  customer_rate: string;         // "149" or "1.1/km"
  customer_rate_perkm?: string;  // numeric per-km rate when vas_rate_type === "PerKM"
  vendor_rate: string;           // backend cost — DO NOT show to user
  vas_rate_type: 'FlatRate' | 'PerKM' | string;
  customer_input_flag: 'YES' | 'NO' | string;
  rate_input_type: 'radio' | 'NA' | string;
  rate_input_value: string[];    // ["English", "Hindi"] for radio
  customer_input_label: string;  // shown above the sub-option control
  customer_input_error: string;  // shown when sub-option missing
  tnc_data?: { tnc?: string[] };
  route_ids?: string;
  start_city_id?: string | null;
  route?: string | null;
  pickup_city_id?: string;
  route_flag?: string;
  toggle_flag?: boolean;
  isChecked?: boolean;           // populated on the way OUT (selection state)
  customer_input_data?: string;  // populated on the way OUT (sub-option pick)
  radioIndex?: number;           // populated on the way OUT (index in rate_input_value)
  [key: string]: unknown;
}

/**
 * POST /booking → 201 Created response.
 *
 * Confirmed shape from live beta HAR (April 2026):
 *   prePayment=0 → { "status": "success", "data": { "bookingId": 2361706, "reservationId": "S0426-2361706", ... } }
 *   prePayment>0 → { "status": "success", "data": [{ "booking_id": "...", ... }] }
 *
 * CRITICAL fields from data:
 *   - bookingId / booking_id → booking ID
 *   - order_id → savaari_payment_id (e.g. "SW35004S0426-2361706")
 *   - paymentOptions[*].parameters.amount25per → advance amount
 *   - paymentOptions[*].parametersEncoded.amount25perEncoded → encoded amount for razor_createorder
 *   - vas_flag (0/1)            → whether the booking has any VAS to offer
 *   - vas_details[]             → list of available services for this trip
 *   - fuel_vas_details[]        → fuel-specific add-ons (separate bucket)
 *   - tripKilometer             → needed to compute total for PerKM VAS
 */
export interface CreateBookingResponseData {
  booking_id?: string;
  bookingId?: number;
  reservation_id?: string;
  reservationId?: string;
  travelId?: number;
  order_id?: string;           // savaari_payment_id (e.g. "SW35004S0426-2361706")
  totalFare?: number;
  prePayment?: number;
  cashToCollect?: number;
  paymentOptions?: PaymentOption[];
  booking_key?: string;
  // VAS (Value Added Services) bucket — drives the "Personalize Your Journey"
  // section on Step 2. Empty / vas_flag=0 means hide the section entirely.
  vas_flag?: number;
  vas_details?: VasDetail[];
  fuel_vas_details?: VasDetail[];
  tripKilometer?: string | number;
  tripHour?: string | number;
  // Error fields (present when booking fails despite 201)
  status_code?: number;
  status_description?: string;
  status_error?: string;
  [key: string]: unknown;
}

export interface PaymentOption {
  payment_gateway_code: number;
  title: string;
  vendor?: string;
  parameters?: {
    amountFull?: number;
    amountAdv?: number;
    amount20per?: number;
    amount25per?: number;
    amount30per?: number;
    amount50per?: number;
    [key: string]: unknown;
  };
  parametersEncoded?: {
    amountFullEncoded?: string;
    amount20perEncoded?: string;
    amount25perEncoded?: string;
    amount30perEncoded?: string;
    amount50perEncoded?: string;
    amountAdvEncoded?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CreateBookingResponse {
  status?: string;
  data?: CreateBookingResponseData | CreateBookingResponseData[];
  // Legacy top-level fields (kept for safety)
  booking_id?: string;
  bookingId?: string;
  reservation_id?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * POST /vas_booking_update response shape (April 2026 beta sample).
 *
 * IMPORTANT: this response also carries a `payment_option` block describing
 * a B2C-only payment gateway (JusPay / CCAvenue / Paytm / PayU / etc). The
 * B2B portal MUST IGNORE that field — our 3 B2B payment options (Pay Any
 * Amount Now / Pay 25% Now Auto-Debit / Zero Cash) are computed locally
 * from the total. Only the fare totals below are consumed.
 */
export interface VasUpdateResponseData {
  status_code?: string;
  status_description?: string;
  vas_update?: {
    vas?: string;                          // comma-joined names of selected VAS
    pre_vas_total_amount?: string;         // total before VAS (e.g. "1838")
    post_vas_total_amount?: string;        // total AFTER VAS (e.g. "1994") ← USE THIS
    vas_total_amount?: string | number;    // VAS amount including GST
    pre_vas_package_hr?: string | null;
    post_vas_package_hr?: string | null;
    pre_vas_package_km?: string | null;
    post_vas_package_km?: string | null;
    fare_breakup?: {
      base_cost?: number;
      service_tax?: string | number;       // base GST (pre-VAS portion)
      final_total_amount?: number;         // new total fare
      total_vas_amount?: number;           // VAS amount with GST
      total_vas_base_amount?: number;      // VAS amount without GST
      total_vas_gst_amount?: string | number;
      vas_list?: string;                   // human-readable list
      base_fare?: number;
      final_total_gst_amount?: number;
      recheck_final_amount?: number;
      [key: string]: unknown;
    };
    // payment_option intentionally omitted from the typed shape — see header.
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface VasUpdateResponse {
  status?: string;
  data?: VasUpdateResponseData;
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
