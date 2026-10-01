export interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries 5xx and network errors with exponential backoff. Never retries
// 4xx — a bad request or bad auth will not fix itself by being repeated.
export async function fetchWithRetry(
  input: string | URL,
  init?: RequestInit,
  config: RetryConfig = {},
): Promise<Response> {
  const maxRetries = config.maxRetries ?? 3;
  const baseDelayMs = config.baseDelayMs ?? 500;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);
      if (response.status >= 500) {
        throw new HttpError(response.status, `${response.status} ${response.statusText}`);
      }
      if (response.status >= 400) {
        return response;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

export interface RateLimiterConfig {
  requestsPerSecond: number;
}

// Simple fixed-interval limiter: configurable per connector, spaces
// consecutive calls at least 1000/requestsPerSecond ms apart. Each caller
// reserves its slot before sleeping, so concurrent callers (the sync runs
// several accounts at once) queue up one interval apart instead of all
// reading the same "last call" time and firing together.
export class RateLimiter {
  private readonly minIntervalMs: number;
  private nextSlotAt = 0;

  constructor(config: RateLimiterConfig) {
    this.minIntervalMs = 1000 / config.requestsPerSecond;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = slot + this.minIntervalMs;
    if (slot > now) {
      await sleep(slot - now);
    }
  }
}
