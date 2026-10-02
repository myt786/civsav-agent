// The shape of a client's SEO to-do list, shared by the generator, the
// API route, the status action and the Recommendations tab. No server
// imports — the tab parses and updates these in the browser too.

export type RecPriority = "high" | "medium" | "low";
export type RecCategory = "content" | "on_page" | "technical" | "links" | "local" | "other";
export type RecEffort = "quick" | "medium" | "big";
export type RecStatus = "open" | "done" | "dismissed";

export const REC_PRIORITIES: RecPriority[] = ["high", "medium", "low"];
export const REC_CATEGORIES: RecCategory[] = ["content", "on_page", "technical", "links", "local", "other"];
export const REC_EFFORTS: RecEffort[] = ["quick", "medium", "big"];

export const PRIORITY_LABELS: Record<RecPriority, string> = { high: "High", medium: "Medium", low: "Low" };
export const CATEGORY_LABELS: Record<RecCategory, string> = {
  content: "Content",
  on_page: "On-page",
  technical: "Technical",
  links: "Links",
  local: "Local",
  other: "Other",
};
export const EFFORT_LABELS: Record<RecEffort, string> = { quick: "Quick win", medium: "A few hours", big: "Bigger project" };

export interface RecommendationItem {
  id: string;
  title: string;
  detail: string;
  priority: RecPriority;
  category: RecCategory;
  effort: RecEffort;
  // The page or search query this is about, when there is one.
  target: string | null;
  status: RecStatus;
  statusAt: string | null;
}

// What the model was given, shown as "Based on …" so a list written from
// a 300-page sitemap and real queries reads differently from one written
// with nothing but a tier.
export interface RecommendationSources {
  sitemapUrls: number | null;
  gscQueries: number;
  gscPages: number;
  notesMonths: number;
}

// Items the team finished or turned down in earlier lists — carried
// across rewrites so the model doesn't suggest them again.
export interface RecommendationHistoryEntry {
  title: string;
  status: "done" | "dismissed";
  at: string;
}

export interface StoredRecommendations {
  version: 2;
  items: RecommendationItem[];
  sources: RecommendationSources | null;
  history: RecommendationHistoryEntry[];
}

export const HISTORY_LIMIT = 40;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

// The column has held two shapes: the original plain list of sentences,
// and this structured version. Older rows still read fine.
export function parseStoredRecommendations(raw: unknown, sitemapUrlCount: number | null = null): StoredRecommendations | null {
  if (raw === null || raw === undefined) return null;

  if (Array.isArray(raw)) {
    const items = raw
      .filter((text): text is string => typeof text === "string" && text.trim() !== "")
      .map<RecommendationItem>((text, i) => ({
        id: `legacy-${i}`,
        title: text,
        detail: "",
        priority: "medium",
        category: "other",
        effort: "medium",
        target: null,
        status: "open",
        statusAt: null,
      }));
    return {
      version: 2,
      items,
      sources: sitemapUrlCount === null ? null : { sitemapUrls: sitemapUrlCount, gscQueries: 0, gscPages: 0, notesMonths: 0 },
      history: [],
    };
  }

  if (typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const items = (Array.isArray(obj.items) ? obj.items : [])
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map<RecommendationItem>((item, i) => ({
      id: typeof item.id === "string" && item.id ? item.id : `item-${i}`,
      title: typeof item.title === "string" ? item.title : "",
      detail: typeof item.detail === "string" ? item.detail : "",
      priority: pick(item.priority, REC_PRIORITIES, "medium"),
      category: pick(item.category, REC_CATEGORIES, "other"),
      effort: pick(item.effort, REC_EFFORTS, "medium"),
      target: typeof item.target === "string" && item.target.trim() ? item.target : null,
      status: pick(item.status, ["open", "done", "dismissed"] as const, "open"),
      statusAt: typeof item.statusAt === "string" ? item.statusAt : null,
    }))
    .filter((item) => item.title.trim() !== "");

  const s = obj.sources as Record<string, unknown> | null | undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const sources: RecommendationSources | null =
    s && typeof s === "object"
      ? {
          sitemapUrls: typeof s.sitemapUrls === "number" ? s.sitemapUrls : null,
          gscQueries: num(s.gscQueries),
          gscPages: num(s.gscPages),
          notesMonths: num(s.notesMonths),
        }
      : null;

  const history = (Array.isArray(obj.history) ? obj.history : [])
    .filter((h): h is Record<string, unknown> => h !== null && typeof h === "object")
    .filter((h) => typeof h.title === "string" && (h.status === "done" || h.status === "dismissed"))
    .map<RecommendationHistoryEntry>((h) => ({
      title: h.title as string,
      status: h.status as "done" | "dismissed",
      at: typeof h.at === "string" ? h.at : new Date(0).toISOString(),
    }));

  return { version: 2, items, sources, history };
}

// Finished and turned-down items from the list being replaced, merged into
// the running history (newest first, de-duplicated by title).
export function carryHistory(previous: StoredRecommendations | null): RecommendationHistoryEntry[] {
  if (!previous) return [];
  const fromItems = previous.items
    .filter((item) => item.status !== "open")
    .map<RecommendationHistoryEntry>((item) => ({
      title: item.title,
      status: item.status as "done" | "dismissed",
      at: item.statusAt ?? new Date().toISOString(),
    }));
  const seen = new Set<string>();
  const merged: RecommendationHistoryEntry[] = [];
  for (const entry of [...fromItems, ...previous.history]) {
    const key = entry.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged.slice(0, HISTORY_LIMIT);
}

const PRIORITY_RANK: Record<RecPriority, number> = { high: 0, medium: 1, low: 2 };

export function sortItems(items: RecommendationItem[]): RecommendationItem[] {
  return [...items].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

// Plain-text version for pasting into an email, Slack or a task tracker.
export function recommendationsAsText(clientName: string, items: RecommendationItem[]): string {
  const open = sortItems(items.filter((item) => item.status === "open"));
  const lines = [`SEO to-do — ${clientName}`, ""];
  for (const item of open) {
    const meta = [PRIORITY_LABELS[item.priority] + " priority", CATEGORY_LABELS[item.category], EFFORT_LABELS[item.effort]].join(", ");
    lines.push(`- ${item.title} (${meta})`);
    if (item.target) lines.push(`  Target: ${item.target}`);
    if (item.detail) lines.push(`  ${item.detail}`);
  }
  if (open.length === 0) lines.push("Nothing open — everything on the list is done.");
  return lines.join("\n");
}
