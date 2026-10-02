import { describe, expect, it } from "vitest";
import { buildDailyDigestEmail } from "./templates";

describe("buildDailyDigestEmail", () => {
  it("escapes client names and includes a plain-text part and the Insights link", () => {
    const email = buildDailyDigestEmail({
      now: new Date("2026-10-01T08:30:00Z"),
      clientCount: 3,
      flags: [
        {
          kind: "leads_down",
          severity: "warning",
          clientId: "c1",
          clientName: "Smith & Sons <Roofing>",
          message: "Leads are down 40% compared with the week before",
        },
      ],
      dataIssues: [],
      narrative: null,
      appUrl: "https://dash.example.com",
    });

    expect(email.subject).toContain("Daily client summary");
    expect(email.html).toContain("Smith &amp; Sons &lt;Roofing&gt;");
    expect(email.html).not.toContain("<Roofing>");
    expect(email.html).toContain("https://dash.example.com/insights");
    expect(email.text).toContain("NEEDS A LOOK");
    expect(email.text).toContain("Smith & Sons <Roofing>: Leads are down 40%");
  });
});

describe("buildAccessReportEmail", () => {
  it("lists broken accounts with reasons and groups unconnected platforms", async () => {
    const { buildAccessReportEmail } = await import("./templates");
    const email = buildAccessReportEmail(
      {
        generatedAt: new Date("2026-10-05T09:00:00Z"),
        clientCount: 3,
        notWorking: [{ clientName: "Acme", platform: "GA4", reason: "We don't have permission to see this account." }],
        notChecked: [],
        notConnected: [{ platform: "Meta Ads", clients: ["Acme", "Beta"] }],
      },
      "https://dash.example.com",
    );
    expect(email.subject).toBe("Account access report — 1 to fix");
    expect(email.html).toContain("Acme");
    expect(email.html).toContain("Meta Ads");
    expect(email.text).toContain("- Acme · GA4: We don't have permission");
    expect(email.text).toContain("- Meta Ads (2): Acme, Beta");
    expect(email.html).toContain("https://dash.example.com/settings/clients");
  });
});
