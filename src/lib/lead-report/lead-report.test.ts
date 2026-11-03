import { describe, expect, it } from "vitest";
import { ghlTouches, leadDashboardTouches, phoneTouches, touchesFromPayloads } from "./extract";
import { fallbackAssessment, mergeTouches, normalisePhone, rankLeads, scoreLead, tierFor } from "./score";
import type { LeadAssessment } from "./types";

const fetchedAt = new Date("2026-10-16T08:00:00Z");

describe("extract", () => {
  it("reads Lead Dashboard records, skipping spam, with nested form answers", () => {
    const touches = leadDashboardTouches(
      {
        data: [
          {
            id: 1,
            status: "completed",
            is_spam: false,
            created_at: "2026-10-10 14:22:00",
            fields: { first_name: "Drew", last_name: "Nielsen", phone: "(712) 246-9280", email: "drew@farm.com", message: "Quote 265-gal totes" },
          },
          { id: 2, status: "completed", is_spam: true, created_at: "2026-10-10 15:00:00", name: "Spam" },
          { id: 3, status: "abandoned", is_spam: null, created_at: "2026-10-11 09:00:00", name: "Half", email: "half@x.com" },
        ],
      },
      fetchedAt,
    );
    expect(touches).toHaveLength(2);
    expect(touches[0]).toMatchObject({ name: "Drew Nielsen", phone: "(712) 246-9280", email: "drew@farm.com", channel: "website", partial: false });
    expect(touches[0].details).toContain("Quote 265-gal totes");
    expect(touches[0].createdAt).toBe("2026-10-10T14:22:00.000Z");
    expect(touches[1].partial).toBe(true);
  });

  it("reads GoHighLevel opportunities with their contact and booked tags", () => {
    const touches = ghlTouches(
      {
        opportunities: [
          {
            id: "o1",
            name: "Ken Less",
            status: "open",
            source: "Facebook form",
            createdAt: "2026-09-22T10:00:00Z",
            monetaryValue: 0,
            contact: { name: "Ken Less", email: "kenless60@gmail.com", phone: "+17125488623", tags: ["booked call"] },
          },
        ],
      },
      fetchedAt,
    );
    expect(touches[0]).toMatchObject({ name: "Ken Less", booked: true, source: "Facebook form", value: null, channel: "crm" });
  });

  it("groups incoming calls per caller and ignores outgoing ones", () => {
    const touches = phoneTouches(
      {
        calls: [
          { id: "c1", direction: "incoming", from: "+18154524785", status: "missed", duration: 0, createdAt: "2026-10-01T15:00:00Z" },
          { id: "c2", direction: "incoming", from: "+18154524785", status: "completed", duration: 120, createdAt: "2026-10-02T15:00:00Z" },
          { id: "c3", direction: "outgoing", from: "+10000000000", status: "completed", duration: 60, createdAt: "2026-10-02T16:00:00Z" },
        ],
      },
      fetchedAt,
    );
    expect(touches).toHaveLength(1);
    expect(touches[0].calls).toEqual({ total: 2, missed: 1, seconds: 120 });
  });

  it("keeps a lead once when two sync runs stored it, and skips error rows", () => {
    const payload = { data: [{ id: 9, status: "completed", is_spam: false, created_at: "2026-10-10 10:00:00", name: "A" }] };
    const touches = touchesFromPayloads([
      { platform: "lead_dashboard", payload, fetchedAt },
      { platform: "lead_dashboard", payload, fetchedAt },
      { platform: "ghl", payload: { error: "boom" }, fetchedAt },
    ]);
    expect(touches).toHaveLength(1);
  });
});

describe("merge and score", () => {
  const base = { tags: [], booked: false, value: null, partial: false, company: null, source: null, details: null };

  it("merges channels on phone, then email", () => {
    const merged = mergeTouches([
      { ...base, channel: "website", externalId: "ld:1", name: "Drew", email: "drew@farm.com", phone: "(712) 246-9280", createdAt: "2026-10-10T00:00:00Z" },
      { ...base, channel: "phone", externalId: "call:1", name: null, email: null, phone: "+17122469280", createdAt: "2026-10-11T00:00:00Z", calls: { total: 2, missed: 1, seconds: 30 } },
      { ...base, channel: "crm", externalId: "ghl:1", name: "Drew N", email: "DREW@farm.com", phone: null, createdAt: "2026-10-12T00:00:00Z" },
      { ...base, channel: "website", externalId: "ld:2", name: "Other", email: "o@x.com", phone: null, createdAt: "2026-10-12T00:00:00Z" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ name: "Drew", channels: ["website", "crm", "phone"], submissions: 2, calls: 2, missedCalls: 1 });
    expect(normalisePhone("+1 (712) 246-9280")).toBe("7122469280");
  });

  it("scores timing, size, intent, persistence, recency and multi-channel", () => {
    const [lead] = mergeTouches([
      { ...base, channel: "website", externalId: "ld:1", name: "A", email: "a@x.com", phone: "5551234567", createdAt: "2026-10-15T00:00:00Z" },
      { ...base, channel: "phone", externalId: "call:1", name: null, email: null, phone: "5551234567", createdAt: "2026-10-15T00:00:00Z", calls: { total: 1, missed: 0, seconds: 10 } },
    ]);
    const hot: LeadAssessment = { timing: "immediate", size: "business", intent: "quote", junk: false, context: "", opener: "" };
    // 40 + 25 + 25 + 0 persistence + 15 recency + 8 multi = 113 → capped 100
    expect(scoreLead(lead, hot, new Date("2026-10-16T00:00:00Z"))).toBe(100);
    const cold: LeadAssessment = { timing: "later", size: "small", intent: "general", junk: false, context: "", opener: "" };
    // 8 + 6 + 6 + 15 + 8 = 43
    expect(scoreLead(lead, cold, new Date("2026-10-16T00:00:00Z"))).toBe(43);
    expect(tierFor(55)).toBe(1);
    expect(tierFor(54)).toBe(2);
    expect(tierFor(39)).toBe(3);
  });

  it("ranks open leads by score, lists booked ones last and drops junk", () => {
    const merged = mergeTouches([
      { ...base, channel: "website", externalId: "1", name: "Cold", email: "c@x.com", phone: null, createdAt: "2026-10-01T00:00:00Z" },
      { ...base, channel: "website", externalId: "2", name: "Hot", email: "h@x.com", phone: null, createdAt: "2026-10-01T00:00:00Z" },
      { ...base, channel: "crm", externalId: "3", name: "Booked", email: "b@x.com", phone: null, createdAt: "2026-10-01T00:00:00Z", booked: true },
      { ...base, channel: "website", externalId: "4", name: "Spam", email: "s@x.com", phone: null, createdAt: "2026-10-01T00:00:00Z" },
    ]);
    const a = (over: Partial<LeadAssessment>): LeadAssessment => ({ ...fallbackAssessment(merged[0]), ...over });
    const assessments = new Map([
      ["c@x.com", a({ timing: "later", intent: "none" })],
      ["h@x.com", a({ timing: "immediate", intent: "quote" })],
      ["b@x.com", a({})],
      ["s@x.com", a({ junk: true })],
    ]);
    const { ranked, junk } = rankLeads(merged, assessments, new Date("2026-10-16T00:00:00Z"));
    expect(junk).toBe(1);
    expect(ranked.map((l) => l.name)).toEqual(["Hot", "Cold", "Booked"]);
    expect(ranked.map((l) => l.rank)).toEqual([1, 2, 3]);
    expect(ranked[2].tier).toBe("booked");
  });
});
