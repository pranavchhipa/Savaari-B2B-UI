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

  /**
   * Partner API credentials — removed from source code for security.
   * These are obtained dynamically via the JWT token after login.
   * If needed for local dev, set via browser console or .env override.
   */
  apiKey: '',
  appId: '',

  /** Agent ID — set dynamically after login from user_id */
  agentId: '',

  /** User email — set after login, used for B2B API calls */
  userEmail: '',

  /** Re-authenticate this many ms before token expiry */
  tokenRefreshBufferMs: 60_000,

  /** Branding & Company Info */
  brandName: 'B2B CAB',
  companyName: 'Savaari Car Rentals Pvt Ltd',
  companyAddress: 'No 1137, 2nd Floor, RG Towers, Indiranagar, Bangalore - 560038',
  supportPhone: '090 4545 0000',
  supportPhoneTel: 'tel:09045450000',
  supportEmail: 'info@savaari.com',

  /** Dashboard background images */
  dashboardImages: {
    oneWay: 'https://images.unsplash.com/photo-1494783367193-149034c05e8f?auto=format&fit=crop&w=3200&q=100',
    roundTrip: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=3200&q=100',
    local: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=3200&q=100',
    airport: 'https://images.unsplash.com/photo-1556388158-158ea5ccacbd?auto=format&fit=crop&w=3200&q=100',
  },
};
