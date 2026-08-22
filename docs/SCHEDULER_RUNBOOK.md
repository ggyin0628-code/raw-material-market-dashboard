# Scheduler Runbook

## Operating boundary

Scheduler only runs public external market intelligence jobs. It does not read or write SAP, company purchase history, supplier quotes, private thresholds, inventory, MOQ, payment terms or private credentials. No production scheduler is activated by this repository task.

## Timezone contract

All business dates and completed-week calculations use `Asia/Taipei` (UTC+08:00). Taiwan has no daylight-saving transition, so the UTC conversion is deterministic year-round.

| Job | Taiwan time | UTC equivalent | Cron expression in UTC | Purpose |
| --- | --- | --- | --- | --- |
| Daily snapshot | Monday–Friday 18:30 | Monday–Friday 10:30 | `30 10 * * 1-5` | Collect after the practical public-market data window; exchange close timing still varies |
| Weekly report／send | Monday 09:30 | Monday 01:30 | `30 1 * * 1` | Report the completed prior Monday–Sunday week |
| Bootstrap | One-time owner action | One-time owner action | Not recurring | Backfill public history, validate and create first weekly artifacts |
| Backup | Owner policy | Owner policy | Not prescribed | Copy public snapshot, metadata and ledger to approved durable backup |

If a scheduler supports a timezone field, use `Asia/Taipei` and the Taiwan-time expressions directly. If it accepts UTC only, use the expressions above. Do not rely on server-local timezone. Do not use a daily schedule at or before midnight Taiwan time because the provider date may still represent the prior market session.

## Required command order

### One-time bootstrap

```sh
npm run production:storage-check
npm run production:bootstrap -- --period 3y
npm run production:status
```

Bootstrap must stop at `STORAGE_CONFIGURATION_REQUIRED` when persistent storage is not configured. It is idempotent: rerunning it uses `materialId + date` identities, keeps better same-day quality and leaves missing provider dates absent.

### Daily job

```sh
npm run production:storage-check
npm run production:daily
npm run production:status
```

The daily command collects all configured indicators and FX, persists one valid identity per indicator/date, preserves partial failure states, and records the compact outcome in job state. A process-level error must return a non-zero exit; a provider-level error remains visible in rows and does not erase successful rows.

### Weekly job

```sh
npm run production:storage-check
npm run production:weekly -- --dry-run --send
# After owner-approved Stage C/D only:
npm run production:weekly -- --send
npm run production:status
```

The weekly command determines the completed prior week in `Asia/Taipei`, loads only fresh `LIVE`／`FALLBACK` values for calculations, evaluates `SEND_OK`／`SEND_WITH_WARNINGS`／`SEND_BLOCKED`, creates HTML and XLSX before any email attempt, then records mail state. It must never report the partial current week as the default weekly report.

## Readiness gate

The scheduler must treat these outcomes as stop conditions: `STORAGE_CONFIGURATION_REQUIRED`, `REPORT_QUALITY_BLOCKED`, `SEND_BLOCKED`, malformed SMTP configuration, missing persistent ledger, corrupted snapshot／metadata JSON, or non-zero process exit. `SEND_WITH_WARNINGS` is deliverable only when the report remains materially usable; its warnings must remain visible in the HTML and XLSX.

## Rerun policy

A scheduler rerun for the same reporting week is safe before delivery when it remains `DRY_RUN`. After `SENT` or `TEST_SENT`, the duplicate guard returns `DUPLICATE_PREVENTED`. Legitimate resend requires owner approval plus `ALLOW_WEEKLY_RESEND=1` and explicit `--allow-resend`; it must not be implemented by deleting arbitrary ledger files.

If a daily job is rerun on the same Taiwan date, the snapshot ledger deduplicates by material/date and retains the higher-quality observation. If a weekly job is interrupted, inspect `/health/weekly`, `production:status` and the delivery ledger before restarting. An uncertain SMTP response after DATA submission must not be retried automatically.

## Scheduler activation checklist

1. Owner provides and validates a durable storage mount.
2. `production:storage-check` returns `DURABLE_CONFIGURED`.
3. Public-history bootstrap completes or returns an explicitly reviewed warning state.
4. Daily job runs successfully and `/health/weekly` records a last successful snapshot.
5. Weekly dry-run generates valid JSON／HTML／XLSX and does not open SMTP.
6. SMTP test-recipient live verification passes.
7. Approved production recipients are configured and one controlled send passes.
8. Only then is the external scheduler enabled.

## References

- [`PRODUCTION_ACTIVATION.md`](PRODUCTION_ACTIVATION.md)
- [`PRODUCTION_STORAGE.md`](PRODUCTION_STORAGE.md)
- [`EMAIL_DELIVERY.md`](EMAIL_DELIVERY.md)
- [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md)
