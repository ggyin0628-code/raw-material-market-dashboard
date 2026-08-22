# Scheduler Runbook

## Recommended operating contract

The intended schedule is **Monday morning in `Asia/Taipei`**, reporting on the completed prior Monday–Sunday week. The external scheduler must pass an explicit timezone rather than relying on the host default. A live production cron is not created or activated by this task.

| Job | Recommended timing | Command | Purpose |
| --- | --- | --- | --- |
| Daily public snapshot | Every market day after the relevant close | `npm run daily:snapshot` | Persist one public snapshot per material and FX |
| Public history backfill | Initial setup or approved maintenance window | `npm run weekly:backfill -- --period 3y` | Fill provider-supported historical dates idempotently |
| Weekly report | Monday morning, Asia/Taipei | `npm run weekly:report -- --week YYYY-Www --out-dir data/weekly-reports` | Generate canonical JSON／HTML／XLSX |
| Weekly dry-run | Before enabling live mail | `DRY_RUN=1 npm run weekly:send -- --week YYYY-Www --dry-run` | Validate artifacts, recipients and configuration without sending |
| Weekly live send | After owner approval and SMTP setup | `npm run weekly:send -- --week YYYY-Www` | Deliver one report, with duplicate-week prevention |

The daily job should run before the weekly job has to render the completed week. If an external scheduler invokes the weekly command without a `--week`, the CLI derives the completed prior week from the current time in `Asia/Taipei`.

## Scheduler examples

A Render Cron-style job can run `npm run weekly:send -- --dry-run` first while `DRY_RUN=1` is set in the service environment. The production schedule should be expressed with an explicit timezone and an owner-approved command, for example:

```text
Timezone: Asia/Taipei
Schedule: Monday 09:00
Command: npm run weekly:send -- --dry-run
```

Replace `--dry-run` only after SMTP variables, approved recipients, persistent storage and monitoring have been reviewed. No scheduler should store secrets in command-line arguments; use environment variables managed by the hosting platform.

## Required environment and storage

The service requires network access to the configured public providers. `MARKET_SNAPSHOT_FILE` must point to a persistent mounted location if data must survive instance replacement. The weekly delivery ledger should use `WEEKLY_DELIVERY_LEDGER` on the same persistent boundary. The repository defaults under `data/` are suitable for local development and controlled tests but are not proof of persistence on an ephemeral deployment filesystem.

SMTP live delivery additionally requires `MAIL_ENABLED`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` and `MAIL_TO`. The dry-run command is safe when these are absent: it reports configuration shape and does not connect. Never commit values for these variables.

## Backfill procedure

Run backfill from a controlled maintenance job with an explicit period such as `1y`, `2y` or `3y`. It uses only provider-returned history, is idempotent by `materialId + date`, preserves source and status, and leaves missing market days absent. A material failure is returned in the result summary and does not fabricate a replacement observation. If FX history is unavailable, commodity history can still be retained with null TWD references and an explicit FX error status.

## Recovery and troubleshooting

If a job exits non-zero, inspect the command result and redacted application log. `API_ERROR` identifies a provider or normalization failure; `STALE` identifies a real older snapshot and is not fresh. Re-running daily snapshot or backfill is safe because same-day or same-date identities are deduplicated and higher-quality records cannot be silently downgraded. If the delivery state is `DUPLICATE_PREVENTED`, review the weekly ledger under approved procedure rather than disabling the guard.

If reports show `DATA_INSUFFICIENT`, verify that the ledger contains enough provider-supported observations for the requested comparison window. Do not fill the gap with interpolated prices or internal purchasing data. If a public provider is unavailable, report the visible source status and wait for the source or owner-approved provider configuration.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/weekly-market-intelligence-v1/lib/weekly/cli.js "Scheduler-compatible weekly commands"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/weekly-market-intelligence-v1/lib/weekly/snapshotStore.js "Persistent snapshot ledger"
[3]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/weekly-market-intelligence-v1/lib/weekly/mailService.js "Delivery ledger and SMTP safety"
