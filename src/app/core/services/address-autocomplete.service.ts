import { Injectable, inject } from '@angular/core';
import { Observable, of, map } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

/**
 * Savaari Address Autocomplete Service.
 *
 * Replaces Google Maps Places API with Savaari's own endpoints:
 *   1. GET /autocomplete/info.php — search addresses by query
 *   2. GET /place_id/info.php — get place details by place_id
 *
 * Confirmed by Shubhendu (March 2026):
 *   - rsource = b2b
 *   - token = partner session token (valid 20 min, refreshes on place_id call)
 *   - request = 'from' | 'to'
 *   - query aligned with city and state if city is set
 *   - lat/lng/city filled on booking page (3rd step)
 */

export interface AddressSuggestion {
  description: string;     // Full address text
  place_id: string;        // Savaari place ID (use in place_id API)
  main_text?: string;      // Primary text (e.g. street name)
  secondary_text?: string; // Secondary text (e.g. city, state)
}

export interface PlaceDetails {
  place_id: string;
  name: string;            // Short name
  formatted_address: string;
  lat: number;
  lng: number;
}

@Injectable({ providedIn: 'root' })
export class AddressAutocompleteService {

  private api = inject(ApiService);
  private auth = inject(AuthService);

  /**
   * Search addresses using Savaari autocomplete API.
   *
   * @param query User-typed text
   * @param request 'from' or 'to'
   * @param city Optional city name (user-selected city on booking page)
   * @param lat Optional latitude
   * @param lng Optional longitude
   */
  searchAddress(query: string, request: 'from' | 'to' = 'from', city?: string, lat?: string, lng?: string): Observable<AddressSuggestion[]> {
    if (environment.useMockData) {
      return of([
        { description: `${query} - Mock Address 1, Bangalore`, place_id: 'mock_place_1', main_text: `${query} - Mock Address 1`, secondary_text: 'Bangalore' },
        { description: `${query} - Mock Address 2, Bangalore`, place_id: 'mock_place_2', main_text: `${query} - Mock Address 2`, secondary_text: 'Bangalore' },
      ]);
    }

    if (!query || query.length < 2) return of([]);

    return this.api.addressGet<any>('autocomplete/info.php', {
      query,
      lat: lat || '',
      lng: lng || '',
      city: city || '',
      request,
      token: this.auth.getPartnerToken(),
      rsource: 'b2b',
    }).pipe(
      map(response => this.parseAutocompleteResponse(response))
    );
  }

  /**
   * Get place details using Savaari place_id API.
   *
   * @param placeId Place ID from autocomplete response
   * @param request 'from' or 'to'
   */
  getPlaceDetails(placeId: string, request: 'from' | 'to' = 'from'): Observable<PlaceDetails | null> {
    if (environment.useMockData) {
      return of({
        place_id: placeId,
        name: 'Mock Address',
        formatted_address: 'Mock Address, Bangalore, Karnataka',
        lat: 12.9716,
        lng: 77.5946,
      });
    }

    if (!placeId) return of(null);

    return this.api.addressGet<any>('place_id/info.php', {
      place_id: placeId,
      request,
      token: this.auth.getPartnerToken(),
      rsource: 'b2b',
    }).pipe(
      map(response => this.parsePlaceResponse(response))
    );
  }

  /**
   * Parse autocomplete API response into AddressSuggestion[].
   * Response format TBD — adapt once we see actual response.
   */
  private parseAutocompleteResponse(response: any): AddressSuggestion[] {
    if (!response) return [];

    // Handle array response (most likely)
    const predictions = response.predictions || response.data || response.results || response;
    if (!Array.isArray(predictions)) return [];

    return predictions.map((p: any) => ({
      description: p.description || p.formatted_address || p.name || '',
      place_id: p.place_id || p.placeId || '',
      main_text: p.structured_formatting?.main_text || p.main_text || p.name || '',
      secondary_text: p.structured_formatting?.secondary_text || p.secondary_text || '',
    })).filter((s: AddressSuggestion) => s.description && s.place_id);
  }

  /**
   * Parse place_id API response into PlaceDetails.
   * Response format TBD — adapt once we see actual response.
   */
  private parsePlaceResponse(response: any): PlaceDetails | null {
    if (!response) return null;

    const result = response.result || response.data || response;
    if (!result) return null;

    const location = result.geometry?.location || result.location || result;

    return {
      place_id: result.place_id || result.placeId || '',
      name: result.name || result.short_name || '',
      formatted_address: result.formatted_address || result.address || result.name || '',
      lat: Number(location.lat) || 0,
      lng: Number(location.lng) || 0,
    };
  }
}
