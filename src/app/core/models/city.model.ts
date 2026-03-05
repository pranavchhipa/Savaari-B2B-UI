/**
 * City models.
 *
 * IMPORTANT: The Savaari API uses integer IDs for cities, not names.
 * e.g. 377 = Bangalore, 145 = New Delhi, 81 = Chennai, 114 = Mumbai
 *
 * The exact shape of city objects will be confirmed once we get
 * sample responses from the Savaari tech team.
 */

export interface City {
  id: number;
  name: string;
  state?: string;
}

/** POST /source-cities.php request */
export interface SourceCitiesRequest {
  tripType: string;
  subTripType: string;
}

/** POST /destination-cities.php request */
export interface DestinationCitiesRequest {
  tripType: string;
  subTripType: string;
  sourceCity: number;
}

/** GET /localities.php -- required for Airport transfers */
export interface Locality {
  id: number;
  name: string;
  cityId?: number;
}
