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
      ctx.addIssue({ code: "custom", message: "Use the GA4 property number, e.g. 123456789." });
    }
  });

const searchConsoleExternalId = z
  .string()
  .trim()
  .min(1, "Site is required.")
  .refine((value) => /^sc-domain:[a-z0-9.-]+\.[a-z]{2,}$/i.test(value) || /^https?:\/\/\S+\/$/i.test(value), {
    message:
      "Use the full website address ending in / (e.g. https://example.com/), or sc-domain:example.com if that's how it appears in Search Console.",
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
    message: "Use the ad account number from Meta, e.g. 123456789.",
  })
  .transform((value) => (value.startsWith("act_") ? value : `act_${value}`));

const ghlExternalId = z
  .string()
  .trim()
  .min(1, "Sub-account ID is required.")
  .refine((value) => /^[a-zA-Z0-9_-]+$/.test(value), {
    message: "That doesn't look like a sub-account ID. Copy it from the address bar, after /location/.",
  });

const ahrefsExternalId = z
  .string()
  .trim()
  .min(1, "Domain is required.")
  .superRefine((value, ctx) => {
    if (/^https?:\/\//i.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter just the website address, without https:// (e.g. example.com).",
      });
      return;
    }
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(value)) {
      ctx.addIssue({ code: "custom", message: "Enter a website address, e.g. example.com." });
    }
  });

const openphoneExternalId = z
  .string()
  .trim()
  .refine((value) => /^\+[1-9]\d{6,14}$/.test(value), {
    message: "Type the number with a + and country code, and no spaces or dashes (e.g. +14155551234).",
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
  ga4: "Property number, e.g. 123456789 (not the one starting with G-).",
  search_console: "Website address, e.g. https://example.com/",
  google_ads: "Customer ID, e.g. 123-456-7890.",
  meta: "Ad account number, e.g. 123456789.",
  ghl: "Sub-account ID — in the address bar after /location/",
  ahrefs: "Website address, e.g. example.com",
  openphone: "Phone number with country code, e.g. +14155551234",
  lead_dashboard: "Client ID from the lead dashboard",
};
