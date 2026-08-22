import type { DiscoveredAccount } from "../connectors/types";

// No Node built-ins here on purpose — this runs client-side too, so typing
// a client name re-suggests instantly against already-fetched discovery
// lists instead of round-tripping to the server on every keystroke.

// Common legal-entity noise that shouldn't count against a match — "Acme
// Roofing" and "Acme Roofing LLC" should score as identical, not merely
// close.
const SUFFIX_WORDS = new Set(["llc", "inc", "co", "corp", "ltd", "company", "group"]);

function normalize(value: string): string {
  const stripped = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !SUFFIX_WORDS.has(word))
    .join(" ");
  return stripped.trim();
}

function bigrams(value: string): string[] {
  if (value.length < 2) return value.length === 1 ? [value] : [];
  const grams: string[] = [];
  for (let i = 0; i < value.length - 1; i++) {
    grams.push(value.slice(i, i + 2));
  }
  return grams;
}

// Dice coefficient over character bigrams: robust to word order and minor
// spelling drift, cheap to compute, no dependency required.
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  if (bigramsA.length === 0 || bigramsB.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const gram of bigramsA) {
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  let overlap = 0;
  for (const gram of bigramsB) {
    const remaining = counts.get(gram) ?? 0;
    if (remaining > 0) {
      overlap++;
      counts.set(gram, remaining - 1);
    }
  }

  return (2 * overlap) / (bigramsA.length + bigramsB.length);
}

function similarity(clientName: string, accountName: string): number {
  const a = normalize(clientName);
  const b = normalize(accountName);
  if (!a || !b) return 0;

  let score = diceCoefficient(a, b);
  // One name fully containing the other (e.g. "Acme" vs. "Acme Roofing Co
  // - Northeast") is a strong signal the bigram score alone can undersell.
  if (a.includes(b) || b.includes(a)) {
    score = Math.max(score, 0.75);
  }
  return score;
}

// Below this, a suggestion is more likely to mislead than help — the row
// is left for the user to search manually instead of being pre-filled.
export const SUGGESTION_THRESHOLD = 0.5;

export interface AccountMatch {
  account: DiscoveredAccount;
  score: number;
}

export function bestMatch(clientName: string, accounts: DiscoveredAccount[]): AccountMatch | null {
  if (!clientName.trim() || accounts.length === 0) return null;

  let best: AccountMatch | null = null;
  for (const account of accounts) {
    const score = similarity(clientName, account.name);
    if (!best || score > best.score) {
      best = { account, score };
    }
  }

  if (!best || best.score < SUGGESTION_THRESHOLD) return null;
  return best;
}
