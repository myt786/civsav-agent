// Connector and API errors are written for developers ("401 Unauthorized",
// "GHL_API_BASE_URL not configured", a zod parse message). This turns them
// into one plain sentence for the people actually using the app; the
// original is kept as `detail` so it can still be shown on request.
// Pure string matching — safe to import from client components.

export interface FriendlyError {
  summary: string;
  detail: string;
}

const RULES: { test: RegExp; summary: string }[] = [
  {
    test: /\b401\b|unauthori[sz]ed|rejected this key|invalid (api )?(key|token)|expired/i,
    summary: "The access key was rejected — it may be wrong or expired. Replace it under Settings → API keys.",
  },
  {
    test: /\b403\b|forbidden|not have access|no access|permission/i,
    summary:
      "We don't have permission to see this account. Check the right account is picked and that it's shared with us.",
  },
  {
    test: /\b404\b|not found|no .* found matching/i,
    summary: "We couldn't find this account. Check the right one is picked.",
  },
  {
    test: /\b429\b|rate.?limit|too many requests|quota/i,
    summary: "The platform asked us to slow down. It will be tried again on the next update.",
  },
  {
    test: /not configured|_API_|_KEY\b|_KEY__|environment variable/i,
    summary: "This platform isn't fully set up yet. Ask whoever manages the app to finish connecting it.",
  },
  {
    test: /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|network|timed? ?out|\b5\d\d\b/i,
    summary: "We couldn't reach the platform. This is usually temporary — it will be tried again on the next update.",
  },
  {
    test: /invalid_type|expected .* received|zod|unexpected token|JSON/i,
    summary: "The platform sent back something we didn't expect. If this keeps happening, let your developer know.",
  },
];

export function friendlyError(message: string | null | undefined): FriendlyError {
  const detail = (message ?? "").trim();
  if (!detail) return { summary: "Something went wrong talking to this platform.", detail: "" };
  // Messages this app writes itself for people (they point somewhere in
  // Settings) are already plain — keep them as they are.
  if (detail.includes("Settings →")) return { summary: detail, detail: "" };
  const rule = RULES.find((r) => r.test.test(detail));
  return { summary: rule?.summary ?? "Something went wrong talking to this platform.", detail };
}
