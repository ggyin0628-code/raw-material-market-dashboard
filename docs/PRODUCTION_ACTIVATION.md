# Production Activation

## Verdict semantics

`BOOTSTRAP_PERFORMANCE_CERTIFIED` means the public-data provider boundary, Postgres adapter, migration, Actions workflows, quality gate, Microsoft Graph mail boundary, observability, recovery documentation, offline validation and the promoted-main three-year Neon bootstrap performance verification are complete. It does **not** mean that the owner has completed the weekly Graph test-mail receipt／attachment review or enabled scheduled workflow execution.

| State | Meaning | Runtime behavior |
| --- | --- | --- |
| `DATABASE_URL_REQUIRED` | Postgres selected without secret-managed URL | Database jobs fail closed with non-zero exit |
| `DATABASE_UNAVAILABLE` | Postgres cannot be reached | Workflow stops; no fabricated data or mail |
| `DATABASE_READY` | Postgres health check succeeds | Migration／jobs may continue |
| `SEND_OK` | Report quality and artifacts are complete | Mail may proceed in the approved stage |
| `SEND_WITH_WARNINGS` | Report usable but contains visible quality warnings | Mail may proceed; warnings stay in report／job state |
| `SEND_BLOCKED` | No usable report, usable ratio below gate or artifact failure | No mail provider call; non-zero workflow |
| `EXTERNAL_CONFIGURATION_REQUIRED` | Owner runtime configuration has not been supplied | Offline code is complete; owner action remains |

## Target architecture

```text
Public market APIs → GitHub Actions → Node.js runtime → Postgres adapter → Neon-compatible PostgreSQL
                                                            ↓
                                           Microsoft Graph /me/sendMail
                                           delegated personal account only
```

The production weekly workflow uses `MAIL_PROVIDER=outlook_graph`, the `consumers` authority, delegated `Mail.Send`, a client ID and a secret-managed refresh token. The previous Gmail SMTP implementation remains isolated only for an explicit `MAIL_PROVIDER=smtp` compatibility path; production weekly no longer injects or depends on Gmail SMTP values. Render Free remains optional dashboard hosting only. It does not provide durable local storage and does not run scheduled mail. `STORAGE_PROVIDER=filesystem` remains local／test compatibility; `STORAGE_PROVIDER=postgres` is the zero-cost production path.

## Stage 0 — owner application and OAuth review

Create an app registration for **Personal Microsoft accounts** only. Add only the Microsoft Graph delegated permission `Mail.Send`; do not add application permissions, company tenant permissions, directory scopes, mailbox-read scopes or a client secret. Record the Application (client) ID as the secret `MICROSOFT_CLIENT_ID`.

On a trusted owner-controlled machine, run `npm run microsoft:oauth -- --client-id <client-id> --output /tmp/raw-material-dashboard-microsoft-refresh-token.json`. Sign in only as `ggyin0628@hotmail.com`. The helper uses the `consumers` device-code endpoint and requests only `offline_access` plus `https://graph.microsoft.com/Mail.Send`. It never sends mail, never prints a token, refuses output inside the repository, and writes the refresh token only to a mode-600 file outside the repository. Supply the `refreshToken` field directly to the owner’s secret manager as `MICROSOFT_REFRESH_TOKEN`, then delete the temporary file securely.

Keep `MICROSOFT_TENANT=consumers`, `MAIL_PROVIDER=outlook_graph`, `MAIL_FROM=ggyin0628@hotmail.com`, `MAIL_TEST_TO=ggyin0628@hotmail.com`, and repository variable `WEEKLY_MAIL_TEST_MODE=1`. Keep `PRODUCTION_SCHEDULES_ENABLED` absent or `0`. Detailed setup and official Microsoft references are in [`docs/EMAIL_DELIVERY.md`](EMAIL_DELIVERY.md).

## Stage 1 — database migration and bootstrap — certified

The promoted-main three-year bootstrap certification has completed. Runs `32611318090` and `32611472483` reached `DATABASE_READY` and `BOOTSTRAP_COMPLETE` without email. No further bootstrap is required for this mail-provider change. For audit/recovery, the owner-controlled commands remain:

```bash
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run db:migrate
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:storage-check
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:bootstrap -- --period 3y
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:status
```

Migration is idempotent and non-destructive. Bootstrap performs migration, provider-supported public history backfill, canonical validation, completed prior-week report generation and job-state update without email. The remediation uses bounded history concurrency of three, capped at four, and `POSTGRES_UPSERT_BATCH_SIZE=250` by default, capped at 500. Each snapshot batch uses one parameterized multi-row `INSERT ... ON CONFLICT` transaction, preserving status quality and leaving completed batches durable for safe rerun. Snapshot identity remains `material_id + observation_date`; missing dates remain missing and source failures remain visible.

