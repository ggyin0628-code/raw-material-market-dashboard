# Codex Handoff — Weekly Market Intelligence Production Activation

## Delivery identity

| Item | Value |
| --- | --- |
| Repository | [`ggyin0628-code/raw-material-market-dashboard`](https://github.com/ggyin0628-code/raw-material-market-dashboard) |
| Starting checkpoint | `weekly-market-intelligence-v1` |
| Starting checkpoint target | `b78ba1e6302a30b8231711c15d5945d3223687c5` |
| Authoritative feature branch | `feat/weekly-market-intelligence-production-v1` |
| Production checkpoint tag | `weekly-market-intelligence-production-ready-v1` |
| Product boundary | External public-market intelligence and purchasing-reference platform |
| Deployment | Not performed in this task |

The production feature branch is based directly on the `weekly-market-intelligence-v1` checkpoint target, not on `main`. `main` must remain unmodified and must never receive a merge from this task. The final immutable revision is the commit resolved by `git rev-parse weekly-market-intelligence-production-ready-v1^{}` after the annotated tag has been pushed. Required tag message: `Weekly Market Intelligence production-ready — SMTP and owner activation remaining`.

## Product boundary

> This system summarizes public market information for purchasing context. It is not a supplier quotation service, a company target-price system, a Taiwan spot-price database, an ERP purchasing module, or a buy／sell decision engine.

The implementation must not claim supplier purchase prices, company target purchase prices, guaranteed negotiation prices, unsupported Taiwan spot prices, or BUY／SELL／MUST PURCHASE instructions. Public status, source, unit, FX and provenance must remain visible. Company purchasing data, SAP, supplier quotations, private thresholds, inventory, delivery terms, MOQ and credentials are explicitly out of scope.

## Architecture

The existing Node.js CommonJS service remains the application boundary. `lib/weekly/snapshotStore.js` owns the atomic JSON ledger, `dailySnapshotService.js` converts the hardened live snapshot to canonical daily records, `backfillService.js` imports provider-supported public history idempotently, `weeklyAnalytics.js` calculates completed-week comparisons and reason-coded signals, `reportService.js` owns the canonical report plus Traditional Chinese HTML and XLSX renderers, `mailService.js` owns fail-closed SMTP delivery and the weekly delivery ledger, and `cli.js` exposes scheduler-compatible commands.

Local development defaults remain under ignored `data/`, but production never treats an ephemeral filesystem as durable. In production mode, `PRODUCTION_STORAGE_ROOT` must be an absolute owner-approved persistent mount or the command fails closed with `STORAGE_CONFIGURATION_REQUIRED`. Snapshot, report, job-state, metadata and delivery ledger files resolve from the shared storage configuration and use temporary-file plus atomic rename writes. Identities are `materialId + date`; a higher-quality `LIVE` or `FALLBACK` record cannot be silently downgraded by a later same-day `STALE`, `NO_DATA` or `API_ERROR` attempt. Missing market days remain missing. Public-only backup export is available via `production:backup`.

## Canonical statuses and public sources

Weekly status names are `LIVE`, `FALLBACK`, `STALE`, `NO_DATA` and `API_ERROR`. Existing market-service `OK` is canonicalized to weekly `LIVE`; the weekly layer never presents `STALE` or `API_ERROR` as fresh. Yahoo Finance remains the primary public source, registry-configured Stooq is the quote fallback, the fixed Jina public proxy is the historical fallback, and open.er-api is the USD/TWD fallback. A source failure is retained in the record and report rather than replaced by a fabricated price.

Each snapshot record contains material id, symbol, category, exchange, date, market price, source unit, currency, USD/TWD rate when available, TWD reference value when valid, source, weekly status, last trade timestamp, collected timestamp, source reliability, error metadata and provenance. The separate `__fx_usd_twd__` record preserves the FX history used by analytics.

## Analytics contract

The report week is an ISO week in `Asia/Taipei`, and the default report is the completed prior Monday–Sunday week. Latest and comparison values use only finite `LIVE` or `FALLBACK` records. Weekly, four-week, approximately three-month, YTD and approximately 52-week changes use the latest valid observation at or before each target date; if the comparable record is absent or outside the documented gap tolerance, the result is `null` and the report exposes a data-insufficient state. Weekly high and low use only observations inside the reporting week. Rolling volatility is sample standard deviation of daily percentage returns over up to the latest 20 valid returns.

Signal precedence is deterministic. Missing current or required comparison data produces `DATA_INSUFFICIENT`; stale or error latest status produces `DATA_QUALITY_WARNING`; rolling volatility at or above 3 percentage points produces `HIGH_VOLATILITY`; weekly change at or above 2% or four-week change at or above 4% produces `COST_PRESSURE_RISING`; weekly change at or below -2% or four-week change at or below -4% produces `MARKET_WEAKENING`; all other sufficient observations produce `STABLE`. The report stores reason codes and a Traditional Chinese explanation for each signal. These signals describe external-market observations only.

## Commands and routes

| Command or route | Purpose | Sends email? |
| --- | --- | --- |
| `npm run daily:snapshot` | Refresh the public snapshot and atomically upsert one daily record per configured material plus FX | No |
| `npm run weekly:backfill -- --period 3y` | Import provider-supported public history idempotently | No |
| `npm run weekly:report -- --week YYYY-Www --out-dir data/weekly-reports` | Build canonical JSON, HTML and XLSX artifacts | No |
| `npm run weekly:preview -- --week YYYY-Www --out preview.html` | Generate a safe HTML preview | No |
| `npm run weekly:send -- --week YYYY-Www --dry-run` | Build artifacts and validate mail configuration without external delivery | No |
| `GET /api/weekly/report?week=YYYY-Www` | Return canonical weekly report JSON | No |
| `GET /weekly/preview?week=YYYY-Www` | Render Traditional Chinese report HTML | No |
| `GET /weekly/export.xlsx?week=YYYY-Www` | Download the four-sheet weekly XLSX | No |

Preview and report routes are safe read operations. They never send email. The dashboard adds only a compact weekly summary, preview link, Excel link and data-quality visibility; the existing hardened market table and decision panel remain intact.

## Production commands and gates

| Command | Purpose | Expected blocking state |
| --- | --- | --- |
| `npm run production:storage-check` | Validate absolute owner-approved durable storage | `STORAGE_CONFIGURATION_REQUIRED` |
| `npm run production:status` | Print sanitized storage／job／week summary | non-zero when storage is unconfigured |
| `npm run production:bootstrap -- --period 3y` | Idempotent public-history bootstrap and first report | blocked by storage or report quality |
| `npm run production:daily` | Capture and persist a public daily snapshot | blocked by storage; row-level provider errors remain visible |
| `npm run production:weekly -- --dry-run --send` | Build artifacts, evaluate quality and write no-socket dry-run ledger | `SEND_BLOCKED` for unusable report |
| `npm run production:backup -- --backup-id <id>` | Export public snapshot／ledger／metadata with manifest | non-zero on storage or copy failure |

Quality gate results are `SEND_OK`, `SEND_WITH_WARNINGS` or `SEND_BLOCKED`; no blocked report opens SMTP. `/health/weekly` returns safe operational data only, with HTTP 503 and `STORAGE_CONFIGURATION_REQUIRED` before durable configuration and HTTP 200 for a configured synthetic root.

## Mail safety

SMTP configuration comes only from environment variables. `MAIL_ENABLED` must be truthy for live delivery; host, port, credentials, sender, recipients, optional `MAIL_CC`／`MAIL_REPLY_TO` and test-mode values are validated. `MAIL_TEST_MODE=1` ignores production recipients and uses only `MAIL_TEST_TO`; test mode also omits production CC／Reply-To headers. `DRY_RUN=1` or `--dry-run` produces the report, attachment and configuration result but does not open a socket or send mail. Live delivery is fail-closed for missing or malformed configuration, has bounded transient-only retry, does not auto-retry uncertain acceptance after SMTP DATA, writes redacted delivery metadata, records `TEST_SENT`／`SENT`／`FAILED` and prevents duplicate weeks. Owner-approved resend requires both `ALLOW_WEEKLY_RESEND=1` and `--allow-resend`.

## Validation commands

Run the following from a clean checkout:

```sh
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
npm run weekly:report -- --week 2026-W33 --file /path/to/snapshots.json --out-dir /tmp/weekly-report
npm run weekly:preview -- --week 2026-W33 --file /path/to/snapshots.json --out /tmp/weekly-preview.html
DRY_RUN=1 npm run weekly:send -- --week 2026-W33 --file /path/to/snapshots.json --out-dir /tmp/weekly-send --dry-run
```

The deterministic suite must cover snapshot persistence, duplicate prevention, missing days, stale and API-error separation, partial and insufficient history, FX calculations, threshold boundaries, reason codes, report model, HTML, XLSX, dry-run email, test-recipient routing, missing mail configuration, duplicate weekly sends, storage gating, quality blocking, production bootstrap, safe health output, scheduler command parsing and history backfill normalization. The current local result is 31 passed／0 failed. A separate public smoke records configured indicators, quote and history availability, source, fallback use and failure count; public API failure is not by itself an offline implementation failure.

## Fresh-clone rule

Final validation must clone only from GitHub using `feat/weekly-market-intelligence-production-v1`. No Manus-only file, local cache, external fixture or untracked artifact may be required. The fresh clone must run `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, production storage/status/bootstrap/daily/weekly dry-run/backup commands with a temporary synthetic absolute durable root, and local `/health` plus `/health/weekly` checks. The clone working tree must remain clean after the checks.

## External configuration required

For public-data operation, the scheduler needs network access to the fixed public providers and an owner-approved durable `PRODUCTION_STORAGE_ROOT`. For live email, an owner must supply SMTP environment variables, an approved sender, `MAIL_TEST_TO` and later approved recipients outside the repository. No real address, password, token, private endpoint or private runtime report may be committed. This task does not deploy, purchase／activate paid resources, or create／activate a production cron. Explicit next human action: configure approved persistent storage and SMTP variables, perform TEST_RECIPIENT live email verification, then enable the weekly scheduler.

## Next Codex task

The next functional expansion is **external machining／sheet-metal market reference intelligence**. It must remain public external market intelligence only and must not be redirected into company purchase history, SAP, supplier quotation history, company target prices, private thresholds, inventory, MOQ, payment terms or other private procurement data. Preserve the public-data semantics, source-status contract and purchasing-reference boundary while extending coverage to public machining and sheet-metal market indicators.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/weekly-market-intelligence-v1 "Authoritative Weekly V1 checkpoint"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/feat/weekly-market-intelligence-production-v1 "Production feature branch"

## Final verification evidence

The GitHub-only fresh clone of `feat/weekly-market-intelligence-production-v1` resolved to `85697cdcad9c7c6c126722b61a550713816b627a`. In the clone, `npm ci`, `npm run check`, `npm test` (31 passed／0 failed), `npm run build` and `npm audit --omit=dev` (0 vulnerabilities) passed. Unconfigured production storage／daily commands returned expected exit 2; `/health` returned HTTP 200; the clone-targeted synthetic production simulation completed storage gate, bootstrap, daily, weekly dry-run, duplicate guard, safe `/health/weekly` and public-only backup; the clone worktree remained clean.

The final code readiness state is `WEEKLY_MARKET_INTELLIGENCE_PRODUCTION_READY`, with `OFFLINE_GAPS = 0` and `CODEX_HANDOFF_READY = YES`. Persistent storage, SMTP credentials, approved sender／recipients, TEST_RECIPIENT live receipt and scheduler activation remain `EXTERNAL_CONFIGURATION_REQUIRED`. The explicit next human action is to configure approved persistent storage and SMTP environment variables, perform TEST_RECIPIENT live email verification, then enable the weekly scheduler.
