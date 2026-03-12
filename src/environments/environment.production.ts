/**
 * Production environment configuration.
 *
 * Points to Beta Savaari APIs (betasavaari.com) for safe testing.
 * No live/production APIs are used.
 */
export const environment = {
  production: true,
  useMockData: false,

  /** Partner API: cities, availability (Beta Savaari) */
  partnerApiBaseUrl: 'https://api.betasavaari.com/partner_api/public',

  /** B2B API: bookings, reports, commission (Beta Savaari) */
  b2bApiBaseUrl: 'https://api23.betasavaari.com',

  /** Partner API credentials (from beta B2B repo) */
  apiKey: 'f645dbc7cd4ba17caf4fac8abc53dc02a01231dde7ec1c31124895aa0fd24166',
  appId: 'MjAxN3Nhdm1vYmlsZXdlYnNpdGU=',

  /** Agent ID — set dynamically after login from user_id */
  agentId: '',

  /** User email — set after login */
  userEmail: '',

  tokenRefreshBufferMs: 60_000,
};
