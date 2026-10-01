import { describe, expect, it } from "vitest";
import { groupDataIssues } from "./data-issues";
import { buildDailyDigest } from "./daily-digest";
import type { AttentionFlag } from "./types";

function syncFlag(clientName: string, raw: string): AttentionFlag {
  return {
    kind: "sync_error",
    severity: "critical",
    clientId: clientName,
    clientName,
    message: `Google rank failed to sync: ${raw}`,
  };
}

const permission = "User does not have sufficient permission for site 'sc-domain:x.com'. See also: https://support.google.com/x";

describe("groupDataIssues", () => {
  it("groups clients that fail for the same reason into one line", () => {
    const issues = groupDataIssues([
      syncFlag("A", permission),
      syncFlag("B", permission),
      { kind: "leads_down", severity: "warning", clientId: "C", clientName: "C", message: "Leads are down 35%" },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].what).toBe("Google rank");
    expect(issues[0].clients).toEqual(["A", "B"]);
    expect(issues[0].reason).not.toContain("https://");
  });
});

describe("buildDailyDigest", () => {
  it("falls back to the raw flags when there is no AI summary, and escapes Slack control characters", () => {
    const flags: AttentionFlag[] = [
      { kind: "leads_down", severity: "warning", clientId: "c", clientName: "Smith & Sons <LLC>", message: "Leads are down 35%" },
      syncFlag("A", permission),
    ];
    const { text, blocks } = buildDailyDigest({
      now: new Date("2026-10-01T08:30:00Z"),
      clientCount: 2,
      flags,
      dataIssues: groupDataIssues(flags),
      narrative: null,
      appUrl: "https://example.com",
    });
    const json = JSON.stringify(blocks);
    expect(text).toContain("Daily client summary");
    expect(json).toContain("Smith &amp; Sons &lt;LLC&gt;");
    expect(json).toContain("Not updating");
    expect(json).toContain("<https://example.com/insights|Open Insights>");
  });
});
