# Gmail SMTP Delivery Contract

## Boundary

Weekly email contains only external public-market intelligence, source/status/provenance, market-reference values, quality warnings and the non-purchasing-instruction disclaimer. It must not contain supplier quotations, company purchase history, SAP, inventory, MOQ, payment terms, company thresholds, credentials or private metadata.

The intended external mail provider is **owner-approved personal Gmail SMTP only**. Microsoft Graph, company email systems and Render Free SMTP responsibility are out of scope. The scheduled sender is GitHub Actions; Render Free remains dashboard hosting only.

## Environment／Actions secret configuration

No SMTP value is stored in Git. GitHub Actions injects these values from repository secrets or variables:

| Variable | Required | Meaning |
| --- | --- | --- |
| `MAIL_ENABLED` | Yes | Truthy before any live connection |
| `MAIL_HOST` | Yes | `smtp.gmail.com` for intended Gmail runtime |
| `MAIL_PORT` | Yes | `465` for Gmail secure TLS |
| `MAIL_SECURE` | Yes | `true` for Gmail TLS |
| `MAIL_USER` | Yes | Owner-approved personal Gmail user; Actions secret |
| `MAIL_PASSWORD` | Yes | Gmail App Password only; Actions secret, never logged |
| `MAIL_FROM` | Yes | Owner-approved sender; Actions secret |
| `MAIL_TO` | After test | Approved production recipient; Actions secret |
| `MAIL_CC` | Optional | Approved production CC list |
| `MAIL_REPLY_TO` | Optional | Approved production reply-to |
| `MAIL_TEST_MODE` | First live run | Truthy to ignore production recipients |
| `MAIL_TEST_TO` | First live run | Owner-approved personal test recipient; Actions secret |
| `DRY_RUN` | Optional | Truthy for no-socket validation |
| `ALLOW_WEEKLY_RESEND` | Optional | Truthy together with explicit `--allow-resend` only |

Recipient parsing accepts comma, semicolon or whitespace separators, trims whitespace and removes case-insensitive duplicates. Test mode uses only `MAIL_TEST_TO` and omits production CC／Reply-To headers. The Gmail App Password must be supplied only at workflow runtime; it is never committed, printed or included in error output.

## Postgres-backed ledger

When `STORAGE_PROVIDER=postgres`, the delivery ledger is stored in the durable `weekly_delivery_ledger` table. When `STORAGE_PROVIDER=filesystem`, the existing atomic JSON ledger remains the local／test adapter. Both paths are keyed by `reporting_week`, and duplicate state is preserved across GitHub Actions job runs. No Render local filesystem is used as the durable ledger.

## Staged activation

### Stage A — dry-run

```bash
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" DRY_RUN=1 npm run production:weekly -- --dry-run --send
```

The command must generate JSON／HTML／XLSX, evaluate the quality gate, write `DRY_RUN`, return `sent: false` and never create an SMTP socket. It does not prove Gmail credentials or network reachability.

### Stage B — live Gmail test recipient

Keep the repository variable `WEEKLY_MAIL_TEST_MODE=1`. Configure `MAIL_ENABLED=1`, `MAIL_HOST=smtp.gmail.com`, `MAIL_PORT=465`, `MAIL_SECURE=true`, secret-managed `MAIL_USER`／`MAIL_PASSWORD`, approved `MAIL_FROM` and `MAIL_TEST_TO`. The configured production `MAIL_TO` is ignored in this mode. Run the weekly workflow manually; do not send this first test from Manus.

### Stage C — receipt and attachment review

Confirm the subject `採購市場情報週報｜YYYY-Www`, sender, test recipient, HTML at desktop and narrow/mobile widths, XLSX opening, timestamps, source labels, status warnings and public-data disclaimer. Do not advance if any item is wrong.

### Stage D — approved production recipient

After Stage C passes, set `WEEKLY_MAIL_TEST_MODE=0`, provide the owner-approved `MAIL_TO` and optional `MAIL_CC`, and run one explicitly approved production-recipient workflow for a known completed week. The duplicate guard remains active.

### Stage E — scheduled workflow activation

Only after Stage D passes may the owner rely on the scheduled weekly workflow. The workflow performs database migration and storage check before report generation and stops on `DATABASE_URL_REQUIRED`, `DATABASE_UNAVAILABLE`, `SEND_BLOCKED` or other materially unsuccessful state.

## Delivery states

| State | Meaning | Safe retry |
| --- | --- | --- |
| `DRY_RUN` | Report／attachment built; no network delivery | Repeat freely |
| `TEST_SENT` | Live Gmail SMTP used `MAIL_TEST_MODE` | Do not resend automatically |
| `SENT` | Live Gmail SMTP sent to approved recipients | Same week is duplicate-blocked |
| `FAILED` | Configuration, authentication, timeout, attachment or other failure | Follow recovery below |
| `DUPLICATE_PREVENTED` | Same week already `SENT` or `TEST_SENT` | Explicit owner-approved resend only |

The durable ledger stores state, timestamp, test-mode flag, recipient count, attachment count and redacted error only. It does not store passwords or full recipient lists.

## Retry and uncertain acceptance

SMTP retry is limited to transient connection／pre-DATA failures. Once the SMTP `DATA` body has been submitted, the adapter does not automatically retry an uncertain response because the message may already have been accepted. Authentication failure is non-transient and is not retried. For an uncertain timeout or connection reset, inspect the Postgres ledger and Gmail mailbox before considering a resend.

## Controlled resend

A legitimate resend requires owner approval, a known reporting week and both controls:

```bash
ALLOW_WEEKLY_RESEND=1 STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:weekly -- --week YYYY-Www --send --allow-resend
```

Never delete arbitrary ledger rows to bypass the guard. Preserve the existing public ledger and use the documented database export／re-backfill recovery procedure.

## Security rules

Never commit a real Gmail address, App Password, `DATABASE_URL`, SMTP credential or recipient list. Never echo secret environment variables. Use placeholders and repository secret injection only.
