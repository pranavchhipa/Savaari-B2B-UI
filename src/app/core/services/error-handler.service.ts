import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

/**
 * Centralized API error handler.
 * Converts HTTP errors into user-friendly messages.
 */
@Injectable({ providedIn: 'root' })
export class ErrorHandlerService {

  /**
   * Handle an API error and return a user-friendly observable error.
   * @param error  The HttpErrorResponse from the API call
   * @param context  A label for logging (e.g. 'AvailabilityService')
   */
  handleApiError(error: HttpErrorResponse, context: string): Observable<never> {
    let message: string;

    if (error.status === 0) {
      message = 'Cannot reach the Savaari servers. Please check your internet connection.';
    } else if (error.status === 401) {
      message = 'Authentication failed. Please try again.';
    } else if (error.status === 400) {
      message = error.error?.message || 'Invalid request. Please check your inputs.';
    } else if (error.status === 404) {
      message = 'The requested resource was not found.';
    } else if (error.status >= 500) {
      message = 'Savaari server error. Please try again later.';
    } else {
      message = error.error?.message || 'An unexpected error occurred.';
    }

    console.error(`[SAVAARI-API] [${context}] Error ${error.status}:`, error.message);

    return throwError(() => ({
      status: error.status,
      message,
      originalError: error,
    }));
  }
}
