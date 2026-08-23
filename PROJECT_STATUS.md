# Project Status — Zero-Cost Production Runtime V1

## Status verdict

**ZERO_COST_RUNTIME_READY**

**OFFLINE_GAPS = 0**

**CODEX_HANDOFF_READY = YES**

This work starts exactly from the annotated checkpoint `weekly-market-intelligence-production-ready-v1`, whose peeled target is `222e1a2a7a602d3700260f83753bf024708b47d6`, and is developed on `feat/zero-cost-runtime-v1`. The owner explicitly approved a fast-forward promotion after validation; `main` now tracks the validated feature branch while `feat/zero-cost-runtime-v1` and `zero-cost-runtime-ready-v1` remain preserved. This task does not create a Neon project, configure Actions secrets, send real mail, deploy, or activate paid resources.

## Product boundary

This remains an **EXTERNAL PUBLIC MARKET INTELLIGENCE AND PURCHASING REFERENCE PLATFORM**. Only external public market data and derived public-market reference reports may be stored. The product must not add SAP, company procurement history, supplier quotations or names, company target prices, private thresholds, inventory, MOQ, payment terms, company email systems, private mappings, credentials or generated private runtime configuration. The next functional expansion remains external machining／sheet-metal public market reference intelligence using public external sources only.

## Zero-cost runtime architecture

```text
Public market APIs
    ↓
GitHub Actions daily／weekly workflows
    ↓
Node.js weekly runtime
    ↓
STORAGE_PROVIDER=postgres
    ↓
Neon-compatible PostgreSQL
    ↓
Gmail SMTP to owner-approved personal TEST_RECIPIENT／recipient
```

Render Free is optional dashboard／web hosting only. It does not provide durable local storage and it does not perform scheduled SMTP delivery. When `STORAGE_PROVIDER=postgres`, the dashboard and Actions jobs share the same durable public history without requiring a paid persistent filesystem.

## Completed scope

| Area | Result |
| --- | --- |
| Storage provider boundary | `filesystem` remains local／test adapter; `postgres` is Neon-compatible production adapter; analytics and report logic are shared |
| PostgreSQL schema | `market_snapshots`, `weekly_delivery_ledger`, `weekly_report_metadata`, `weekly_job_state` with primary keys／indexes |
| Migration | `npm run db:migrate`; idempotent and non-destructive, with explicit `DATABASE_MIGRATION_FAILED` |
| Snapshot semantics | Deterministic `material_id + observation_date`; transactional upsert; higher-quality `LIVE`／`FALLBACK` cannot be downgraded; malformed payloads rejected |
| Operational persistence | Delivery ledger, public report metadata and job state supported by Postgres; filesystem JSON remains atomic compatibility path |
| Bootstrap | migration → public history backfill → validation → job state → first report, idempotent and no email; manual-only Actions workflow added |
| Manual bootstrap Actions | `market-bootstrap.yml`; dispatch-only, npm ci, migration, storage check, 3y public backfill and final status; no mail secrets or schedule |
| Weekly Actions | `market-weekly.yml`; completed prior week, quality gate, HTML／XLSX, Gmail SMTP, duplicate guard and final status |
| Gmail SMTP | Personal Gmail only, env／Actions-secret configuration, `MAIL_TEST_MODE=1` isolation, dry-run, bounded retry and uncertain-acceptance recovery |
| Health | `/health/weekly` readiness fields: `WEB_READY`, `DATABASE_READY`, `DAILY_DATA_READY`, `WEEKLY_REPORT_READY`, `MAIL_CONFIGURATION_READY`; no secrets／recipient lists |
| Backup | Public-only Postgres export／manifest; provider re-backfill remains recovery source of truth; no paid backup service required |
| Documentation | Zero-cost architecture, Postgres schema, Actions operations, email, scheduler, operations, activation and handoff docs |

## Commands

```bash
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
STORAGE_PROVIDER=postgres DATABASE_SSL=true DATABASE_URL="$DATABASE_URL" npm run db:migrate
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:storage-check
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:bootstrap -- --period 3y
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:daily
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:weekly -- --dry-run --send
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:backup -- --backup-id <owner-approved-id>
```

