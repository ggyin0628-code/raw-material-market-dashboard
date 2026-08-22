# Codex Handoff — Weekly Market Intelligence V1

## Delivery identity

| Item | Value |
| --- | --- |
| Repository | [`ggyin0628-code/raw-material-market-dashboard`](https://github.com/ggyin0628-code/raw-material-market-dashboard) |
| Starting checkpoint | `raw-material-dashboard-hardened-v1` |
| Starting checkpoint target | `698bed19b79ec0ee868d9707bdecd858e5a18f73` |
| Authoritative feature branch | `feat/weekly-market-intelligence-v1` |
| Checkpoint tag to resolve after delivery | `weekly-market-intelligence-v1` |
| Product boundary | External public-market intelligence and purchasing-reference platform |
| Deployment | Not performed in this task |

The weekly feature branch must be based on the hardened checkpoint tag, not on `main`. `main` must remain unmodified and must never receive a merge from this task. The final immutable revision is the commit resolved by `git rev-parse weekly-market-intelligence-v1^{}` after the annotated tag has been pushed. This command keeps the document self-verifying without depending on conversation history.

## Product boundary

> This system summarizes public market information for purchasing context. It is not a supplier quotation service, a company target-price system, a Taiwan spot-price database, an ERP purchasing module, or a buy／sell decision engine.

The implementation must not claim supplier purchase prices, company target purchase prices, guaranteed negotiation prices, unsupported Taiwan spot prices, or BUY／SELL／MUST PURCHASE instructions. Public status, source, unit, FX and provenance must remain visible. Company purchasing data, SAP, supplier quotations, private thresholds, inventory, delivery terms, MOQ and credentials are explicitly out of scope.

## Architecture

The existing Node.js CommonJS service remains the application boundary. `lib/weekly/snapshotStore.js` owns the atomic JSON ledger, `dailySnapshotService.js` converts the hardened live snapshot to canonical daily records, `backfillService.js` imports provider-supported public history idempotently, `weeklyAnalytics.js` calculates completed-week comparisons and reason-coded signals, `reportService.js` owns the canonical report plus Traditional Chinese HTML and XLSX renderers, `mailService.js` owns fail-closed SMTP delivery and the weekly delivery ledger, and `cli.js` exposes scheduler-compatible commands.

The default durable ledger path is `data/market-snapshots/snapshots.json`, overridable by `MARKET_SNAPSHOT_FILE`. The default report output directory is `data/weekly-reports`. Both generated paths are ignored by Git. Writes use a temporary file followed by an atomic rename; identities are `materialId + date`. A higher-quality `LIVE` or `FALLBACK` record cannot be silently downgraded by a later same-day `STALE`, `NO_DATA` or `API_ERROR` attempt. Missing market days remain missing.

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

## Mail safety

SMTP configuration comes only from environment variables. `MAIL_ENABLED` must be truthy for live delivery; `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` and `MAIL_TO` are validated. `DRY_RUN=1` or `--dry-run` produces the report, attachment and configuration result but does not open a socket or send mail. Live delivery is fail-closed for missing or malformed configuration, has a bounded timeout and retry policy, writes only redacted delivery metadata, and records `SENT` by reporting week to prevent duplicate sends.

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

The deterministic suite must cover snapshot persistence, duplicate prevention, missing days, stale and API-error separation, partial and insufficient history, FX calculations, threshold boundaries, reason codes, report model, HTML, XLSX, dry-run email, missing mail configuration, duplicate weekly sends, scheduler command parsing and history backfill normalization. A separate public smoke records configured indicators, quote and history availability, source, fallback use and failure count; public API failure is not by itself an offline implementation failure.

## Fresh-clone rule

Final validation must clone only from GitHub using the feature branch. No Manus-only file, local cache, external fixture or untracked artifact may be required. The fresh clone must run `npm ci`, `npm run check`, `npm test`, `npm run build`, the production dependency audit, the safe report commands and a local `/health` check. The clone working tree must remain clean after the checks.

## External configuration required

For public-data operation, the scheduler needs network access to the fixed public providers and a persistent `MARKET_SNAPSHOT_FILE` location. For live email, an owner must supply the SMTP environment variables and approved recipients outside the repository. No real address, password, token or private endpoint may be committed. A Render-style external scheduler can run the commands; this task does not create or activate a production cron.

## Next Codex task

Before any private data integration, obtain owner approval for a separate private authenticated procurement-data service and a data-classification／retention／access-control design. Do not add supplier quotation, SAP, inventory, delivery, MOQ, company thresholds or private credentials to this public repository. Preserve the weekly public-data semantics and source-status contract.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/raw-material-dashboard-hardened-v1 "Starting hardened checkpoint"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/feat/weekly-market-intelligence-v1 "Weekly Market Intelligence V1 feature branch"
