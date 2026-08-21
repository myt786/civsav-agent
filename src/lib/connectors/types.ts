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

export interface Connector<T> {
  platform: Platform;
  schema: z.ZodType<T>;
  fetch(account: PlatformAccount, range: DateRange): Promise<ConnectorResult<T>>;
}
