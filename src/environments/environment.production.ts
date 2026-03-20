/**
 * Production environment configuration.
 *
 * useMockData is TRUE — live Vercel stays safe.
 * When ready to go live, set useMockData: false and fill in credentials.
 */
export const environment = {
  production: true,
  useMockData: true,

  /** Partner API: cities, availability (proxied via Vercel rewrites) */
  partnerApiBaseUrl: '/partner-api',

  /** B2B API: bookings, reports, commission (proxied via Vercel rewrites) */
  b2bApiBaseUrl: '/b2b-api',

  /** Wallet API: balance, topup, history (proxied via Vercel rewrites) */
  walletApiBaseUrl: '/wallet-api',

  /** Razorpay key — use live key for production */
  razorpayKeyId: '',

  /** Partner API credentials — injected at build time via CI/CD */
  apiKey: '',
  appId: '',

  /** Agent ID */
  agentId: '',

  /** User email — set after login */
  userEmail: '',

  tokenRefreshBufferMs: 60_000,
};