`DATABASE_URL` in these examples is a placeholder for secret-managed runtime injection and must never be pasted into tracked files or logs.

## Validation status

| Gate | Result |
| --- | --- |
| Starting checkpoint | PASS; `weekly-market-intelligence-production-ready-v1` → `222e1a2a7a602d3700260f83753bf024708b47d6` |
| Branch isolation | PASS; `feat/zero-cost-runtime-v1` was based on the checkpoint; owner-approved fast-forward promotion preserved the feature branch and tag |
| Syntax／build | PASS; `npm run check` and `npm run build` |
| Deterministic tests | PASS; 38 passed／0 failed |
| Dependency audit | PASS; `npm audit --omit=dev` reports 0 vulnerabilities |
| Postgres migration／parity | PASS offline with FakePostgresPool; idempotence, schema command contract, filesystem parity, uniqueness and quality upsert covered |
| Transaction／failure behavior | PASS offline; rollback, invalid payload, missing `DATABASE_URL`, database failure and safe error states covered |
| SMTP safety | PASS; no-socket dry-run, test-recipient isolation, auth／timeout／uncertain acceptance／attachment failure and duplicate guard covered |
| Workflow source contracts | PASS; bootstrap dispatch-only plus daily／weekly schedules, manual dispatch, secrets-only configuration and required commands are source-validated |
| Production simulation | PASS with synthetic public-safe records and temporary storage; no Neon or Gmail connection |
| GitHub-only fresh clone | PASS; feature clone and post-promotion main clone verified with npm ci, 38 tests, build, audit, blocked gates, health, workflow contracts, three workflow files and synthetic simulation |
| Live Neon／Gmail integration | `EXTERNAL_CONFIGURATION_REQUIRED` |
| GitHub Actions activation | `EXTERNAL_CONFIGURATION_REQUIRED`; workflows remain untriggered and schedules unchanged |
| Deployment／paid resources | Not performed; no paid resource required for PASS |

## External configuration required

| Dependency | Classification | Owner action |
| --- | --- | --- |
| Neon-compatible free PostgreSQL project | `EXTERNAL_CONFIGURATION_REQUIRED` | Create／select owner-approved project and add `DATABASE_URL` as Actions secret |
| Gmail personal SMTP | `EXTERNAL_CONFIGURATION_REQUIRED` | Add `MAIL_USER`, Gmail App Password, `MAIL_FROM`, `MAIL_TEST_TO` as Actions secrets |
| Production recipients | `EXTERNAL_CONFIGURATION_REQUIRED` | Add `MAIL_TO` only after TEST_RECIPIENT receipt and attachment review |
| Actions test mode | `EXTERNAL_CONFIGURATION_REQUIRED` | Keep `WEEKLY_MAIL_TEST_MODE=1` for first live workflow; set `0` only after manual verification |
| Workflow activation | `EXTERNAL_CONFIGURATION_REQUIRED` | Enable／run daily and weekly workflows after secrets and manual checks are complete |

## Failure recovery contract

The system returns non-zero workflow outcomes for missing／unavailable Postgres, migration failure, invalid payload, rollback, materially insufficient data, attachment failure and failed SMTP. Partial public-source failures may remain `SEND_WITH_WARNINGS` when the report contract permits; they remain visible in job state and report quality. Duplicate weekly delivery is `DUPLICATE_PREVENTED`; uncertain SMTP acceptance after DATA is not automatically retried and requires mailbox／ledger review before owner-approved resend.

## Explicit next human action

Create the owner-approved Neon Free project, configure `DATABASE_URL` and Gmail credentials only as GitHub Actions secrets, run the manual bootstrap workflow, execute one `MAIL_TEST_MODE=1` live weekly send to the approved personal recipient, verify receipt and attachment, then enable scheduled daily and weekly workflows.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/weekly-market-intelligence-production-ready-v1 "Starting production-ready checkpoint"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/feat/zero-cost-runtime-v1 "Zero-cost runtime feature branch"
[3]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/zero-cost-runtime-v1/docs/POSTGRES_STORAGE.md "PostgreSQL storage contract"
[4]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/zero-cost-runtime-v1/docs/GITHUB_ACTIONS_OPERATIONS.md "GitHub Actions operations runbook"
