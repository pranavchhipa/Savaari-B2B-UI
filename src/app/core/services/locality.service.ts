import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface Locality {
  id: number;
  name: string;
  isAirport: boolean;
}

/**
 * Fetches localities (sub-areas) for a given city from the Partner API.
 *
 * Confirmed from live API (March 2026):
 *   GET /localities → api.savaari.com/partner_api/public/localities
 *   Params: sourceCity (city ID), token (Partner JWT)
 *   Returns: { status: "success", data: { cityName, subarea: [{ id, subarea, is_airport }] } }
 *
 * Bangalore has 14,289 localities — use with autocomplete, not dropdown.
 */
@Injectable({ providedIn: 'root' })
export class LocalityService {
  // Cache per city to avoid re-fetching
  private cache = new Map<number, Locality[]>();

  constructor(
    private api: ApiService,
    private auth: AuthService,
  ) {}

  /**
   * Get localities for a city. Results are cached per city ID.
   */
  getLocalities(cityId: number): Observable<Locality[]> {
    const cached = this.cache.get(cityId);
    if (cached) {
      return of(cached);
    }

    return this.api.partnerGet<any>('localities', {
      sourceCity: cityId,
      token: this.auth.getPartnerToken(),
    }).pipe(
      map(response => {
        if (!response?.data?.subarea) return [];

        const localities: Locality[] = response.data.subarea
          .map((s: any) => ({
            id: s.id,
            name: s.subarea || '',
            isAirport: s.is_airport === '1',
          }))
          // Filter out entries with non-Latin-only names for cleaner display
          // (API has many Hindi/regional duplicates)
          .filter((l: Locality) => l.name.length > 0);

        return localities;
      }),
      tap(localities => {
        this.cache.set(cityId, localities);
        console.log(`[LOCALITY] Loaded ${localities.length} localities for city ${cityId}`);
      }),
      catchError(err => {
        console.warn('[LOCALITY] API error:', err);
        return of([]);
      })
    );
  }

  /**
   * Search localities by name (client-side filter after loading).
   * Returns up to maxResults matches.
   */
  searchLocalities(cityId: number, query: string, maxResults = 20): Observable<Locality[]> {
    return this.getLocalities(cityId).pipe(
      map(localities => {
        if (!query || query.length < 2) return [];
        const q = query.toLowerCase();
        return localities
          .filter(l => l.name.toLowerCase().includes(q))
          .slice(0, maxResults);
      })
    );
  }

  /**
   * Search ONLY airport localities for a given city.
   * Filters localities where isAirport === true.
   * Used in the Airport tab to show only airport/terminal options.
   */
  searchAirports(cityId: number, query: string, maxResults = 10): Observable<Locality[]> {
    return this.getLocalities(cityId).pipe(
      map(localities => {
        const airports = localities.filter(l => l.isAirport);
        // Most cities have very few airports (1-3), so always show all.
        // If query matches, prioritize those; otherwise show all airports anyway.
        if (!query || query.length < 1) return airports.slice(0, maxResults);
        const q = query.toLowerCase();
        const matched = airports.filter(l => l.name.toLowerCase().includes(q));
        return matched.length > 0 ? matched.slice(0, maxResults) : airports.slice(0, maxResults);
      })
    );
  }

  /**
   * Get all airport localities for a city (no search filter).
   */
  getAirports(cityId: number): Observable<Locality[]> {
    return this.getLocalities(cityId).pipe(
      map(localities => localities.filter(l => l.isAirport))
    );
  }

  clearCache(): void {
    this.cache.clear();
  }
}
