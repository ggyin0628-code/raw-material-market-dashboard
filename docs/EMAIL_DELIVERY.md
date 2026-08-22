# Email Delivery Runbook

## Boundary

Weekly email contains only external public-market intelligence, source/status/provenance, market-reference values, quality warnings and the non-purchasing-instruction disclaimer. It must not contain supplier quotations, company purchase history, SAP, inventory, MOQ, payment terms, company thresholds, credentials or private metadata.

## Environment-only configuration

No SMTP value is stored in Git. The adapter reads:

| Variable | Required for live send | Meaning |
| --- | --- | --- |
| `MAIL_ENABLED` | Yes | Must be truthy before any live connection |
| `MAIL_HOST` | Yes | Approved SMTP host |
| `MAIL_PORT` | Yes | Integer 1–65535; default 587 |
| `MAIL_SECURE` | No | TLS connection mode |
| `MAIL_USER` | Yes | Secret-managed SMTP user |
| `MAIL_PASSWORD` | Yes | Secret-managed password; never logged |
| `MAIL_FROM` | Yes | Approved sender address |
| `MAIL_TO` | Yes | Production recipient list |
| `MAIL_CC` | No | Optional additional recipients |
| `MAIL_REPLY_TO` | No | Optional valid reply-to address |
| `MAIL_TEST_MODE` | No | When truthy, ignore `MAIL_TO` and use only `MAIL_TEST_TO` |
| `MAIL_TEST_TO` | Required in test mode | Approved test recipient list |
| `DRY_RUN` | No | When truthy, generate and validate without SMTP socket |
| `ALLOW_WEEKLY_RESEND` | No | Must be truthy together with explicit `--allow-resend` to bypass duplicate guard |

Recipient parsing accepts comma, semicolon or whitespace separators, trims whitespace and removes case-insensitive duplicates. `MAIL_FROM`, `MAIL_TO`, `MAIL_CC`, `MAIL_REPLY_TO` and `MAIL_TEST_TO` are validated; malformed configuration fails closed.

## Required staged activation

### Stage A — dry-run

```sh
DRY_RUN=1 npm run production:weekly -- --dry-run --send
```

The command must generate JSON／HTML／XLSX, evaluate the quality gate, write `DRY_RUN` state, return `sent: false` and never create an SMTP socket. A dry-run does not prove credentials or network reachability.

### Stage B — real SMTP with test recipient only

Set `MAIL_ENABLED=1`, approved host／port／secure mode, secret-managed user／password, approved sender, `MAIL_TEST_MODE=1` and `MAIL_TEST_TO=<approved-test-address>`. The configured production `MAIL_TO` is ignored in this mode. Do not set production recipients as a substitute for `MAIL_TEST_TO`.

### Stage C — actual receipt review

Send one explicitly approved test week. Confirm subject `採購市場情報週報｜YYYY-Www`, sender, HTML at desktop and narrow/mobile widths, attachment opening, timestamps, source labels, status warnings and public-data disclaimer. Do not advance if any item is wrong.

### Stage D — approved production recipients

After Stage C passes, disable test mode and provide the owner-approved `MAIL_TO` and optional `MAIL_CC`. Run one explicitly approved production-recipient send for a known reporting week. The system still applies the duplicate guard.

### Stage E — scheduler enablement

Only after Stage D passes may the owner activate the weekly external scheduler. The scheduler must run the readiness/storage check first and must stop on `STORAGE_CONFIGURATION_REQUIRED` or `SEND_BLOCKED`.

## Delivery states

| State | Meaning | Safe retry |
| --- | --- | --- |
| `DRY_RUN` | Report and attachment built; no network delivery | Repeat freely; ledger records simulation |
| `TEST_SENT` | Live SMTP send used `MAIL_TEST_MODE` | Do not resend automatically |
| `SENT` | Live SMTP sent to approved recipients | Duplicate guard blocks same week |
| `FAILED` | Configuration, authentication, timeout or other delivery failure | Follow recovery below |
| `DUPLICATE_PREVENTED` | Same week already `SENT` or `TEST_SENT` | Requires explicit owner-approved resend |

The ledger is atomic and keyed by reporting week. It stores state, timestamp, test-mode flag, recipient count, attachment count and a redacted error only. It does not store passwords or full recipient lists.

## Retry and uncertain acceptance

Market data retry remains bounded and provider-visible. SMTP retry is limited to transient connection／pre-DATA failures. Once the SMTP `DATA` body has been submitted, the adapter does not automatically retry an uncertain response because the message may already have been accepted and a retry could duplicate it. An authentication failure is non-transient and is not retried.

For an SMTP timeout or connection reset, inspect the ledger and provider logs. If the failure occurred after DATA submission, treat delivery as uncertain and require owner confirmation before any resend. If the failure occurred before DATA submission, correct the configuration or transient network issue and retry only with explicit operational approval.

## Controlled resend

A legitimate resend requires owner approval, a known reporting week and an explicit command:

```sh
ALLOW_WEEKLY_RESEND=1 npm run production:weekly -- --week YYYY-Www --send --allow-resend
```

Never delete arbitrary ledger files to bypass the guard. Preserve the previous ledger for audit and use the documented backup/recovery procedure.

## References

- [`PRODUCTION_ACTIVATION.md`](PRODUCTION_ACTIVATION.md)
- [`PRODUCTION_STORAGE.md`](PRODUCTION_STORAGE.md)
- [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md)
- [`WEEKLY_REPORT_CONTRACT.md`](WEEKLY_REPORT_CONTRACT.md)
