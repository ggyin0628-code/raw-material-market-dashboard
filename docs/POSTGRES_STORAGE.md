# PostgreSQL Storage Contract

## Scope

This document defines the `STORAGE_PROVIDER=postgres` adapter for the external public-market intelligence product. The adapter is Neon-compatible standard PostgreSQL and is intended for short-lived GitHub Actions jobs. The existing filesystem adapter remains the local／test compatibility path.

## Configuration and redaction

Production PostgreSQL is configured only through environment variables. `DATABASE_URL` is required and must be supplied through a secret manager or GitHub Actions repository secret. `DATABASE_SSL=true` is supported; Neon-style hosts are treated as SSL-capable. Pool size, connection timeout and query timeout are bounded in code. The application never prints the URL, password, SMTP credentials or recipient lists. Status and errors expose only states such as `DATABASE_READY`, `DATABASE_URL_REQUIRED`, `DATABASE_UNAVAILABLE` or `DATABASE_MIGRATION_FAILED`.

## Schema

`npm run db:migrate` creates the smallest non-destructive schema and indexes. It may be executed repeatedly and does not drop or truncate data.

| Table | Primary key | Stored payload |
| --- | --- | --- |
| `market_snapshots` | `(material_id, observation_date)` | Canonical public snapshot JSONB, status and collected timestamp |
| `weekly_delivery_ledger` | `reporting_week` | Delivery state JSONB and update timestamp |
| `weekly_report_metadata` | `reporting_week` | Public artifact names, quality summary, coverage and report period |
| `weekly_job_state` | `job_name` | Sanitized operational state, warnings and quality summary |

`market_snapshots` has date and status indexes. Snapshot JSONB preserves material id／name, symbol, category, exchange, date, price, source unit, currency, valid FX／TWD reference, source, canonical status, source reliability, last trade time, collected time, error and provenance metadata.

## Transaction and upsert semantics

Snapshot writes run in a transaction. Each row is locked by its deterministic identity before comparison. A higher-quality `LIVE` or `FALLBACK` row cannot be silently replaced by a lower-quality `STALE`, `NO_DATA` or `API_ERROR` row. Equal-status writes use collected time as the deterministic tie-breaker. A duplicate identity is never inserted as a second row. Any validation or database failure rolls back the whole transaction and returns an explicit non-zero failure state.

The report and analytics layer consumes the same canonical record shape for both filesystem and PostgreSQL providers. Therefore weekly change windows, volatility, signals, quality summaries and rendered artifacts use one implementation and are parity-tested with the same fixture data.

## Migration and bootstrap

The safe sequence is:

```bash
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run db:migrate
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:bootstrap -- --period 3y
```

Migration creates missing tables and indexes only. Bootstrap performs migration, provider-supported public history backfill, snapshot validation, completed-week report generation and job-state update. It does not send email and is safe to rerun.

## Failure states and recovery

| Failure | State／behavior | Recovery |
| --- | --- | --- |
| Missing `DATABASE_URL` | `DATABASE_URL_REQUIRED`, exit 2 | Add secret-managed URL; do not place it in source |
| Database cannot connect | `DATABASE_UNAVAILABLE`, non-zero | Check Neon availability／secret, rerun manual workflow |
| Migration statement fails | `DATABASE_MIGRATION_FAILED`, transaction rollback | Inspect safe error, correct schema access, rerun migration |
| Query timeout or disconnect | bounded `DATABASE_READ_FAILED`／`DATABASE_WRITE_FAILED` | Rerun workflow; no infinite retry or fabricated data |
| Invalid JSONB／canonical row | `SNAPSHOT_PAYLOAD_INVALID` or corresponding contract error | Reject payload and investigate provider response |
| Partial batch failure | transaction rollback; no partial Postgres commit | Rerun idempotent job after cause is resolved |
| Corrupted filesystem adapter data | existing `*_INVALID` state | Restore from public export or use provider re-backfill |

## Public export

`npm run production:backup -- --backup-id <id>` writes a lightweight public export／manifest for PostgreSQL mode. The export includes only public snapshots, weekly delivery ledger, public report metadata and sanitized job state. It does not require a paid backup service. Provider-supported re-backfill remains the recovery source of truth because the stored market data is reproducible public information.

## Security boundary

Do not commit a real `DATABASE_URL`, Neon credential, Gmail App Password, personal address unless owner-approved for runtime configuration, company data, supplier data or generated private runtime reports. This repository is public and the product remains external public market intelligence and purchasing reference only.
