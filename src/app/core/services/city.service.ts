import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap, shareReplay, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ErrorHandlerService } from './error-handler.service';
import { City, Locality } from '../models';
import { environment } from '../../../environments/environment';
import { MOCK_SOURCE_CITIES, MOCK_DESTINATION_CITIES, MOCK_LOCALITIES } from '../mocks/mock-cities';

/**
 * Service for city and locality lookups.
 *
 * Caches results in memory to avoid redundant API calls --
 * city lists don't change during a session.
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
   * POST /source-cities.php
   */
  getSourceCities(tripType: string, subTripType: string): Observable<City[]> {
    if (environment.useMockData) {
      return of(MOCK_SOURCE_CITIES);
    }

    const cacheKey = `${tripType}:${subTripType}`;
    if (this.sourceCitiesCache.has(cacheKey)) {
      return of(this.sourceCitiesCache.get(cacheKey)!);
    }

    return this.api.post<City[]>('source-cities.php', {
      tripType,
      subTripType,
    }).pipe(
      tap(cities => this.sourceCitiesCache.set(cacheKey, cities)),
      shareReplay(1),
      catchError(err => this.errorHandler.handleApiError(err, 'CityService.getSourceCities'))
    );
  }

  /**
   * Get destination cities for a given source city and trip type.
   * POST /destination-cities.php
   */
  getDestinationCities(tripType: string, subTripType: string, sourceCityId: number): Observable<City[]> {
    if (environment.useMockData) {
      return of(MOCK_DESTINATION_CITIES);
    }

    const cacheKey = `${tripType}:${subTripType}:${sourceCityId}`;
    if (this.destinationCitiesCache.has(cacheKey)) {
      return of(this.destinationCitiesCache.get(cacheKey)!);
    }

    return this.api.post<City[]>('destination-cities.php', {
      tripType,
      subTripType,
      sourceCity: sourceCityId,
    }).pipe(
      tap(cities => this.destinationCitiesCache.set(cacheKey, cities)),
      shareReplay(1),
      catchError(err => this.errorHandler.handleApiError(err, 'CityService.getDestinationCities'))
    );
  }

  /**
   * Get localities for airport transfers.
   * GET /localities.php
   */
  getLocalities(): Observable<Locality[]> {
    if (environment.useMockData) {
      return of(MOCK_LOCALITIES);
    }

    if (this.localitiesCache) {
      return of(this.localitiesCache);
    }

    return this.api.get<Locality[]>('localities.php', {}).pipe(
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

  /** Clear all cached data (e.g. on logout). */
  clearCache(): void {
    this.sourceCitiesCache.clear();
    this.destinationCitiesCache.clear();
    this.localitiesCache = null;
  }
}
