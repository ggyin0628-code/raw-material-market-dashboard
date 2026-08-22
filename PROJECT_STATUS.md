# Project Status — Weekly Market Intelligence Production Activation

## Status verdict

**WEEKLY_MARKET_INTELLIGENCE_PRODUCTION_READY**

**OFFLINE_GAPS = 0**

**CODEX_HANDOFF_READY = YES**

This production readiness work starts exactly from `weekly-market-intelligence-v1` at `b78ba1e6302a30b8231711c15d5945d3223687c5`, on branch `feat/weekly-market-intelligence-production-v1`. The final revision is the commit resolved by `git rev-parse weekly-market-intelligence-production-ready-v1^{}` after the annotated tag is pushed. `main` must remain unchanged. This task does not deploy, purchase／activate paid resources, or enable production cron or real-recipient mail.

## Product boundary

This is an external public-market intelligence and purchasing-reference platform. It gives purchasing users reliable public-market trend information, source coverage and data-quality visibility. It must not claim supplier purchase price, company target purchase price, guaranteed negotiation price, unsupported Taiwan spot price or BUY／SELL／MUST PURCHASE instructions. Supplier quotations, SAP, company thresholds, inventory, delivery terms, MOQ, payment terms and private credentials are excluded.

## Completed scope

| Area | Result |
| --- | --- |
| Daily snapshot persistence | Atomic JSON ledger, configurable path, `materialId + date` identity, duplicate prevention, provenance, timestamps, source unit, FX and valid TWD reference value |
| Historical quality | Distinct `LIVE`, `FALLBACK`, `STALE`, `NO_DATA`, `API_ERROR`; stale/error are never fresh; missing days stay absent |
| Weekly analytics | Latest valid, prior-week, four-week, approximately three-month, YTD and 52-week comparisons; high／low, range and rolling volatility; FX trends; insufficient-history nulls |
| Signals | `COST_PRESSURE_RISING`, `MARKET_WEAKENING`, `STABLE`, `HIGH_VOLATILITY`, `DATA_INSUFFICIENT`, `DATA_QUALITY_WARNING`, all with thresholds and reason codes |
| Weekly report | Canonical JSON model with reporting period, coverage, quality, summary, all indicators, provenance and purchasing-reference note |
| HTML | Traditional Chinese report, top risers／decliners／volatility／quality warnings, complete indicator table and optional inline SVG visuals |
| XLSX | 「本週摘要」、「市場明細」、「歷史資料」、「資料來源與說明」 with required values, statuses, timestamps and disclaimer |
| Preview | Safe CLI and dashboard routes; no route sends mail |
| Mail | Provider-neutral SMTP adapter, env-only configuration, dry-run with no socket, `MAIL_TEST_MODE`／`MAIL_TEST_TO` isolation, optional CC／Reply-To in production mode, fail-closed validation, bounded transient-only retry, uncertain-acceptance recovery and duplicate-week ledger |
| Storage | Shared production configuration, absolute durable root gate, atomic snapshots／reports／metadata／job state／delivery ledger and public-only backup export |
| Quality gate | `SEND_OK`, `SEND_WITH_WARNINGS`, `SEND_BLOCKED`; blocks no-usable／<50% usable／artifact integrity failures before mail |
| Observability | Safe `/health/weekly` with 503 `STORAGE_CONFIGURATION_REQUIRED` when unconfigured and no paths／secrets in responses |
| Production jobs | `production:storage-check`, `production:status`, `production:bootstrap`, `production:daily`, `production:weekly`, `production:backup` |
| Scheduler | Daily／weekly Asia/Taipei contract with UTC conversion documented; no production cron activated |

| Backfill | Provider-supported public history only, idempotent, provenance-preserving, missing-date-safe and source-failure-visible |
| UI | Minimum weekly summary, report preview link, XLSX link and quality warning visibility added; current hardened dashboard preserved |
| Security | Generated paths ignored, safe filenames, public-source boundaries, no credentials or company-private data in tracked files |

## Commands

