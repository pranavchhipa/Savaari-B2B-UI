import { Injectable } from '@angular/core';
import { Observable, of, map } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ErrorHandlerService } from './error-handler.service';
import { AvailabilityRequest, AvailabilityResponse, RawAvailabilityResponse, RawAvailableCar, AvailableCar } from '../models';
import { environment } from '../../../environments/environment';
import { MOCK_AVAILABILITY_RESPONSE } from '../mocks/mock-cars';

/**
 * Checks cab availability for a given itinerary.
 *
 * GET /availabilities → api.savaari.com/partner_api/public/availabilities
 *
 * Raw API response: { status, data: { R1: { availableCars: [...] } } }
 * Normalized to:    { status, cars: [...] }
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityService {

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private errorHandler: ErrorHandlerService
  ) {}

  checkAvailability(request: AvailabilityRequest): Observable<AvailabilityResponse> {
    if (environment.useMockData) {
      return of(MOCK_AVAILABILITY_RESPONSE);
    }

    const isOutstation = request.tripType === 'outstation';
    const isLocal = request.tripType === 'local';
    const isAirport = request.tripType === 'airport';

    // Build params per trip type to match live site HAR:
    // - rate_source: 'web' for outstation + local only (NOT airport)
    // - rate_type: 'premium' for outstation only
    // - customerLatLong: actual lat/lng for airport; empty string for local/outstation
    // - destinationCity: sent for outstation + local (empty for local); NOT sent for airport
    const params: Record<string, string | number | boolean | null | undefined> = {};

    // rate_source sent for outstation & local, NOT airport
    if (!isAirport) {
      params['rate_source'] = 'web';
    }

    // rate_type=premium only for outstation (confirmed by Shubhendu + live site)
    if (isOutstation) {
      params['rate_type'] = 'premium';
    }

    // customerLatLong: actual coords for airport, empty for others
    if (isAirport) {
      params['customerLatLong'] = request.customerLatLong || '';
    } else {
      params['customerLatLong'] = '';
    }

    params['sourceCity'] = request.sourceCity;
    params['tripType'] = request.tripType;
    params['subTripType'] = request.subTripType;
    params['pickupDateTime'] = request.pickupDateTime;
    params['duration'] = request.duration;

    // destinationCity: sent for outstation & local, NOT for airport
    // For local, HAR shows empty string destinationCity= (cleanParams keeps empty strings)
    if (!isAirport) {
      params['destinationCity'] = request.destinationCity ?? '';
    }

    // Multicity intermediate stops for round trip (e.g. Bangalore → Mysore → Ooty)
    if (request.multicityId) {
      params['multicityId'] = request.multicityId;
    }

    // Airport-specific params (confirmed by Shubhendu — required for airport pricing)
    if (isAirport) {
      params['terminalId'] = request.terminalId || '';
      params['selectPlaceId'] = request.selectPlaceId || '';
      params['custShortAddress'] = request.custShortAddress || '';
      params['airport_id'] = request.airport_id || '';
      params['airport_name'] = request.airport_name || '';
    }

    params['token'] = this.auth.getPartnerToken();
    params['agentId'] = btoa(this.auth.getAgentId());
    params['api_source'] = 'b2b';

    return this.api.partnerGet<RawAvailabilityResponse>('availabilities', params).pipe(
      map(raw => this.normalizeResponse(raw)),
      catchError(err => this.errorHandler.handleApiError(err, 'AvailabilityService'))
    );
  }

  private normalizeResponse(raw: RawAvailabilityResponse): AvailabilityResponse {
    const cars: AvailableCar[] = [];
    if (raw.data) {
      for (const key of Object.keys(raw.data)) {
        const group = raw.data[key];
        if (group?.availableCars?.length) {
          for (const rawCar of group.availableCars) {
            if (!rawCar.soldoutFlag) {
              cars.push(this.normalizeCar(rawCar));
            }
          }
        }
      }
    }
    console.log(`[AvailabilityService] ${cars.length} cars available`);
    return { status: raw.status, cars };
  }

  private normalizeCar(raw: RawAvailableCar): AvailableCar {
    return {
      carId: String(raw.carId),
      carTypeId: raw.carId,
      carType: raw.carType,
      carName: raw.carName,
      fare: raw.rates?.discounted?.totalAmount ?? 0,
      originalFare: raw.rates?.regular?.totalAmount,
      kmsIncluded: raw.rates?.discounted?.packageKilometer,
      hoursIncluded: raw.rates?.discounted?.packageHour,
      extraKmRate: raw.rates?.discounted?.extraKilometer,
      nightAllowance: raw.rates?.discounted?.nightCharge,
      seatCapacity: raw.seatCapacity,
      luggageCapacity: raw.lugguageCapacity,
      inclusions: raw.inclusions?.map(i => i.text) ?? [],
      exclusions: raw.exclusions?.map(e => e.text) ?? [],
      carImage: raw.carImage,
      carImageLarge: raw.carImageLarge,
      tncData: raw.tnc_data,
      packageId: raw.package ? String(raw.package) : undefined,
    };
  }
}
