---
name: build-connector
description: Add a new platform connector to src/lib/connectors/ (metrics source for the client dashboard — ad platforms, CRMs, telephony, SEO tools, etc.). Use when asked to add, build, or wire up a connector for a new data source, or to review/fix an existing connector against house pattern.
---

# Building a connector

Eight connectors exist today: `lead-dashboard`, `search-console`, `google-ads`,
`ga4`, `ahrefs`, `openphone`, `ghl`, `meta`. They all follow one pattern.
**`lead-dashboard` is the reference — read it first, copy its shape, then adapt
only where the platform genuinely forces a difference.** This skill documents
that pattern and flags every place the eight connectors already disagree with
each other, so a ninth doesn't silently pick a fourth answer.

## The contract (never modify)

`src/lib/connectors/types.ts` defines `Connector<T>` and `ConnectorResult<T>`.
Every connector implements this exactly:

```ts
type ConnectorResult<T> =
  | { status: 'ok'; data: T; raw: unknown }
  | { status: 'no_data'; raw: unknown }
  | { status: 'error'; error: string }

interface Connector<T> {
  platform: Platform
  schema: z.ZodType<T>
  fetch(account: PlatformAccount, range: DateRange): Promise<ConnectorResult<T>>
}
```

If a platform genuinely can't be expressed through this — not "it's a bit
awkward," but genuinely can't — **stop and say so instead of changing the
contract.** Every one of the eight found a way to fit; none needed a change.

Rules that follow from the contract, non-negotiable in every connector:

- `error` and `no_data` are different things. A failed fetch is never
  indistinguishable from a real zero.
- Read-only. No connector has a write method.
- Validate the raw API response with Zod at the boundary. A validation
  failure returns `status: 'error'` with the Zod message — never a
  silently-coerced value.
- Retry 5xx and network errors with exponential backoff. **Never retry 4xx.**
  A bad request or bad auth will not fix itself by being repeated — and for
  metered APIs (Ahrefs) retrying a quota error actively burns budget instead
  of just wasting time.
- All date bucketing uses `account.clientTimezone` via `date-fns-tz` — never
  the platform's default, never the server's.
- `CONNECTOR_MODE=fixture` reads from `fixtures/<platform>/` instead of the
  network. Every connector ships at least `success.json`, `empty.json`,
  `malformed.json`.

## File layout

```
src/lib/connectors/<platform>/
  schema.ts   — Zod schema for the raw API shape, Zod schema for the normalized data
  client.ts   — fetch logic: fixture branch, real branch, retry, rate limit
  index.ts    — Connector<T> implementation: calls client, validates, aggregates
  <platform>.test.ts
fixtures/<platform>/
  success.json
  empty.json
  malformed.json
```

Directory and fixture names are kebab-case even when the `Platform` value is
snake_case — `google-ads/` and `fixtures/google-ads/` implement platform
`"google_ads"`. Don't let the two drift into matching; they're deliberately
not the same string.

## Step by step

1. Confirm the platform is already in the `Platform` union (`types.ts`) and
   the `platform` pg enum (`src/lib/db/schema.ts`). All eight are already
   there; a ninth platform needs both extended first — additive only, never
   rename/remove an existing value.
2. Write `schema.ts`: a raw-shape schema matching the real API response
   (including its quirks — string-typed numbers, optional fields, whatever
   the platform actually does), and a separate normalized-data schema for
   what gets stored in `metric_snapshots`. Both get validated; see below.
3. Write `client.ts`: fixture branch first (reads `fixtures/<platform>/`,
   filename overridable via `<PLATFORM>_FIXTURE` env var, defaults to
   `success.json`), then the real branch (env-configured credentials, rate
   limiter, retry, throws on failure — never returns a partial/garbage
   value).
4. Write `index.ts`: call the client, `safeParse` the raw response, check
   the empty/no-data condition, aggregate into the normalized shape, format
   dates via `formatInTimeZone(range.start/end, account.clientTimezone, ...)`,
   `safeParse` the normalized data too, return the `ConnectorResult`.
