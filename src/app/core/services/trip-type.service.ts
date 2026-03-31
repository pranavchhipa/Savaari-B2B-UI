import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap, shareReplay, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ErrorHandlerService } from './error-handler.service';
import { TripType, SubTripType, TRIP_TYPE_VALUES, SUB_TRIP_TYPE_VALUES } from '../models';
import { environment } from '../../../environments/environment';

/**
 * Fetches and caches trip types and sub-trip types from the Savaari API.
 * Also provides mapping between UI tab names and API parameter values.
 *
 * GET /trip-types.php
 * GET /sub-trip-types.php
 * GET /local-sub-trip-types.php
 */
@Injectable({ providedIn: 'root' })
export class TripTypeService {
  private tripTypesCache$?: Observable<TripType[]>;
  private subTripTypesCache = new Map<string, Observable<SubTripType[]>>();

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private errorHandler: ErrorHandlerService
  ) {}

  /** GET /trip-types.php */
  getTripTypes(): Observable<TripType[]> {
    if (environment.useMockData) {
      return of([
        { name: 'Local', value: TRIP_TYPE_VALUES.LOCAL },
        { name: 'Outstation', value: TRIP_TYPE_VALUES.OUTSTATION },
        { name: 'Airport', value: TRIP_TYPE_VALUES.AIRPORT },
      ]);
    }

    if (!this.tripTypesCache$) {
      this.tripTypesCache$ = this.api.partnerGet<TripType[]>('web-trip-types', {
        token: this.auth.getPartnerToken(),
      }).pipe(
        shareReplay(1),
        catchError(err => this.errorHandler.handleApiError(err, 'TripTypeService.getTripTypes'))
      );
    }
    return this.tripTypesCache$;
  }

  /** GET /sub-trip-types.php */
  getSubTripTypes(tripType: string): Observable<SubTripType[]> {
    if (environment.useMockData) {
      return of(this.getMockSubTripTypes(tripType));
    }

    if (!this.subTripTypesCache.has(tripType)) {
      const obs$ = this.api.partnerGet<SubTripType[]>('sub-trip-types', {
        token: this.auth.getPartnerToken(),
        tripType,
      }).pipe(
        shareReplay(1),
        catchError(err => this.errorHandler.handleApiError(err, 'TripTypeService.getSubTripTypes'))
      );
      this.subTripTypesCache.set(tripType, obs$);
    }
    return this.subTripTypesCache.get(tripType)!;
  }

  /** GET /local-sub-trip-types.php */
  getLocalSubTripTypes(sourceCityId: number): Observable<SubTripType[]> {
    if (environment.useMockData) {
      return of(this.getMockSubTripTypes('local'));
    }

    return this.api.partnerGet<SubTripType[]>('local-sub-trip-types', {
      token: this.auth.getPartnerToken(),
      sourceCity: sourceCityId,
    }).pipe(
      catchError(err => this.errorHandler.handleApiError(err, 'TripTypeService.getLocalSubTripTypes'))
    );
  }

  /**
   * Maps a UI tab name to the API tripType and subTripType values.
   * This is the bridge between the dashboard tabs and the API parameters.
   */
  mapUiTabToApiParams(uiTab: string, options?: { localPackage?: string; airportSubType?: string }): {
    tripType: string;
    subTripType: string;
  } {
    switch (uiTab) {
      case 'One Way':
        return { tripType: TRIP_TYPE_VALUES.OUTSTATION, subTripType: SUB_TRIP_TYPE_VALUES.ONE_WAY };
      case 'Round Trip':
        return { tripType: TRIP_TYPE_VALUES.OUTSTATION, subTripType: SUB_TRIP_TYPE_VALUES.ROUND_TRIP };
      case 'Local':
        if (options?.localPackage === '12hr/120km') {
          return { tripType: TRIP_TYPE_VALUES.LOCAL, subTripType: SUB_TRIP_TYPE_VALUES.LOCAL_12HR_120KM };
        }
        if (options?.localPackage === '4hr/40km') {
          return { tripType: TRIP_TYPE_VALUES.LOCAL, subTripType: SUB_TRIP_TYPE_VALUES.LOCAL_4HR_40KM };
        }
        return { tripType: TRIP_TYPE_VALUES.LOCAL, subTripType: SUB_TRIP_TYPE_VALUES.LOCAL_8HR_80KM };
      case 'Airport':
        if (options?.airportSubType === 'pickup') {
          return { tripType: TRIP_TYPE_VALUES.AIRPORT, subTripType: SUB_TRIP_TYPE_VALUES.AIRPORT_PICKUP };
        }
        return { tripType: TRIP_TYPE_VALUES.AIRPORT, subTripType: SUB_TRIP_TYPE_VALUES.AIRPORT_DROP };
      default:
        return { tripType: TRIP_TYPE_VALUES.OUTSTATION, subTripType: SUB_TRIP_TYPE_VALUES.ONE_WAY };
    }
  }

  private getMockSubTripTypes(tripType: string): SubTripType[] {
    switch (tripType) {
      case TRIP_TYPE_VALUES.OUTSTATION:
        return [
          { name: 'One Way', value: SUB_TRIP_TYPE_VALUES.ONE_WAY },
          { name: 'Round Trip', value: SUB_TRIP_TYPE_VALUES.ROUND_TRIP },
        ];
      case TRIP_TYPE_VALUES.LOCAL:
        return [
          { name: '8 Hours / 80 KM', value: SUB_TRIP_TYPE_VALUES.LOCAL_8HR_80KM },
          { name: '4 Hours / 40 KM', value: SUB_TRIP_TYPE_VALUES.LOCAL_4HR_40KM },
          { name: '12 Hours / 120 KM', value: SUB_TRIP_TYPE_VALUES.LOCAL_12HR_120KM },
        ];
      case TRIP_TYPE_VALUES.AIRPORT:
        return [
          { name: 'Airport Pickup', value: SUB_TRIP_TYPE_VALUES.AIRPORT_PICKUP },
          { name: 'Airport Drop', value: SUB_TRIP_TYPE_VALUES.AIRPORT_DROP },
        ];
      default:
        return [];
    }
  }
}
