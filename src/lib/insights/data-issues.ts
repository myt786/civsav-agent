import { friendlyError } from "../friendly-error";
import type { AttentionFlag } from "./types";

export interface DataIssue {
  // Which numbers are affected, e.g. "Google rank".
  what: string;
  // One plain sentence on why, shared by every client in the group.
  reason: string;
  clients: string[];
}

const DATA_KINDS = new Set<AttentionFlag["kind"]>(["sync_error", "stale_sync"]);

export function isDataFlag(flag: AttentionFlag): boolean {
  return DATA_KINDS.has(flag.kind);
}

// Sync problems usually hit many clients for the same reason (one
// permission missing, one expired key). Grouping them turns twelve
// near-identical lines into one: "Google rank — 12 clients — why".
export function groupDataIssues(flags: AttentionFlag[]): DataIssue[] {
  const groups = new Map<string, DataIssue>();
  for (const flag of flags) {
    if (!isDataFlag(flag)) continue;
    let what: string;
    let reason: string;
    if (flag.kind === "stale_sync") {
      what = "All numbers";
      reason = "Haven't updated in over a day.";
    } else {
      const [field, ...rest] = flag.message.split(" failed to sync: ");
      what = rest.length > 0 ? field : "Some numbers";
      reason = friendlyError(rest.length > 0 ? rest.join(" failed to sync: ") : flag.message).summary;
    }
    const key = `${what}|${reason}`;
    const group = groups.get(key) ?? { what, reason, clients: [] };
    if (!group.clients.includes(flag.clientName)) group.clients.push(flag.clientName);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.clients.length - a.clients.length);
}
