import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Savaari Analytics Service
 * Mirrors the analytics tracking used on savaari.com, tuned for B2B.
 *
 * API: POST /analytics-api/analytics_data?token=<SavaariToken>
 * Content-Type: application/x-www-form-urlencoded
 * Body: session_id=<sessionId>&event_name=<name>&event_data=<plain JSON>
 *
 * Per backend team guidance (April 2026):
 *   - event_data is sent as plain JSON (NOT base64-encoded).
 *   - Every payload carries agent_flag = 1 so backend can separate
 *     B2B agent traffic from B2C consumer traffic in reports.
 *
 * Standard lifecycle events (B2B booking funnel):
 *   - select_trip        → dashboard → Explore Cabs submitted successfully
 *   - select_car         → select-car → car picked, navigating to booking
 *   - enter-info         → booking step 1 → passenger details page shown
 *   - enter-payment      → booking step 2 → payment options page shown
 *   - booking-confirmed  → booking step 3 → payment succeeded, booking done
 *
 * Auto-added to every payload: agent_flag, device_type, utm_source,
 * utm_medium, utm_campaign, ud_id.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private http = inject(HttpClient);

  private readonly SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

  /** Fire-and-forget analytics event. Never throws. */
  track(eventName: string, payload: Record<string, any> = {}): void {
    try {
      const token = localStorage.getItem('SavaariToken');
      if (!token) return; // not logged in yet — skip

      // Enrich payload (mirrors savaari.com behaviour, plus B2B-specific flag)
      const enriched: Record<string, any> = { ...payload };
      // Per backend team (April 2026): every B2B event must carry agent_flag=1
      // so analytics can segment agent-driven traffic from consumer traffic.
      enriched['agent_flag'] = 1;
      enriched['device_type'] = window.innerWidth <= 710 ? 'mobile' : 'desktop';
      enriched['ud_id'] = localStorage.getItem('SavaariUserDeviceID') ?? this.getOrCreateDeviceId();

      const utm_source = localStorage.getItem('utm_source');
      const utm_medium = localStorage.getItem('utm_medium');
      const utm_campaign = localStorage.getItem('utm_campaign');
      if (utm_source) enriched['utm_source'] = utm_source;
      if (utm_medium) enriched['utm_medium'] = utm_medium;
      if (utm_campaign) enriched['utm_campaign'] = utm_campaign;

      const body = new URLSearchParams();
      body.set('session_id', this.getSessionId());
      body.set('event_name', eventName);
      // Per backend team (April 2026): event_data is sent as PLAIN JSON, NOT
      // base64-encoded. Previously we wrapped this in btoa(...) to match the
      // consumer site's payload shape, but the B2B ingest expects raw JSON
      // so the fields are queryable without a decode step on the backend.
      body.set('event_data', JSON.stringify(enriched));

      const headers = new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });
      const url = `/analytics-api/analytics_data?token=${token}`;

      this.http.post(url, body.toString(), { headers })
        .pipe(catchError(() => of(null)))
        .subscribe();

      if (!environment.production) console.log(`[Analytics] ${eventName}`, enriched);
    } catch (e) {
      // Analytics must never break the app
    }
  }

  // ─── Convenience event methods ───────────────────────────────────────────

  /** Fired 2s after page load — mirrors savaari.com page-load event. */
  trackPageLoad(pickupCity?: string, dropCity?: string): void {
    this.track('page-load', {
      page_url: window.location.pathname,
      pickup_city: pickupCity ?? '',
      drop_city: dropCity ?? '',
    });
  }

  /** Fired when user switches trip type tab. */
  trackSwitchTripType(from: string, to: string): void {
    this.track('switch-trip-type', {
      page_url: window.location.pathname,
      from_trip_subtype: from,
      to_trip_subtype: to,
    });
  }

  /** Fired when user fills in pickup date. */
  trackPickupDateFill(value: string, tripType: string, tripSubtype: string): void {
    this.track('pickup-date-fill', {
      user_input: value,
      page_url: window.location.pathname,
      trip_type: tripType,
      trip_subtype: tripSubtype,
    });
  }

  /** Fired when user fills in pickup time. */
  trackPickupTimeFill(value: string, tripType: string, tripSubtype: string): void {
    this.track('pickup-time-fill', {
      user_input: value,
      page_url: window.location.pathname,
      trip_type: tripType,
      trip_subtype: tripSubtype,
    });
  }

  /** Fired when Explore Cabs is clicked with a validation error. */
  trackExploreButtonError(error: string, tripType: string, tripSubtype: string): void {
    this.track('explore-button-error', {
      error,
      page_url: window.location.pathname,
      trip_type: tripType,
      trip_subtype: tripSubtype,
    });
  }

  /** Fired when from-city has a validation error. */
  trackFromCityError(userInput: string, tripType: string, error: string): void {
    this.track('from-city-error', {
      page_url: window.location.pathname,
      user_input: userInput,
      trip_type: tripType,
      error,
    });
  }

  /** Fired when to-city has a validation error. */
  trackToCityError(userInput: string, tripSubtype: string, error: string): void {
    this.track('to-city-error', {
      page_url: window.location.pathname,
      user_input: userInput,
      trip_subtype: tripSubtype,
      error,
    });
  }

  // ─── B2B Lifecycle Events (backend team spec, April 2026) ───────────────
  //
  // These five events map the agent's journey through the booking funnel.
  // Event names are exactly as the backend team listed them — note the mix
  // of underscore (select_trip, select_car) and hyphen (enter-info,
  // enter-payment, booking-confirmed) conventions. Kept verbatim so the
  // backend ingest doesn't need renaming on their side.

  /**
   * Fired on the dashboard when the agent submits a valid Explore Cabs search.
   *
   * Field shape per backend team spec (April 2026), aligned with savaari.com's
   * select_trip event:
   *   - pickup_city / drop_city — full "City, State" strings (drop_city empty
   *     for Local & Airport since they don't have a separate destination)
   *   - start_date / end_date   — DD-MM-YYYY (end_date == start_date for
   *     non-round-trip flows; round trip sends the return date)
   *   - start_time              — HH:MM in 24-hour format (no AM/PM)
   */
  trackSelectTrip(payload: {
    trip_type: string;
    trip_subtype?: string;
    pickup_city?: string;
    drop_city?: string;
    start_date?: string;
    end_date?: string;
    start_time?: string;
  }): void {
    this.track('select_trip', {
      page_url: window.location.pathname,
      ...payload,
    });
  }

  /**
   * Fired on select-car when the agent picks a cab and proceeds to booking.
   *
   * Field shape per backend team spec (April 2026), aligned with savaari.com's
   * select_car event:
   *   - car_type     — numeric carTypeId as a string (e.g. "18"), NOT the
   *                    display label like "AC Mid-Size Plus"
   *   - car_rate     — fare in INR (renamed from `fare`)
   *   - pickup_city / drop_city — same shape as select_trip
   *
   * Note: `car_name` (display string like "Toyota Etios or Equivalent") is
   * intentionally NOT sent — backend spec doesn't include it.
   */
  trackSelectCar(payload: {
    trip_type: string;
    trip_subtype?: string;
    car_type?: string;
    car_rate?: number;
    pickup_city?: string;
    drop_city?: string;
  }): void {
    this.track('select_car', {
      page_url: window.location.pathname,
      ...payload,
    });
  }

  /** Fired when agent completes Step 1 (passenger details) and booking is created. */
  trackEnterInfo(payload: {
    booking_id: string;
    trip_type: string;
    trip_subtype?: string;
    car_type?: string;
    car_rate?: number;
  }): void {
    this.track('enter-info', {
      page_url: window.location.pathname,
      ...payload,
    });
  }

  /** Fired when agent selects a payment option (radio button click on Step 2). */
  trackEnterPayment(payload: {
    booking_id: string;
    trip_type: string;
    trip_subtype?: string;
    car_rate?: number;
    payment_type: 'PARTPAID' | 'FULLPAID';
    payment_percentage: number;
  }): void {
    this.track('enter-payment', {
      page_url: window.location.pathname,
      ...payload,
    });
  }

  /**
   * Fired after the agent's payment succeeds and the booking is confirmed.
   *
   * Field shape mirrors the consumer site's booking-confirmed payload (April
   * 2026 reference shared by backend team) so both funnels write the same
   * columns. The first iteration of this fix only sent the trip+customer
   * fields — backend still rejected with "Error while data insert" because:
   *   • trip_type was the UI label ("One Way") instead of the backend enum
   *     value ("outstation");
   *   • pickup_city_id and car_type were missing (required FKs);
   *   • customer_country_code was bare "91" instead of "91|IND".
   * This iteration fixes all three plus adds itinerary + hours_to_trip.
   *
   * Per backend team: fields the B2B flow doesn't have (utm_keyword,
   * pickup_region, fuel_type, hatchback_rate/sedan_rate/etc, whatsapp_optin,
   * rate_modified/old_rate/new_rate) are intentionally NOT sent — caller
   * was told "data not available, don't send the parameter".
   *
   * drop_city / drop_address / drop_city_id are sent empty for Local &
   * Round Trip flows because there's no separate destination — caller is
   * responsible for blanking them when not applicable.
   */
  trackBookingConfirmed(payload: {
    booking_id: string;
    trip_type: string;                // 'outstation' | 'local' | 'airport' (backend enum)
    trip_subtype?: string;            // 'oneWay' | 'roundTrip' | '880' | '440' | '12120' | 'pick_airport' | 'drop_airport'
    // payment_option / payment_method intentionally NOT in the signature —
    // backend team confirmed they are "not required" and were causing the
    // INSERT to reject the row even after every other field was aligned.
    payment_type: 'PARTPAID' | 'FULLPAID';
    payment_percentage: number;
    payment_amount: number;
    car_rate?: number;
    booking_amount?: number;
    booking_type?: string;
    // Trip + customer context (required by backend INSERT).
    pickup_city?: string;
    drop_city?: string;
    pickup_city_id?: string;          // numeric city id as string, e.g. "377"
    //drop_city_id?: string;            // empty for Local & Airport
    start_date?: string;              // DD-MM-YYYY
    start_time?: string;              // HH:MM (24-hour)
    car_type?: number;                // numeric carTypeId, e.g. 43
    itinerary?: string;               // route string e.g. "Bangalore-Mysore" (outstation only)
    hours_to_trip?: number;           // integer hours from now until pickup
    customer_name?: string;
    customer_email?: string;
    customer_country_code?: string;   // "<isd>|<ISO>" e.g. "91|IND"
    customer_phone?: string;
    pickup_address?: string;
    drop_address?: string;
  }): void {
    this.track('booking-confirmed', {
      page_url: window.location.pathname,
      ...payload,
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** Session ID: 19-char random + timestamp, refreshed every 30 min. */
  private getSessionId(): string {
    try {
      const stored = localStorage.getItem('b2b_analytics_session');
      if (stored) {
        const { id, ts } = JSON.parse(stored);
        if (Date.now() - ts < this.SESSION_TTL_MS) return id;
      }
      const id = this.randomString(19) + Date.now();
      localStorage.setItem('b2b_analytics_session', JSON.stringify({ id, ts: Date.now() }));
      return id;
    } catch {
      return this.randomString(19) + Date.now();
    }
  }

  /** Persistent anonymous device ID. */
  private getOrCreateDeviceId(): string {
    let id = localStorage.getItem('SavaariUserDeviceID');
    if (!id) {
      id = this.randomString(24);
      localStorage.setItem('SavaariUserDeviceID', id);
    }
    return id;
  }

  private randomString(len: number): string {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
}
