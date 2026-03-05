/**
 * Development / Staging environment configuration.
 *
 * SAFETY:  useMockData defaults to TRUE so the app never hits
 *          a real API unless you explicitly flip this flag.
 *
 * USAGE:   Set useMockData to false AND add your staging apiKey/appId
 *          to start calling the real Savaari staging API.
 */
export const environment = {
  production: false,

  /** Master safety switch -- true = all services return mock data */
  useMockData: true,

  /** Proxied via proxy.conf.json to api.betasavaari.com/partner_client */
  apiBaseUrl: '/api',

  /** Staging credentials -- obtain from Savaari tech team */
  apiKey: '',
  appId: '',

  /** Re-authenticate this many ms before token expiry */
  tokenRefreshBufferMs: 60_000,
};
