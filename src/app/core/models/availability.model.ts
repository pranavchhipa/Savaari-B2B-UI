/**
 * Availability models — confirmed from live API (March 2026).
 *
 * GET /availabilities → api.savaari.com/partner_api/public/availabilities
 *
 * Required query params: rate_source, rate_type, sourceCity, tripType,
 *   subTripType, pickupDateTime (DD-MM-YYYY HH:MM), duration,
 *   destinationCity, token, agentId (base64), api_source
 */

export interface AvailabilityRequest {
  sourceCity: number;          // Integer city ID (e.g. 377 = Bangalore)
  tripType: string;            // 'local' | 'outstation' | 'airport'
  subTripType: string;         // 'oneWay' | 'roundTrip' | '880' etc.
  destinationCity?: number;    // Required for outstation (final destination for multicity)
  multicityId?: string;        // Comma-separated intermediate city IDs for round trip multicity
  pickupDateTime: string;      // Format: DD-MM-YYYY HH:MM
  duration?: number;           // Days — always required (1 for oneWay)
  customerLatLong?: string;    // lat,lng — sent for airport; empty string for local/outstation
  localityId?: number;         // Required for airport transfers
  // Airport-specific params (confirmed by Shubhendu)
  terminalId?: string;
  selectPlaceId?: string;      // Google Place ID
  custShortAddress?: string;   // Short address label
  airport_id?: number;         // Airport locality ID
  airport_name?: string;       // Full airport/terminal name
}

/**
 * Normalized car used by the app.
 * The AvailabilityService maps raw API cars to this shape.
 */
export interface AvailableCar {
  carId?: string;
  carTypeId?: number;
  carType?: string;            // "AC Minivan", "Toyota Innova Crysta", etc.
  carName: string;             // "Toyota Innova"
  fare: number;                // discounted totalAmount
  originalFare?: number;       // regular totalAmount
  kmsIncluded?: number;        // packageKilometer
  hoursIncluded?: number;      // packageHour
  extraKmRate?: number;        // extraKilometer rate
  nightAllowance?: number;     // nightCharge
  seatCapacity?: number;
  luggageCapacity?: number;
  inclusions?: string[];       // text-only from API's [{text,image}]
  exclusions?: string[];
  carImage?: string;           // URL from API
  carImageLarge?: string;      // URL from API
  tncData?: string[];          // Terms and conditions
  packageId?: string;          // Package ID from API (sent to advance_payment_check)
  [key: string]: unknown;
}

/** Raw GET /availabilities response from API */
export interface RawAvailabilityResponse {
  status: string;
  data: {
    [key: string]: {
      availableCars: RawAvailableCar[];
      soldoutCars: unknown[];
    };
  };
}

/** Raw car object from the API (before normalization) */
export interface RawAvailableCar {
  carId: number;
  carType: string;
  carName: string;
  carNameAlias: string;
  package: string;
  rates: {
    discounted: { totalAmount: number; extraKilometer: number; nightCharge: number; packageKilometer: number; packageHour?: number; driverAllowance: number; [key: string]: unknown };
    regular: { totalAmount: number; extraKilometer: number; nightCharge: number; packageKilometer: number; [key: string]: unknown };
  };
  seatCapacity: number;
  lugguageCapacity: number;   // API typo
  inclusions: { text: string; image: string }[];
  exclusions: { text: string; image: string }[];
  facilities: { text: string; image: string }[];
  tnc_data: string[];
  carImage: string;
  carImageLarge: string;
  soldoutFlag: boolean;
  [key: string]: unknown;
}

/** Normalized response used by the app */
export interface AvailabilityResponse {
  status?: string;
  cars: AvailableCar[];
  [key: string]: unknown;
}
