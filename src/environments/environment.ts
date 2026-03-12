/**
 * Development / Staging environment configuration.
 *
 * SAFETY:  useMockData defaults to TRUE so the app never hits
 *          a real API unless you explicitly flip this flag.
 *
 * ARCHITECTURE: The Savaari B2B portal uses TWO API domains:
 *   1. Partner API (api.betasavaari.com) — cities, availability
 *   2. B2B API (api23.betasavaari.com) — bookings, reports, commission
 *
 * Both are proxied in development via proxy.conf.json.
 */
export const environment = {
  production: false,

  /** Master safety switch — true = all services return mock data */
  useMockData: false,

  /** Partner API: cities, availability (proxied to api.betasavaari.com/partner_api/public) */
  partnerApiBaseUrl: '/partner-api',

  /** B2B API: bookings, reports, commission (proxied to api23.betasavaari.com) */
  b2bApiBaseUrl: '/b2b-api',

  /** Partner API credentials (from beta B2B repo environment.ts) */
  apiKey: 'f645dbc7cd4ba17caf4fac8abc53dc02a01231dde7ec1c31124895aa0fd24166',
  appId: 'MjAxN3Nhdm1vYmlsZXdlYnNpdGU=',

  /** Agent ID — set dynamically after login from user_id */
  agentId: '',

  /** User email — set after login, used for B2B API calls */
  userEmail: '',

  /** Re-authenticate this many ms before token expiry */
  tokenRefreshBufferMs: 60_000,
};
