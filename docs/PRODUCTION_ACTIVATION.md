# Production Activation and Deployment Checkpoint

## Current verdict

**RENDER_WEB_PRODUCTION_DEPLOYMENT_PASS**

The public Render Free web deployment is verified and the production report/mail path is operationally certified through the owner-confirmed Gmail SMTP test. The approved presentation redesign is already committed and pushed to `main` at `8a9fd80c30a339b9eeea1a176c174459368a39b9`.

This document records deployment and activation state only. It does not authorize a bootstrap rerun, workflow trigger, additional email, secret change or schedule change.

## State semantics

| State | Meaning | Runtime interpretation |
| --- | --- | --- |
| `WEB_READY` | Render web process responds | Web/dashboard process is available |
| `DATABASE_READY` | PostgreSQL durable storage is reachable | Neon-backed reads and writes may continue |
| `DAILY_DATA_NOT_READY` | Current daily job data is not ready in the web health view | Not a Render deployment failure; inspect GitHub Actions daily state separately |
| `WEEKLY_REPORT_READY` | Weekly report state is available | Report artifacts/status are available for review |
| `MAIL_CONFIGURATION_REQUIRED` | Render does not have mail credentials | Expected on Render; Render is not the scheduled mail host |
| `SEND_OK` | Report quality and artifacts are complete | Gmail SMTP delivery may proceed in the approved workflow stage |
| `SEND_WITH_WARNINGS` | Report remains usable with visible warnings | Delivery may proceed only with warnings retained |
| `SEND_BLOCKED` | No usable report, insufficient coverage or artifact failure | No mail provider call; workflow fails closed |
| `BOOTSTRAP_COMPLETE` | Three-year public history bootstrap completed | Bootstrap is complete and must not be rerun for this checkpoint |

## Runtime architecture

```text
Public market APIs
        ↓
GitHub Actions daily／weekly workflows ───────→ Gmail SMTP delivery
        ↓                                            ↓
Neon-compatible PostgreSQL ←──── Render Free web/dashboard read path
```

GitHub Actions remains responsible for scheduled daily/weekly jobs and Gmail SMTP mail delivery. Render Free is web/dashboard hosting only. It does not own scheduled jobs, scheduled mail or durable local filesystem storage. No Gmail/SMTP credentials must be added to Render.

The active production mail provider is the existing Gmail SMTP path with the existing recipient, test-mode, ledger and duplicate-guard boundaries. Microsoft Graph is historical/inactive only and is not a production dependency. No company Microsoft 365, company mail or company data integration is present.

## Verified Render Free deployment

| Checkpoint | Verified result |
| --- | --- |
| Public deployment | [`https://raw-material-market-dashboard-1.onrender.com`](https://raw-material-market-dashboard-1.onrender.com) |
| Homepage | Loads successfully |
| `GET /health` | Status OK |
| `GET /health/weekly` | Status OK |
| Web readiness | `WEB_READY` |
| Database readiness | `DATABASE_READY` |
| Storage | PostgreSQL durable storage configured |
| Observed database latency | 36 ms |
| Bootstrap state | `BOOTSTRAP_COMPLETE` |
| Persisted records | `persistedRecordCount: 11351` |
| Quality gate | `SEND_OK` |
| Usable indicators | 14/14 |
| Weekly report state | `WEEKLY_REPORT_READY` |
| Latest weekly mail state | `TEST_SENT` |
| Deployment verdict | `RENDER_WEB_PRODUCTION_DEPLOYMENT_PASS` |

`DAILY_DATA_NOT_READY` is not a deployment failure. It describes daily-data readiness in the health view and must be interpreted separately from `WEB_READY` and `DATABASE_READY`. `MAIL_CONFIGURATION_REQUIRED` on Render is expected because Render is web/dashboard hosting only; it is not evidence of a Gmail failure and must not be fixed by adding mail credentials to Render.

## Bootstrap and data certification

The complete three-year public history bootstrap remains certified. The remediation preserved the 30-minute safety ceiling, bounded public-history concurrency, bounded PostgreSQL batch upsert, status-quality ranking, chunk resumability and safe progress. The successful production state includes `BOOTSTRAP_COMPLETE` and `persistedRecordCount: 11351`.

Bootstrap is complete and must not be rerun for this deployment checkpoint, documentation update or presentation state. No destructive reset, truncation or fabricated public data is permitted.

## Gmail SMTP and weekly report state

The owner-confirmed Gmail SMTP live test succeeded. The HTML email was successfully received and the XLSX attachment was successfully received. The weekly mail historical latest success state is `TEST_SENT`.

The manual Gmail receipt test is complete and must not be repeated by this checkpoint. A historical SMTP `535` `lastError` must not be interpreted as the current mail state because a later successful `TEST_SENT` record exists. The existing Gmail credentials remain in the GitHub Actions secret boundary only; they are not copied to Render or printed in logs.

The approved presentation redesign remains at main SHA `8a9fd80c30a339b9eeea1a176c174459368a39b9`, with procurement-management HTML/XLSX layout, KPI cards, weekly overview, review priorities, category momentum, signal distribution, compact detail table and warning/data-quality presentation.

## Schedule gate

The daily and weekly GitHub Actions schedules remain controlled by `PRODUCTION_SCHEDULES_ENABLED`. The schedule gate was not changed by the deployment checkpoint. When the owner is ready, setting `PRODUCTION_SCHEDULES_ENABLED=1` enables the existing schedule behavior; until then, scheduled jobs remain safely gated while manual dispatch remains available.

No workflow was triggered, no email was sent and no bootstrap was rerun while recording this checkpoint.

## Owner activation and recovery commands

The following commands remain owner-controlled and must run only with secret-managed environment variables. They are documented for recovery and do not authorize execution by this handoff:

```bash
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run db:migrate
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:storage-check
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:status
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" MAIL_PROVIDER=smtp \
  MAIL_HOST=smtp.gmail.com MAIL_PORT=465 MAIL_SECURE=true \
  npm run production:weekly -- --dry-run --send
```

If Render health is degraded, inspect `/health` and `/health/weekly` first, then inspect the safe GitHub Actions and Neon status. Do not add Gmail credentials to Render, do not treat `DAILY_DATA_NOT_READY` as a web deployment failure, do not rerun bootstrap without explicit owner approval and do not infer current mail failure from the historical SMTP 535 entry.

## Permanent safety boundary

The system remains limited to external public market intelligence and purchasing-reference context. It must not ingest SAP, company purchasing history, supplier quotations or names, company target prices, private thresholds, inventory, MOQ, payment terms, company email data, company credentials or private runtime reports.

## References

[1]: https://raw-material-market-dashboard-1.onrender.com "Verified Render Free public deployment"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/commit/8a9fd80c30a339b9eeea1a176c174459368a39b9 "Final presentation main commit"
[3]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611318090 "Successful promoted-main bootstrap"
[4]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611472483 "Bootstrap batch telemetry verification"
