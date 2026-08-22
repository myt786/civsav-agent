import type { z } from "zod";

export type Platform =
  | "google_ads"
  | "meta"
  | "ga4"
  | "search_console"
  | "ghl"
  | "openphone"
  | "ahrefs"
  | "lead_dashboard";

export interface PlatformAccount {
  clientId: string;
  clientTimezone: string;
  platform: Platform;
  externalId: string;
  // Which of a platform's several configured credentials to use — only
  // meaningful for a platform whose API keys are scoped per-tenant rather
  // than one shared credential for every client (OpenPhone: a key is
  // scoped to one workspace, with no cross-workspace agency API). Null/
  // undefined means "the platform's single default credential."
  credentialLabel?: string | null;
}

export interface DateRange {
  start: Date;
  end: Date;
}

// A failed API call must never be indistinguishable from a real zero.
// 'error' and 'no_data' are different things and must stay separate all
// the way to the UI — never coerce either one into a displayed value.
export type ConnectorResult<T> =
  | { status: "ok"; data: T; raw: unknown }
  | { status: "no_data"; raw: unknown }
  | { status: "error"; error: string };

// One account/property/location as returned by a platform's own account
// listing endpoint — never a credential, always something safe to render.
// `extra` is a short human-readable disambiguator (currency, status,
// domain type, ...) shown alongside name/id when two accounts share a name.
export interface DiscoveredAccount {
  id: string;
  name: string;
  extra?: string;
  // Set only by a platform whose accounts are split across several
  // per-tenant credentials — see PlatformAccount.credentialLabel. Carried
  // through to the mapping so fetch/Verify/sync know which credential
  // this particular externalId belongs to.
  credentialLabel?: string;
}

export type DiscoveryResult =
  | { status: "ok"; accounts: DiscoveredAccount[] }
  | { status: "error"; error: string };

export interface Connector<T> {
  platform: Platform;
  schema: z.ZodType<T>;
  fetch(account: PlatformAccount, range: DateRange): Promise<ConnectorResult<T>>;
  // Optional because it's rolled out per-connector; the settings UI falls
  // back to manual entry for any platform that doesn't implement it yet.
  listAccounts?(): Promise<DiscoveryResult>;
}
