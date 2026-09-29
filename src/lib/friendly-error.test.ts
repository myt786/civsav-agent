import { describe, expect, it } from "vitest";
import { friendlyError } from "./friendly-error";

describe("friendlyError", () => {
  it("explains a rejected key without the status code, keeping the original as detail", () => {
    const result = friendlyError("401 Unauthorized");
    expect(result.summary).toMatch(/access key was rejected/);
    expect(result.summary).not.toContain("401");
    expect(result.detail).toBe("401 Unauthorized");
  });

  it("turns missing env config into a 'not set up yet' message", () => {
    expect(friendlyError("GHL_API_BASE_URL not configured").summary).toMatch(/isn't fully set up/);
  });

  it("treats permission errors separately from bad keys", () => {
    expect(friendlyError("403 The token does not have access to this location").summary).toMatch(/permission/);
  });

  it("keeps messages the app already wrote for people", () => {
    const message = "This client's GoHighLevel key was deleted — add it again in Settings → API keys.";
    expect(friendlyError(message)).toEqual({ summary: message, detail: "" });
  });

  it("falls back to a generic sentence for unknown errors", () => {
    const result = friendlyError("something odd happened");
    expect(result.summary).toBe("Something went wrong talking to this platform.");
    expect(result.detail).toBe("something odd happened");
  });
});
