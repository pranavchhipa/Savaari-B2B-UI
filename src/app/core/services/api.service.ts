import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Base API service for all Savaari API calls.
 *
 * ARCHITECTURE: All Savaari endpoints use GET with query params.
 * Two separate API domains:
 *   - Partner API (partnerApiBaseUrl): cities, availability
 *   - B2B API (b2bApiBaseUrl): bookings, reports, commission
 */
@Injectable({ providedIn: 'root' })
export class ApiService {

  constructor(private http: HttpClient) {}

  /**
   * GET from the Partner API (api.savaari.com/partner_api/public/).
   * Used for: source-cities, destination-cities, availabilities
   */
  partnerGet<T>(endpoint: string, params: Record<string, string | number | boolean | undefined | null>): Observable<T> {
    const httpParams = new HttpParams({ fromObject: this.cleanParams(params) });
    return this.http.get<T>(`${environment.partnerApiBaseUrl}/${endpoint}`, { params: httpParams });
  }

  /**
   * GET from the B2B API (api23.savaari.com/).
   * Used for: booking-details, booking-details-report, user/get-commission
   */
  b2bGet<T>(endpoint: string, params: Record<string, string | number | boolean | undefined | null>): Observable<T> {
    const httpParams = new HttpParams({ fromObject: this.cleanParams(params) });
    return this.http.get<T>(`${environment.b2bApiBaseUrl}/${endpoint}`, { params: httpParams });
  }

  /**
   * POST to the B2B API with JSON body.
   * Used for: user/login
   */
  b2bPost<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${environment.b2bApiBaseUrl}/${endpoint}`, body);
  }

  /**
   * POST to the B2B API with raw string body and custom Content-Type.
   * Used for: user/autologin (Content-Type: text/plain per Postman)
   */
  b2bPostRaw<T>(endpoint: string, body: string, contentType: string): Observable<T> {
    return this.http.post<T>(`${environment.b2bApiBaseUrl}/${endpoint}`, body, {
      headers: { 'Content-Type': contentType }
    });
  }

  /**
   * GET from the Partner API with no params.
   * Used for: auth/webtoken (no auth required)
   */
  partnerGetNoParams<T>(endpoint: string): Observable<T> {
    return this.http.get<T>(`${environment.partnerApiBaseUrl}/${endpoint}`);
  }

  /**
   * POST to the Partner API with form-encoded body and token as query param.
   * Used for: booking (create), booking/update_invoice_payer_info
   *
   * Confirmed from live site (March 2026):
   *   POST /booking?token=<partnerJWT> → 201 Created
   *   Body: application/x-www-form-urlencoded
   */
  partnerPostForm<T>(endpoint: string, body: Record<string, string | number | boolean | undefined | null>, queryParams?: Record<string, string>): Observable<T> {
    const formBody = new HttpParams({ fromObject: this.cleanParams(body) });
    let url = `${environment.partnerApiBaseUrl}/${endpoint}`;
    if (queryParams) {
      const qp = new HttpParams({ fromObject: queryParams });
      url += `?${qp.toString()}`;
    }
    return this.http.post<T>(url, formBody.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  }

  /**
   * POST to the B2B API with form-encoded body.
   * Used for: user/update-profile (confirmed from beta site — sends form data, not JSON)
   */
  b2bPostForm<T>(endpoint: string, body: Record<string, string | number | boolean | undefined | null>): Observable<T> {
    const formBody = new HttpParams({ fromObject: this.cleanParams(body) });
    return this.http.post<T>(`${environment.b2bApiBaseUrl}/${endpoint}`, formBody.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
  }

  /**
   * POST to the Payment PHP API (b2bcab.betasavaari.com).
   * Used for: advance_payment_check.php, razor_createorder.php,
   *           razor_checkhash.php, payment_confirmation/confirmation.php
   *
   * Confirmed from Postman: all PHP endpoints use form-encoded body.
   */
  paymentPost<T>(endpoint: string, body: Record<string, string | number | boolean | undefined | null>): Observable<T> {
    const formBody = new HttpParams({ fromObject: this.cleanParams(body) });
    return this.http.post<T>(`${environment.paymentApiBaseUrl}/${endpoint}`, formBody.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
    });
  }

  /**
   * POST to the Payment PHP API with FormData (multipart/form-data).
   * Used for: razor_checkhash.php (confirmed from Postman)
   */
  paymentPostFormData<T>(endpoint: string, formData: FormData): Observable<T> {
    return this.http.post<T>(`${environment.paymentApiBaseUrl}/${endpoint}`, formData);
  }

  /**
   * POST to the Wallet API (apiext.betasavaari.com/wallet/public/).
   * Token goes in Authorization: Bearer header per wallet TRD.
   * Used for: wallet/balance, wallet/create, wallet/history, wallet/topup/*, wallet/pay-booking, wallet/refund
   */
  walletPost<T>(endpoint: string, body: unknown, token: string): Observable<T> {
    return this.http.post<T>(`${environment.walletApiBaseUrl}/${endpoint}`, body, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  }

  /**
   * Strip undefined/null values and convert everything to strings.
   * HttpParams requires all values to be strings.
   * Empty strings are KEPT — live site sends empty params like subTripType=&customerLatLong=
   */
  private cleanParams(params: Record<string, string | number | boolean | undefined | null>): Record<string, string> {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        cleaned[key] = String(value);
      }
    }
    return cleaned;
  }
}
