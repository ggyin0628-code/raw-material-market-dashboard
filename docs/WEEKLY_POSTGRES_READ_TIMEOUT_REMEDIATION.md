# Weekly PostgreSQL Snapshot Read Timeout Remediation

## Incident and root cause

The scheduled weekly report failed during report generation with `DATABASE_READ_FAILED` and a PostgreSQL query read timeout. Email sending was not reached. The pre-remediation path was `loadAndBuildWeeklyReport()` → `listSnapshots()` → `SELECT payload FROM market_snapshots ORDER BY material_id, observation_date`, without `WHERE` bounds. This caused every weekly report to read the complete JSONB snapshot table before Node performed analytics filtering.

The database adapter already bounded statement and connection timeout settings at a default of 8,000 ms and a maximum of 30,000 ms. This remediation does not increase those limits. The fix is query bounding, not timeout masking.

## Bounded historical range

Weekly report loading now derives the report period first and passes explicit `from` and `to` values into `listSnapshots()`. `to` is the reporting week end. `from` is the earlier of the report-year YTD start and `reportingWeek.end - 784 days`, where 784 equals the 364-day 52-week comparison target plus the existing 420-day maximum comparison gap.

For example, `2026-W33` resolves to `from=2024-06-23` and `to=2026-08-16`. This conservative range covers the current week, weekly, four-week, three-month, YTD, 52-week and rolling-volatility requirements. The report's XLSX history sheet remains correct because its existing presentation filter is applied to the already bounded records and requires only the prior calendar-year history.

The PostgreSQL query is now structurally:

```sql
SELECT payload
FROM market_snapshots
WHERE observation_date >= $1
  AND observation_date <= $2
ORDER BY material_id, observation_date
```

The application does not fetch the full table and filter only in Node.

## Index and timeout decision

The existing `market_snapshots_date_idx` index on `observation_date` supports the new range predicate. The composite primary key on `(material_id, observation_date)` remains available for identity and conflict operations. No new index was added because deterministic migration assertions confirm the existing date index and the bounded query is explicit.

The query timeout policy remains unchanged: default 8,000 ms, clamped to a maximum of 30,000 ms. The incident is addressed through a bounded read while preserving fail-closed behavior for genuinely unavailable or stuck database reads.

## Regression coverage

The regression suite now proves that weekly storage reads receive explicit `from` and `to` bounds, no unbounded weekly snapshot query remains in the report path, and the conservative range preserves weekly, four-week, three-month, YTD, 52-week and volatility inputs. It also verifies XLSX history row preservation, `DATABASE_READ_FAILED` propagation, zero mail attempts when report generation fails, and the normal successful weekly report mail path using a deterministic injected sender.

All tests use synthetic public fixtures only. No production workflow, migration, bootstrap, backfill, mail resend, schedule, credential, Neon data, or private company data operation is part of this remediation.

## Delivery boundary

This work is limited to feature branch `fix/weekly-postgres-read-timeout-v1` and must stop before main promotion. The failed weekly email must not be resent by this change.