5. Write fixtures: at least `success.json` (realistic, not `{foo: 1}`),
   `empty.json` (whatever "no data" looks like for this API — an empty
   array, an absent `rows` key, a `null` field — match the real API's own
   idiom), `malformed.json` (a type violation that should fail Zod, ideally
   one that exercises the platform's specific numeric trap if it has one).
6. Write `<platform>.test.ts` — six cases minimum: happy path, no_data,
   malformed, missing fixture file, 429 (not retried), 500 (retried to
   exhaustion). See Testing below for exact shape.
7. Register in `src/lib/connectors/registry.ts`: import and add one line.
   Nothing else in the orchestrator changes — `src/lib/sync/run.ts` loops
   every `client_platform_accounts` row and looks the platform up in the
   registry; an unregistered platform is silently skipped (`if (!connector)
   continue`), so forgetting this step fails quietly, not loudly. Verify by
   running the orchestrator once in fixture mode and checking the platform
   shows up in `attempted`.
8. Add every new env var to `.env.example` with a comment, never a real
   value.

## Zod at the boundary

Two schemas, always:

- **Raw schema** — matches what the API actually sends, including its
  quirks. If the API returns numbers as strings, type the field
  `z.string()`, not `z.coerce.number()` — coercion is exactly the silent
  failure mode this whole pattern exists to prevent. A field arriving as
  the wrong type should fail validation, not get quietly fixed up.
- **Normalized schema** — the shape written to `metric_snapshots.metrics`.
  Parsed a second time in `index.ts` right before returning `status: 'ok'`,
  even though the connector just built the object itself — this catches a
  connector's own aggregation bug (e.g. a NaN from a bad division) before
  it reaches the database, not just the API's bugs.

`sync/run.ts` re-validates against `connector.schema` a *third* time before
writing to `metric_snapshots` — defense in depth, not redundant. Don't skip
your own two just because the orchestrator has one too.

## The three-state result

- `ok` — real data, `raw` is the full untouched API response.
- `no_data` — the API succeeded and genuinely has nothing for this range.
  `raw` is still the (empty-shaped) response — always store *something*,
  never `undefined`.
- `error` — the fetch failed or the response didn't validate. **No `raw`
  field on this variant** — there may be nothing to store (a network
  failure has no response body). `sync/run.ts` handles this by persisting
  `{ error: result.error }` as the `raw_responses` payload instead, so sync
  history still has a row for that run.

What counts as "empty" is API-specific — model it after what the platform
actually does, don't force everything into one shape:

| Connector | Raw envelope | Empty condition |
|---|---|---|
| lead-dashboard | `{ data: [...] }` (client.ts flattens the platform's own paginated `{ data, meta }` pages into this before handing off) | `data.length === 0` |
| search-console | `{ rows?: [...] }` | `rows` absent or `[]` |
| google-ads | bare `[...]` (no wrapper) | `array.length === 0` |
| ga4 | `{ trafficSourceReport, conversionEventReport }` | primary report has no rows |
| ahrefs | `{ metrics: {...} \| null }` | `metrics === null` — a single summary object, not a list |
| openphone | `{ calls: [...] }` | `calls.length === 0` |
| ghl | `{ opportunities: [...] }` | `opportunities.length === 0` |
| meta | `{ data: [...] }` | `data.length === 0` |

**Flagged divergence:** six of eight wrap the list in a named key; google-ads
returns a bare array because that's genuinely what `customer.report()`
hands back; ahrefs is a nullable single object, not a list, because its API
is a summary endpoint, not a query over rows. None of these are wrong — but
if you're pattern-matching from a random existing connector instead of
`lead-dashboard`, check which shape you actually landed on.

## Retry and rate limiting — two implementations, pick by transport

`src/lib/connectors/shared/http.ts` has `fetchWithRetry` (wraps `fetch`
directly, exponential backoff, 3 retries / 500ms base delay by default) and
`RateLimiter` (fixed-interval, `requestsPerSecond` config).

**If the platform has no official SDK and you're using raw `fetch`**
(lead-dashboard, ahrefs, openphone, ghl, meta): use `fetchWithRetry` and
`RateLimiter` straight from `shared/http.ts`. Nothing to duplicate.

**If the platform requires an SDK** (search-console/ga4 via `googleapis` /
`@google-analytics/data`, google-ads via `google-ads-api`): the SDK throws
on failure instead of returning an inspectable `Response`, so
`fetchWithRetry` doesn't apply — it wraps `fetch` specifically. All three
SDK-based connectors duplicate the same ~20-line local `withRetry` +
`getStatusCode` helper in their own `client.ts`, matching `fetchWithRetry`'s
exact policy (retry 5xx/network, never 4xx) against the SDK's thrown errors.

**Flagged divergence, deliberately not deduplicated:** that retry loop is
copy-pasted verbatim three times (search-console, google-ads, ga4) instead
of extracted into `shared/`. This was a judgment call to keep `shared/http.ts`
untouched and each connector self-contained rather than risk a shared
"SDK retry" abstraction leaking assumptions between three unrelated SDKs. If
a fourth SDK-based connector shows up, that's the point to reconsider
extracting it — don't extract it speculatively before a third data point
existed, and don't extract it now just because this doc points it out.

**Rate limits are not one-size-fits-all** — size `RateLimiter` and
`fetchWithRetry`'s `RetryConfig` to the platform's actual documented limits,
not by copying the nearest connector:

| Connector | requestsPerSecond | retries / base delay | why |
|---|---|---|---|
| lead-dashboard, search-console, ga4, ahrefs, openphone, meta | 5 | 3 / 500ms | shared default, no documented tight limit |
| google-ads | `1/30` | 3 / 500ms | Explorer tier: 2,880 ops/day = 1 op/30s |
| ghl | 1 | 5 / 1000ms | "rate limits are tight — batch and back off generously" |

## Fixture mode

`CONNECTOR_MODE=fixture` short-circuits `client.ts` before any network/SDK
call. The fixture filename is overridable per-test via
`<PLATFORM>_FIXTURE=<name>.json` (e.g. `GHL_FIXTURE`, `META_FIXTURE`),
defaulting to `success.json`. This is how tests select which fixture to
exercise without touching the filesystem path logic.

For metered/budget-capped APIs (Ahrefs: hard-stops when the unit budget
runs out), fixture mode isn't just a convenience — treat it as mandatory
during development. Never debug against the live API in a loop.

## Testing

Reference shape is `lead-dashboard/lead-dashboard.test.ts` — but read the
divergence note below before copying it as-is.

Every test file needs:
1. **Happy path** — asserts specific field values, not just `status === 'ok'`.
   If aggregation happens (summing across rows), assert the summed value
   specifically enough that a broken aggregation (e.g. string concatenation
   instead of addition) would fail the assertion, not just happen to pass.
2. **no_data** — asserts `status === 'no_data'` and that `raw` is still defined.
3. **malformed** — a fixture with a type violation; asserts `status === 'error'`
   with a truthy `error` message.
4. **missing fixture file** — asserts `status === 'error'` (the read itself throws).
5. **429** — mock a 429 response/error; assert `status === 'error'` AND that
   the mock was called exactly once (proves it wasn't retried).
6. **500** — mock a 500 response/error; assert `status === 'error'` AND the
   call count matches `1 + maxRetries` for that connector (4 for the
   default config, 6 for ghl's more generous one). Use `vi.useFakeTimers()`
   + `await vi.runAllTimersAsync()` around the call — real backoff delays
   would otherwise make the test slow (or, for ghl, actually wait several
   real seconds).

**Flagged divergence: `lead-dashboard`'s own test file only has cases 1–4.**
It predates the 429/500 requirement — every connector built after it has 6
(google-ads has 7, one extra for `microsToCurrency`). Don't copy
lead-dashboard's test file as a template for coverage; copy it for the
*shape* of cases 1–4, then add 5–6 following any other connector's test file.

**Mocking differs by transport**, same split as retry:

- **Raw fetch connectors**: `vi.stubGlobal('fetch', fetchMock)` once at
  module scope, a small `mockResponse(status, body)` helper building a
  fake `Response`-shaped object, `fetchMock.mockReset()` in `beforeEach`.
- **SDK connectors**: `vi.mock('<sdk-package>', () => ({ ... }))` with
  `vi.hoisted()` for the mock functions referenced inside the factory (plain
  `const` above `vi.mock` hits a TDZ error — `vi.mock` calls are hoisted
  above imports). **If the SDK's constructor is called with `new` in
  `client.ts`, the mock implementation must be a real `function`, not an
  arrow function** — `vi.fn(() => ({...}))` used with `new` fails silently
  (vitest warns "did not use 'function' or 'class'", and the mocked method
  is just never called). See `google-ads.test.ts` or `ga4.test.ts` for the
  working pattern.

## Provider-swappable interfaces — two answers, both intentional

Two connectors sit behind a named interface instead of a bare function, so
a different provider could be swapped in later without touching a
connector's aggregation/validation logic:

- **ahrefs**: `SeoDataProvider` is defined *inline in `client.ts`* — no
  extra directory, 3-file layout preserved exactly.
- **openphone**: `Telephony` lives in its own file,
  `src/lib/connectors/telephony/types.ts`, separate from
  `openphone/client.ts` which implements it.

**Flagged divergence:** these two structural answers exist because the
task that requested each connector specified the location explicitly for
one (`"Put this behind a Telephony interface in
src/lib/connectors/telephony/"`) and left it unspecified for the other
(`"Put this behind an SeoData interface"`, no path given). There's no
technical reason telephony needed its own directory and SEO data didn't —
if asked to add a provider-swappable interface with no path specified,
default to inlining it in `client.ts` (ahrefs's answer) unless multiple
connectors are expected to share the same provider category, in which case
a shared directory (openphone's answer) is worth it once there's a second
implementation to justify the indirection.

## Auth patterns — four shapes in eight connectors

| Shape | Connectors | Mechanism |
|---|---|---|
| Per-client bearer token, header | lead-dashboard, ahrefs, openphone, meta* | `Authorization: Bearer <token>` |
| Shared service account, one credential for many clients | search-console, ga4 | `GOOGLE_SERVICE_ACCOUNT_JSON`, same env var, both connectors |
| Per-tenant credential (one key per client) | ghl, openphone | `GHL_AGENCY_API_KEY__<LABEL>` / `OPENPHONE_API_KEY__<LABEL>` |
| OAuth refresh token + developer token | google-ads | `GOOGLE_ADS_*` (4 required vars, 1 optional MCC var) |

\* meta is the one outlier even within "bearer token": Graph API takes the
token as an `access_token` **query parameter**, not an `Authorization`
header — matches what the real API actually does, don't "fix" it to match
the others.

The shared-credential shape (service account / agency token) is not a
contract deviation — `account.externalId` still carries the per-client
identifier (property ID, locationId, etc.), exactly like every other
connector. Only the *secret* is shared, and only when the platform's own
API is agency/account-level rather than per-client. Don't invent a
per-client credential column if the platform doesn't have per-client
credentials.

## The traps already hit

These are the bugs this whole pattern (typed raw schemas, explicit parsing,
distinct no_data/error) exists to prevent. Each was called out as CRITICAL
in the connector that hit it — treat any new numeric or temporal field with
the same suspicion until proven otherwise.

- **Micros (google-ads)**: `cost_micros / 1_000_000 = currency`. Get this
  wrong and the number is off by 1,000,000× while still looking plausible
  in aggregate (a $50k/day account looks like $50B — obviously wrong; a
  $500/day account looks like $500M — still obviously wrong, but a
  mid-sized number silently becomes a differently-wrong-but-plausible mid-
  sized number is the actual risk). Fix: name the raw field `cost_micros`
  (never rename it to `cost` before converting), do the division in exactly
  one named, exported, unit-tested function (`microsToCurrency`), never
  inline the division at the call site.
- **String-typed numerics (meta, ga4)**: Graph API returns
  `spend`/`impressions`/`clicks` as strings. GA4's Data API returns *every*
  dimension and metric value as a string, always, no exceptions. Type the
  raw schema field `z.string()`, parse with `Number(...)` explicitly at
  aggregation time. The failure mode if you don't: `"100.50" + "200.25"`
  is `"100.50200.25"`, not `300.75` — string concatenation instead of
  addition is silent (no error, no NaN, just a garbage number that still
  looks like a number). meta's test fixture deliberately uses two rows so
  a concatenation bug produces a visibly wrong sum instead of coincidentally
  passing with one row.
- **Data lag (search-console)**: reports lag 2-3 days behind real time, so
  querying "yesterday" can legitimately return nothing yet — that's a real
  `no_data`, not a bug to paper over. The normalized data still carries the
  date it actually asked for (`dataDate`), separate from
  `metric_snapshots.date` (which is always the sync's target day) — so a
  later reconciliation can tell "the row for Tuesday" apart from "data that
  actually covers Tuesday."
- **Forwarded-call flags (openphone)**: a forwarded call is frequently
  flagged `status: "missed"` by the provider even though it was answered
  elsewhere. `status` and `forwarded` are captured as separate raw fields —
  never conflated — and the normalized data carries `missedCalls`,
  `forwardedCalls`, **and their overlap** (`missedAndForwardedCalls`) as
  three distinct counts. The connector does not try to resolve the
  ambiguity itself (i.e. does not decide the "true" missed count) — it only
  makes the ambiguity visible so a downstream consumer can correct it.
- **Trusting a platform's own "agency-level" framing (ghl)**: GHL's docs
  describe their API as agency-level, and a Private Integration token
  *looks* agency-wide (it can call `/locations/search` and see the whole
  agency's directory). It isn't — confirmed live, a token created with
  every scope checked still gets 403 "does not have access to this
  location" for any location other than the one it was created inside.
  The platform's own docs and a token's apparent reach are not proof of
  its actual authorization boundary; only a real call against a second
  account proves it. Fix: one `GHL_AGENCY_API_KEY__<LABEL>` per client
  location, same per-tenant-credential shape as OpenPhone, not the single
  shared key the docs' framing suggested.

The pattern behind all five: **when an API's own representation is
ambiguous or trap-prone, don't resolve the ambiguity inside the connector.
Preserve enough distinct raw signal in the normalized data that the
downstream consumer (dashboard, analyst, future you) can resolve it
correctly** — resolving it wrong once, silently, inside a connector is far
worse than an admin seeing two numbers and a note.

## Checklist for a new connector

- [ ] Platform already in `Platform` union and `platform` pg enum (or add
      both, additive-only)
- [ ] `schema.ts`: raw schema matches the real API's actual types
      (including its numeric-as-string quirks if any), normalized schema
      separate
- [ ] `client.ts`: fixture branch, then real branch; SDK → local
      `withRetry`/`getStatusCode`, raw fetch → shared `fetchWithRetry`;
      `RateLimiter` sized to the platform's real limits, not copy-pasted
- [ ] `index.ts`: parse raw → check empty condition → aggregate → format
      dates via `account.clientTimezone` → parse normalized → return
- [ ] Fixtures: `success.json` (realistic), `empty.json` (matches the API's
      own "nothing here" idiom), `malformed.json` (a real type violation)
- [ ] Tests: 6 cases (happy/no_data/malformed/missing-fixture/429/500),
      SDK connectors need the `vi.hoisted` + real-`function`-constructor
      mock pattern
- [ ] Registered in `src/lib/connectors/registry.ts`
- [ ] Env vars documented in `.env.example`, no real secrets
- [ ] `pnpm test`, `tsc --noEmit`, `pnpm lint`, `pnpm build` all clean
- [ ] Live orchestrator run in fixture mode (`CONNECTOR_MODE=fixture pnpm run sync`)
      confirms the platform shows up in `attempted` and the stored
      `metric_snapshots` row matches the fixture's expected aggregation
