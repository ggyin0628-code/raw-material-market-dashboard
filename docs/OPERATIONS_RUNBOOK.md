# Zero-Cost Operations Runbook

## Scope and safety

This service is permanently limited to external public market intelligence and purchasing-reference context. It is not a procurement system and must never ingest SAP, private purchasing data, supplier names or quotations, inventory, MOQ, payment terms, company target prices, private thresholds, company email data, credentials or private runtime reports.

The scheduled runtime is GitHub Actions. Render Free is optional dashboard hosting only; it is not the durable storage provider and it does not send scheduled SMTP. The zero-cost durable provider is Neon-compatible PostgreSQL selected by `STORAGE_PROVIDER=postgres` and secret-managed `DATABASE_URL`.

## Safe observability

Use the read-only checks from a secret-managed environment:

```bash
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:storage-check
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:status
curl -i https://<host>/health/weekly
```

`/health/weekly` returns sanitized readiness fields for `WEB_READY`, database, daily data, weekly report and mail configuration, together with public job states, completed-week label and warnings. It never exposes `DATABASE_URL`, `MAIL_PASSWORD`, SMTP credentials, recipient lists, message body, absolute paths or stack traces. Missing Postgres configuration returns HTTP 503 with `DATABASE_URL_REQUIRED`; a database outage returns a safe unavailable state. `/health` only proves that the web process responds.

## Failure matrix and recovery

| Failure | Expected state | Recovery | Prohibited response |
| --- | --- | --- | --- |
| Missing `DATABASE_URL` | `DATABASE_URL_REQUIRED`, exit 2 | Add secret-managed Actions URL and rerun migration／job | Never put URL in source or logs |
| Neon unavailable／connection failure | `DATABASE_UNAVAILABLE`, non-zero | Check owner secret／service availability, then use `workflow_dispatch` | Do not fall back to ephemeral Render storage |
| Migration failure | `DATABASE_MIGRATION_FAILED`, transaction rollback | Correct permissions/schema access and rerun non-destructive migration | Do not drop, truncate or reset tables |
| Query timeout／disconnect | bounded database read/write failure | Rerun after transient condition; inspect safe logs | No infinite retry or fabricated data |
| Invalid public payload | `SNAPSHOT_PAYLOAD_INVALID` or explicit contract error | Preserve failure, investigate provider normalization, rerun | Do not insert malformed rows |
| Bootstrap timeout／cancel | `production:bootstrap` cancelled or non-zero | Inspect safe step timing and latest `productionBootstrap` progress; fix bottleneck, then rerun 3y bootstrap | Do not lower 3y period or blindly extend timeout |
| Partial Postgres batch failure | Active batch transaction rolls back; prior batches remain durable | Correct cause and rerun idempotent batch | Do not claim failed batch persisted; do not truncate |
| Public API timeout／HTTP failure | `API_ERROR`, `NO_DATA` or `STALE` per row | Use bounded retry and next workflow window | Do not invent dates, prices or FX |
| Partial daily failure | successful rows retained; failed rows visible | Review coverage and rerun daily | Do not delete successful rows |
| Weekly insufficient data | `SEND_BLOCKED`, non-zero | Obtain provider-supported public history or wait, then dry-run | Do not interpolate or use private data |
| Weekly degraded but usable | `SEND_WITH_WARNINGS` | Review warnings and approve delivery if appropriate | Do not hide warnings |
| Missing／malformed Gmail config | `FAILED` before socket | Correct Actions secrets; run dry-run first | Do not pass secrets as committed args |
| Gmail authentication failure | `FAILED`, non-transient | Correct personal Gmail App Password／sender authorization; repeat test mode | Do not retry blindly |
| SMTP pre-DATA timeout | `FAILED`, bounded transient retry | Review connectivity and rerun after approval | Do not exceed bounded retry |
| SMTP timeout after DATA | `FAILED`, acceptance uncertain | Inspect Postgres ledger and Gmail mailbox before resend | Do not automatic retry |
| Attachment failure | `FAILED`, no successful send | Regenerate public artifacts and rerun controlled test | Do not mark sent manually |
| Duplicate week | `DUPLICATE_PREVENTED` | Review ledger; owner-approved resend only | Do not delete ledger row |
| Public export failure | non-zero | Correct destination／database access and rerun export | Do not claim backup exists without manifest |

## Bootstrap performance and resumability

