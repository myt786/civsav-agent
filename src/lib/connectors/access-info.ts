import "server-only";

// The two non-secret identifiers a client has to grant access to, read
// from server config so Settings can show them instead of "ask your
// developer for the email address". Only these fields leave the server —
// never the key material around them.
export interface AccessInfo {
  // The Google service account GA4 and Search Console read with.
  googleReportingEmail: string | null;
  // Our Google Ads manager (MCC) account, formatted 123-456-7890.
  googleAdsManagerId: string | null;
}

export function getAccessInfo(): AccessInfo {
  let googleReportingEmail: string | null = null;
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (raw) {
      const parsed = JSON.parse(raw) as { client_email?: unknown };
      if (typeof parsed.client_email === "string") googleReportingEmail = parsed.client_email;
    }
  } catch {
    googleReportingEmail = null;
  }

  const digits = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/\D/g, "");
  const googleAdsManagerId =
    digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : null;

  return { googleReportingEmail, googleAdsManagerId };
}
