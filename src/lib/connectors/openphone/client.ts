import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry, HttpError, RateLimiter } from "../shared/http";
import type { Telephony } from "../telephony/types";
import type { PlatformAccount, DateRange } from "../types";

// Configurable per connector, per the contract's rate-limit requirement.
const rateLimiter = new RateLimiter({ requestsPerSecond: 5 });

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "openphone");

export const openPhoneProvider: Telephony = {
  async fetchCallSummary(account: PlatformAccount, range: DateRange): Promise<unknown> {
    if (process.env.CONNECTOR_MODE === "fixture") {
      const fixtureName = process.env.OPENPHONE_FIXTURE ?? "success.json";
      const raw = await readFile(path.join(FIXTURES_DIR, fixtureName), "utf-8");
      return JSON.parse(raw);
    }

    const baseUrl = process.env.OPENPHONE_API_BASE_URL;
    const apiKey = process.env.OPENPHONE_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error("OPENPHONE_API_BASE_URL / OPENPHONE_API_KEY not configured");
    }

    await rateLimiter.wait();

    const url = new URL(`${baseUrl}/calls`);
    url.searchParams.set("phoneNumberId", account.externalId);
    url.searchParams.set("start", range.start.toISOString());
    url.searchParams.set("end", range.end.toISOString());

    const response = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new HttpError(response.status, `${response.status} ${response.statusText}`);
    }

    return response.json();
  },
};
