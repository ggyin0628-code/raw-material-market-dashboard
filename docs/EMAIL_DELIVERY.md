# Email Delivery

## Scope and safety

Weekly mail is a provider-neutral SMTP adapter for the public-market intelligence report. It does not read addresses, passwords or tokens from tracked files. All configuration comes from environment variables, and no live email is sent by the preview or report routes.

`DRY_RUN=1` or the `--dry-run` argument always takes precedence over delivery. In dry-run mode the system builds the weekly JSON／HTML／XLSX artifacts, validates the recipient and configuration shape, reports `DRY_RUN`, and does not open an SMTP socket. A dry-run never records `SENT` and can be repeated safely.

## Configuration

| Variable | Required for live delivery | Description |
| --- | --- | --- |
| `MAIL_ENABLED` | Yes | Truthy value enables live delivery; otherwise the adapter fails closed |
| `MAIL_HOST` | Yes | SMTP host |
| `MAIL_PORT` | Yes | Integer from 1 to 65535; default shape is 587 when omitted |
| `MAIL_SECURE` | Yes | Truthy value uses TLS; false uses plain SMTP with STARTTLS not negotiated by this minimal adapter |
| `MAIL_USER` | Yes | SMTP authentication username |
| `MAIL_PASSWORD` | Yes | SMTP authentication password; never logged |
| `MAIL_FROM` | Yes | One validated sender address |
| `MAIL_TO` | Yes | One or more validated addresses separated by whitespace, comma or semicolon |
| `MAIL_TIMEOUT_MS` | No | Bounded timeout, clamped to 1–30 seconds |
| `WEEKLY_DELIVERY_LEDGER` | No | Optional persistent ledger path; defaults to `data/weekly-reports/delivery-ledger.json` |
| `DRY_RUN` | No | Truthy value prevents network delivery |

The current adapter expects authenticated SMTP credentials for live delivery. If the environment does not provide a complete valid configuration, the result is `FAILED` with a redacted configuration error and no socket connection. The adapter never prints `MAIL_PASSWORD`.

## Delivery states

| State | Meaning |
| --- | --- |
| `DRY_RUN` | Artifacts and configuration shape validated; no delivery attempted |
| `SENT` | SMTP transaction completed and weekly ledger recorded the successful send |
| `FAILED` | Mail disabled, configuration invalid, timeout, provider error or bounded retries exhausted |
| `DUPLICATE_PREVENTED` | The same reporting week is already recorded as `SENT` |

The delivery ledger is written atomically and keyed by `reportingWeek`. A successful delivery records only state, timestamp, recipient count and attachment count. It does not store credentials or message bodies.

## Safe commands

```sh
# Generate artifacts only
npm run weekly:report -- --week 2026-W33 --out-dir /tmp/weekly-report

# Preview HTML only
npm run weekly:preview -- --week 2026-W33 --out /tmp/weekly-preview.html

# Validate configuration and attachments without sending
DRY_RUN=1 npm run weekly:send -- --week 2026-W33 --dry-run --out-dir /tmp/weekly-send
```

Live delivery is intentionally not required for the public repository handoff because SMTP credentials and approved recipients have not been supplied. The dry-run, missing-configuration, fail-closed, timeout／retry, and duplicate-week paths are deterministic and tested.

## Troubleshooting

If the result is `FAILED` with a configuration error, validate `MAIL_ENABLED`, host, port, sender and all recipients; do not put credentials into `.env` committed files. If the result is `FAILED` after configuration validation, inspect the redacted runtime log for timeout or provider response without printing the password. If a week returns `DUPLICATE_PREVENTED`, inspect the persistent ledger and intentionally remove or rotate that entry only under owner-approved operational procedure; do not resend automatically.

The intended weekly report is external market intelligence. It must not be reworded as a supplier quote, company target price, guaranteed negotiation price, unsupported Taiwan spot price or a BUY／SELL instruction.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/weekly-market-intelligence-v1/lib/weekly/mailService.js "SMTP adapter implementation"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/weekly-market-intelligence-v1/lib/weekly/cli.js "Weekly CLI implementation"
