/**
 * Production environment configuration.
 *
 * useMockData is TRUE until beta/staging APIs are available.
 * Beta servers (betasavaari.com) are currently unreachable.
 */
export const environment = {
  production: true,
  useMockData: true,

  /** Partner API: cities, availability */
  partnerApiBaseUrl: 'https://api.savaari.com/partner_api/public',

  /** B2B API: bookings, reports, commission */
  b2bApiBaseUrl: 'https://api23.savaari.com',

  /** Partner API credentials — injected at build time via CI/CD */
  apiKey: '',
  appId: '',

  /** Agent ID */
  agentId: '',

  /** User email — set after login */
  userEmail: '',

  tokenRefreshBufferMs: 60_000,
};
