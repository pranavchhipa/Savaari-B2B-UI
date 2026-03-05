/**
 * Production environment configuration.
 *
 * apiKey and appId MUST be injected via CI/CD environment variables.
 * NEVER hardcode production credentials in this file.
 */
export const environment = {
  production: true,
  useMockData: false,
  apiBaseUrl: 'https://api.betasavaari.com/partner_client',
  apiKey: '',   // Injected at build time via CI/CD
  appId: '',    // Injected at build time via CI/CD
  tokenRefreshBufferMs: 60_000,
};
