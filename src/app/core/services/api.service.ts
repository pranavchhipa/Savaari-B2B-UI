import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Base API service for all Savaari Partner API calls.
 *
 * Handles the critical detail that the Savaari API uses
 * application/x-www-form-urlencoded encoding (NOT JSON).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.apiBaseUrl;

  private readonly formHeaders = new HttpHeaders({
    'Content-Type': 'application/x-www-form-urlencoded',
  });

  constructor(private http: HttpClient) {}

  /**
   * POST with x-www-form-urlencoded body.
   * Used by: authenticate, availabilities, booking-create, booking-cancel,
   *          coupon-code, source-cities, destination-cities
   */
  post<T>(endpoint: string, params: Record<string, string | number | boolean | undefined | null>): Observable<T> {
    const body = new HttpParams({ fromObject: this.cleanParams(params) });
    return this.http.post<T>(
      `${this.baseUrl}/${endpoint}`,
      body.toString(),
      { headers: this.formHeaders }
    );
  }

  /**
   * GET with query parameters.
   * Used by: booking-get, car-types, localities, trip-types,
   *          sub-trip-types, local-sub-trip-types, all report endpoints
   */
  get<T>(endpoint: string, params: Record<string, string | number | boolean | undefined | null>): Observable<T> {
    const httpParams = new HttpParams({ fromObject: this.cleanParams(params) });
    return this.http.get<T>(`${this.baseUrl}/${endpoint}`, { params: httpParams });
  }

  /**
   * Strip undefined/null/empty values and convert everything to strings.
   * HttpParams requires all values to be strings.
   */
  private cleanParams(params: Record<string, string | number | boolean | undefined | null>): Record<string, string> {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        cleaned[key] = String(value);
      }
    }
    return cleaned;
  }
}
