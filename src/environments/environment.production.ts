/**
 * Production / Alpha environment configuration.
 *
 * Hits real Savaari APIs via .htaccess proxy rewrites. API prefixes
 * (/partner-api, /b2b-api, /wallet-api) are rewritten by Apache .htaccess
 * to the actual Savaari domains.
 */
export const environment = {
  production: true,
  demoMode: false,

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

  /** System Bookings API: cancellation.php (proxied via .htaccess) */
  systemBookingsApiBaseUrl: '/system-bookings-api',

  /**
   * Registration API: GST verification + OTP send/verify.
   * Alpha-hosted endpoints. On the alpha server itself these calls are local
   * (same origin) — .htaccess / proxy.php will rewrite `/reg-api/*` to
   * `https://api.alphasavaari.com/*`. Used by the new registration wizard.
   */
  registrationApiBaseUrl: '/reg-api',

  /**
   * Settlement API: POST /booking/settlement-payment — alpha-only.
   * Beta backend returns 404 (endpoint not deployed there). On the alpha
   * server itself this can hit the local origin (same backend). Rewritten
   * via proxy.php / .htaccess to api.alphasavaari.com/partner_api/public.
   */
  settlementApiBaseUrl: '/settlement-api',

  /** Razorpay test key — updated per backend team (April 2026) */
  razorpayKeyId: 'rzp_test_SWAcB744ApXvsB',

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
  supportPhone: '079 7111 1865',
  supportPhoneTel: 'tel:07971111865',
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
