import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap, map, shareReplay, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ErrorHandlerService } from './error-handler.service';
import { CommissionApiResponse, CommissionData } from '../models';
import { environment } from '../../../environments/environment';

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
    if (environment.useMockData) {
      return of(this.mockCommissionData());
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
        // Extract the commission object from the wrapper
        if (!response || !response.commission) {
          console.warn('[COMMISSION] No commission data in response');
          return this.mockCommissionData();
        }
        return response.commission;
      }),
      tap(commission => {
        this.cachedCommission = commission;
        this.inFlight$ = null;
        console.log('[COMMISSION] Loaded:', {
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

  clearCache(): void {
    this.cachedCommission = null;
    this.inFlight$ = null;
  }

  /** Mock data for development mode */
  private mockCommissionData(): CommissionData {
    return {
      id: '0',
      user_id: '983680',
      state_id: '10',
      city_id: '145',
      agent_gst: '',
      airport_commision: '10.00',
      local_commision: '8.00',
      outstation_commision: '10.00',
      airport_commission_amount: '0',
      local_commission_amount: '0',
      outstation_commission_amount: '0',
      airport_rate_bump_up: '0',
      local_rate_bump_up: '0',
      outstation_rate_bump_up: '0',
      airport_rate_bump_up_amt: '0',
      local_rate_bump_up_amt: '0',
      outstation_rate_bump_up_amt: '0',
      display_commission_flag: '1',
      disable_commission_update: '0',
      savaari_commission: '0',
      enable_oneway: '1',
      enable_roundtrip: '1',
      enable_local: '1',
      enable_transfer: '1',
      invoice_payer: 'pay_by_agent',
      wallet_user: '0',
      enable_no_payment: '0',
      block_agent: '0',
      block_agent_invoice: '0',
      block_customer_invoice: '0',
      block_customer_communication: '0',
      display_only_premium: '0',
      unrealized_full_paid_bookings: '0',
      remark: '',
    };
  }
}
