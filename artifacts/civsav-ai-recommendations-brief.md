# Civsav AI recommendations

Product concept · September 9, 2026 · Proposed functionality, not implemented

Civsav should turn each client's performance data into a short, prioritized action plan: what changed, what the evidence suggests, what to investigate or improve, who should act, and how to evaluate the result. It should support both recovery and continued growth.

The strongest version is an investigation assistant with traceable recommendations. A traffic decline alone should not generate generic advice to publish content, change ads, or improve speed.

## The experience

Keep the portfolio and deterministic issue queue as the starting point. Add Recommendations to the client experience, alongside the relevant issues. An agency operator opens a client, reviews observed changes, and requests an AI investigation. A successful investigation returns a few distinct actions, ranked by business importance, urgency, supporting evidence, and effort.

Each recommendation contains:

- **Observation:** the metric, current and baseline values, periods, segment, and source.
- **Interpretation:** a possible cause or opportunity, with evidence strength and competing explanations. Label a cause as confirmed only when a specific check supports it.
- **Evidence:** source/account, filters, data coverage, retrieval time, and inspectable stored records or report links. Clearly distinguish fetched evidence from proposed checks.
- **Action:** the affected page, query, campaign, or workflow when known; ordered steps; suggested owner; effort; dependencies; and any approval needed for execution.
- **Measurement:** the target outcome, baseline, observation window, implementation date, and guardrails. Expected impact is a hypothesis unless a defensible estimation method supports a range.

Workflow: proposed → accepted → in progress → monitoring → improved / no clear change / worse / inconclusive. Also allow dismissal with a reason, reopening, and superseding an outdated recommendation. Accepting a suggestion does not mark it implemented or execute it.

The interactive concept uses a fictional dental client and three scenarios: declining leads despite flat sessions, growing organic traffic with an SEO opportunity, and incomplete data that limits diagnosis. Every number is illustrative.

## What each source contributes

| Source | Role in diagnosis | Detail to add or verify |
| --- | --- | --- |
| Google Analytics | Traffic sources, sessions, and event behavior | Landing pages, device and channel segmentation, meaningful conversion definitions, and instrumented funnel steps |
| Search Console | Search exposure, clicks, queries, and position | Page/query/device comparisons, complete reporting periods, and separate totals versus limited query results |
| Google Ads | Spend, delivery, and platform-reported outcomes | Campaign and search-term detail, conversion definitions, attribution settings, and matched business outcomes |
| Meta / Facebook Ads | Spend, delivery, and platform-reported outcomes | Campaign, ad set, and creative detail; attribution context; lead-quality linkage |
| GoHighLevel | Opportunities and pipeline distribution | Stage names, qualification definitions, outcome timestamps, stage history, and lead identity mapping |
| Leads data | Form records, completion/abandonment, and spam context | Agreed lead definition, duplicate handling, source attribution, and joins to qualified outcomes |

Paid performance and CRM outcomes inform business growth; they do not establish an organic ranking improvement. Analytics and ad metrics also cannot establish a broken form, slow page, or indexing fault without a relevant check. Add page inspection, form testing, Search Console URL inspection, or performance diagnostics only when the investigation needs them.

## Fit with the current codebase

Repository inspection shows useful foundations: shared attention rules, daily history, source breakdowns, on-demand AI summaries, and three read-only chat tools. Those chat tools retrieve dashboard data and sync status; they do not currently investigate granular provider reports.

The main implementation gaps are concrete:

- `src/lib/connectors/search-console/client.ts` requests only 25 query rows per day. Do not present their summed metrics as comprehensive site totals. Add separate aggregate reporting and scoped detail retrieval, with coverage metadata. Even a broader API query does not guarantee every row: [Search Analytics API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query).
- The GA4 schema currently exposes source-level sessions/conversions and event totals, and explicitly notes that phone taps can contribute to conversion counts. It does not provide the page/device diagnosis illustrated in future retrieval steps.
- The ad schemas expose aggregated metrics without campaign identifiers in the normalized output. Campaign-specific actions require additional retrieval and storage.
- GoHighLevel stores opaque stage IDs and counts. Qualification, response speed, and progression claims need more data and agreed stage meanings.
- Lead Dashboard distinguishes completed/abandoned records and spam context. These are not interchangeable with unique qualified leads or won customers.

