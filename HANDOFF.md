# Codex Handoff — Zero-Cost Production Runtime V1

## Delivery identity

| Item | Value |
| --- | --- |
| Repository | `ggyin0628-code/raw-material-market-dashboard` |
| Starting checkpoint | `weekly-market-intelligence-production-ready-v1` |
| Starting checkpoint target | `222e1a2a7a602d3700260f83753bf024708b47d6` |
| Feature branch | `feat/zero-cost-runtime-v1` |
| Required final tag | `zero-cost-runtime-ready-v1` |
| Required tag message | `Zero-cost runtime ready — Neon and Gmail Actions secrets activation remaining` |
| Product boundary | External public-market intelligence and purchasing-reference platform |
| Deployment | Not performed in this task |

The feature branch is based directly on the production-ready checkpoint, not on `main`. The owner explicitly approved a fast-forward promotion after validation; `main` now contains the validated feature branch, while `feat/zero-cost-runtime-v1` and `zero-cost-runtime-ready-v1` remain preserved. The tag remains the pre-promotion zero-cost checkpoint; the final main SHA is recorded in the final integrity evidence.

## Product boundary

> This system stores and reports external public market information for purchasing context. It is not a supplier quotation service, company target-price system, Taiwan spot-price database, ERP purchasing module or buy／sell decision engine.

Only public external market data may be stored. SAP, company procurement history, supplier quotations or names, company target prices, private thresholds, inventory, MOQ, payment terms, company email systems, private mappings, credentials and generated private runtime reports are permanently out of scope. The next functional expansion remains external machining／sheet-metal public market reference intelligence only.

## Runtime architecture

```text
Public market APIs
    ↓
GitHub Actions manual bootstrap／daily／weekly workflows
    ↓
Node.js weekly runtime
    ↓
STORAGE_PROVIDER=postgres
    ↓
Neon-compatible PostgreSQL
    ↓
Gmail SMTP to approved personal TEST_RECIPIENT／recipient
```

Render Free is optional dashboard／web hosting only. It must not perform scheduled SMTP delivery and its local filesystem is not durable. `STORAGE_PROVIDER=filesystem` remains the local／test adapter; `STORAGE_PROVIDER=postgres` is the zero-cost durable path. The analytics and report implementation is shared, so storage provider choice does not change report calculations.

## Provider contract

Postgres production uses environment-only `DATABASE_URL`, optional `DATABASE_SSL`, bounded pool size and bounded connection／query timeouts. The application never logs or returns the database URL. `npm run db:migrate` creates the non-destructive schema for `market_snapshots`, `weekly_delivery_ledger`, `weekly_report_metadata` and `weekly_job_state`; it may run repeatedly and never resets existing data.

Market snapshot identity remains `material_id + observation_date`. Transactional upsert preserves the canonical fields and prevents a lower-quality `STALE`, `NO_DATA` or `API_ERROR` observation from silently replacing higher-quality `LIVE`／`FALLBACK` data. Payload validation, connection failure, query timeout, transaction rollback and reconnect-by-rerun are explicit failure paths.

## Commands and workflows

| Command／workflow | Purpose | Mail |
| --- | --- | --- |
| `npm run db:migrate` | Idempotent PostgreSQL schema migration | No |
| `npm run production:bootstrap -- --period 3y` | Migration → public history backfill → validation → first report／job state | No |
| `npm run production:daily` | Persist public snapshot and FX for prior market window | No |
| `npm run production:weekly -- --send` | Completed prior week, quality gate, JSON／HTML／XLSX and Gmail SMTP | Yes, test mode first |
| `.github/workflows/market-bootstrap.yml` | Manual `workflow_dispatch` only; 3y public bootstrap | No |
| `.github/workflows/market-daily.yml` | Tue–Sat approximately 07:17 Asia/Taipei (`17 23 * * 1-5`) | No |
| `.github/workflows/market-weekly.yml` | Monday approximately 09:17 Asia/Taipei (`17 1 * * 1`) | Yes, `MAIL_TEST_TO` first |

All three workflows use `ubuntu-latest`, Node 20, `npm ci`, repository secrets where needed and no real credentials in source. The bootstrap workflow is dispatch-only, contains only `DATABASE_URL`, and cannot send email. The weekly workflow defaults `WEEKLY_MAIL_TEST_MODE` to `1` through a repository variable fallback and must not be switched to production recipients until the owner verifies a live test receipt and attachment.

## Health and observability

`GET /health/weekly` returns readiness fields `WEB_READY`, `DATABASE_READY`, `DAILY_DATA_READY`, `WEEKLY_REPORT_READY` and `MAIL_CONFIGURATION_READY`／required states. It never exposes `DATABASE_URL`, `MAIL_PASSWORD`, SMTP credentials or recipient lists. Missing Postgres configuration returns HTTP 503 with `DATABASE_URL_REQUIRED`; unavailable Postgres returns a safe database failure state. Render `/health` only proves that the web process responds.

## Mail safety

