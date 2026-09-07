# Civsav design system

**Status:** implementation baseline, September 2026.

This is the design reference for future Civsav UI work. Read it before adding or changing a screen, component, chart, or interaction. Extend the existing system so a new feature feels like part of the same product. An explicit new product direction can change this baseline; update this document and the shared implementation together when that happens.

The values below come from the implemented redesign. Component source files remain the precise implementation reference. Do not copy an incidental one-off style into a new design convention. [REDESIGN.md](./REDESIGN.md) describes the implementation and local validation; this document defines the visual and interaction system.

## Contents

1. [Product purpose and design principles](#1-product-purpose-and-design-principles)
2. [Color and surfaces](#2-color-and-surfaces)
3. [Typography and numbers](#3-typography-and-numbers)
4. [Spacing, shape, and layout](#4-spacing-shape-and-layout)
5. [Application shell and navigation](#5-application-shell-and-navigation)
6. [Controls and reusable components](#6-controls-and-reusable-components)
7. [Health and data states](#7-health-and-data-states)
8. [Tables, search, and pagination](#8-tables-search-and-pagination)
9. [Charts and forecasts](#9-charts-and-forecasts)
10. [Screen specifications](#10-screen-specifications)
11. [Forms and feedback](#11-forms-and-feedback)
12. [Accessibility and motion](#12-accessibility-and-motion)
13. [Writing and labels](#13-writing-and-labels)
14. [Implementation references](#14-implementation-references)
15. [Future work and review checklist](#15-future-work-and-review-checklist)

## 1. Product purpose and design principles

Civsav is an agency workspace for comparing the digital performance of more than 100 clients and investigating issues. The initial overview must answer three questions:

- Which clients need attention?
- What is happening?
- Where should I investigate?

The visual direction is warm, light, restrained, and precise: an ivory canvas, white working surfaces, charcoal type, fine borders, and a small amount of Civsav orange. The premium quality comes from hierarchy, alignment, readable information, and consistent behavior.

### Principles

| Principle                      | Consequence for new work                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Comparison first               | Put the client list close to the portfolio summary. Keep high-level comparison fast.                     |
| Evidence before interpretation | Present observed metrics and deterministic issues before optional AI commentary.                         |
| A clear path to investigation  | Link each issue to its client and supporting section. Suggest a practical next step.                     |
| Honest data                    | Preserve the distinction between missing, unverified, failed, and zero values. Explain partial coverage. |
| Quiet visual hierarchy         | Use typography, spacing, alignment, and borders before adding color or decoration.                       |
| Consistent context             | Preserve list state when opening a client and returning. Use direct, bookmarkable URLs.                  |
| Scales beyond a demo           | Paginate lists, compute totals globally, and avoid mounting a chart for every client at once.            |

### Boundaries

- The app is **light-only**. Do not add a dark theme, theme switch, or stored-theme initialization.
- Do not introduce numerical health scores, gauges, or percentages that imply comprehensive business health.
- Do not replace client detail pages with a side drawer. Drawers are appropriate for temporary navigation and the assistant.
- Avoid decorative gradients, glass effects, large ambient shadows, oversized hero sections, ornamental illustrations, and colorful card collections.
- Do not animate metric counters or stagger rows into view.
- AI output must remain optional. Users must be able to understand and investigate an issue without generating a summary or opening chat.

## 2. Color and surfaces

Use semantic Tailwind classes backed by [globals.css](./src/app/globals.css). Prefer `bg-card`, `text-muted-foreground`, and `border-border` over copying hex values into components.

### Core palette

| Token                                        | Value     | Intended use                                              |
| -------------------------------------------- | --------- | --------------------------------------------------------- |
| `--background`                               | `#F7F7F2` | Warm ivory page canvas                                    |
| `--foreground`                               | `#292B26` | Primary text and important numbers                        |
| `--card` / `--popover`                       | `#FFFFFF` | Working surfaces, menus, dialogs                          |
| `--card-foreground` / `--popover-foreground` | `#292B26` | Text on white surfaces                                    |
| `--primary`                                  | `#AC491F` | Main actions, selected tab underline, investigation links |
| `--primary-foreground`                       | `#FFFFFF` | Text on primary buttons                                   |
| `--secondary`                                | `#F0F0EA` | Secondary controls and neutral surfaces                   |
| `--secondary-foreground`                     | `#45473F` | Secondary control text                                    |
| `--muted`                                    | `#F1F2EC` | Subtle grouping and hover backgrounds                     |
| `--muted-foreground`                         | `#6D7065` | Supporting copy, dates, labels, metadata                  |
| `--accent`                                   | `#FAEEE5` | Restrained warm emphasis                                  |
| `--accent-foreground`                        | `#99421D` | Text on warm accent backgrounds                           |
| `--border`                                   | `#E4E5DC` | Panel edges, dividers, table rules                        |
| `--input`                                    | `#DDDFD5` | Form control borders                                      |
| `--ring`                                     | `#AC491F` | Keyboard focus                                            |
| `--destructive`                              | `#B33737` | Errors and destructive intent                             |

### Sidebar palette

| Token                                  | Value     |
| -------------------------------------- | --------- |
| `--sidebar`                            | `#F1F2EB` |
| `--sidebar-foreground`                 | `#45483E` |
| `--sidebar-accent`                     | `#E7E9DF` |
| `--sidebar-accent-foreground`          | `#292B26` |
| `--sidebar-border`                     | `#E0E3D7` |
| `--sidebar-primary` / `--sidebar-ring` | `#AC491F` |
| `--sidebar-primary-foreground`         | `#FFFFFF` |

### Semantic status colors

| Meaning              | Color             | Presentation                                                 |
| -------------------- | ----------------- | ------------------------------------------------------------ |
| Critical / failed    | `#B33737`         | Small colored dot and text; errors also have a visible label |
| Needs attention      | `#96600C`         | Small amber dot and text                                     |
| Insufficient data    | `#6D7065`         | Neutral dot and text                                         |
| No issues detected   | `#397257`         | Small green dot and text                                     |
| Positive lead change | `#397257`         | Signed percentage                                            |
| Negative lead change | Destructive token | Signed percentage                                            |

Reserve red, amber, and green for states with meaning. Do not use them to decorate navigation or distinguish arbitrary clients. Forecast direction is neutral because an increase in spend is not automatically good news.

Primary text, muted text, orange links, and the health colors have at least 4.5:1 contrast against the ivory canvas at their base colors. Opacity, hover treatments, and different backgrounds can change contrast; check the actual combination before reuse. Fine borders are separators, not the sole indicator of an actionable state.

### Surface treatment

- Pages use the ivory canvas; functional content sits on white panels.
- A panel normally uses a one-pixel border and no shadow.
- Use internal dividers to group related values rather than wrapping every value in another card.
- Reserve subtle elevation for transient overlays such as tooltips and menus.
- The overview summary is one divided surface containing four metrics.
- Table headers and row hovers use very light neutral fills. Existing portfolio treatments include `#F8F9F5` for the header and `#FAFBF7` on row hover.

## 3. Typography and numbers

### Font system

Use **Geist Sans** for the interface and **Geist Mono** for compact metric values where consistent digit alignment helps. Both variable fonts are bundled under `src/app/fonts` and loaded with `next/font/local` in the root layout.

| Utility        | Font variable       |
| -------------- | ------------------- |
| `font-sans`    | `--font-geist-sans` |
| `font-heading` | `--font-geist-sans` |
| `font-mono`    | `--font-geist-mono` |

The font tokens must reference these variables rather than reference themselves. Preserve local font loading and the bundled license. Do not introduce a second display font for individual features.

### Type hierarchy

| Element                                  | Baseline                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Page title, `.page-title`                | 28px; 32px from `sm`; weight 600; tight line height; tracking `-0.035em` |
| Section title, `.section-title`          | 16px; weight 600; tracking `-0.02em`                                     |
| Page eyebrow, `.eyebrow`                 | 11px; weight 500; uppercase; tracking `0.16em`; muted                    |
| Body copy and forms                      | 14px; normal weight; relaxed line height for explanations                |
| Desktop portfolio table                  | 13px; client names weight 500                                            |
| Compact metadata                         | 12px; muted                                                              |
| Table headers and secondary annotations  | 11px; generally weight 500                                               |
| Chart ticks and very compact annotations | 10px; use sparingly                                                      |
| Health labels                            | 12px; weight 500                                                         |
| Navigation tabs                          | 14px; weight 500                                                         |

Large summary values are prominent without becoming hero typography. Keep one clear page title, subordinate section titles, and restrained supporting text. Use the eyebrow once to establish page context; do not repeat uppercase labels everywhere.

### Number formatting

- Apply tabular numerals globally; the body already sets `font-variant-numeric: tabular-nums`.
- Use shared formatters in `src/lib/dashboard/format.ts`.
- Integers use grouping separators: `20,675`.
- Current currency formatting is USD with no decimal places: `$1,921`. Do not silently change currency assumptions in a visual edit.
- Search position uses one decimal place: `12.4`.
- Lead changes show an explicit sign and one decimal place when a comparison is available.
- Right-align numeric table columns. Keep primary value and its comparison vertically aligned.
- A genuine zero renders as `0` or `$0`; it must never become an em dash.
- An unavailable comparison renders a neutral dash with an accessible “No comparison available” label.
- Format timestamps with explicit locale/timezone when server and client both render them. Mapping verification and audit timestamps currently use `en-US` and UTC.

## 4. Spacing, shape, and layout

### Spacing rhythm

Use the existing Tailwind spacing scale. Typical increments are 4, 8, 12, 16, 20, 24, 28, 32, and 40px. Choose spacing based on relationships: related label/value pairs are close; sections are farther apart.

| Pattern                           | Baseline                         |
| --------------------------------- | -------------------------------- |
| Workspace section gap             | 28px (`gap-7`)                   |
| Workspace horizontal padding      | 20px; 40px from `lg`             |
| Workspace vertical padding        | 28px; 36px from `lg`             |
| Standard panel padding            | 20px (`p-5`)                     |
| More spacious identity/form panel | 24px (`p-6`)                     |
| Filter control gap                | 10px (`gap-2.5`)                 |
| Label to input                    | 6px (`gap-1.5`)                  |
| Form field groups                 | 20px (`gap-5`)                   |
| Desktop portfolio cell padding    | 20px horizontally and vertically |
| Heading to supporting copy        | Usually 8px                      |

### Radius system

The base radius is `0.625rem`, normally 10px. Tailwind radius tokens are derived from it:

| Token         | Computed size at a 16px root |
| ------------- | ---------------------------- |
| `rounded-sm`  | 6px                          |
| `rounded-md`  | 8px                          |
| `rounded-lg`  | 10px                         |
| `rounded-xl`  | 14px                         |
| `rounded-2xl` | 18px                         |
| `rounded-3xl` | 22px                         |
| `rounded-4xl` | 26px                         |

Use `rounded-xl` for main panels and `rounded-lg` for most controls. Larger radius tokens exist but are not a reason to create oversized rounded containers. Avoid pill-shaped cards and excessive nesting.

### Responsive behavior

The shared `.workspace` is centered, full-width, and capped at 1440px **within the main content area**. The sidebar is separate from that width.

| Breakpoint              | Important behavior                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Below `sm` / 640px      | Titles are 28px. Forms and actions wrap. Identity and connection sections stack.           |
| Below `md` / 768px      | Replace the desktop sidebar with a 64px mobile header and collapsible navigation.          |
| `md` / 768px and above  | Show the 216px desktop sidebar. Keep content responsive to the remaining width.            |
| Below `lg` / 1024px     | Portfolio rows become compact client articles; summary uses two columns.                   |
| `lg` / 1024px and above | Portfolio uses a comparison table; summary uses four columns; workspace padding increases. |
| `xl` / 1280px and above | Forecasts can use two columns.                                                             |

Do not shrink a desktop table until it becomes unreadable on mobile. Preserve client identity, health, leading issue, leads/change, spend, cost per lead, and freshness in the mobile representation. Sorting remains available through labeled controls.

Use `min-w-0` on flexible content and let controls wrap. Connection account inputs take a full row on small screens (`basis-full`) with switches and actions below; they must not shrink to a few characters beside Save and Verify.

## 5. Application shell and navigation

Use `AppShell` rather than building a new navigation frame for a feature.

- Desktop sidebar: 216px wide, sticky, full viewport height, pale neutral background, fine right border.
- Brand: existing Civsav icon, compact lowercase wordmark, restrained orange punctuation. Reuse the existing assets.
- Main navigation order: **Overview → Insights → Settings → Help**.
- Client detail pages keep Overview active. Client configuration pages keep Settings active.
- Active navigation uses the sidebar accent surface, stronger text, and a small orange dot. Inactive links are muted with subtle hover feedback.
- Keep Quick navigation and the labeled **Ask the assistant** action near the sidebar bottom.
- `Ctrl/Cmd + K` opens quick navigation. Preserve both modifier conventions even if the visible hint is compact.
- Mobile: brand at the left; labeled icon actions for assistant and navigation at the right. Navigation opens in a sheet and closes after selecting a destination.
- Preserve the Skip to content link and a focusable main region.

Navigation is a real link when it changes location. Use `aria-current="page"` for the current destination. Use buttons for actions such as opening the assistant, refreshing account discovery, or triggering sync.

## 6. Controls and reusable components

### Shared visual classes

| Class            | Role                                                  |
| ---------------- | ----------------------------------------------------- |
| `.workspace`     | Page width, padding, and section rhythm               |
| `.page-title`    | Primary page title                                    |
| `.eyebrow`       | Compact page context                                  |
| `.panel`         | White, bordered working surface                       |
| `.section-title` | Panel or section title                                |
| `.field-control` | 40px native input/select style                        |
| `.quiet-link`    | Restrained orange text action with underline on hover |
| `.health-label`  | Small status dot and text                             |
| `.nav-tab`       | Route-backed tab with an orange active underline      |

### Buttons

Reuse `Button` from `components/ui/button.tsx` and its existing variants.

| Variant     | Use                                                                |
| ----------- | ------------------------------------------------------------------ |
| Default     | Main action, such as Add client, Create client, or Save changes    |
| Outline     | Secondary navigation/action, filter Apply, supporting controls     |
| Secondary   | Compact operational actions, including sync and mapping saves      |
| Ghost       | Tertiary actions and unobtrusive utility controls                  |
| Destructive | Explicit destructive intent; do not use as a generic warning style |
| Link        | Text action when a filled button would add unnecessary weight      |

The primitive is compact: default height 32px, small 28px, large 36px, with corresponding icon sizes. Page-level actions and Apply controls commonly use `h-10` to align with 40px fields. Preserve this distinction; do not globally resize every button to match one form.

Keep button labels short and concrete. Show pending labels such as “Saving…”, “Creating…”, “Verifying…”, and “Syncing…”. Disable duplicate submission while the action is pending. Keep disabled controls recognizable.

### Inputs and filters

- Use visible labels in forms and accessible names for compact filter controls.
- Search uses a small leading search icon and an explicit Apply action.
- Group related search, filter, sort, and direction controls on one wrapping row.
- Reset/Clear filters is a low-emphasis link that restores a useful view.
- Keep input surfaces white, text charcoal, and borders neutral.
- Reuse the existing account combobox for discovered accounts, manual IDs, and credential selection.

### Tabs, disclosures, and overlays

- Route-level views use links with URL state and `.nav-tab` styling: Insights views and client configuration.
- A local chart metric switch uses the existing accessible Tabs primitive.
- Secondary diagnostics and raw chart values use native `details`/`summary` disclosures.
- Sheets are reserved for temporary utilities such as navigation and assistant chat.
- Tooltips add explanations; they must not be the only place an essential status or primary action is visible.

### Icons

Use Lucide consistently. Common sizes are 16px for navigation and actions, 14px for supporting links, and 12px for compact indicators. Navigation icons use a restrained stroke, approximately 1.7px. Decorative icons are `aria-hidden`; icon-only buttons need an accessible label.

## 7. Health and data states

Health is a summary of **existing detected issues in available data**, not an overall business score. Use the shared calculations in `lib/dashboard/portfolio.ts` and `lib/insights/rules.ts` on every screen.

### Classification order

| Health             | Rule                                                             |
| ------------------ | ---------------------------------------------------------------- |
| Critical           | At least one existing critical flag                              |
| Needs attention    | At least one remaining warning flag                              |
| Insufficient data  | No usable tracked metrics, or no recorded successful stored data |
| No issues detected | No existing flag applies to the data that can be checked         |

Default portfolio order follows that same priority, then a stable client ordering. Coverage is separate from health. A client with partial data can have no detected issues; the interface must still make its missing coverage apparent.

### Metric rendering contract

| State        | Display                                                 | Required meaning                                                                |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ok`         | Normal formatted number                                 | A usable verified value, including genuine zero                                 |
| `unverified` | Formatted value with a small focusable circle indicator | A real value that is not fully verified; do not hide it or replace it with zero |
| `no_data`    | Em dash with accessible “No data” text                  | No usable value for the period                                                  |
| `error`      | Visible Error label and icon, with focusable detail     | A failed metric state; do not silently substitute another value                 |

Use `DataCell` and `DeltaCellView`; do not reinvent these states inside a new card. Current unverified values use a restrained amber treatment. A percentage requires a usable baseline; an absent or zero baseline must not produce an invented change.

### Coverage and freshness

- Portfolio lead and spend totals include available values only. Show contributing client counts alongside them and disclose unverified contributions.
- Client coverage currently counts six metric groups: leads, calls, spend, sessions, conversions, and search position. It is not a percentage score of business health.
- Keep **latest fetch attempt** separate from **last successfully stored data**.
- Failed or empty fetches do not refresh the last-success timestamp. A successful re-fetch of an existing day does refresh it.
- A client's last success can come from any platform; it does not certify that every connection is current.
- Legacy data cannot reconstruct successful re-fetch timestamps that were never recorded. Do not imply that the redesign repaired missing historical metadata.

### Reporting semantics

Preserve seven full reporting days ending yesterday in each client's timezone, the preceding seven-day lead comparison, and thirty days of daily history. Current rule constants include a 5% lead noise band, a 36-hour stale-data threshold, and a missed-call warning above 30% with at least five calls. Statistical anomaly checks use the existing earlier-history baseline and skip inadequate baselines. These are product/data rules, not design knobs; a styling task must not change them.

## 8. Tables, search, and pagination

The portfolio table is the primary working surface, not a secondary detail below a chart wall.

### Portfolio columns

1. Client identity and real detail link.
2. Health plus leading issue or coverage context.
3. Leads with comparison beneath the value.
4. Spend.
5. Cost per lead.
6. Last successful data refresh.
7. A compact, accessibly labeled detail arrow where space permits.

Client and issue content align left; numeric columns align right. Use a light header, fine horizontal rules, a subtle row hover, and comfortable rows. Avoid zebra striping, decorative badges in every cell, embedded row charts, and entrance animations.

### State and scale

- Portfolio and Settings directory pages show **25 clients per page**. The issue queue shows **25 issues per page**. Forecasts show **12 clients per page**.
- Filter and sort before pagination. Global health counts and portfolio totals come from all active clients, never from the visible page.
- Overview URL state uses `q`, `health`, `sort`, `dir`, and `page`.
- Client links preserve the overview query in `from`; only valid overview return locations are accepted.
- Insights uses URL state for its view, search, severity, issue type, forecast metric, and pagination.
- Settings directory uses `q`, `status`, and `page`.
- Changing a search or filter returns to the first relevant page. Keep pagination ranges and disabled boundaries accurate.
- Use stable sorting and put missing numeric values last. Do not sort formatted currency strings lexically.
- Preserve genuine link behavior: keyboard activation, opening in another tab, direct URLs, and browser Back.
- Limit browser payloads and mounted charts to visible rows and the necessary series. Keep global aggregation on the server.

## 9. Charts and forecasts

Charts support diagnosis after the list or issues establish what matters. Use Recharts and the shared chart components.

### Chart palette

| Token       | Value     | Character                                               |
| ----------- | --------- | ------------------------------------------------------- |
| `--chart-1` | `#B35B35` | Muted terracotta; portfolio leads and current forecasts |
| `--chart-2` | `#647E92` | Muted blue                                              |
| `--chart-3` | `#827260` | Warm gray-brown; portfolio spend                        |
| `--chart-4` | `#658C88` | Muted teal                                              |
| `--chart-5` | `#777F99` | Muted slate                                             |
| `--chart-6` | `#938065` | Muted earth tone                                        |

### Rendering baseline

- Daily trend chart height: 210px. Forecast chart height: 160px.
- Daily trend stroke: 2px. Forecast stroke: 1.5px.
- Use a uniform, very faint area fill (`fillOpacity={0.055}`), not a gradient.
- Use subtle horizontal grid lines where helpful; avoid heavy frames and unnecessary vertical grids.
- Tick labels are compact, muted, and spaced to remain readable. Daily labels use month/day notation.
- Keep tooltip values formatted with the same unit conventions as the rest of the app.
- Preserve gaps with `connectNulls={false}`. Invalid/missing values are not zero.
- Disable chart entrance animation with `isAnimationActive={false}`.
- Supply a meaningful accessible group label and readable values disclosure. Use Recharts' accessibility support where applicable.
- An entirely missing series shows a calm “No synced data for this period” state instead of an empty axis frame.

### Forecasts

Actual values use a solid line; projected values use a dashed line. Label projections explicitly, including the next-seven-day period. Use neutral direction icons and text: “trending up”, “trending down”, “holding flat”, or “not enough history yet”. Never imply that a direction is good or bad without metric-specific evidence.

Keep forecasts in their secondary Insights view, paginate them, and retain a link to each client's relevant metric section. Do not turn them back into an unbounded chart grid.

## 10. Screen specifications

### Overview — `/`

Order the page as follows:

1. Compact header: page context, Client overview title, concise description, reporting window, Add client action.
2. One divided portfolio summary surface: active clients, clients needing attention, seven-day leads, seven-day spend. Coverage appears with partial totals.
3. Main client surface: heading/count, health filters with counts, name search, sort/direction controls, table or mobile list, pagination.
4. Portfolio trends below the client list, with Leads and Spend tabs.
5. Compact expandable sync diagnostics and a supporting Help link.

Do not place a large chart, welcome banner, AI narrative, or marketing hero above the client list. The first screen should establish portfolio size, attention, activity, and the route into individual clients.

### Client detail — `/clients/[id]`

Order: return navigation → client identity and health → reporting/freshness context → issues and next steps → seven-day metrics → thirty-day trends → source breakdown.

- Preserve the prior overview query in the return link.
- Include a clear Client settings link.
- Issues show severity, evidence, comparison period, and a practical investigation step.
- Connection issues link to the client's Connections controls. Performance issues link to the supporting metric section.
- Preserve leads, spend, cost per lead, calls, missed calls, sessions, conversions, and search position.
- Preserve section IDs used by issue links, including `issues`, `issue-{kind}`, and metric anchors such as `leads`, `spend`, `callsTotal`, `sessions`, and `avgPosition`.
- Direct visits work without opening the overview first. Unknown or inactive IDs produce a useful not-found page with a way back.

### Insights — `/insights`

The first view is the **Issue queue**. Route-backed secondary views are **AI summary** and **Forecasts**.

Each issue row identifies the client, severity, issue, and evidence, with an Investigate link to the corresponding client section. Search by client and filter by severity/type. Keep overall issue and affected-client counts separate from pagination.

AI summary is generated on request. Do not make a model call just to render the default issue queue. Preserve the assistant's existing capabilities and access from the shell.

### Settings — `/settings/clients`

The client directory leads the page. Provide search, active/inactive filtering, pagination, and Add client. Sync operations are a separate section below the directory.

On mobile, prioritize client identity and status, with timezone under the name. The full desktop directory can expose timezone and row actions as separate columns. Client configuration remains the route to full editing controls.

Only Settings requires authentication. A design change must not expand or remove authentication boundaries.

### Client configuration — `/settings/clients/[id]`

Use a client directory breadcrumb, client title, performance link, and three route-backed tabs:

| Tab         | Content                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Profile     | Name, timezone, active state, Save changes                                                            |
| Connections | Account discovery, manual IDs, credential selection, mapping save, verification, active mapping state |
| Activity    | Existing audit history with actor, change, and timestamp                                              |

Keep discovery and verification available without making the entire screen a dense settings wall. A verification result can be data, no data, or an error; show the result honestly. Saving a mapping is not the same as verifying its data.

### New client — `/settings/clients/new`

Use two clear sections: **Client identity** and **Connections**. Name and timezone come first. Explain matching account suggestions and preserve the ability to choose accounts or enter IDs manually. Connections can be added later. Show explicit validation, pending state, and successful navigation to the created client.

### Login — `/settings/login`

Use a focused, centered light page with the existing brand, a white bordered form panel, a direct sign-in heading, visible Email and Password labels, and one primary Sign in action. The working column is approximately 420px maximum width. Keep a low-emphasis link back to the overview.

Preserve the requested Settings destination, including its query string, after authentication. Keep email/password autocomplete and audit attribution behavior intact.

### Help — `/docs`

Use readable sections with anchored contents navigation. Contents can be sticky on wide screens and a wrapping group of links on mobile. Explain data states, reporting periods, metric definitions, health, verification, sync, troubleshooting, and platforms.

Preserve these anchors: `numbers`, `compare`, `metrics`, `verify`, `sync`, `freshness`, `insights`, and `platforms`. The redesign also includes `health` and `troubleshooting`. New organization must not break existing deep links.

## 11. Forms and feedback

- Validate required identity fields and platform-specific IDs without erasing user input.
- Keep saved values visible after submission. A successful save must not make a control appear to revert.
- Include UTC and the current valid timezone in the selector, even when `Intl.supportedValuesOf("timeZone")` omits them.
- Preserve account discovery, verification, manual entry, credential labels, mapping activity, and audit attribution.
- Show error text near the affected control or form and use an alert role where appropriate.
- Use the shared toast system for concise save, verification, and sync feedback. Critical error information should also be available in context.
- Reflect pending state and prevent duplicate submissions without replacing the whole workspace.
- Keep the latest verification result and timestamp readable on small screens.

**Implementation guardrail:** Profile and mapping forms dispatch their existing server actions inside a React transition from `onSubmit`. This prevents React's automatic form-action reset from passing old values back through Radix's hidden form controls. Do not casually restore an automatic reset or remove the transition; verify selected values and switches immediately after saving when changing these forms.

### Empty, loading, and error states

| Situation                  | Treatment                                                          |
| -------------------------- | ------------------------------------------------------------------ |
| No matching clients/issues | Plain-language explanation and Clear filters or useful next action |
| Empty portfolio            | Explain how to add clients; do not populate invented metrics       |
| No chart data              | Explicit missing-data message, preserving chart context            |
| Loading                    | Neutral skeletons that approximate the working layout              |
| Recoverable failure        | Clear error state and retry or navigation action                   |
| Unknown client             | Client not available message and overview/directory return link    |

Do not substitute a success-looking empty dashboard when the query failed. Do not display fabricated zeros while loading.

## 12. Accessibility and motion

- Aim for WCAG AA contrast: at least 4.5:1 for normal text and 3:1 for qualifying large text. Check icons, focus, and control affordances as well as text.
- Never communicate health, errors, or change direction by color alone. Include text and, where useful, a symbol.
- Preserve visible keyboard focus. The global baseline is a 2px orange outline with a 4px offset; shared primitives may supply their own visible ring.
- Use semantic headings, navigation regions, table captions, column headers, labels, and button/link roles.
- Ensure keyboard users can search, filter, change tabs, paginate, open a client, return, expand chart values, and close overlays.
- Icon-only controls must have accessible names. Supporting tooltip triggers must be focusable.
- Preserve touch usability: allow controls to wrap, give nearby actions adequate spacing, and enlarge compact targets when necessary for the context.
- Do not require hover to discover the client's identity, status, or main action.
- Avoid horizontal page overflow; an intentionally scrollable table should stay contained within its surface.

Motion is limited to subtle interaction feedback and existing overlay behavior. There are no animated counters, staggered tables, or decorative chart draws. The global `prefers-reduced-motion: reduce` rule reduces animations/transitions to effectively immediate, single-iteration changes and disables smooth scrolling. New motion must respect it.

## 13. Writing and labels

Use concise, direct language that helps an agency operator decide what to do.

| Prefer                                | Avoid                                                      |
| ------------------------------------- | ---------------------------------------------------------- |
| “Client overview”                     | A promotional hero headline replacing the screen's purpose |
| “Connection needs review”             | “Something magical is happening” or vague system language  |
| “Leads down 24% vs. the prior 7 days” | An unexplained red score                                   |
| “Review connections”                  | “Optimize now” when the action only opens settings         |
| “No data”                             | `$0` when nothing was fetched                              |
| “No issues detected”                  | “Perfect health” or “Everything is healthy”                |
| “Includes unverified data”            | Treating all available numbers as verified                 |
| “Projected, next 7d”                  | Presenting forecasts as guaranteed outcomes                |

Use sentence case for ordinary headings, controls, and labels. Eyebrows are the limited uppercase exception. Use client-facing terms such as client, connection, leads, spend, and last success. Keep internal model names, query mechanics, and database details out of normal product flows.

## 14. Implementation references

Read and reuse the nearest existing pattern before adding a new component.

| Concern                                                     | Source                                                                                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tokens, shared classes, focus, reduced motion               | [globals.css](./src/app/globals.css)                                                                                                                                                 |
| Fonts, metadata, root theme                                 | [Root layout](./src/app/layout.tsx)                                                                                                                                                  |
| Sidebar, mobile navigation, assistant action                | [AppShell](./src/components/app-shell.tsx)                                                                                                                                           |
| Page header, health label, filters, pagination, empty state | [Workspace UI](./src/components/workspace-ui.tsx)                                                                                                                                    |
| Loading pattern                                             | [WorkspaceLoading](./src/components/workspace-loading.tsx)                                                                                                                           |
| Overview                                                    | [Overview page](./src/app/%28shell%29/page.tsx)                                                                                                                                      |
| Desktop and mobile client comparison                        | [PortfolioTable](./src/components/dashboard/portfolio-table.tsx)                                                                                                                     |
| Metric and comparison states                                | [DataCell](./src/components/dashboard/data-cell.tsx)                                                                                                                                 |
| Portfolio chart tabs                                        | [PortfolioTrend](./src/components/dashboard/portfolio-trend.tsx)                                                                                                                     |
| Daily history and accessible values                         | [FleetTrendChart](./src/components/dashboard/fleet-trend-chart.tsx)                                                                                                                  |
| Issue evidence and investigation steps                      | [ClientIssues](./src/components/dashboard/client-issues.tsx)                                                                                                                         |
| Forecast rendering                                          | [ForecastChart](./src/components/insights/forecast-chart.tsx)                                                                                                                        |
| Settings forms                                              | [ClientForm](./src/components/settings/client-form.tsx), [ClientSetupForm](./src/components/settings/client-setup-form.tsx), [MappingRow](./src/components/settings/mapping-row.tsx) |
| Directory layout                                            | [ClientsList](./src/components/settings/clients-list.tsx)                                                                                                                            |
| UI primitives                                               | `src/components/ui/`                                                                                                                                                                 |
| Shared portfolio health, coverage, sorting, URL state       | [Portfolio calculations](./src/lib/dashboard/portfolio.ts)                                                                                                                           |
| Server page query interfaces                                | [Dashboard views](./src/lib/dashboard/views.ts)                                                                                                                                      |
| Metrics, timestamps, and history queries                    | [Dashboard queries](./src/lib/dashboard/queries.ts)                                                                                                                                  |
| Formatting                                                  | [Formatters](./src/lib/dashboard/format.ts)                                                                                                                                          |
| Existing issue and forecast rules                           | [Insights rules](./src/lib/insights/rules.ts)                                                                                                                                        |

Retain Next.js, Tailwind 4, the existing UI primitives, TanStack Table, Recharts, and connector infrastructure. Read the applicable installed Next.js guidance before writing framework code, as required by `AGENTS.md`; use official version-matched guidance if the installed documentation is unavailable.

## 15. Future work and review checklist

### How to extend the system

1. Identify the user's task and its place in the existing navigation.
2. Read this guide and the nearest working screen/component.
3. Reuse semantic tokens, shared primitives, formatting, and data-state calculations.
4. Choose the information order before decorating the surface.
5. Design empty, partial, failed, and loading states alongside the populated view.
6. Keep list state in the URL when the view should survive navigation or sharing.
7. Check responsive and keyboard behavior with realistic client counts and long names.
8. If a new pattern should become standard, implement it centrally and document it here. Avoid parallel design systems inside feature folders.

### Review before considering UI work complete

- [ ] The page remains light-only and uses the established colors and Geist fonts.
- [ ] A user can identify the main task and next action without reading every panel.
- [ ] Existing navigation, direct links, section anchors, and browser-back behavior still work.
- [ ] Main headings, spacing, panel borders, radii, controls, and icons match adjacent screens.
- [ ] Health colors have a meaning, and status is also expressed in text.
- [ ] Missing, unverified, failed, and zero values remain distinct.
- [ ] Partial totals disclose coverage; global counts do not come from the current page.
- [ ] Search, sorting, filtering, pagination, and empty results work with 150+ clients when relevant.
- [ ] Charts preserve gaps, label units/periods, and expose readable values.
- [ ] Desktop, tablet, and mobile layouts remain usable; start with approximately 1440px, 820px, and 390px test widths and include breakpoint edges when changing responsive behavior.
- [ ] Focus, keyboard operation, contrast, and reduced motion have been considered.
- [ ] Forms retain entered/saved values, prevent duplicate submission, and show useful feedback.
- [ ] Settings authentication, mapping, verification, sync, and audit workflows are preserved where affected.
- [ ] No decorative gradients, counter animations, chart walls, or invented health scores have appeared.
- [ ] Relevant tests, type checking, lint, and production build pass for implementation changes.

Documentation-only changes do not require rebuilding the app. For code changes, use the validation commands in [REDESIGN.md](./REDESIGN.md) and verify the affected workflows. A design change does not by itself authorize deployment, a database migration, or changes to reporting thresholds.
