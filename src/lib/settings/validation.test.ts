import { describe, expect, it } from "vitest";
import { isPlatform, isUuid, isValidCredentialLabel } from "./validation";

describe("settings input checks", () => {
  it("accepts only well-formed uuids", () => {
    expect(isUuid("3f2b6c1e-8d4a-4b7e-9f10-2a3b4c5d6e7f")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it("accepts only known platforms", () => {
    expect(isPlatform("ghl")).toBe(true);
    expect(isPlatform("toString")).toBe(false);
    expect(isPlatform("myspace")).toBe(false);
  });

  it("accepts the three credential label shapes and nothing else", () => {
    expect(isValidCredentialLabel(null)).toBe(true);
    expect(isValidCredentialLabel("db:3f2b6c1e-8d4a-4b7e-9f10-2a3b4c5d6e7f")).toBe(true);
    expect(isValidCredentialLabel("ACME_CO")).toBe(true);
    expect(isValidCredentialLabel("db:nope")).toBe(false);
    expect(isValidCredentialLabel("../SECRET")).toBe(false);
  });
});
