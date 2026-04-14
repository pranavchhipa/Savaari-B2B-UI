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

  /** Payment API: Razorpay order/verify via PHP (proxied to b2bcab.betasavaari.com) */
  paymentApiBaseUrl: '/payment-api',

  /** Address API: autocomplete + place_id (proxied to apiext.betasavaari.com) */
  addressApiBaseUrl: '/address-api',

  /** System Bookings API: cancellation.php (proxied to api.betasavaari.com/system_bookings) */
  systemBookingsApiBaseUrl: '/system-bookings-api',

  /**
   * Registration API: GST verification + OTP send/verify (proxied to api.alphasavaari.com).
   * These endpoints are alpha-only per backend team confirmation (April 2026).
   * Used by the new multi-step registration wizard.
   */
  registrationApiBaseUrl: '/reg-api',

  /**
   * Settlement API: POST /booking/settlement-payment — alpha-only.
   * Beta backend returns 404 for this endpoint (not deployed there). The
   * related auto-pay cron (`cron_wallet_auto_pay_balance.php`) is also alpha-
   * hosted per the April 2026 settlement doc, so the whole settlement flow
   * runs against alpha even when the rest of the app is on beta.
   */
  settlementApiBaseUrl: '/settlement-api',

  /** Razorpay test key — updated per backend team (April 2026) */
  razorpayKeyId: 'rzp_test_SWAcB744ApXvsB',

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

  /**
   * Partner-facing contact info — shown in the authenticated dashboard
   * header and on the Contact Us page. Kept separate from the public
   * `support*` fields so the landing page and general footer can keep
   * using the retail customer-care number.
   */
  partnerSupportPhone: '079 7111 1865',
  partnerSupportPhoneTel: 'tel:07971111865',
  partnerSupportEmail: 'partners.holiday@savaari.com',
  partnerSupportWhatsapp: '+91 63989 85092',
  partnerSupportWhatsappUrl: 'https://wa.me/916398985092',

  /** New multi-step registration wizard */
  newRegistrationFlow: true,

  /** Dashboard background images */
  dashboardImages: {
    oneWay: '/dashboard-oneway.jpg',
    roundTrip: '/dashboard-roundtrip.jpg',
    local: '/dashboard-local.jpg',
    airport: '/dashboard-airport.jpg',
  },
};
