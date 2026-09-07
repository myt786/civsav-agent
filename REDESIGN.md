# Civsav workspace redesign

The light-only workspace uses locally bundled Geist fonts, shared visual tokens, and status colors reserved for meaningful health information.

- `/`: portfolio aggregates across all active clients, followed by 25-client pages. `q`, `health`, `sort`, `dir`, and `page` persist in the URL. Client links retain the overview query in `from`.
- `/clients/[id]`: issue evidence and investigation steps, seven-day metrics, thirty-day daily history, and platform breakdowns. Unknown and inactive client IDs show a recoverable not-found view.
- `/insights`: searchable issue queue; AI narrative and paginated forecasts are separate views. AI remains optional and on demand.
- `/settings/clients`: searchable database-paginated directory. Profile, Connections, and Activity retain existing administration actions and authentication.
- `/docs`: Help, preserving the existing section anchors.

Health is computed from the existing rules across all active clients before pagination. Missing data, unverified numbers, failures, and genuine zeros remain distinct. Coverage accompanies partial totals; “No issues detected” only describes checks possible with the available data. Seven-day reporting uses each client's timezone, ending yesterday. Existing thresholds and thirty-day history remain unchanged.

The latest fetch attempt and last successfully stored data are separate timestamps. Successful re-fetches update the snapshot timestamp; failures and empty responses do not refresh it. Legacy snapshot timestamps cannot reconstruct past re-fetch times that were never recorded.

## Local validation

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm exec eslint src eslint.config.mjs next.config.ts
pnpm build
```

Portfolio tests use 155 synthetic clients to exercise global counts, partial totals, sorting, health filters, pagination, and safe return links. PGlite integration tests cover directory queries, unknown IDs, zero values, failed fetches, and successful re-sync freshness. No database migration is required.

Set `CIVSAV_DIST_DIR=.next-preview` for a separate local build directory when an existing development server uses `.next`. Use the same setting for `build` and `start`. Keep any fixture preview database separate from the regular PGlite directory. This pass does not deploy the application.
