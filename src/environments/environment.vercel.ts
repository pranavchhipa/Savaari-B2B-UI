/**
 * Vercel (Demo) environment configuration.
 *
 * useMockData: true — ALL operations are mocked, no real API calls.
 * Safe for public demo — no real bookings, no real payments.
 */
export const environment = {
  production: true,
  useMockData: true,

  /** Not used in mock mode, but required by type */
  partnerApiBaseUrl: '/partner-api',
  b2bApiBaseUrl: '/b2b-api',
  walletApiBaseUrl: '/wallet-api',
  paymentApiBaseUrl: '/payment-api',
  addressApiBaseUrl: '/address-api',
  systemBookingsApiBaseUrl: '/system-bookings-api',
  registrationApiBaseUrl: '/reg-api',
  settlementApiBaseUrl: '/settlement-api',

  /** Razorpay — not used in mock mode */
  razorpayKeyId: '',

  /** Not used in mock mode */
  apiKey: '',
  appId: '',
  agentId: '',
  userEmail: '',

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
