/**
 * Production environment configuration.
 *
 * useMockData is TRUE until staging credentials are configured.
 * Once you have credentials, set useMockData to false and inject
 * apiKey/appId via CI/CD environment variables.
 */
export const environment = {
  production: true,
  useMockData: true,
  apiBaseUrl: 'https://api.betasavaari.com/partner_client',
  apiKey: '',   // Injected at build time via CI/CD
  appId: '',    // Injected at build time via CI/CD
  tokenRefreshBufferMs: 60_000,
};
