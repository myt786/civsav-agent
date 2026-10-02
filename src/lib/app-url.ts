// The dashboard's own address, for links in Slack and email reports.
// APP_URL if set, otherwise the production URL Vercel provides.
export function getAppUrl(): string | null {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return process.env.APP_URL || (productionHost ? `https://${productionHost}` : null);
}
