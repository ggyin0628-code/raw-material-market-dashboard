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

## Production recovery certification — 2026-W35

**WEEKLY_POSTGRES_BOUNDED_READ_PRODUCTION_RECOVERY_PASS**

The approved feature head `366ad99784bcaf19f588ae0930875f6f032af2f5` was promoted to `main` by pure fast-forward after the required lineage and full-gate checks. The existing Render deployment remained the only deployment path. Read-only production certification passed for the public routes and product boundaries before recovery.

The production W35 report endpoint completed successfully with `HTTP 200` and no `DATABASE_READ_FAILED`. The report identified `reportingWeek=2026-W35`, period `2026-08-24` through `2026-08-30` in `Asia/Taipei`, 14 indicators, 6,261 history rows, and quality gate `SEND_OK` with `readyForDelivery=true`. The bounded report request completed in **13.877676 seconds**. The XLSX export also returned `HTTP 200` in **16.778032 seconds**, with a valid ZIP/XLSX signature and size 433,436 bytes.

For this W35 report, `from` is `2024-07-07` and `to` is `2026-08-30`: the earlier of the 2026 YTD start (`2026-01-01`) and `2026-08-30 - 784 days` (`2024-07-07`), through the reporting week end. This preserves weekly, four-week, three-month, YTD, 52-week, rolling-volatility and XLSX history requirements without raising the 8,000 ms default query timeout.

Before recovery, the public durable job state showed `weeklyReport.state=FAILED`, `reportingWeek=2026-W35`, `lastError=Postgres snapshot query failed：Query read timeout`, and `lastSuccessfulAt=2026-08-24T02:39:21.582Z`, which predates W35. The failed incident therefore had no successful W35 delivery record. The separate `weeklyMail` successful state was for W34, not W35. No `SENT` or `TEST_SENT` ledger state for W35 was present before the recovery attempt.

The only recovery run was GitHub Actions run [33600925979](https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/33600925979). It ran on main SHA `366ad99784bcaf19f588ae0930875f6f032af2f5`, completed successfully, generated `weekly-market-intelligence-2026-W35.html`, `.json` and `.xlsx`, and recorded `reportingWeek=2026-W35`, `qualityGate=SEND_OK`, and `mailState=TEST_SENT`. The post-send public state recorded `weeklyMail.state=TEST_SENT`, `reportingWeek=2026-W35`, `sent=true`, `lastSuccessfulAt=2026-09-02T06:54:25.070Z`, while `weeklyReport.state=SEND_OK` recorded the same W35 artifacts. This proves exactly one successful recovery email in the existing test-mode recipient path; no second recovery or test email was sent.

The next normal daily/weekly schedules, `PRODUCTION_SCHEDULES_ENABLED`, `WEEKLY_MAIL_TEST_MODE`, recipients, credentials, database configuration and mail configuration were not modified. No bootstrap, backfill, migration-only operation, manual database mutation or unrelated workflow was run. The code and report path remain fail-closed if a future bounded read fails or the quality gate returns `SEND_BLOCKED`.

## Delivery boundary

This remediation and recovery are complete on main at the promoted code checkpoint. No further recovery, duplicate send, test email, daily run or manual next-week weekly run is authorized by this change. The next weekly report must use the unchanged normal schedule under the bounded PostgreSQL read implementation.
