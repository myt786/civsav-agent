import { describe, expect, it } from "vitest";
import { generatePassword, hashPassword, verifyPassword } from "./passwords";

describe("team passwords", () => {
  it("generates four groups of four unambiguous characters", () => {
    const password = generatePassword();
    expect(password).toMatch(/^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){3}$/);
    expect(generatePassword()).not.toBe(password);
  });

  it("verifies the right password and rejects others", async () => {
    const stored = await hashPassword("k7mq-3xpt-9hwz-r2fd");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("k7mq");
    await expect(verifyPassword("k7mq-3xpt-9hwz-r2fd", stored)).resolves.toBe(true);
    await expect(verifyPassword("k7mq-3xpt-9hwz-r2fe", stored)).resolves.toBe(false);
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    await expect(verifyPassword("anything", "not-a-hash")).resolves.toBe(false);
  });
});