The observed `Market Production Bootstrap #1` run on main `8390a0234fb5d18e28e100ee1ff40750b6b0d95e` completed checkout, Node setup, `npm ci`, code validation, migration and storage check in approximately 14 seconds, then remained active in `Bootstrap public history` until the 30-minute job ceiling. The dominant observed bottleneck was therefore the bootstrap stage, not checkout or migration. Source inspection identified two contributing paths: sequential per-material public history fetches and per-record Postgres lookup／write round-trips. This remediation addresses both without changing the 3y period or analytics. The first promoted-main verification was run `32611318090`; the final-SHA progress verification was run `32611472483`.

The backfill now uses bounded history concurrency of three, capped at four, while retaining the existing provider timeout／retry policy and per-material failure isolation. Postgres snapshot writes use `POSTGRES_UPSERT_BATCH_SIZE=250` by default, clamped to 500. Each chunk uses one transaction and one parameterized multi-row `INSERT ... ON CONFLICT` statement; lower-quality rows cannot overwrite higher-quality rows. A committed chunk remains durable if a later chunk or the workflow is interrupted. Rerunning the same 3y bootstrap is safe and does not require reset or truncate.

Progress output is safe and includes `FX history fetched`, material index／count, records prepared, batch number／count, committed counters, API-error material count and final elapsed time. It excludes database URLs, passwords, Gmail credentials and recipient values. Job state stores the latest safe progress and final `fetchedRows`, `inserted`, `replaced`, `ignored`, `apiErrorMaterials`, `elapsedMs` and persisted record count.

## Daily incident procedure

Capture workflow run URL, timestamp and safe status output. Check `DATABASE_READY`, the `dailySnapshot` job state, source coverage and row-level statuses. If the database is healthy, rerun the daily workflow once with `workflow_dispatch`; deterministic snapshot identity preserves prior successes. If a public provider is unavailable, leave explicit `API_ERROR`／`NO_DATA`／`STALE` state and allow the next scheduled window. If Postgres is unhealthy, correct the secret or service condition before rerunning.

## Weekly incident procedure

Confirm the completed prior Monday–Sunday week in `production:status`. Run the weekly workflow in default test mode or run a dry-run. If quality is `SEND_BLOCKED`, inspect coverage／FX／history and do not send. If report artifacts are valid but Gmail fails, preserve public artifacts and correct secrets. If SMTP acceptance is uncertain after DATA, inspect the mailbox and ledger before any owner-approved resend. If the state is `DUPLICATE_PREVENTED`, require both `ALLOW_WEEKLY_RESEND=1` and explicit `--allow-resend` after reviewing the existing delivery state.

## Backup and restoration

Run the public-only Postgres export command through a secret-managed environment:

```bash
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:backup -- --backup-id <owner-approved-id>
```

The export contains public market snapshots, delivery ledger, public report metadata and sanitized job state with a manifest. No paid backup service is required. Because public market history is reproducible, provider-supported re-backfill is the primary recovery source. Preserve damaged data for investigation, restore only known-good public data and metadata, then rerun migration／storage check／status／dry-run before any live send.

## Quality gate operations

The quality gate counts tracked indicators and classifies usable `LIVE`／`FALLBACK`, `STALE`, `API_ERROR` and `NO_DATA`, plus insufficient history, missing FX and artifact integrity. It blocks when there is no usable data, usable ratio is below 50% or required artifacts are incomplete. Otherwise it returns `SEND_OK` for clean coverage or `SEND_WITH_WARNINGS` when the report remains usable but degraded. Warnings remain in JSON／HTML／XLSX and job state.

## Workflow operations

GitHub Actions schedules are best-effort and may be delayed. Public repositories may have scheduled workflows disabled after extended inactivity. `workflow_dispatch` is the manual recovery path. The daily／weekly job-level schedule gate runs scheduled jobs only when repository variable `PRODUCTION_SCHEDULES_ENABLED` equals `1`; manual dispatch is always allowed. Keep this variable absent or `0` until the manual bootstrap succeeds and the first live TEST_RECIPIENT receipt／attachment review passes. Keep `WEEKLY_MAIL_TEST_MODE=1` until that review; only then may the owner set it to `0` and enable approved production-recipient operation.

The bootstrap certification has completed on promoted `main`: run `32611318090` established the performance result and run `32611472483` verified final-SHA batch progress telemetry. No weekly workflow was triggered, no email was sent, and the schedule gate variable was not changed. Do not trigger another bootstrap or weekly workflow as part of this handoff.

## Owner activation handoff

The explicit next human action is: **Run exactly one Market Weekly Intelligence Report manually while `WEEKLY_MAIL_TEST_MODE=1`, verify the received Gmail HTML report and XLSX attachment, then set `PRODUCTION_SCHEDULES_ENABLED=1`.** The owner must keep test mode enabled until receipt／attachment review passes; the remediation agent must not trigger weekly mail or change the schedule variable.
