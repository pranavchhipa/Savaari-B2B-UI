/**
 * Production / Alpha environment configuration.
 *
 * useMockData: false — hits real Savaari APIs via .htaccess proxy rewrites.
 * API prefixes (/partner-api, /b2b-api, /wallet-api) are rewritten by
 * Apache .htaccess to the actual Savaari domains.
 */
export const environment = {
  production: true,
  useMockData: false,

  /** Partner API: cities, availability (proxied via .htaccess) */
  partnerApiBaseUrl: '/partner-api',

  /** B2B API: bookings, reports, commission (proxied via .htaccess) */
  b2bApiBaseUrl: '/b2b-api',

  /** Wallet API: balance, topup, history (proxied via .htaccess) */
  walletApiBaseUrl: '/wallet-api',

  /** Payment API: Razorpay order/verify via PHP (proxied via .htaccess) */
  paymentApiBaseUrl: '/payment-api',

  /** Address API: autocomplete + place_id (proxied via .htaccess) */
  addressApiBaseUrl: '/address-api',

  /** Razorpay test key */
  razorpayKeyId: 'rzp_test_dsrBANLbHxlwZb',

  /** Partner API credentials — obtained dynamically via JWT after login */
  apiKey: '',
  appId: '',

  /** Agent ID — set dynamically after login */
  agentId: '',

  /** User email — set after login */
  userEmail: '',

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
    oneWay: '/dashboard-oneway.jpg',
    roundTrip: '/dashboard-roundtrip.jpg',
    local: '/dashboard-local.jpg',
    airport: '/dashboard-airport.jpg',
  },
};
