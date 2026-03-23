import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Savaari Analytics Service
 * Mirrors the analytics tracking used on savaari.com.
 *
 * API: POST /analytics-api/analytics_data?token=<SavaariToken>
 * Content-Type: application/x-www-form-urlencoded
 * Body: s_id=<sessionId>&event_name=<name>&event_data=<base64(JSON)>
 *
 * Auto-added to every payload: device_type, utm_source, utm_medium, utm_campaign, ud_id
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

      // Enrich payload (mirrors savaari.com behaviour)
      const enriched: Record<string, any> = { ...payload };
      enriched['device_type'] = window.innerWidth <= 710 ? 'mobile' : 'desktop';
      enriched['ud_id'] = localStorage.getItem('SavaariUserDeviceID') ?? this.getOrCreateDeviceId();

      const utm_source = localStorage.getItem('utm_source');
      const utm_medium = localStorage.getItem('utm_medium');
      const utm_campaign = localStorage.getItem('utm_campaign');
      if (utm_source) enriched['utm_source'] = utm_source;
      if (utm_medium) enriched['utm_medium'] = utm_medium;
      if (utm_campaign) enriched['utm_campaign'] = utm_campaign;

      const body = new URLSearchParams();
      body.set('s_id', this.getSessionId());
      body.set('event_name', eventName);
      body.set('event_data', btoa(unescape(encodeURIComponent(JSON.stringify(enriched)))));

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
