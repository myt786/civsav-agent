import { beforeAll, describe, expect, it } from "vitest";
import { createSessionCookieValue, verifySessionCookieValue } from "./session";

describe("verifySessionCookieValue", () => {
  beforeAll(() => {
    process.env.SETTINGS_SESSION_SECRET = "test-secret-for-session-tests";
  });

  it("accepts a cookie it signed", async () => {
    const value = await createSessionCookieValue("a@example.com");
    expect(await verifySessionCookieValue(value)).toEqual({ email: "a@example.com" });
  });

  it("treats a garbled cookie as signed out instead of throwing", async () => {
    await expect(verifySessionCookieValue("abc.%%%not-base64%%%")).resolves.toBeNull();
    await expect(verifySessionCookieValue("only-one-part")).resolves.toBeNull();
  });
});
