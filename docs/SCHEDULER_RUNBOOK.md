# GitHub Actions Scheduler Runbook

## Operating boundary

The scheduler runs only public external market intelligence jobs. It does not read or write SAP, company purchase history, supplier quotes, private thresholds, inventory, MOQ, payment terms, company email systems or private credentials. The scheduled runtime is GitHub Actions; Render Free is dashboard hosting only and never owns scheduled SMTP delivery. No schedule is activated by this repository task.

## Timezone contract

All business dates and completed-week calculations use `Asia/Taipei` (UTC+08:00). Taiwan has no daylight-saving transition, so the conversion is deterministic year-round. Schedules are intentionally not at the top of the hour.

| Workflow | Taiwan time | UTC cron | Purpose | Gate |
| --- | --- | --- | --- | --- |
| `market-daily.yml` | approximately 07:17 Tuesday–Saturday | `17 23 * * 1-5` | Capture completed prior market-day public data; no email | `PRODUCTION_SCHEDULES_ENABLED=1` for schedule; manual always allowed |
| `market-weekly.yml` | approximately 09:17 Monday | `17 1 * * 1` | Generate completed prior Monday–Sunday report and send Gmail email | `PRODUCTION_SCHEDULES_ENABLED=1` for schedule; manual always allowed |
| `market-bootstrap.yml` | Owner-triggered `workflow_dispatch` | Not recurring | Migration, public history backfill, validation and first report | No schedule; not gated |
| Backup | Owner policy／workflow command | Not prescribed | PostgreSQL public export／manifest; no paid backup service required | Owner-controlled |

GitHub schedule is best-effort and may be delayed. Public repositories may have scheduled workflows disabled after extended repository inactivity. `workflow_dispatch` is the manual recovery path. The daily／weekly job-level condition is `github.event_name != 'schedule' || vars.PRODUCTION_SCHEDULES_ENABLED == '1'`; absent or non-`1` values safely skip scheduled jobs while leaving manual dispatch available. Keep the variable absent or `0` until the owner completes the manual weekly test-mail receipt／attachment review. The certified bootstrap has already passed on promoted `main`; do not create artificial commits merely to hide inactivity.

## Required secret gate

Before activating the workflows, the owner must add `DATABASE_URL`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_TO` and `MAIL_TEST_TO` as repository Actions secrets. Keep the repository variable `WEEKLY_MAIL_TEST_MODE=1` until a live test receipt and attachment review pass. `DATABASE_URL` and Gmail App Password must never occur in workflow source, logs or tracked files.

## Required command order

### One-time Postgres bootstrap

```bash
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run db:migrate
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:storage-check
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:bootstrap -- --period 3y
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:status
```

Migration is idempotent and non-destructive. Bootstrap backfills provider-supported public history, validates the canonical record contract, creates the first completed-week report and records job state without sending email. It uses bounded history concurrency of three (capped at four), `POSTGRES_UPSERT_BATCH_SIZE=250` by default (capped at 500), one transaction per batch and one parameterized multi-row upsert per batch. Progress and final counters are safe and resumable. Both commands fail closed when `DATABASE_URL` is missing or the database is unavailable.

### Daily workflow

`.github/workflows/market-daily.yml` runs `npm ci`, `npm run check`, `npm run db:migrate`, `npm run production:storage-check`, `npm run production:daily` and `npm run production:status`. It does not call the mail command. A process or database error exits non-zero. Partial public-source failures remain visible per row and may complete only when the daily contract permits them.

### Weekly workflow

`.github/workflows/market-weekly.yml` runs `npm ci`, `npm run check`, `npm run db:migrate`, `npm run production:storage-check`, then `npm run production:weekly -- --send` for the completed prior week. The job generates JSON／HTML／XLSX, evaluates `SEND_OK`／`SEND_WITH_WARNINGS`／`SEND_BLOCKED`, applies duplicate-send protection and uses Gmail SMTP only after quality gate approval. It finishes with `npm run production:status`.

The default repository variable keeps the first live workflow in `MAIL_TEST_MODE=1`; in that state only `MAIL_TEST_TO` is used and production `MAIL_TO`／CC／Reply-To are not forwarded. After manual receipt review, the owner may set `WEEKLY_MAIL_TEST_MODE=0` and run one explicitly approved production-recipient workflow before relying on the schedule.

## Readiness and stop states

The scheduler must stop on `DATABASE_URL_REQUIRED`, `DATABASE_UNAVAILABLE`, `DATABASE_MIGRATION_FAILED`, `SEND_BLOCKED`, malformed Gmail configuration, attachment failure or non-zero process exit. `SEND_WITH_WARNINGS` is deliverable only when the report remains materially usable and its warnings remain visible. `/health/weekly` distinguishes `WEB_READY`, `DATABASE_READY`, `DAILY_DATA_READY`, `WEEKLY_REPORT_READY` and mail-configuration states without exposing secrets.

## Rerun and failure recovery

A migration rerun is safe because it uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. A bootstrap or daily rerun is safe because snapshot identity is `material_id + observation_date` and upsert quality ranking prevents lower-quality replacement. A weekly rerun for a `SENT` or `TEST_SENT` week returns `DUPLICATE_PREVENTED`; owner-approved resend requires `ALLOW_WEEKLY_RESEND=1` and explicit `--allow-resend` after ledger／mailbox review.

For a Neon outage or query timeout, inspect the safe workflow log, correct the secret／service condition and rerun via `workflow_dispatch`. For a bootstrap timeout, inspect step timing and the latest safe progress counters, then rerun the unchanged 3y bootstrap; committed batches remain durable and the rerun is idempotent. For public API failures, inspect per-source status and report quality; never fabricate observations. For SMTP disconnect after DATA submission, do not retry automatically because acceptance is uncertain. For migration or transaction rollback, correct the database condition and rerun the idempotent command. Public PostgreSQL export and provider-supported re-backfill are the recovery source of truth.

## Scheduler activation checklist

| Check | Required result |
| --- | --- |
| Owner-approved Neon Free project and `DATABASE_URL` secret | Configured outside Git |
| Gmail personal SMTP secrets and `MAIL_TEST_TO` | Configured outside Git |
| Manual migration／storage check | `DATABASE_READY` |
| Manual bootstrap certification | PASS; promoted-main runs `32611318090` and `32611472483` completed with public data and job state |
| Manual daily workflow | `DAILY_DATA_READY` |
| Weekly dry-run | Artifacts valid, `sent: false`, no SMTP socket |
| First live weekly workflow | `MAIL_TEST_MODE=1`, receipt／attachment manually verified |
| Approved recipient send | One controlled send after test pass |
| Scheduled workflows | Enabled only after all preceding checks |

After this remediation PASS, the exact next human action is to run **one** `Market Weekly Intelligence Report` manually while `WEEKLY_MAIL_TEST_MODE=1`, verify the received Gmail HTML report and XLSX attachment, then set `PRODUCTION_SCHEDULES_ENABLED=1`. The bootstrap certification has already completed; do not trigger another bootstrap or the weekly workflow from the agent, and do not send email from the agent.
