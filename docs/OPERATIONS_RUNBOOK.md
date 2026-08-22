# Operations Runbook

## Scope and safety

This service is permanently limited to external public market intelligence and procurement reference context. It is not a procurement system and must never ingest SAP, private purchasing data, supplier names or quotations, inventory, MOQ, payment terms, company target prices, private thresholds, credentials or private runtime reports.

## Safe observability

Use these read-only checks:

```sh
npm run production:storage-check
npm run production:status
curl -i https://<host>/health/weekly
```

`/health/weekly` returns a sanitized summary containing readiness state, storage state, current completed-week label, last job state, coverage/status counts and warnings. It must not expose absolute filesystem paths, environment variable values, SMTP host credentials, sender, recipients, message body or stack traces. Expected unconfigured production response is HTTP 503 with `STORAGE_CONFIGURATION_REQUIRED`. A synthetic durable-root test response is HTTP 200 only when the root is configured and accessible.

## Failure matrix and recovery

| Failure | Expected state | Recovery | Do not do |
| --- | --- | --- | --- |
| No durable root in production | `STORAGE_CONFIGURATION_REQUIRED` | Configure owner-approved persistent mount, rerun storage check, then bootstrap if needed | Do not treat Render free filesystem as durable; do not activate scheduler |
| Storage permission／mount failure | `STORAGE_CONFIGURATION_REQUIRED` or non-zero exit | Fix mount ownership/permissions, preserve existing files, rerun check | Do not change to repository `data/` in production |
| Corrupt snapshot JSON | `SNAPSHOT_STORE_INVALID` | Preserve original, inspect last backup, restore public-only backup, rerun status and quality checks | Do not silently reset ledger or fabricate values |
| Corrupt report／job metadata | `*_INVALID` or non-zero exit | Preserve artifact, restore matching public-only metadata backup, rerun the interrupted job in dry-run | Do not mark `SENT` manually |
| Provider timeout / HTTP failure | Row-level `API_ERROR`, `NO_DATA` or `STALE` | Retry only within bounded policy; rerun daily/backfill if safe; keep visible source status | Do not invent a date, price, FX or Taiwan spot value |
| Partial daily failure | Successful rows retained; failed rows visible | Review coverage and rerun; same `materialId + date` identity is idempotent | Do not delete successful rows |
| Weekly insufficient data | `SEND_BLOCKED` | Obtain more provider-supported public history or wait for provider recovery; rerun dry-run | Do not interpolate or import private procurement data |
| Weekly degraded but usable | `SEND_WITH_WARNINGS` | Review warning list and approve delivery if appropriate | Do not hide warning status |
| Missing or malformed SMTP config | `FAILED` before socket | Correct environment-only config; run dry-run first | Do not put secrets in Git or command-line args |
| SMTP auth／permission failure | `FAILED`, non-transient | Fix approved account/sender authorization; repeat test mode | Do not retry blindly |
| SMTP pre-DATA timeout | `FAILED`, transient eligible | Fix network/provider issue; retry once approved | Do not exceed bounded retry policy |
| SMTP timeout after DATA | `FAILED` with uncertain acceptance | Check provider logs and recipient mailbox; owner decides whether resend is safe | Do not automatic retry; duplicate risk exists |
| Duplicate week | `DUPLICATE_PREVENTED` | Confirm ledger and owner-approved resend process | Do not delete ledger entry |
| Backup failure | non-zero exit | Fix destination mount/permissions; rerun and verify manifest | Do not claim backup exists without manifest |

## Backup and restoration

Run:

```sh
npm run production:backup -- --backup-id <owner-approved-id>
```

A backup must include snapshot ledger, delivery ledger, report metadata and a manifest with safe file names, sizes and timestamps. Keep backups in an approved durable location with access control. Restore only public-market data and operational metadata from a known-good backup, preserve the damaged source files for investigation, then run `production:storage-check`, `production:status`, weekly dry-run and duplicate review before any live send.

## Quality gate operations

The gate counts tracked indicators and classifies rows as usable (`LIVE`／`FALLBACK`), `STALE`, `API_ERROR`, `NO_DATA`, plus insufficient history and missing FX. It blocks when there is no usable data, usable ratio is below 50%, or required report artifacts are incomplete. Otherwise it returns `SEND_OK` for clean coverage or `SEND_WITH_WARNINGS` when the report is usable but degraded. Quality warnings remain in JSON／HTML／XLSX and are never removed merely to pass.

## Daily incident procedure

First capture the safe command output and timestamp. Check storage readiness, job state, row status counts and provider error summaries. If storage is healthy, rerun daily once; the atomic identity merge preserves prior successes. If the provider is unavailable, leave the explicit error status and allow the next scheduled window. If storage is unhealthy, fix the persistent mount before any rerun.

## Weekly incident procedure

Do not send on an unknown or partial week. Start with `production:status`, inspect the completed-week label and delivery state, then execute a dry-run. If artifacts are valid but mail fails, preserve them and correct SMTP without regenerating private content. For uncertain acceptance, wait for owner confirmation. For duplicate prevention, require `ALLOW_WEEKLY_RESEND=1` plus explicit `--allow-resend`; document the reason outside the repository.

## Owner activation handoff

The explicit next human action is: **configure approved persistent storage and SMTP environment variables; perform TEST_RECIPIENT live email verification; then enable the weekly scheduler.** The next functional expansion remains external machining／sheet-metal market reference intelligence from public sources only.
