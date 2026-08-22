# Project Status — Weekly Market Intelligence V1

## Status verdict

**WEEKLY_MARKET_INTELLIGENCE_V1_COMPLETE**

**OFFLINE_GAPS = 0**

**CODEX_HANDOFF_READY = YES**

This feature is built from the `raw-material-dashboard-hardened-v1` checkpoint at `698bed19b79ec0ee868d9707bdecd858e5a18f73`, on branch `feat/weekly-market-intelligence-v1`. The final revision is the commit resolved by `git rev-parse weekly-market-intelligence-v1^{}` after the annotated tag is pushed. `main` must remain unchanged, and this task does not deploy production.

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
| Mail | Provider-neutral SMTP adapter, env-only configuration, dry-run, fail-closed validation, bounded retry／timeout and duplicate-week ledger |
| Scheduler | `daily:snapshot`, `weekly:backfill`, `weekly:report`, `weekly:preview`, `weekly:send`; Monday morning Asia/Taipei contract documented |
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
```

The weekly preview and report commands are read／write artifact operations only. They do not send email. The live send command requires owner-managed environment variables and must be tested in dry-run first.

## External configuration required

Public operation needs network access to the configured Yahoo Finance, Stooq, Jina public proxy and open.er-api endpoints. Durable operation needs a persistent `MARKET_SNAPSHOT_FILE` and `WEEKLY_DELIVERY_LEDGER` location if the hosting filesystem is ephemeral. Live email needs approved values for `MAIL_ENABLED`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` and `MAIL_TO`; no such values are committed or supplied in this task.

## Validation status

| Gate | Status |
| --- | --- |
| Existing hardened regression suite | PASS before weekly additions |
| Weekly deterministic tests | PASS; 25 passed, 0 failed |
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
| Fresh-clone verification | Required before final tag; must use GitHub-only branch clone |
| Live public-data smoke | Required separately; report availability, fallback use and failure count |
| Production deployment | Not performed by instruction |

## Known external limitations

Public API availability, provider rate limits, timeout, data delay, source licensing and filesystem persistence remain operational dependencies. External failure is not an offline implementation gap, but it must remain visible through status and report quality fields. No material may be silently replaced with another symbol or fabricated observation.

## Next action

The next Codex task is to obtain owner approval for a separate private authenticated procurement-data service and data-classification／retention／access-control design. Until approved, do not add supplier quotation, SAP, inventory, delivery, MOQ, company thresholds, contract exposure or private credentials to this public repository.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/feat/weekly-market-intelligence-v1 "Weekly Market Intelligence V1 branch"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/weekly-market-intelligence-v1/HANDOFF.md "Codex handoff"
[3]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/weekly-market-intelligence-v1/docs/WEEKLY_REPORT_CONTRACT.md "Weekly report contract"
