/**
 * Trip type models.
 *
 * GET /trip-types.php          -- all supported trip types
 * GET /sub-trip-types.php      -- sub-trip types for a given trip type
 * GET /local-sub-trip-types.php -- local + airport sub-trip types
 */

export interface TripType {
  id?: number | string;
  name: string;
  value: string;   // The exact string value the API accepts
  [key: string]: unknown;
}

export interface SubTripType {
  id?: number | string;
  name: string;
  value: string;
  tripType?: string;
  [key: string]: unknown;
}

/**
 * Known sub-trip type values from the API documentation.
 * These are used in availability and booking requests.
 */
export const SUB_TRIP_TYPE_VALUES = {
  ONE_WAY: 'oneWay',
  ROUND_TRIP: 'roundTrip',
  LOCAL_8HR_80KM: '880',
  LOCAL_8HR_80KM_P2D: '880P2D',
  LOCAL_4HR_40KM: '440',
  LOCAL_12HR_120KM: '12120',
  AIRPORT_PICKUP: 'pickup_airport',
  AIRPORT_DROP: 'drop_airport',
} as const;

/**
 * Known trip type values from the API documentation.
 */
export const TRIP_TYPE_VALUES = {
  LOCAL: 'local',
  OUTSTATION: 'outstation',
  AIRPORT: 'airport',
} as const;

/** GET /car-types.php response entry */
export interface CarType {
  id: number;
  name: string;
  [key: string]: unknown;
}

/**
 * Known car type IDs from API documentation.
 */
export const CAR_TYPE_IDS: Record<number, string> = {
  4:  'Tata Indigo or Equivalent',
  5:  'Honda City or Equivalent',
  6:  'Mercedes E Class',
  7:  'Ertiga or Equivalent',
  49: 'Swift Dzire or Equivalent (CNG)',
  52: 'SUV (6+1 seater)',
  53: 'SUV (7+1 seater)',
  54: 'SUV (6+1 seater) CNG',
  48: 'Tempo Traveller or Equivalent (12+1)',
  57: 'Tempo Traveller or Equivalent (13+1)',
  56: 'Minibus or Equivalent (20+1)',
  58: 'Minibus or Equivalent (25+1)',
};
