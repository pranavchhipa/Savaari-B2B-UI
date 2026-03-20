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

    // Extract the most specific error message from the Savaari API response
    const body = error.error;
    const extractedMsg = this.extractApiMessage(body);

    if (error.status === 0) {
      message = 'Cannot reach the servers. Please check your internet connection.';
    } else if (error.status === 401) {
      message = extractedMsg || 'Authentication failed. Please try again.';
    } else if (error.status === 400) {
      message = extractedMsg || 'Invalid request. Please check your inputs.';
    } else if (error.status === 402) {
      message = extractedMsg || 'Payment required. Please check your inputs.';
    } else if (error.status === 404) {
      message = extractedMsg || 'Service temporarily unavailable. Please try again.';
    } else if (error.status >= 500) {
      message = extractedMsg || 'Server error. Please try again later.';
    } else {
      message = extractedMsg || 'An unexpected error occurred.';
    }

    // Always log full details for debugging
    console.error(`[SAVAARI-API] [${context}] HTTP ${error.status}:`, message);
    console.error(`[SAVAARI-API] [${context}] Full response body:`, JSON.stringify(body, null, 2));

    return throwError(() => ({
      status: error.status,
      message,
      originalError: error,
    }));
  }

  /**
   * Extract the most specific error message from Savaari API response body.
   * Handles multiple response shapes (JSON object, array, string, nested errors).
   */
  private extractApiMessage(body: any): string | null {
    if (!body) return null;
    if (typeof body === 'string') return body;

    // Savaari nested errors array: { errors: [{ internalMessage, errroMessage, ... }] }
    const nestedErr = body?.errors?.[0];
    if (nestedErr) {
      const msg = nestedErr.internalMessage || nestedErr.errroMessage || nestedErr.message || nestedErr.error;
      if (msg) return msg;
    }

    // Direct message fields
    return body.message || body.error || body.msg || body.error_message
      || body.errorMessage || body.error_description || null;
  }
}
