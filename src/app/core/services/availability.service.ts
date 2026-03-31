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

    // rate_type=premium only for outstation trips (confirmed by Shubhendu + live site)
    const isOutstation = request.tripType === 'outstation';

    const isAirport = request.tripType === 'airport';

    return this.api.partnerGet<RawAvailabilityResponse>('availabilities', {
      rate_source: 'web',
      ...(isOutstation && { rate_type: 'premium' }),
      customerLatLong: '',
      sourceCity: request.sourceCity,
      tripType: request.tripType,
      subTripType: request.subTripType,
      pickupDateTime: request.pickupDateTime,
      duration: request.duration,
      destinationCity: request.destinationCity,
      // Multicity intermediate stops for round trip (e.g. Bangalore → Mysore → Ooty)
      ...(request.multicityId && { multicityId: request.multicityId }),
      // Airport-specific params (confirmed by Shubhendu — required for airport pricing)
      ...(isAirport && {
        terminalId: request.terminalId || '',
        selectPlaceId: request.selectPlaceId || '',
        custShortAddress: request.custShortAddress || '',
        airport_id: request.airport_id || '',
        airport_name: request.airport_name || '',
      }),
      token: this.auth.getPartnerToken(),
      agentId: btoa(this.auth.getAgentId()),
      api_source: 'b2b',
    }).pipe(
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
    };
  }
}
