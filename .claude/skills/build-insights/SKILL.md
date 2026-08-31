---
name: build-insights
description: Extend /insights (attention flags, forecasts, AI summary, chat) or the dashboard's flag badge. Use when asked to add a new attention flag, add a forecast metric, change the anomaly-detection threshold, touch the AI summary or chat agent, or when a Vercel production build starts OOM-killing after a dependency change.
---

# Building on Insights

`/insights` (plus the small warning badge it feeds into the main dashboard
table) has two layers that must never be confused: a **deterministic rules
layer** that computes real numbers with no model call, and a thin **AI
layer** that only narrates numbers the rules layer already computed. This
skill documents both, plus two non-obvious infrastructure facts (model
availability, a build-memory fix) that are easy to break by accident.

## File map

```
src/lib/insights/
  types.ts      — AttentionFlag, MetricForecast, ForecastPoint
  rules.ts      — computeAttentionFlags, buildForecasts (all pure functions)
  rules.test.ts — the reference test shape for both
  narrative.ts  — generateFleetNarrative (server-only, one structured AI SDK call)
src/lib/agents/
  insights-agent.ts        — the chat ToolLoopAgent + its instructions
  tools/dashboard-tools.ts — the 3 read-only tools the agent can call
src/app/api/insights/
  narrative/route.ts — POST, on-demand, calls generateFleetNarrative
  chat/route.ts       — POST, createAgentUIStreamResponse(insightsAgent)
src/app/insights/page.tsx        — server component, wires it all together
src/components/insights/         — AttentionFlags, ForecastChart, AiSummary, ChatPanel
src/components/dashboard/columns.tsx — the "client" column badge (dashboard, not /insights)
```

`computeAttentionFlags` and `buildForecasts` both take the already-fetched
`DashboardData` from `getDashboardData()` — they never query the DB
themselves, and neither does anything AI-related. That's deliberate: the
same flags feed three different UIs (the /insights list, the dashboard
badge, and the AI summary's prompt), and they all have to agree exactly.
Compute a flag once, in `rules.ts`; never recompute a variant of it
somewhere else.

## Adding a new attention flag

1. Add the `FlagKind` string to `types.ts`.
2. Decide: is this a **threshold on an existing cell** (like `leads_down`,
   which reuses `ClientRow.leadsDelta` — already computed for the table, so
   just reads it) or a **new anomaly check on a 30-day sparkline series**
   (like `spend_spike`)? Prefer reusing an existing cell/delta when one
   exists — it guarantees the flag can never disagree with what the table
   itself shows.
3. For a sparkline-based check, call `rollingZScore(series.points,
   WINDOW_DAYS)` (see below) rather than inventing a new fixed-%% or
   fixed-slope threshold. A magic-number threshold was the mistake this
   codebase already made once (the original `POSITION_TREND_THRESHOLD`
   slope check) and deliberately moved away from.
4. Push the flag inside the `for (const row of data.rows)` loop in
   `computeAttentionFlags`, following the existing pattern: `kind`,
   `severity` (`critical` only for `sync_error` — everything else is
   `warning`), `clientId`, `clientName`, a `message` with the actual
   numbers in it (never a vague "something changed").
5. Add the label to `KIND_LABEL` in both
   `src/components/insights/attention-flags.tsx` (full list) — the
   dashboard badge in `columns.tsx` doesn't need its own label map, it
   just renders whatever `message` the flag already carries.
6. Add tests in `rules.test.ts` following the existing z-score fixture
   pattern (see below) — one asserting the flag fires, one asserting it
   doesn't on the opposite direction, and if it's z-score-based, one
   asserting it doesn't fire with too little baseline history.
7. Document it in `/docs#insights` (`src/app/docs/page.tsx`) — the row in
   the flag-kinds table.

## The z-score anomaly method (`rollingZScore` in `rules.ts`)

Compares the last `WINDOW_DAYS` (7) days' mean against a baseline built
from everything before it in the 30-day sparkline, scaled by that
baseline's own standard deviation:

```
z = (recentMean - baselineMean) / (baselineStdDev / sqrt(recentCount))
```

- `ANOMALY_Z_THRESHOLD = 2` — roughly the "worth a second look" cutoff
  (~95% band on a normal distribution). Loosening this trades fewer false
  positives for more missed real changes and vice versa; don't change it
  without checking what it does to `rules.test.ts`'s existing fixtures.
- `MIN_BASELINE_DAYS = 5` — below this, `rollingZScore` returns `null`
  (no flag) rather than computing a standard deviation from a handful of
  points. A 20-point test series (13 baseline + 7 recent) is the minimum
  that clears this in a test; a 10-point series (the original pre-z-score
  test fixtures) does not — if you're writing a new z-score test and it
  mysteriously never fires, check the series is long enough first.
- Baseline `stdDev === 0` (a perfectly flat history) is handled as an
  explicit special case (`z = ±Infinity`) rather than dividing by zero —
  any change at all from a genuinely flat baseline is real.
- The split is by **array position** (`points.length - recentDays`), not
  by count of non-null values — this keeps "recent" aligned with the same
  `WINDOW_DAYS` the rest of the dashboard uses for "this week," regardless
  of how sparse the data is.

## Adding a forecast metric

`computeForecast` and `MetricForecast` are already generic over
`key`/`unit` — extending coverage is data, not new logic:

1. Widen `MetricForecast["key"]` in `types.ts` (currently `"leads" |
   "spend"`).
2. Add a row to the `FORECAST_METRICS` array in `rules.ts` — `{ key,
   sparklineKey, label, unit }`. `sparklineKey` must match a
   `SparklineMetric["key"]` from `src/lib/dashboard/types.ts`; if the
   metric you want doesn't have one yet (e.g. CPL, which isn't stored as
   its own daily series), you'd need to add it to
   `getDashboardData`'s sparklines first — that's dashboard work, not
   insights work, do it in `src/lib/dashboard/queries.ts`.
