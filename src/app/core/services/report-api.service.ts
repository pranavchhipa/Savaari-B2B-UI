import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ErrorHandlerService } from './error-handler.service';
import {
  ReportDetailedEntry,
} from '../models';
import { environment } from '../../../environments/environment';
import {
  MOCK_REPORT_DETAILED,
} from '../mocks/mock-reports';

/**
 * Fetches booking reports from the Savaari B2B API.
 *
 * Confirmed from live site:
 *   GET /booking-details-report → api23.savaari.com/booking-details-report
 *   Params: userEmail, token (B2B RSA JWT), fromDate (Unix ts), toDate (Unix ts)
 *   Status 204 = no records for the given period.
 *
 * IMPORTANT: Dates are Unix timestamps (seconds), NOT DD-MM-YYYY!
 *
 * NOTE: The live site only showed one report endpoint (booking-details-report).
 * The separate overview/cancellation/financial endpoints from the original
 * API docs may not exist on the B2B API. For now, we use the single
 * confirmed endpoint and derive sub-reports from the data.
 */
@Injectable({ providedIn: 'root' })
export class ReportApiService {

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private errorHandler: ErrorHandlerService
  ) {}

  private reportParams(fromDate: number, toDate: number) {
    return {
      userEmail: this.auth.getUserEmail(),
      token: this.auth.getB2bToken(),
      fromDate,
      toDate,
    };
  }

  /**
   * GET /booking-details-report — confirmed endpoint from live site.
   * Returns booking records for the given date range.
   * Dates must be Unix timestamps in seconds.
   */
  getReport(fromDate: number, toDate: number): Observable<ReportDetailedEntry[]> {
    if (environment.useMockData) return of(MOCK_REPORT_DETAILED);
    return this.api.b2bGet<any>(
      'booking-details-report', this.reportParams(fromDate, toDate)
    ).pipe(
      map(response => {
        // 204 No Content returns null
        if (!response) return [];
        // If response is already an array, use it directly
        if (Array.isArray(response)) return response;
        // API may return wrapped object (similar to booking-details)
        if (response.bookingDetails) {
          const details = response.bookingDetails;
          if (Array.isArray(details)) return details;
          // May be pre-categorized like booking-details
          const upcoming: any[] = details.bookingUpcoming || [];
          const completed: any[] = details.bookingCompleted || [];
          const cancelled: any[] = details.bookingCancelled || [];
          return [...upcoming, ...completed, ...cancelled];
        }
        // If response has a data array
        if (Array.isArray(response.data)) return response.data;
        return [];
      }),
      catchError(err => this.errorHandler.handleApiError(err, 'ReportApiService.getReport'))
    );
  }

  /**
   * Convenience: convert Date objects to Unix timestamps and call getReport.
   */
  getReportByDates(fromDate: Date, toDate: Date): Observable<ReportDetailedEntry[]> {
    return this.getReport(
      Math.floor(fromDate.getTime() / 1000),
      Math.floor(toDate.getTime() / 1000)
    );
  }
}
