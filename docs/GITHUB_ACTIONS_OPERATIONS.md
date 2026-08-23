# GitHub Actions Operations Runbook

## Purpose and boundaries

GitHub Actions is the scheduled runtime for the zero-cost production path. It collects and reports only external public market intelligence. Render Free is not used for scheduled SMTP delivery, and its local filesystem is never the durable source of truth. No workflow in this repository reads SAP, company procurement records, supplier quotations, company target prices, private thresholds, inventory, MOQ, payment terms or company email systems.

## Workflows and schedule

| Workflow | Taiwan schedule | UTC cron | Mail | Schedule gate |
| --- | --- | --- | --- | --- |
| `market-bootstrap.yml` | Manual `workflow_dispatch` only | None | No; mail credentials absent | None |
| `market-daily.yml` | approximately 07:17 Tuesday–Saturday | `17 23 * * 1-5` | No | `PRODUCTION_SCHEDULES_ENABLED=1` |
| `market-weekly.yml` | approximately 09:17 Monday | `17 1 * * 1` | Yes, initially test-recipient only | `PRODUCTION_SCHEDULES_ENABLED=1` |

Taiwan uses UTC+8 without seasonal DST changes. The daily workflow runs after the prior market-day window; the weekly workflow calculates the completed prior Monday–Sunday ISO week and never creates a partial current-week report. Schedules are intentionally not on the hour, but GitHub-hosted schedules are best-effort rather than real-time guarantees. Both scheduled jobs have a job-level guard: manual dispatch is always allowed, while a `schedule` event runs only when the repository variable `PRODUCTION_SCHEDULES_ENABLED` equals `1`; absent or other values safely skip the job. The bootstrap workflow is manual-only and is not gated by this variable.

## Required repository secrets and variables

| Name | Type | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Actions secret | Neon-compatible PostgreSQL connection string |
| `MAIL_USER` | Actions secret | Owner-approved personal Gmail username |
| `MAIL_PASSWORD` | Actions secret | Gmail App Password only; never a normal account password |
| `MAIL_FROM` | Actions secret | Owner-approved sender address |
| `MAIL_TO` | Actions secret | Approved production recipient list, used only after test receipt |
| `MAIL_TEST_TO` | Actions secret | First live verification recipient |
| `WEEKLY_MAIL_TEST_MODE` | Actions variable | Defaults to `1`; set to `0` only after manual receipt and attachment review |

The workflow source contains no real URL, address, password or token. GitHub masks secret values in logs; commands also avoid echoing environment variables. `DATABASE_SSL`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `NODE_ENV` and `STORAGE_PROVIDER` are non-secret workflow environment values.

## Activation sequence

The owner first creates or selects an approved free PostgreSQL project and adds `DATABASE_URL`, Gmail secrets and `MAIL_TEST_TO` in repository settings. The owner runs `market-bootstrap.yml` manually first; it performs `npm ci`, code validation, migration, storage check, a three-year public-history bootstrap and final status, and contains no mail credentials or scheduled trigger. The owner then runs the daily workflow manually or waits for its schedule, confirms `DATABASE_READY` and `DAILY_DATA_READY`, and runs the weekly workflow manually with the default test mode. The received email must be checked for recipient isolation, public-only content, attachment presence and readable HTML/XLSX. Only after that review may the owner set `WEEKLY_MAIL_TEST_MODE=0` and enable the approved production-recipient workflow behavior.

The repository does not activate workflows, create a Neon project, request a Gmail App Password or send a real email during this task. Those are explicit external configuration actions. Keep `PRODUCTION_SCHEDULES_ENABLED` absent or set to `0` until the manual bootstrap and TEST_RECIPIENT review pass; setting it to `1` is the final owner-controlled schedule activation gate.

## Failure behavior and recovery

| Failure | Expected result | Recovery |
| --- | --- | --- |
| Public API total failure | Explicit `API_ERROR`／`NO_DATA`; quality may become `SEND_BLOCKED` | Inspect provider status, rerun manual workflow; never fabricate rows |
| Partial public API failure | Per-row status preserved; may be `SEND_WITH_WARNINGS` | Review coverage and rerun after provider recovery |
| Bootstrap exceeds timeout | `production:bootstrap` step cancelled or non-zero | Inspect progress／step timing; rerun only after remediation using committed batches and safe rerun. Do not lower 3y period or blindly extend timeout. |
| Missing／unavailable Neon | `DATABASE_URL_REQUIRED`／`DATABASE_UNAVAILABLE`, non-zero | Correct Actions secret or service availability, rerun migration and job |
| Migration failure | `DATABASE_MIGRATION_FAILED`, non-zero | Correct permissions/schema access; rerun idempotent migration |
| Quality blocked | `SEND_BLOCKED`, no SMTP attempt, non-zero | Obtain sufficient public observations or accept report as blocked; do not override gate silently |
| Gmail auth failure | `FAILED`, non-zero, redacted ledger state | Recheck owner Gmail App Password and sender; rerun test mode only |
| SMTP timeout before acceptance | Bounded transient retry, then `FAILED` | Rerun after connectivity review |
| SMTP disconnect after `DATA` | No automatic retry because acceptance is uncertain | Inspect delivery ledger／mailbox before owner-approved resend |
| Attachment failure | `FAILED`, no successful send state | Regenerate report artifacts and rerun controlled test |
| Duplicate weekly send | `DUPLICATE_PREVENTED` | Use owner-approved resend flag only after reviewing existing state |

The workflow exit is non-zero for database failure, migration failure, quality block, attachment failure and `FAILED` mail. A permitted `SEND_WITH_WARNINGS` report can complete, but its warning state remains in job state and the report. Bootstrap progress records material／batch counters, fetched rows, inserted／replaced／ignored counts, API-error materials and elapsed time without secret values.

## Manual checks

Use the Actions UI `workflow_dispatch` trigger after verifying the intended branch and secret configuration. The required first manual trigger is `Market Production Bootstrap`; it must complete before daily／weekly operation. After a successful bootstrap, the owner may use `workflow_dispatch` for daily／weekly recovery. From a checked-out environment, the corresponding safe checks are:

```bash
npm ci
npm run check
npm run db:migrate
npm run production:storage-check
npm run production:status
npm run production:daily
npm run production:weekly -- --dry-run --send
```

Never paste a real `DATABASE_URL`, Gmail App Password or personal recipient into a shell command that may be captured. Use secret-managed environment injection only.

## GitHub schedule limitations

GitHub schedule runs can be delayed and are not real-time guarantees. Public repositories may have scheduled workflows disabled after extended repository inactivity. `workflow_dispatch` remains the manual recovery path. Do not create artificial commits merely to conceal inactivity; use the workflow UI and documented manual procedure instead.
