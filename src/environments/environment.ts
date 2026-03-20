/**
 * Development / Staging environment configuration.
 *
 * ARCHITECTURE: Three API domains, all proxied via proxy.conf.json:
 *   1. Partner API (api.betasavaari.com) — cities, availability
 *   2. B2B API (api23.betasavaari.com) — bookings, reports, commission
 *   3. Wallet API (apiext.betasavaari.com) — wallet balance, topup, history
 */
export const environment = {
  production: false,

  /** Master safety switch — true = all services return mock data */
  useMockData: false,

  /** Partner API: cities, availability (proxied to api.betasavaari.com) */
  partnerApiBaseUrl: '/partner-api',

  /** B2B API: bookings, reports, commission (proxied to api23.betasavaari.com) */
  b2bApiBaseUrl: '/b2b-api',

  /** Wallet API: balance, topup, history (proxied to apiext.betasavaari.com) */
  walletApiBaseUrl: '/wallet-api',

  /** Razorpay test key for wallet top-up */
  razorpayKeyId: 'rzp_test_dsrBANLbHxlwZb',

  /** Partner API credentials (from JWT payload) */
  apiKey: 'f645dbc7cd4ba17caf4fac8abc53dc02a01231dde7ec1c31124895aa0fd24166',
  appId: 'MjAxN3Nhdm1vYmlsZXdlYnNpdGU=',

  /** Agent ID — set dynamically after login from user_id */
  agentId: '983680',

  /** User email — set after login, used for B2B API calls */
  userEmail: '',

  /** Re-authenticate this many ms before token expiry */
  tokenRefreshBufferMs: 60_000,
};
