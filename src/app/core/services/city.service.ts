import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap, map, shareReplay, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ErrorHandlerService } from './error-handler.service';
import { City, CityApiResponse, toCity, Locality } from '../models';
import { environment } from '../../../environments/environment';
import { MOCK_SOURCE_CITIES, MOCK_DESTINATION_CITIES, MOCK_LOCALITIES } from '../mocks/mock-cities';

/**
 * Service for city and locality lookups.
 *
 * Uses Partner API: GET /source-cities, GET /destination-cities
 * Response wrapped in { "status": "success", "data": [...] }
 * Token passed as query param.
 *
 * Caches results in memory — city lists don't change during a session.
 */
@Injectable({ providedIn: 'root' })
export class CityService {
  private sourceCitiesCache = new Map<string, City[]>();
  private destinationCitiesCache = new Map<string, City[]>();
  private localitiesCache: Locality[] | null = null;

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private errorHandler: ErrorHandlerService
  ) {}

  /**
   * Get source cities for a given trip type.
   * GET /source-cities?tripType=...&subTripType=...&token=...
   */
  getSourceCities(tripType: string, subTripType: string): Observable<City[]> {
    if (environment.useMockData) {
      return of(MOCK_SOURCE_CITIES);
    }

    const cacheKey = `${tripType}:${subTripType}`;
    if (this.sourceCitiesCache.has(cacheKey)) {
      return of(this.sourceCitiesCache.get(cacheKey)!);
    }

    return this.api.partnerGet<CityApiResponse>('source-cities', {
      tripType,
      subTripType,
      token: this.auth.getPartnerToken(),
    }).pipe(
      map(response => response.data.map(toCity)),
      tap(cities => this.sourceCitiesCache.set(cacheKey, cities)),
      shareReplay(1),
      catchError(err => this.errorHandler.handleApiError(err, 'CityService.getSourceCities'))
    );
  }

  /**
   * Get destination cities for a given source city and trip type.
   * GET /destination-cities?tripType=...&subTripType=...&sourceCity=...&token=...
   */
  getDestinationCities(tripType: string, subTripType: string, sourceCityId: number): Observable<City[]> {
    if (environment.useMockData) {
      return of(MOCK_DESTINATION_CITIES);
    }

    const cacheKey = `${tripType}:${subTripType}:${sourceCityId}`;
    if (this.destinationCitiesCache.has(cacheKey)) {
      return of(this.destinationCitiesCache.get(cacheKey)!);
    }

    return this.api.partnerGet<CityApiResponse>('destination-cities', {
      tripType,
      subTripType,
      sourceCity: sourceCityId,
      token: this.auth.getPartnerToken(),
    }).pipe(
      map(response => response.data.map(toCity)),
      tap(cities => this.destinationCitiesCache.set(cacheKey, cities)),
      shareReplay(1),
      catchError(err => this.errorHandler.handleApiError(err, 'CityService.getDestinationCities'))
    );
  }

  /**
   * Get localities for airport transfers.
   * GET /localities (endpoint not yet confirmed on live site)
   */
  getLocalities(): Observable<Locality[]> {
    if (environment.useMockData) {
      return of(MOCK_LOCALITIES);
    }

    if (this.localitiesCache) {
      return of(this.localitiesCache);
    }

    return this.api.partnerGet<Locality[]>('localities', {
      token: this.auth.getPartnerToken(),
    }).pipe(
      tap(localities => this.localitiesCache = localities),
      shareReplay(1),
      catchError(err => this.errorHandler.handleApiError(err, 'CityService.getLocalities'))
    );
  }

  /**
   * Find a city by name (case-insensitive).
   * Useful for matching user input to a city ID.
   */
  findCityByName(cities: City[], name: string): City | undefined {
    const normalized = name.trim().toLowerCase();
    return cities.find(c => c.name.toLowerCase() === normalized);
  }

  /**
   * Get the lat,lng string for a city by ID from any cached city list.
   * Used by booking page to get city coordinates for autocomplete API.
   * Returns undefined if city not found in cache.
   */
  getCityLL(cityId: number): string | undefined {
    for (const cities of this.sourceCitiesCache.values()) {
      const city = cities.find(c => c.id === cityId);
      if (city?.ll) return city.ll;
    }
    for (const cities of this.destinationCitiesCache.values()) {
      const city = cities.find(c => c.id === cityId);
      if (city?.ll) return city.ll;
    }
    return undefined;
  }

  /** Clear all cached data (e.g. on logout). */
  clearCache(): void {
    this.sourceCitiesCache.clear();
    this.destinationCitiesCache.clear();
    this.localitiesCache = null;
  }
}