3. `unit: "count" | "currency"` drives formatting automatically —
   `ForecastChart`'s `unitFormatter` and the tooltip already switch on it.
4. Add a new section in `src/app/insights/page.tsx` (`forecasts.filter((f)
   => f.metric.key === "...")`, same pattern as the existing leads/spend
   sections) — `buildForecasts` already returns every metric mixed
   together, filtering by key is the caller's job.

The forecast itself is a plain least-squares line through the 30-day
history (`fitTrend` in `rules.ts`), never fit with fewer than 5 known
days, never projecting a negative value (`Math.max(0, ...)`).

## The AI layer — narration only, never computation

Both `narrative.ts` and `insights-agent.ts` are instructed to **only
describe numbers they're given**, never compute or estimate one
themselves:

- `generateFleetNarrative` builds a plain-text summary of every client's
  already-computed row + flags, then makes one `generateText` call with
  `output: Output.object({ schema: narrativeOutputSchema })` (structured
  output — not the deprecated `generateObject`). The model never sees raw
  DB rows, only the same numbers already rendered elsewhere on the page.
- `insightsAgent` (a `ToolLoopAgent`) has exactly three tools —
  `getFleetSnapshot`, `getClientDetail`, `getSyncStatus` — each a thin
  wrapper around a `dashboard/queries.ts` function. Its instructions
  explicitly forbid stating a number it didn't just get from a tool call,
  and explain what `no_data` / `error` / `unverified` mean so it doesn't
  narrate a missing metric as a real zero. `stopWhen: stepCountIs(8)`
  caps the tool-call loop.
- Tools re-query the DB fresh on every call rather than caching within a
  request — deliberate simplicity (five clients, cheap queries), matching
  how `getSyncStatus` in `queries.ts` is already a standalone query for
  the same reason. Don't add a request-scoped cache unless the dataset
  actually grows enough to justify it.

**If you add a new tool**, keep it read-only, wrap an existing
`dashboard/queries.ts` function rather than writing new SQL, and give it a
description explicit enough that the model knows when to call it without
guessing (see the existing three for the level of detail expected).

## Model choice — a real constraint, not a preference

`NARRATIVE_MODEL` and `INSIGHTS_MODEL` are both currently
`"google/gemini-2.5-flash-lite"`. **This is not the ideal model choice —
it's the only one that actually works on this Vercel team's AI Gateway
plan.** Verified live during development: `anthropic/claude-*` and
`google/gemini-2.5-pro` / `gemini-3.7-flash` all returned "Free tier users
do not have access to this model" (402-shaped) or, under any load,
`GatewayRateLimitError` (429) — this is an **account-plan limit**, not a
code bug, a quota you can retry past, or something `stopWhen`/`maxRetries`
fixes.

