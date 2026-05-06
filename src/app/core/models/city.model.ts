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
  aid?: string;              // Airport ID from source-cities API (e.g. "10" for Bangalore Airport)
  ll?: string;               // "12.966,77.606" (lat,lng from SavaariCity)
  /** Comma-separated tokens from GET /airport-list (e.g. IATA, area names) for autocomplete */
  airportSearchKeywords?: string;
}

/** Raw row from GET /airport-list (terminal-level or legacy SavaariCity shape). */
export interface AirportListRow {
  cityId?: number | string;
  cityName?: string;
  cityOnly?: string;
  stateOnly?: string;
  airportAddress?: string;
  airportLatLong?: string;
  airportId?: number | string;
  searchKeyword?: string;
  is_airport?: string;
  aid?: string;
  ll?: string;
  top_dest_ids?: string;
  [key: string]: unknown;
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
    aid: raw.aid,
    ll: raw.ll,
  };
}

/** Normalize airport-list API rows to City (handles terminal rows with airportAddress + searchKeyword). */
export function toAirportListCity(raw: AirportListRow | SavaariCity): City {
  const r = raw as AirportListRow;
  if (r.airportAddress != null && String(r.airportAddress).trim() !== '') {
    const cityId = Number(r.cityId);
    const cityName = r.cityName != null ? String(r.cityName) : '';
    return {
      id: Number.isFinite(cityId) ? cityId : 0,
      name: String(r.airportAddress),
      cityOnly: r.cityOnly ?? (cityName ? cityName.split(',')[0].trim() : undefined),
      state: r.stateOnly ?? (cityName.includes(',') ? cityName.split(',').slice(1).join(',').trim() : undefined),
      isAirport: true,
      aid: r.airportId != null ? String(r.airportId) : r.aid,
      ll: (r.airportLatLong ?? r.ll) as string | undefined,
      airportSearchKeywords: typeof r.searchKeyword === 'string' ? r.searchKeyword : undefined,
    };
  }
  return toCity(raw as SavaariCity);
}