The Gmail adapter remains provider-neutral but is configured for owner-approved personal Gmail only: `smtp.gmail.com`, port `465`, secure TLS. `MAIL_TEST_MODE=1` uses only `MAIL_TEST_TO`; production `MAIL_TO` is ignored in test mode. Dry-run opens no socket, duplicate weekly sends are prevented, transient pre-acceptance failures have bounded retry, and SMTP uncertainty after `DATA` is not automatically retried. No real address, App Password or production recipient is stored in Git.

## Failure recovery

The cancelled `Market Production Bootstrap #1` run on main `8390a0234fb5d18e28e100ee1ff40750b6b0d95e` completed checkout, Node setup, `npm ci`, code validation, migration and storage check in approximately 14 seconds, then spent the remaining 30-minute ceiling in `Bootstrap public history`. Source diagnosis identified both sequential public-history fetches and per-record Postgres lookup／write round-trips as contributing bottlenecks. The remediation keeps `--period 3y`, adds bounded history concurrency of three capped at four, and replaces the snapshot write path with `POSTGRES_UPSERT_BATCH_SIZE=250` default／500 max parameterized batch upserts.

Each snapshot batch commits independently, preserves `LIVE > FALLBACK > STALE > API_ERROR > NO_DATA`, and leaves prior committed batches durable if a later batch fails. Rerunning the same bootstrap is safe and does not reset or truncate tables. Safe progress reports FX fetch, material X/Y, prepared rows, batch X/Y, committed counters and final elapsed／failure summary without database or Gmail secrets.

Daily and weekly scheduled jobs run only when repository variable `PRODUCTION_SCHEDULES_ENABLED=1`; manual dispatch remains allowed and bootstrap remains dispatch-only. The pre-promotion remediation suite is 43 passed／0 failed; the GitHub-only remediation clone and post-promotion live bootstrap must be completed before certification.

External public API total failure remains visible as `API_ERROR`／`NO_DATA`; partial source failure may remain `SEND_WITH_WARNINGS` when the report contract allows it. Missing `DATABASE_URL`, Neon unavailability, migration failure, invalid payload, query timeout, transaction rollback, quality block, Gmail authentication failure, SMTP timeout, attachment failure and failed mail return non-zero workflow outcomes. `DUPLICATE_PREVENTED` is a safe terminal state. For uncertain SMTP acceptance, inspect the ledger and mailbox before an owner-approved resend; do not retry automatically.

GitHub scheduled workflows may be delayed and are not real-time guarantees. Public repositories may have scheduled workflows disabled after extended inactivity. Use `workflow_dispatch` for manual recovery and do not create artificial commits to hide inactivity.

## Validation contract

Run the local gates from a clean checkout:

```bash
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run db:migrate
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:storage-check
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:bootstrap -- --period 3y
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:daily
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:weekly -- --dry-run --send
```

The offline suite must use deterministic fakes and must not require a real Neon account. It covers migration idempotence, schema command contract, filesystem／Postgres parity, uniqueness, quality-preserving upsert, ledger, metadata, job state, database failure, rollback, missing URL, all three workflow source contracts, Gmail dry-run, test-recipient redirect and duplicate send, batch boundaries, 1,000／3,000-record query bounds, all status pairs, chunk rollback, resumable rerun, bounded history concurrency and safe bootstrap progress. The latest remediation suite is 43 passed／0 failed.

Final delivery for this remediation must clone only from GitHub using `fix/bootstrap-performance-v1`, rerun all gates and leave the clone clean. The prior zero-cost main clone evidence (38 tests) is historical; this remediation requires a new 43-test clone before promotion, followed by one owner-approved manual bootstrap on promoted main. No Manus-only files, local caches, owner secrets, real mail or paid backup service may be required.

## External configuration required

The allowed remaining external states are `EXTERNAL_CONFIGURATION_REQUIRED` for an owner-approved Neon Free project／`DATABASE_URL`, Gmail Actions secrets, `MAIL_TEST_TO`, first live test send and GitHub Actions activation. These are not offline implementation gaps. The task does not create the Neon project, read／print／rotate the configured secrets, send real mail or activate schedules. The owner-approved code promotion is complete; runtime activation remains external.

**Explicit next human action after the bootstrap remediation is certified:** run exactly one `Market Weekly Intelligence Report` manually while `WEEKLY_MAIL_TEST_MODE=1`, verify the received Gmail HTML report and XLSX attachment, then set `PRODUCTION_SCHEDULES_ENABLED=1`. During this remediation, trigger only `Market Production Bootstrap` on promoted `main`; do not trigger the weekly workflow and do not send email.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/weekly-market-intelligence-production-ready-v1 "Starting production-ready checkpoint"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/feat/zero-cost-runtime-v1 "Zero-cost runtime feature branch"
[3]: https://github.com/ggyin0628-code/blob/feat/zero-cost-runtime-v1/docs/POSTGRES_STORAGE.md "PostgreSQL storage contract"
[4]: https://github.com/ggyin0628-code/blob/feat/zero-cost-runtime-v1/docs/GITHUB_ACTIONS_OPERATIONS.md "GitHub Actions operations runbook"