If you're debugging a broken narrative/chat response:

1. Check the actual error first — a `429`/`GatewayRateLimitError` in the
   dev server log (not the generic `{"type":"error","errorText":"An error
   occurred."}` the UI shows) means rate-limited, not broken code.
2. Don't retry-loop against the gateway to "confirm" a fix — burns the
   $5/month free credit fast (this happened during development testing).
   Change the model, wait, test once.
3. Before hardcoding any other model string, verify it's actually
   reachable on this account: `curl -s -X POST
   http://localhost:PORT/api/insights/narrative` (no auth needed in dev)
   and read the real response, or check
   `https://ai-gateway.vercel.sh/v1/models` for what exists at all — never
   assume a model ID from training data or documentation is available on
   this specific account.
4. If the account gets a paid plan or `AI_GATEWAY_API_KEY` later, revisit
   the model choice — flash-lite was picked for availability, not
   capability. A capability upgrade (e.g. to `anthropic/claude-sonnet-5`
   for the chat agent specifically, where tool-use quality matters more
   than for the narrative summary) is a one-line change in each file's
   `*_MODEL` constant.

## The build-memory fix in `next.config.ts` — do not remove blind

Adding the `ai` SDK pushed the production build (`next build`, which uses
webpack, not Turbopack — `next dev --turbopack`'s dev server never
exercises this path) over Vercel's 4-core/8 GB build machine's memory
ceiling. Two things fixed it, verified by measuring actual peak RSS
locally with `/usr/bin/time -l npx next build`:

- `experimental.webpackMemoryOptimizations: true` — Next's own knob,
  modest effect on its own.
- `webpack: (config) => { config.cache = false; return config; }` —
  disables Next's default persistent filesystem webpack cache. This was
  the fix that actually mattered: **6.23 GB → 5.29 GB peak RSS** on this
  codebase, cold-cache build, and *faster* too (172s → 139s, since
  there's no cache to serialize and write). `webpackBuildWorker` was also
  tried and measurably did **nothing** — it's deliberately not in the
  config; don't re-add it without re-measuring.

**If you see `Next.js build worker exited with code: null and signal:
SIGKILL` on a deploy** (check with `npx vercel inspect --logs <deployment
url>` — the tail has a "Build system report" confirming "At least one
Out of Memory (OOM) event was detected"): this is exactly that failure
mode again, most likely from a new dependency growing the module graph
further. Don't just add more flags speculatively — re-run the
`/usr/bin/time -l npx next build` measurement (with and without your
change) locally first, the same way this fix was derived, so you know a
change actually helped before pushing it. `next build` succeeding
*locally* proves nothing about the 8 GB ceiling — this machine has more
RAM than the build container; only a peak-RSS measurement or an actual
Vercel deploy tells you.

**Don't remove `config.cache = false` to "speed up" CI** without
re-measuring — every build becomes cold-cache-cost again if you do, and
that cost is exactly what was traded away to stop the OOM.

## Testing checklist for insights changes

- [ ] New/changed rule: covered in `rules.test.ts`, both the fires-case
      and the does-not-fire-case (see existing z-score tests for the
      fixture shape — 13+ baseline points, 7 recent points, `seriesFromValues`)
- [ ] `npx vitest run` — full suite, not just the new file (currently 131
      tests; a regression elsewhere in `dashboard/` would still fail here)
- [ ] `npx tsc --noEmit -p tsconfig.json` and `npx eslint <changed files>`
- [ ] If you touched `next.config.ts`, the AI model constants, or added a
      dependency: `rm -rf .next && npx next build` locally — and if it's a
      dependency change specifically, measure peak RSS with `/usr/bin/time
      -l` before assuming it's fine
- [ ] Visual check in a real browser for any UI change — `/insights` and,
      if the flag/badge logic changed, the main dashboard table too
      (`pnpm dev`, or `next dev --turbopack -p <port>` with
      `CONNECTOR_MODE=fixture` for seeded demo data)