```sh
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
npm run daily:snapshot
npm run weekly:backfill -- --period 3y
npm run weekly:report -- --week YYYY-Www --out-dir data/weekly-reports
npm run weekly:preview -- --week YYYY-Www --out /tmp/weekly-preview.html
DRY_RUN=1 npm run weekly:send -- --week YYYY-Www --dry-run --out-dir /tmp/weekly-send
npm run production:storage-check
npm run production:status
npm run production:bootstrap -- --period 3y
npm run production:daily
npm run production:weekly -- --dry-run --send
npm run production:backup -- --backup-id <owner-approved-id>
```

The weekly preview and report commands are read／write artifact operations only. They do not send email. Production weekly always generates and quality-gates public JSON／HTML／XLSX before mail. Live SMTP requires owner-managed environment variables and must follow dry-run → TEST_RECIPIENT → approved-recipient stages.

## External configuration required

Public operation needs network access to the configured Yahoo Finance, Stooq, Jina public proxy and open.er-api endpoints. Production operation needs owner-approved persistent `PRODUCTION_STORAGE_ROOT`; missing durable configuration is an explicit `STORAGE_CONFIGURATION_REQUIRED` stop state. Live email needs approved environment values for SMTP host／port／secure mode／user／password／sender, `MAIL_TEST_TO` for controlled verification and later `MAIL_TO`／optional `MAIL_CC`; no such values are committed or supplied in this task.

## Validation status

| Gate | Status |
| --- | --- |
| Existing hardened regression suite | PASS before weekly additions |
| Weekly deterministic tests | PASS; historical V1 baseline 25 passed, 0 failed |
| Production deterministic tests | PASS; 31 passed, 0 failed |
| `npm run check` and all weekly module syntax checks | PASS |
| `npm run build` | PASS |
| `npm audit --omit=dev` | PASS; 0 vulnerabilities |
| Report generation | PASS in safe run; JSON／HTML／XLSX created |
| HTML preview | PASS in safe run; no mail side effect |
| SMTP dry-run | PASS; `DRY_RUN`, no socket, no external email |
| Missing SMTP configuration | PASS; fail-closed `FAILED` |
| Duplicate weekly send prevention | PASS; `DUPLICATE_PREVENTED` |
| Backfill idempotence and missing days | PASS |
| Weekly API JSON／HTML／XLSX routes | PASS |
| Storage gate / production simulations | PASS when unconfigured 503／blocked and synthetic durable root completes storage→bootstrap→daily→weekly dry-run→duplicate→health→backup |
| SMTP safety simulations | PASS; dry-run no socket, TEST_RECIPIENT isolation, fail-closed config and duplicate guard |
| Fresh-clone verification | Required before final tag; must use GitHub-only `feat/weekly-market-intelligence-production-v1` clone |
| Live public-data smoke | Required separately; report availability, fallback use and failure count |
| Owner persistent storage／SMTP／TEST_RECIPIENT | `EXTERNAL_CONFIGURATION_REQUIRED` |
| Weekly scheduler activation | `EXTERNAL_CONFIGURATION_REQUIRED`; owner action after live test receipt |
| Production deployment | Not performed by instruction |

## Known external limitations

Public API availability, provider rate limits, timeout, data delay, source licensing and filesystem persistence remain operational dependencies. External failure is not an offline implementation gap, but it must remain visible through status and report quality fields. No material may be silently replaced with another symbol or fabricated observation.

## Next action

**Explicit next human action:** configure approved persistent storage and SMTP environment variables, perform TEST_RECIPIENT live email verification, then enable the weekly scheduler. The next functional expansion is **external machining／sheet-metal market reference intelligence**. It must remain public external market intelligence only. Do not add supplier quotation, SAP, inventory, delivery, MOQ, company target prices, private thresholds, contract exposure or private credentials to this public repository.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/feat/weekly-market-intelligence-production-v1 "Weekly Market Intelligence V1 branch"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/weekly-market-intelligence-production-v1/HANDOFF.md "Codex handoff"
[3]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/weekly-market-intelligence-production-v1/docs/WEEKLY_REPORT_CONTRACT.md "Weekly report contract"
