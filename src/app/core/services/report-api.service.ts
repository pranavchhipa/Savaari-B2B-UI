import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ErrorHandlerService } from './error-handler.service';
import {
  ReportOverview,
  ReportDetailedEntry,
  ReportCancellationEntry,
  ReportFinancialEntry,
} from '../models';
import { environment } from '../../../environments/environment';
import {
  MOCK_REPORT_OVERVIEW,
  MOCK_REPORT_DETAILED,
  MOCK_REPORT_CANCELLATIONS,
  MOCK_REPORT_FINANCIAL,
} from '../mocks/mock-reports';

/**
 * Fetches booking reports from the Savaari API.
 *
 * All four endpoints are GET with shared params: token, fromDate, toDate, filterType.
 */
@Injectable({ providedIn: 'root' })
export class ReportApiService {

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private errorHandler: ErrorHandlerService
  ) {}

  private reportParams(fromDate: string, toDate: string, filterType = 'booking_date') {
    return {
      token: this.auth.getToken(),
      fromDate,
      toDate,
      filterType,
    };
  }

  /** GET /report-overview.php */
  getOverview(fromDate: string, toDate: string, filterType?: string): Observable<ReportOverview> {
    if (environment.useMockData) return of(MOCK_REPORT_OVERVIEW);
    return this.api.get<ReportOverview>(
      'report-overview.php', this.reportParams(fromDate, toDate, filterType)
    ).pipe(catchError(err => this.errorHandler.handleApiError(err, 'ReportApiService.overview')));
  }

  /** GET /report-detailed.php */
  getDetailed(fromDate: string, toDate: string, filterType?: string): Observable<ReportDetailedEntry[]> {
    if (environment.useMockData) return of(MOCK_REPORT_DETAILED);
    return this.api.get<ReportDetailedEntry[]>(
      'report-detailed.php', this.reportParams(fromDate, toDate, filterType)
    ).pipe(catchError(err => this.errorHandler.handleApiError(err, 'ReportApiService.detailed')));
  }

  /** GET /report-cancellation.php */
  getCancellations(fromDate: string, toDate: string, filterType?: string): Observable<ReportCancellationEntry[]> {
    if (environment.useMockData) return of(MOCK_REPORT_CANCELLATIONS);
    return this.api.get<ReportCancellationEntry[]>(
      'report-cancellation.php', this.reportParams(fromDate, toDate, filterType)
    ).pipe(catchError(err => this.errorHandler.handleApiError(err, 'ReportApiService.cancellations')));
  }

  /** GET /report-financial.php */
  getFinancial(fromDate: string, toDate: string, filterType?: string): Observable<ReportFinancialEntry[]> {
    if (environment.useMockData) return of(MOCK_REPORT_FINANCIAL);
    return this.api.get<ReportFinancialEntry[]>(
      'report-financial.php', this.reportParams(fromDate, toDate, filterType)
    ).pipe(catchError(err => this.errorHandler.handleApiError(err, 'ReportApiService.financial')));
  }
}
