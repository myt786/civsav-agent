import { z } from "zod";
import type { Platform } from "../connectors/types";

// Per-platform external-ID validation. These formats are routinely
// confused with a similar-looking-but-wrong ID from the same platform
// (GA4 property vs. measurement ID being the classic one), so each schema
// rejects the common mistake with a specific message rather than a generic
// "invalid format." Transforms normalize into the exact shape the
// connector's client.ts expects (dashes stripped, act_ prefix present) so
// storage is always in the connector-ready form.

const ga4ExternalId = z
  .string()
  .trim()
  .min(1, "Property ID is required.")
  .superRefine((value, ctx) => {
    if (/^g-/i.test(value)) {
      ctx.addIssue({
        code: "custom",
        message:
          "This looks like a GA4 Measurement ID (starts with G-), not a Property ID. Use the numeric Property ID instead, e.g. 123456789.",
      });
      return;
    }
    if (!/^\d+$/.test(value)) {
      ctx.addIssue({ code: "custom", message: "Must be a numeric GA4 Property ID, e.g. 123456789." });
    }
  });

const searchConsoleExternalId = z
  .string()
  .trim()
  .min(1, "Site is required.")
  .refine((value) => /^sc-domain:[a-z0-9.-]+\.[a-z]{2,}$/i.test(value) || /^https?:\/\/\S+\/$/i.test(value), {
    message:
      "Use a full site URL ending in / (e.g. https://example.com/) or a Domain property (e.g. sc-domain:example.com).",
  });

const googleAdsExternalId = z
  .string()
  .trim()
  .refine((value) => /^\d{3}-\d{3}-\d{4}$/.test(value) || /^\d{10}$/.test(value), {
    message: "Use a 10-digit customer ID, with or without dashes (e.g. 123-456-7890 or 1234567890).",
  })
  .transform((value) => value.replace(/-/g, ""));

const metaExternalId = z
  .string()
  .trim()
  .refine((value) => /^(act_)?\d+$/.test(value), {
    message: "Use the numeric ad account ID, with or without the act_ prefix (e.g. act_123456789 or 123456789).",
  })
  .transform((value) => (value.startsWith("act_") ? value : `act_${value}`));

const ghlExternalId = z
  .string()
  .trim()
  .min(1, "Location ID is required.")
  .refine((value) => /^[a-zA-Z0-9_-]+$/.test(value), {
    message: "Use the GoHighLevel location ID (letters, numbers, - and _ only).",
  });

const ahrefsExternalId = z
  .string()
  .trim()
  .min(1, "Domain is required.")
  .superRefine((value, ctx) => {
    if (/^https?:\/\//i.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter the bare domain, no protocol (e.g. example.com, not https://example.com).",
      });
      return;
    }
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(value)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid domain, e.g. example.com." });
    }
  });

const openphoneExternalId = z
  .string()
  .trim()
  .refine((value) => /^\+[1-9]\d{6,14}$/.test(value), {
    message: "Use E.164 format: a leading +, country code, and number with no spaces or dashes (e.g. +14155551234).",
  });

const leadDashboardExternalId = z.string().trim().min(1, "Client ID is required.");

export const externalIdSchemas: Record<Platform, z.ZodType<string, string>> = {
  ga4: ga4ExternalId,
  search_console: searchConsoleExternalId,
  google_ads: googleAdsExternalId,
  meta: metaExternalId,
  ghl: ghlExternalId,
  ahrefs: ahrefsExternalId,
  openphone: openphoneExternalId,
  lead_dashboard: leadDashboardExternalId,
};

export const externalIdHints: Record<Platform, string> = {
  ga4: "Numeric property ID, e.g. 123456789 — not the G-XXXXXXX measurement ID.",
  search_console: "Site URL, e.g. https://example.com/ or sc-domain:example.com",
  google_ads: "Customer ID, e.g. 123-456-7890 or 1234567890 (dashes are stripped automatically).",
  meta: "Ad account ID, e.g. act_123456789 or 123456789 (stored with the act_ prefix).",
  ghl: "GoHighLevel location ID.",
  ahrefs: "Domain, no protocol — e.g. example.com.",
  openphone: "Phone number in E.164 format, e.g. +14155551234.",
  lead_dashboard: "Internal lead-dashboard client ID.",
};
