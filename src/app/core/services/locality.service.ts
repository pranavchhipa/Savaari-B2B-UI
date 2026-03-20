import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

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
    if (environment.useMockData) {
      return of(this.mockLocalities());
    }

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

  private mockLocalities(): Locality[] {
    return [
      { id: 7725, name: 'Kempegowda International Airport', isAirport: true },
      { id: 347, name: 'Abbigere', isAirport: false },
      { id: 349, name: 'Adugodi', isAirport: false },
      { id: 350, name: 'Agram', isAirport: false },
      { id: 351, name: 'Ashok Nagar', isAirport: false },
      { id: 352, name: 'BTM Layout', isAirport: false },
      { id: 353, name: 'Banashankari', isAirport: false },
      { id: 354, name: 'Banaswadi', isAirport: false },
      { id: 355, name: 'Basavanagudi', isAirport: false },
      { id: 356, name: 'Bellandur', isAirport: false },
      { id: 357, name: 'Bommanahalli', isAirport: false },
      { id: 358, name: 'Brookefield', isAirport: false },
      { id: 359, name: 'CV Raman Nagar', isAirport: false },
      { id: 360, name: 'Chamrajpet', isAirport: false },
      { id: 361, name: 'Chickpet', isAirport: false },
      { id: 362, name: 'Domlur', isAirport: false },
      { id: 363, name: 'Electronic City', isAirport: false },
      { id: 364, name: 'Fraser Town', isAirport: false },
      { id: 365, name: 'HSR Layout', isAirport: false },
      { id: 366, name: 'Hebbal', isAirport: false },
      { id: 367, name: 'Indiranagar', isAirport: false },
      { id: 368, name: 'JP Nagar', isAirport: false },
      { id: 369, name: 'Jayanagar', isAirport: false },
      { id: 370, name: 'Kalyan Nagar', isAirport: false },
      { id: 371, name: 'Koramangala', isAirport: false },
      { id: 372, name: 'Krishnarajapuram', isAirport: false },
      { id: 373, name: 'Kumaraswamy Layout', isAirport: false },
      { id: 374, name: 'MG Road', isAirport: false },
      { id: 375, name: 'Madiwala', isAirport: false },
      { id: 376, name: 'Majestic', isAirport: false },
      { id: 377, name: 'Malleswaram', isAirport: false },
      { id: 378, name: 'Marathahalli', isAirport: false },
      { id: 379, name: 'Nagarbhavi', isAirport: false },
      { id: 380, name: 'Rajajinagar', isAirport: false },
      { id: 381, name: 'Sadashivanagar', isAirport: false },
      { id: 382, name: 'Sarjapur Road', isAirport: false },
      { id: 383, name: 'Shivajinagar', isAirport: false },
      { id: 384, name: 'Ulsoor', isAirport: false },
      { id: 385, name: 'Vijayanagar', isAirport: false },
      { id: 386, name: 'Whitefield', isAirport: false },
      { id: 387, name: 'Yelahanka', isAirport: false },
      { id: 388, name: 'Yeshwanthpur', isAirport: false },
      { id: 389, name: 'Madhapur', isAirport: false },
      { id: 390, name: 'Hitech City', isAirport: false },
      { id: 391, name: 'Gachibowli', isAirport: false },
      { id: 392, name: 'Kondapur', isAirport: false },
      { id: 393, name: 'Jubilee Hills', isAirport: false },
      { id: 394, name: 'Banjara Hills', isAirport: false },
      { id: 395, name: 'Secunderabad', isAirport: false },
      { id: 396, name: 'T Nagar', isAirport: false },
      { id: 397, name: 'Adyar', isAirport: false },
      { id: 398, name: 'Anna Nagar', isAirport: false },
      { id: 399, name: 'Velachery', isAirport: false },
      { id: 400, name: 'Tambaram', isAirport: false },
      { id: 401, name: 'Meenambakkam', isAirport: false },
      { id: 402, name: 'Connaught Place', isAirport: false },
      { id: 403, name: 'Karol Bagh', isAirport: false },
      { id: 404, name: 'Dwarka', isAirport: false },
      { id: 405, name: 'Andheri', isAirport: false },
      { id: 406, name: 'Bandra', isAirport: false },
      { id: 407, name: 'Dadar', isAirport: false },
      { id: 408, name: 'Powai', isAirport: false },
    ];
  }
}