Keep model-generated prose separate from deterministic calculations. Extend existing connector, query, and shared UI patterns when implementing. This concept creates no live integrations or application changes.

## Proposed investigation flow

1. **Validate the evidence.** Verify client-to-account mappings, source freshness, covered dates, completeness, metric definitions, currency, and timezone. Preserve zero, missing, failed, and unverified states. The existing dashboard period remains seven complete client reporting days ending yesterday; if a source lags, show a separately labeled common complete comparison window.
2. **Detect meaningful changes.** Reuse existing issue rules for the initial release. Add tested opportunity rules for improving segments. Use sufficient volume/history, matched weekdays, and seasonality or change annotations where available. A stable or low-volume series should not trigger advice simply because it moved.
3. **Retrieve targeted details.** A client-scoped investigation service calls read-only tools for the relevant source, segment, and period. Start from stored snapshots; fetch fresh provider details where needed. Enforce account scope server-side, validate tool inputs, and cap calls, time, and cost.
4. **Build the evidence package.** Application code calculates deltas, ratios, and contributions. Every result carries an evidence ID, source, metric definition, filters, coverage, timestamps, and any missing-data limitation. Do not sum ad-attributed conversions, GA4 events, and CRM leads into one outcome count.
5. **Generate and validate recommendations.** The model returns structured observations, hypotheses, supporting evidence IDs, actions, missing checks, and measurement plans. Reject unsupported metric claims and invalid evidence references. If the diagnosis is uncertain, recommend a diagnostic action. Retrieved pages and CRM text are data, never instructions for the agent.
6. **Review and learn.** Save accepted actions, owner, implementation date, and outcome. Refresh or supersede recommendations when source evidence changes. Deduplicate recurring suggestions. Measure outcomes after relevant data and conversion delays; use controlled experiments where feasible.

For search declines, segment the affected pages and queries and consider seasonality, demand, technical issues, and ranking changes before prescribing a remedy. This approach is consistent with [Google's traffic-drop investigation guidance](https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops). Preserve attribution context when comparing channels: [Google Analytics attribution guidance](https://support.google.com/analytics/answer/10596866?hl=en).

## Smallest useful release

Start with on-demand client investigations and three playbooks: lead decline, organic search opportunity, and paid efficiency investigation. Include a data-quality gate, evidence inspection, accept/dismiss controls, an owner, and an outcome check. Paid and SEO playbooks should return a clearly labeled request for additional evidence until the required granular tools exist.

Store investigation runs, evidence snapshots, recommendations, and action/outcome history. Record client/account scope, reporting windows, input snapshot version, rule/model/prompt version, evidence references, status, and timestamps. Authorize access consistently with the intended agency audience; keep credentials server-side and minimize personal lead data sent to the model.

Once the pilot is useful, add investigations triggered by completed syncs, client-specific goals, a portfolio recommendation queue, and notifications for meaningful changes. Batch work and reuse unchanged evidence across 100+ clients. Automatic website edits or spend changes belong to a later, separately authorized execution workflow.

## How to judge the pilot

Track time from a detected issue to an accepted action, unsupported or incorrect recommendation rate, repeated/dismissed suggestion rate, investigation cost and latency, and actions with observable outcomes. Human-review a representative sample of declines, growth, sparse history, missing sources, and conflicting signals. Test cross-client isolation and source errors before enabling provider detail tools.

Measure business results using qualified leads, bookings, or won outcomes where definitions and joins are reliable. CTR, traffic, ranking, and platform conversion improvements remain supporting indicators. A before/after improvement alone does not prove the recommendation caused it.

**Assessment:** This is a strong extension of Civsav because it shortens the distance from reporting to action. The first investment should be trustworthy granular evidence and useful investigation steps; that foundation determines whether the AI earns an agency team's trust.
