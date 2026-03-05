import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { ErrorHandlerService } from './error-handler.service';
import { AvailabilityRequest, AvailabilityResponse } from '../models';
import { environment } from '../../../environments/environment';
import { MOCK_AVAILABILITY_RESPONSE } from '../mocks/mock-cars';

/**
 * Checks cab availability for a given itinerary.
 * POST /availabilities.php
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityService {

  constructor(
    private api: ApiService,
    private errorHandler: ErrorHandlerService
  ) {}

  /**
   * Check available cabs for a trip.
   *
   * @param request  Must include sourceCity (integer ID), tripType,
   *                 subTripType, pickupDateTime (DD-MM-YYYY HH:MM).
   *                 destinationCity required for outstation.
   *                 duration required for roundTrip.
   *                 localityId required for airport.
   */
  checkAvailability(request: AvailabilityRequest): Observable<AvailabilityResponse> {
    if (environment.useMockData) {
      return of(MOCK_AVAILABILITY_RESPONSE);
    }

    return this.api.post<AvailabilityResponse>('availabilities.php', {
      sourceCity: request.sourceCity,
      tripType: request.tripType,
      subTripType: request.subTripType,
      destinationCity: request.destinationCity,
      pickupDateTime: request.pickupDateTime,
      duration: request.duration,
      localityId: request.localityId,
    }).pipe(
      catchError(err => this.errorHandler.handleApiError(err, 'AvailabilityService'))
    );
  }
}
