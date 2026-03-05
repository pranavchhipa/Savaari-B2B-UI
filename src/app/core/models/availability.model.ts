/**
 * Availability models.
 *
 * POST /availabilities.php -- checks cab availability for a given itinerary.
 * The response shape will be confirmed from Savaari sample responses.
 */

export interface AvailabilityRequest {
  sourceCity: number;          // Integer city ID
  tripType: string;            // 'local' | 'outstation' | 'airport'
  subTripType: string;         // 'oneWay' | 'roundTrip' | '880' | '880P2D' | '440' | '12120' | 'pick_airport' | 'drop_airport'
  destinationCity?: number;    // Required for outstation
  pickupDateTime: string;      // Format: DD-MM-YYYY HH:MM
  duration?: number;           // Days -- required for outstation roundTrip
  localityId?: number;         // Required for airport transfers
}

/** A single car option returned from the availability API */
export interface AvailableCar {
  carTypeId: number;           // e.g. 4 = Tata Indigo, 7 = Ertiga
  carName: string;
  fare: number;
  kmsIncluded: number;
  extraKmRate: number;
  nightAllowance: number;
  tollsIncluded?: boolean;
  termsAndConditions?: string;
  [key: string]: unknown;      // Catch-all for fields we discover later
}

/** POST /availabilities.php response */
export interface AvailabilityResponse {
  status?: string;
  cars: AvailableCar[];
  [key: string]: unknown;
}