## Stage 2 — daily workflow

Run `.github/workflows/market-daily.yml` by manual dispatch first. It installs locked dependencies, validates source, migrates schema, checks database readiness, captures public daily data and validates status. It does not invoke the mail command. A database or process failure is non-zero; partial public-source failures remain explicit per row.

The scheduled daily expression is `17 23 * * 1-5` UTC, approximately 07:17 Tuesday–Saturday in Taiwan. The job runs on a schedule only when repository variable `PRODUCTION_SCHEDULES_ENABLED=1`; manual dispatch is always allowed. GitHub schedule is best-effort and may be delayed; use manual dispatch for recovery.

## Stage 3 — weekly dry-run

Run the weekly workflow in its default test-mode configuration or execute:

```bash
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" MAIL_PROVIDER=outlook_graph DRY_RUN=1 npm run production:weekly -- --dry-run --send
```

The runtime calculates only the completed prior Monday–Sunday week in `Asia/Taipei`, generates JSON／HTML／XLSX, evaluates the quality gate, writes `DRY_RUN` to the durable ledger and returns `sent: false`. No OAuth token exchange or Graph request is made. The production CLI returns a concise safe summary rather than printing full report/history payloads. Confirm tracked count, usable count, source/status coverage, FX availability, warnings and artifact integrity.

## Stage 4 — live `TEST_RECIPIENT`

Keep `WEEKLY_MAIL_TEST_MODE=1` and configure `MAIL_TEST_TO` to the owner-approved personal test recipient. Run **one** manual weekly workflow with no `--dry-run`. In test mode, production `MAIL_TO`, CC and Reply-To are not forwarded. Do not run this live test from the remediation agent; use the owner-controlled GitHub Actions workflow.

The Graph adapter refreshes the delegated token in memory and sends JSON to `/me/sendMail`. A `202 Accepted` response records `TEST_SENT`; it means Graph accepted the request for processing, not that final mailbox delivery is guaranteed. Review the received email subject `採購市場情報週報｜YYYY-Www`, sender, recipient, public-only content, HTML at desktop and narrow/mobile widths, XLSX attachment, timestamps, source labels, warnings and disclaimer. If any item fails, keep test mode enabled and recover through manual workflow dispatch.

## Stage 5 — approved production recipients

Only after manual receipt and attachment review pass may the owner set `WEEKLY_MAIL_TEST_MODE=0` and use the approved personal `MAIL_TO`. Run one explicitly approved completed-week send. The Postgres delivery ledger and duplicate guard remain active. A Graph `401`/`403` or refresh-token failure is explicit and redacted; it never falls back to Gmail. For a `202` acceptance uncertainty, inspect the mailbox and ledger before any owner-approved resend.

## Stage 6 — scheduled workflow activation

After the controlled production-recipient send passes, the owner may set repository variable `PRODUCTION_SCHEDULES_ENABLED=1` and rely on the weekly schedule `17 1 * * 1` UTC, approximately Monday 09:17 Asia/Taipei. The workflow performs migration, storage check, quality-gated report generation, Microsoft Graph delivery and final status validation. It stops on database failure, `SEND_BLOCKED`, attachment failure, failed OAuth/Graph request or any other materially unsuccessful state. Until that variable is `1`, scheduled daily／weekly jobs safely skip while manual dispatch remains available.

## Recovery and non-destructive behavior

Migration uses non-destructive create-if-missing operations. Transactional Postgres snapshot upsert rolls back only the active batch on failure; prior committed batches remain durable, and the 3y rerun is idempotent without reset or truncate. Provider re-backfill and public Postgres export are the recovery sources of truth. Filesystem adapter corruption remains explicit and does not silently become valid data. Delivery duplicate protection remains keyed by reporting week. There is no paid backup requirement.

Graph refresh tokens can expire or be revoked. On `GRAPH_TOKEN_REFRESH_FAILED`, the owner must rerun the interactive helper and replace only the Actions refresh-token secret. Never print, paste or commit the old or new token. No real Microsoft OAuth exchange, Graph send, weekly live email, bootstrap rerun or schedule activation was performed during this code change.

## Required final human action

Run exactly one `Market Weekly Intelligence Report` manually while `WEEKLY_MAIL_TEST_MODE=1`, verify the received Outlook HTML report and XLSX attachment, then set `PRODUCTION_SCHEDULES_ENABLED=1`. Do not trigger the weekly workflow or send email from the remediation agent.
