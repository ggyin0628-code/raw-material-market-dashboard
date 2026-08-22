# Zero-Cost Production Activation

## Verdict semantics

`ZERO_COST_RUNTIME_READY` means the provider boundary, Postgres adapter, migration, Actions workflows, quality gate, Gmail safety, observability, recovery documentation and offline validation are complete. It does not mean that an owner-approved Neon project, GitHub Actions secrets, Gmail App Password, personal recipient or workflow activation has been supplied during this task.

| State | Meaning | Runtime behavior |
| --- | --- | --- |
| `DATABASE_URL_REQUIRED` | Postgres selected without secret-managed URL | Database jobs fail closed with non-zero exit |
| `DATABASE_UNAVAILABLE` | Postgres cannot be reached | Workflow stops; no fabricated data or mail |
| `DATABASE_READY` | Postgres health check succeeds | Migration／jobs may continue |
| `SEND_OK` | Report quality and artifacts are complete | Mail may proceed in the approved stage |
| `SEND_WITH_WARNINGS` | Report usable but contains visible quality warnings | Mail may proceed; warnings stay in report／job state |
| `SEND_BLOCKED` | No usable report, usable ratio below gate or artifact failure | No SMTP attempt; non-zero workflow |
| `EXTERNAL_CONFIGURATION_REQUIRED` | Owner runtime configuration has not been supplied | Offline code is complete; owner action remains |

## Target architecture

```text
Public market APIs → GitHub Actions → Node.js runtime → Postgres adapter → Neon-compatible PostgreSQL
                                                            ↓
                                                  Gmail personal SMTP
```

Render Free remains optional dashboard hosting only. It does not provide durable local storage and does not run scheduled SMTP. `STORAGE_PROVIDER=filesystem` remains local／test compatibility; `STORAGE_PROVIDER=postgres` is the zero-cost production path.

## Stage 0 — owner configuration review

The owner creates or selects an owner-approved free PostgreSQL project and adds `DATABASE_URL` as a GitHub Actions secret. Add `MAIL_USER`, `MAIL_PASSWORD` as a Gmail App Password, `MAIL_FROM`, `MAIL_TO` and `MAIL_TEST_TO` as Actions secrets. Keep the repository variable `WEEKLY_MAIL_TEST_MODE=1`. No secret belongs in source, issue text, logs or committed configuration.

The intended Gmail runtime is `smtp.gmail.com`, port `465`, secure TLS. Do not use a company email system or Microsoft Graph. The product boundary remains external public market intelligence and purchasing reference only.

## Stage 1 — database migration and bootstrap

Run the manual workflow or an owner-controlled checkout with secret injection:

```bash
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run db:migrate
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:storage-check
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:bootstrap -- --period 3y
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:status
```

Migration is idempotent and non-destructive. Bootstrap performs migration, provider-supported public history backfill, canonical validation, completed prior-week report generation and job-state update without email. Snapshot identity remains `material_id + observation_date`; missing dates remain missing and source failures remain visible.

## Stage 2 — daily workflow

Run `.github/workflows/market-daily.yml` by manual dispatch first. It installs locked dependencies, validates source, migrates schema, checks database readiness, captures public daily data and validates status. It does not invoke the mail command. A database or process failure is non-zero; partial public-source failures remain explicit per row.

The scheduled daily expression is `17 23 * * 1-5` UTC, approximately 07:17 Tuesday–Saturday in Taiwan. GitHub schedule is best-effort and may be delayed; use manual dispatch for recovery.

## Stage 3 — weekly dry-run

Run the weekly workflow in its default test-mode configuration or execute:

```bash
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" DRY_RUN=1 npm run production:weekly -- --dry-run --send
```

The runtime calculates only the completed prior Monday–Sunday week in `Asia/Taipei`, generates JSON／HTML／XLSX, evaluates the quality gate, writes `DRY_RUN` to the durable ledger and returns `sent: false`. No SMTP socket is opened. Confirm tracked count, usable count, source/status coverage, FX availability, warnings and artifact integrity.

## Stage 4 — live TEST_RECIPIENT

Keep `WEEKLY_MAIL_TEST_MODE=1` and configure `MAIL_TEST_TO` to the owner-approved personal test recipient. Run one manual weekly workflow with no `--dry-run`. In test mode, production `MAIL_TO`, CC and Reply-To are not forwarded. Do not run this live test from Manus; use the owner-controlled GitHub Actions workflow.

Review the received email subject `採購市場情報週報｜YYYY-Www`, sender, recipient, public-only content, HTML at desktop and narrow/mobile widths, XLSX attachment, timestamps, source labels, warnings and disclaimer. If any item fails, keep test mode enabled and recover through manual workflow dispatch.

## Stage 5 — approved production recipients

Only after manual receipt and attachment review pass may the owner set `WEEKLY_MAIL_TEST_MODE=0` and use the approved personal `MAIL_TO`. Run one explicitly approved completed-week send. The Postgres delivery ledger and duplicate guard remain active. Uncertain SMTP acceptance after `DATA` requires mailbox／ledger review before any resend.

## Stage 6 — scheduled workflow activation

After the controlled production-recipient send passes, the owner may rely on the weekly schedule `17 1 * * 1` UTC, approximately Monday 09:17 Asia/Taipei. The workflow performs migration, storage check, quality-gated report generation, Gmail delivery and final status validation. It stops on database failure, `SEND_BLOCKED`, attachment failure, failed SMTP or any other materially unsuccessful state.

## Recovery and non-destructive behavior

Migration uses non-destructive create-if-missing operations. Transactional Postgres snapshot upsert rolls back on batch failure. Provider re-backfill and public Postgres export are the recovery sources of truth. Filesystem adapter corruption remains explicit and does not silently become valid data. Delivery duplicate protection remains keyed by reporting week. There is no paid backup requirement.

## Required final human action

Create the owner-approved Neon Free project, configure `DATABASE_URL` and Gmail credentials only as GitHub Actions secrets, run the manual bootstrap workflow, execute one `MAIL_TEST_MODE=1` live weekly send to the approved personal recipient, verify receipt and attachment, then enable scheduled daily and weekly workflows.
