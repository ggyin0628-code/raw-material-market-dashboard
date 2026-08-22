# Zero-Cost Production Runtime V1

## Architecture

> **EXTERNAL PUBLIC MARKET INTELLIGENCE AND PURCHASING REFERENCE PLATFORM**

The production runtime stores only external public market observations and derived public-market reference reports. The intended zero-cost runtime is:

```text
Public market APIs
    ↓
GitHub Actions daily／weekly workflows
    ↓
Node.js weekly runtime
    ↓
PostgreSQL storage adapter
    ↓
Neon-compatible PostgreSQL
    ↓
Gmail SMTP to owner-approved personal recipient
```

Render Free remains optional web/dashboard hosting. It serves the dashboard and reads the same PostgreSQL-backed public history when `STORAGE_PROVIDER=postgres`; it has no scheduled SMTP responsibility and does not use its local filesystem for durable data.

## Provider boundary

`STORAGE_PROVIDER=filesystem` is the local development and deterministic-test adapter. `STORAGE_PROVIDER=postgres` is the external durable production adapter. Both providers expose the same snapshot, ledger, metadata and job-state contract to the existing weekly analytics and report code. Analytics is not duplicated between providers: storage returns canonical records, and `buildWeeklyReport` performs the same deterministic calculations.

Postgres production is selected through environment configuration only:

| Variable | Meaning |
| --- | --- |
| `STORAGE_PROVIDER` | `filesystem` or `postgres` |
| `DATABASE_URL` | Secret-managed standard PostgreSQL connection string; never committed or logged |
| `DATABASE_SSL` | Optional SSL flag; Neon URLs are treated as SSL-capable by default |
| `DB_POOL_MAX` | Short-lived job pool size, clamped to a small bounded value |
| `DB_CONNECTION_TIMEOUT_MS` | Bounded connection timeout |
| `DB_QUERY_TIMEOUT_MS` | Bounded query timeout |

When Postgres is selected without `DATABASE_URL`, production commands fail closed with `DATABASE_URL_REQUIRED`. A configured URL is never returned by `/health/weekly`, CLI status, logs or backup metadata.

## Runtime stages

The owner first creates or selects an owner-approved free PostgreSQL project, configures `DATABASE_URL` and optional non-secret database variables as GitHub Actions secrets／variables, then runs the manual daily or weekly workflow. The workflow performs `npm ci`, code validation, idempotent `db:migrate`, storage check and the requested public-data job. The first weekly live run must use `MAIL_TEST_MODE=1` and `MAIL_TEST_TO`; production-recipient mode remains disabled until the owner verifies the received attachment.

`production:bootstrap` runs migration, provider-supported public-history backfill, validation and a first completed-week report without sending email. `production:daily` persists one public snapshot per configured material and FX observation. `production:weekly` generates JSON／HTML／XLSX, evaluates the quality gate and sends only when the report is not blocked. Every workflow is safe to rerun because snapshot identity is `material_id + observation_date` and delivery identity is `reporting_week`.

## Failure and recovery posture

A missing database URL, failed migration, unavailable database, invalid public payload, transaction rollback, quality-blocked report, missing SMTP configuration, Gmail authentication failure, timeout, attachment failure or duplicate weekly send produces an explicit state. Partial public-source failures may produce `SEND_WITH_WARNINGS` when the report contract permits; materially unusable data produces `SEND_BLOCKED` and no SMTP attempt. The owner uses `workflow_dispatch` for manual recovery rather than creating artificial commits or silently fabricating market data.

## Permanent product boundary

This runtime must not add SAP, company procurement history, supplier quotations or names, company target prices, private thresholds, inventory, MOQ, payment terms, company email systems, private mappings or credentials. The next functional expansion is external machining／sheet-metal public market reference intelligence using external public sources only.
