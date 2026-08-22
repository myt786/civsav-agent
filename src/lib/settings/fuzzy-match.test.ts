import { describe, expect, it } from "vitest";
import { bestMatch, SUGGESTION_THRESHOLD } from "./fuzzy-match";
import type { DiscoveredAccount } from "../connectors/types";

const accounts: DiscoveredAccount[] = [
  { id: "1", name: "Acme Roofing" },
  { id: "2", name: "Blue Ridge Dental" },
  { id: "3", name: "Coastal HVAC - Paused" },
];

describe("bestMatch", () => {
  it("scores an exact name match as 1", () => {
    const match = bestMatch("Acme Roofing", accounts);
    expect(match?.account.id).toBe("1");
    expect(match?.score).toBe(1);
  });

  it("treats legal-entity suffixes and punctuation as noise, not signal", () => {
    const match = bestMatch("Acme Roofing, LLC.", accounts);
    expect(match?.account.id).toBe("1");
    expect(match?.score).toBe(1);
  });

  it("is case-insensitive", () => {
    const match = bestMatch("acme roofing", accounts);
    expect(match?.account.id).toBe("1");
  });

  it("matches on substring containment (client name shorter than the account name)", () => {
    const match = bestMatch("Coastal HVAC", accounts);
    expect(match?.account.id).toBe("3");
    expect(match!.score).toBeGreaterThanOrEqual(SUGGESTION_THRESHOLD);
  });

  it("returns null when nothing clears the confidence threshold", () => {
    const match = bestMatch("Zenith Plumbing Co", accounts);
    expect(match).toBeNull();
  });

  it("returns null for an empty client name or an empty account list", () => {
    expect(bestMatch("", accounts)).toBeNull();
    expect(bestMatch("Acme Roofing", [])).toBeNull();
  });

  it("picks the single best-scoring account, not just the first candidate above threshold", () => {
    const twoClose: DiscoveredAccount[] = [
      { id: "a", name: "Acme Roofing Solutions" },
      { id: "b", name: "Acme Roofing" },
    ];
    const match = bestMatch("Acme Roofing", twoClose);
    expect(match?.account.id).toBe("b");
  });
});
