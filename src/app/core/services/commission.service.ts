import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap, map, shareReplay, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ErrorHandlerService } from './error-handler.service';
import { CommissionApiResponse, CommissionData } from '../models';
import { environment } from '../../../environments/environment';
import { DEMO_COMMISSION } from '../demo/demo-data';

/**
 * Fetches agent commission/markup settings from the Savaari B2B API.
 *
 * Confirmed from live API (March 2026):
 *   GET /user/get-commission → api23.savaari.com/user/get-commission
 *   Params: userEmail, token (B2B RSA JWT)
 *   Returns: { statusCode: 200, message, commission: { ...fields } }
 *
 * Commission fields are all strings — parseFloat where needed.
 */
@Injectable({ providedIn: 'root' })
export class CommissionService {
  private cachedCommission: CommissionData | null = null;
  private inFlight$: Observable<CommissionData> | null = null;

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private errorHandler: ErrorHandlerService
  ) {}

  /**
   * Get the agent's commission data (cached after first call).
   * Returns the commission object from the API with all fields.
   */
  getCommission(): Observable<CommissionData> {
    if (environment.demoMode) {
      if (!this.cachedCommission) this.cachedCommission = DEMO_COMMISSION.commission as any;
      return of(this.cachedCommission!);
    }
    if (this.cachedCommission) {
      return of(this.cachedCommission);
    }

    if (this.inFlight$) {
      return this.inFlight$;
    }

    this.inFlight$ = this.api.b2bGet<CommissionApiResponse>('user/get-commission', {
      userEmail: this.auth.getUserEmail(),
      token: this.auth.getB2bToken(),
    }).pipe(
      map(response => {
        // Commission is agent-specific — can't proceed with defaults because
        // markup, display flag, invoice payer, and enabled trip types all
        // drive real money + UI gating.
        if (!response || !response.commission) {
          throw new Error('Commission data missing from API response');
        }
        return response.commission;
      }),
      tap(commission => {
        this.cachedCommission = commission;
        this.inFlight$ = null;
        if (!environment.production) console.log('[COMMISSION] Loaded:', {
          airport: commission.airport_commision,
          local: commission.local_commision,
          outstation: commission.outstation_commision,
          displayFlag: commission.display_commission_flag,
        });
      }),
      shareReplay(1),
      catchError(err => {
        this.inFlight$ = null;
        console.error('[COMMISSION] API error:', err);
        return this.errorHandler.handleApiError(err, 'CommissionService');
      })
    );

    return this.inFlight$;
  }

  /**
   * Get the commission percentage for a given trip type.
   * Returns a number (e.g. 10 for 10%).
   */
  getCommissionPercent(tripType: 'airport' | 'local' | 'outstation'): number {
    if (!this.cachedCommission) return 0;
    const field = `${tripType}_commision`; // API uses "commision" (typo)
    return parseFloat(this.cachedCommission[field]) || 0;
  }

  /**
   * Get the fixed commission amount for a given trip type.
   */
  getCommissionAmount(tripType: 'airport' | 'local' | 'outstation'): number {
    if (!this.cachedCommission) return 0;
    const field = `${tripType}_commission_amount`;
    return parseFloat(this.cachedCommission[field]) || 0;
  }

  /**
   * Get the rate bump-up percentage for a given trip type.
   * Negative values mean the agent gets a discounted fare.
   */
  getRateBumpUp(tripType: 'airport' | 'local' | 'outstation'): number {
    if (!this.cachedCommission) return 0;
    const field = `${tripType}_rate_bump_up`;
    return parseFloat(this.cachedCommission[field]) || 0;
  }

  /**
   * Check if commission should be displayed to the agent.
   */
  shouldDisplayCommission(): boolean {
    return this.cachedCommission?.display_commission_flag === '1';
  }

  /**
   * Check if the agent is a wallet user.
   */
  isWalletUser(): boolean {
    return this.cachedCommission?.wallet_user === '1';
  }

  /**
   * Get the invoice payer type.
   */
  getInvoicePayer(): string {
    return this.cachedCommission?.invoice_payer || 'pay_by_agent';
  }

  /**
   * Check which trip types are enabled for this agent.
   */
  getEnabledTripTypes(): { oneway: boolean; roundtrip: boolean; local: boolean; transfer: boolean } {
    if (!this.cachedCommission) {
      return { oneway: true, roundtrip: true, local: true, transfer: true };
    }
    return {
      oneway: this.cachedCommission.enable_oneway === '1',
      roundtrip: this.cachedCommission.enable_roundtrip === '1',
      local: this.cachedCommission.enable_local === '1',
      transfer: this.cachedCommission.enable_transfer === '1',
    };
  }

  /**
   * Update agent's commission/markup settings via API.
   * POST /user/update-commission
   *
   * Confirmed from live API (March 2026):
   *   POST https://api23.betasavaari.com/user/update-commission
   *   Body: JSON with userEmail, token, and rate_bump_up fields
   *   Returns: { statusCode: 200, message, result: true }
   */
  updateCommission(updates: Record<string, string | number>): Observable<{ statusCode: number; message: string; result: boolean }> {
    if (environment.demoMode) return of({ statusCode: 200, message: 'Updated (demo)', result: true });
    const body = {
      userEmail: this.auth.getUserEmail(),
      token: this.auth.getB2bToken(),
      ...updates,
    };

    return this.api.b2bPost<{ statusCode: number; message: string; result: boolean }>('user/update-commission', body).pipe(
      tap(resp => {
        if (resp.statusCode === 200 && this.cachedCommission) {
          // Update local cache
          Object.entries(updates).forEach(([key, val]) => {
            (this.cachedCommission as any)[key] = String(val);
          });
        }
      }),
      catchError(err => this.errorHandler.handleApiError(err, 'CommissionService.updateCommission'))
    );
  }

  clearCache(): void {
    this.cachedCommission = null;
    this.inFlight$ = null;
  }
}
