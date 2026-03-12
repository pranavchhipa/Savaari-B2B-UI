/**
 * Development / Staging environment configuration.
 *
 * SAFETY:  useMockData defaults to TRUE so the app never hits
 *          a real API unless you explicitly flip this flag.
 *
 * ARCHITECTURE: The Savaari B2B portal uses TWO API domains:
 *   1. Partner API (api.savaari.com) — cities, availability
 *   2. B2B API (api23.savaari.com) — bookings, reports, commission
 *
 * Both are proxied in development via proxy.conf.json.
 */
export const environment = {
  production: false,

  /** Master safety switch — true = all services return mock data */
  useMockData: false,

  /** Partner API: cities, availability (proxied to api.savaari.com/partner_api/public) */
  partnerApiBaseUrl: '/partner-api',

  /** B2B API: bookings, reports, commission (proxied to api23.savaari.com) */
  b2bApiBaseUrl: '/b2b-api',

  /** Partner API credentials (from JWT payload) */
  apiKey: '576a6783ea54f',
  appId: '576a67842fc3b',

  /** Agent ID — set dynamically after login from user_id */
  agentId: '983680',

  /** User email — set after login, used for B2B API calls */
  userEmail: '',

  /** Re-authenticate this many ms before token expiry */
  tokenRefreshBufferMs: 60_000,
};
