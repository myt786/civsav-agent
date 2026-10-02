import { describe, expect, it } from "vitest";
import { isSeoOnly } from "./seo-only";

describe("isSeoOnly", () => {
  it("is true when every account is Search Console or Ahrefs", () => {
    expect(isSeoOnly([{ platform: "search_console" }, { platform: "ahrefs" }])).toBe(true);
    expect(isSeoOnly([{ platform: "ahrefs" }])).toBe(true);
  });

  it("is false with any other account, or none at all", () => {
    expect(isSeoOnly([{ platform: "search_console" }, { platform: "google_ads" }])).toBe(false);
    expect(isSeoOnly([])).toBe(false);
  });
});
