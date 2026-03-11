/**
 * City models — confirmed from live API responses.
 *
 * GET /source-cities   → api.savaari.com/partner_api/public/source-cities
 * GET /destination-cities → api.savaari.com/partner_api/public/destination-cities
 *
 * Response wrapped in: { "status": "success", "data": [...] }
 */

/** Raw city object from the API response */
export interface SavaariCity {
  cityId: number;
  cityName: string;          // "Bangalore, Karnataka"
  cityOnly: string;          // "Bangalore"
  stateOnly: string;         // "Karnataka"
  top_dest_ids: string;      // "1222,2754,4346,153,4508,2769" (comma-separated)
  ll: string;                // "12.966,77.606" (lat,lng)
  aid: string;               // agent id? "859"
  org: string;               // origin name "Bangalore"
  is_airport: string;        // "0" or "1"
  [key: string]: unknown;
}

/** Wrapper response from source-cities and destination-cities endpoints */
export interface CityApiResponse {
  status: string;            // "success"
  data: SavaariCity[];
}

/**
 * Normalized city for internal use (autocomplete, display, etc.)
 * Keeps id/name for compatibility with existing PrimeNG AutoComplete bindings.
 */
export interface City {
  id: number;                // = cityId from API
  name: string;              // = cityName from API ("Bangalore, Karnataka")
  cityOnly?: string;         // "Bangalore" (short name for display)
  state?: string;            // "Karnataka"
  isAirport?: boolean;
}

/** GET /localities — required for Airport transfers */
export interface Locality {
  id: number;
  name: string;
  cityId?: number;
}

/** Convert raw API city to our normalized City interface */
export function toCity(raw: SavaariCity): City {
  return {
    id: raw.cityId,
    name: raw.cityName,
    cityOnly: raw.cityOnly,
    state: raw.stateOnly,
    isAirport: raw.is_airport === '1',
  };
}
