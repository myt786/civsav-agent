import { describe, expect, it } from "vitest";
import { carryHistory, parseStoredRecommendations, recommendationsAsText } from "./recommendation-items";

describe("parseStoredRecommendations", () => {
  it("reads the original plain list of sentences", () => {
    const parsed = parseStoredRecommendations(["Fix the title on /roofing", "  "], 120);
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]).toMatchObject({ title: "Fix the title on /roofing", priority: "medium", status: "open" });
    expect(parsed?.sources?.sitemapUrls).toBe(120);
  });

  it("fills in anything missing or unexpected in the structured shape", () => {
    const parsed = parseStoredRecommendations({
      version: 2,
      items: [{ id: "a", title: "Add FAQ", priority: "urgent", category: "content", status: "done" }, { title: "" }, null],
      sources: { sitemapUrls: null, gscQueries: 20 },
    });
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]).toMatchObject({ id: "a", priority: "medium", category: "content", effort: "medium", status: "done", target: null });
    expect(parsed?.sources).toEqual({ sitemapUrls: null, gscQueries: 20, gscPages: 0, notesMonths: 0 });
  });

  it("returns null for nothing stored", () => {
    expect(parseStoredRecommendations(null)).toBeNull();
  });
});

describe("carryHistory", () => {
  it("keeps finished and turned-down items, newest first, without duplicates", () => {
    const previous = parseStoredRecommendations({
      items: [
        { id: "1", title: "Add FAQ", status: "done", statusAt: "2026-09-01T00:00:00Z" },
        { id: "2", title: "Build links", status: "dismissed" },
        { id: "3", title: "Still open", status: "open" },
      ],
      history: [{ title: "add faq", status: "done", at: "2026-08-01T00:00:00Z" }, { title: "Old one", status: "done", at: "2026-07-01T00:00:00Z" }],
    });
    const history = carryHistory(previous);
    expect(history.map((h) => h.title)).toEqual(["Add FAQ", "Build links", "Old one"]);
  });
});

describe("recommendationsAsText", () => {
  it("lists only open items, high priority first", () => {
    const parsed = parseStoredRecommendations({
      items: [
        { id: "1", title: "Low thing", priority: "low" },
        { id: "2", title: "Big thing", priority: "high", target: "/services" },
        { id: "3", title: "Done thing", priority: "high", status: "done" },
      ],
    });
    const text = recommendationsAsText("Acme", parsed!.items);
    expect(text.indexOf("Big thing")).toBeLessThan(text.indexOf("Low thing"));
    expect(text).not.toContain("Done thing");
    expect(text).toContain("Target: /services");
  });
});
