# Production Storage Contract

## Purpose and boundary

This storage boundary persists only external public market observations, public-source provenance, report metadata, job state and delivery state. SAP, company procurement history, supplier quotations or names, inventory, MOQ, payment terms, company target prices, private thresholds, company email data, personal credentials and private runtime reports are permanently excluded.

## Provider modes

| Mode | Configuration | Behavior |
| --- | --- | --- |
| `filesystem` | Default local adapter; production requires an owner-approved absolute durable root | Atomic JSON compatibility path for local development／deterministic tests; not a zero-cost scheduled production source unless the host proves durable filesystem |
| `postgres` | `STORAGE_PROVIDER=postgres` plus secret-managed `DATABASE_URL` | Neon-compatible durable production path for GitHub Actions and optional Render dashboard; no paid persistent filesystem required |

With `STORAGE_PROVIDER=filesystem`, local default `data/` remains useful but must never be called durable across redeploy. In filesystem production mode, missing `PRODUCTION_STORAGE_ROOT` returns `STORAGE_CONFIGURATION_REQUIRED`. With `STORAGE_PROVIDER=postgres`, missing `DATABASE_URL` returns `DATABASE_URL_REQUIRED`. Both are fail-closed states.

## Postgres configuration

```bash
STORAGE_PROVIDER=postgres
DATABASE_URL=<secret-managed-standard-postgresql-url>
DATABASE_SSL=true
DB_POOL_MAX=2
DB_CONNECTION_TIMEOUT_MS=8000
DB_QUERY_TIMEOUT_MS=8000
```

The URL and any password are runtime secrets only. The adapter uses a small bounded pool suitable for short-lived GitHub Actions jobs, bounded connection／query timeouts and SSL support for Neon-compatible endpoints. Status and errors redact credentials.

## Durable schema

`npm run db:migrate` creates missing tables and indexes without dropping, truncating or resetting data:

| Table | Primary key | Content |
| --- | --- | --- |
| `market_snapshots` | `(material_id, observation_date)` | Canonical public market snapshot JSONB, status and collection timestamp |
| `weekly_delivery_ledger` | `reporting_week` | Delivery state JSONB and update timestamp |
| `weekly_report_metadata` | `reporting_week` | Public artifact names, quality summary, period and coverage |
| `weekly_job_state` | `job_name` | Sanitized job state, warnings and quality summary |

`market_snapshots` includes date and status indexes. Snapshot payloads preserve material id／name, symbol, category, exchange, price, unit, currency, valid FX／TWD reference, source, status, source reliability, last trade time, collected time, error and provenance metadata.

## Write guarantees

Snapshot writes use a transaction. Each deterministic identity is locked before comparison. `LIVE` and `FALLBACK` rank above `STALE`, `API_ERROR` and `NO_DATA`, so lower-quality records cannot silently replace better same-identity data. Duplicate identities are upserted rather than inserted twice. Invalid payloads are rejected. Any database or validation error rolls back the batch and returns a non-zero state. Filesystem writes retain the existing temp-file plus atomic-rename guarantee.

Delivery ledger, report metadata and job state use conflict-safe key upserts. The weekly analytics and report implementation is shared across providers; only storage I/O changes. The same fixture data therefore produces deterministic parity results in filesystem and Postgres tests.

## Migration and bootstrap

```bash
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run db:migrate
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:bootstrap -- --period 3y
```

Migration is safe to rerun. Bootstrap runs migration, provider-supported public history backfill, canonical validation, completed prior-week report generation and job-state update without email. It is idempotent and leaves missing provider dates absent.

## Health and backup

`npm run production:storage-check` returns `DATABASE_READY`, `DATABASE_URL_REQUIRED` or `DATABASE_UNAVAILABLE` without returning the URL. `/health/weekly` reports safe readiness states and never exposes paths, URLs, passwords, SMTP credentials or recipient lists.

`npm run production:backup -- --backup-id <owner-approved-id>` writes a lightweight public Postgres export and manifest. The export contains public snapshots, delivery ledger, report metadata and sanitized job state only. No paid backup service is required; provider-supported public re-backfill is the primary recovery source.

## Failure recovery

| Failure | Result | Recovery |
| --- | --- | --- |
| Missing `DATABASE_URL` | `DATABASE_URL_REQUIRED`, exit 2 | Add Actions secret and rerun migration |
| Neon unavailable／connection failure | `DATABASE_UNAVAILABLE`, non-zero | Correct secret／service condition and use manual workflow dispatch |
| Migration failure | `DATABASE_MIGRATION_FAILED`, rollback | Correct schema access and rerun idempotent migration |
| Query timeout／disconnect | Bounded read／write failure | Rerun after transient condition; no fabricated data |
| Invalid JSONB／canonical record | `SNAPSHOT_PAYLOAD_INVALID` or contract error | Reject payload and investigate public provider response |
| Partial batch failure | Transaction rollback | Correct cause and rerun; no partial commit claim |
| Filesystem corruption | Existing `*_INVALID` state | Preserve source, restore public export or re-backfill |

## Render posture

Render Free is optional dashboard hosting. When its environment is configured with `STORAGE_PROVIDER=postgres` and owner-provided `DATABASE_URL`, it can read the same Postgres public history; it does not require a persistent disk. It never owns scheduled SMTP delivery. No Render deployment or paid resource activation is performed by this task.
