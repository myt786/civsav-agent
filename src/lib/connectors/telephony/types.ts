import type { PlatformAccount, DateRange } from "../types";

// Interface boundary so a different telephony provider could be swapped
// in later without touching a connector's aggregation or validation
// logic. OpenPhone (src/lib/connectors/openphone/) is one implementation
// of this interface.
export interface Telephony {
  fetchCallSummary(account: PlatformAccount, range: DateRange): Promise<unknown>;
}
