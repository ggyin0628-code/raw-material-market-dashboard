# Raw Material Dashboard — Outlook Graph Mail Handoff

## Delivery identity

| Item | Value |
| --- | --- |
| Repository | `ggyin0628-code/raw-material-market-dashboard` |
| Authoritative baseline | `8390a0234fb5d18e28e100ee1ff40750b6b0d95e` |
| Existing bootstrap remediation | `fix/bootstrap-performance-v1`, certified by `bootstrap-performance-certified-v1` |
| New feature branch | `feat/outlook-graph-mail-v1` |
| Graph implementation SHA | `1372244d6cb32f696378595f53b6c6072678674f` |
| Final promoted SHA | The final fast-forward commit containing this handoff and certification docs; verify from `outlook-graph-mail-v1` and `main` after promotion |
| Required checkpoint tag | `outlook-graph-mail-v1` |
| Required tag message | `Personal Outlook Graph delegated OAuth2 mail provider — test-mail verification next` |
| Product boundary | External public market intelligence and purchasing-reference context only |
| Deployment / paid resources | Not performed / none added |

The feature is based on the already-promoted bootstrap-performance baseline. The final delivery must be fast-forward only: push the feature, update `main` by fast-forward, push the required annotated tag at the promoted SHA, and verify both refs. No force push, reset, destructive migration, data truncation, application deployment or workflow trigger is part of this change.

## Permanent safety boundary

> The system stores only external public market observations and derived public-market reference reports. It is not a procurement system, supplier quotation service, company target-price system, ERP purchasing module or buy/sell decision engine.

Do not add SAP, company procurement history, supplier quotations or names, company target prices, private thresholds, inventory, MOQ, payment terms, company email systems, private mappings, credentials or private runtime reports. Do not read, print, export, rotate or modify GitHub Actions secret values. Do not enable schedules, trigger the production bootstrap, trigger the weekly workflow or send live mail from this handoff.

## Existing bootstrap certification retained

The cancelled `Market Production Bootstrap #1` run `32609131444` on baseline main completed setup, checkout, `npm ci`, code validation, migration and storage readiness in about 14 seconds, then occupied the 30-minute safety ceiling in `Bootstrap public history`. The bottleneck was classified as **BOTH**: sequential public history fetches and per-record PostgreSQL lookup/write round-trips.

The remediation kept the complete three-year public history and 30-minute safety ceiling. It added bounded history concurrency 3 (cap 4), default Postgres batch size 250 (cap 500), one parameterized multi-row upsert transaction per batch, status-quality preservation, chunk resumability and safe progress. The first promoted-main run `32611318090` succeeded with 11,351 inserted public rows; the final-SHA telemetry run `32611472483` succeeded with 11,351 replaced rows, 60 batch events and no provider failures. Both runs were bootstrap-only and mail `NOT_REQUESTED` / `sent: false`. No bootstrap rerun is required for the Graph change.

## Graph mail design

Production weekly uses `MAIL_PROVIDER=outlook_graph` and `MICROSOFT_TENANT=consumers` for the owner-approved personal account `ggyin0628@hotmail.com`. The workflow injects only `MICROSOFT_CLIENT_ID`, `MICROSOFT_REFRESH_TOKEN`, `MAIL_FROM`, `MAIL_TO` and `MAIL_TEST_TO` from Actions secrets; it no longer injects Gmail SMTP settings. The Graph adapter requests delegated `offline_access` and `https://graph.microsoft.com/Mail.Send`, exchanges the refresh token at the v2.0 `consumers` token endpoint, keeps the access token in memory, and calls `POST https://graph.microsoft.com/v1.0/me/sendMail`.

The JSON payload contains the existing HTML report and one XLSX `#microsoft.graph.fileAttachment` with base64 `contentBytes`. HTTP `202 Accepted` records `TEST_SENT` or `SENT`; it indicates Graph accepted processing and does not prove final mailbox delivery. HTTP `401`, `403`, refresh-token failure, malformed payload and configuration failures are explicit sanitized failures. Graph `429`, `5xx`, bounded network errors and timeouts use the bounded retry path. There is no silent SMTP fallback. The legacy SMTP implementation remains only for explicit `MAIL_PROVIDER=smtp` compatibility.

`MAIL_TEST_MODE=1` selects only `MAIL_TEST_TO` and removes production CC／Reply-To. The Postgres delivery ledger and duplicate guard are unchanged. The CLI now emits only a concise safe summary containing reporting week, quality state/counts, provider/mail state, recipient/attachment counts, artifact basenames and duration; it does not dump the full report or history.

## OAuth helper and owner procedure

`npm run microsoft:oauth` is a one-time owner-controlled device-code helper. It uses the `consumers` authority, requests only `offline_access` and delegated `Mail.Send`, prints only the verification URL, transient user code, tenant, scopes and output path, refuses any output inside the repository and writes the refresh token only to a mode-600 file outside the repository. It never sends mail and never prints an access or refresh token.

The owner must register an application for **Personal Microsoft accounts** only, add only Microsoft Graph delegated `Mail.Send`, enable public-client/device-code flow if the portal exposes the setting, and use only `ggyin0628@hotmail.com`. Store the Application (client) ID as `MICROSOFT_CLIENT_ID`; store the helper file’s `refreshToken` field as `MICROSOFT_REFRESH_TOKEN`; delete the temporary file securely. Never paste a real token into Git, issue text, documentation or ordinary shell history. Company Microsoft 365 accounts, application permissions and paid mail services are out of scope.

## Validation status

The Graph implementation SHA passed the deterministic suite with **53 passed / 0 failed**. Coverage includes the previous 43 bootstrap/storage/report tests plus Graph provider configuration, consumers token exchange, token-refresh failure, sendMail attachment shape, `401`/`403`/`429`/`5xx`, test-recipient isolation, duplicate prevention, no SMTP fallback, OAuth secret redaction, device-code polling and concise CLI output. Local gates passed: `npm ci`, `npm run check`, explicit syntax checks, `npm test`, `npm run build`, `npm audit --omit=dev`, YAML formatting/parse, `git diff --check` and security scan.

All Graph/OAuth requests are mocked in tests. No real Microsoft OAuth exchange, Graph sendMail, weekly live email, bootstrap rerun, schedule activation, Neon write or GitHub Actions workflow trigger was performed for this mail change. The existing Neon bootstrap state and public-data/report/quality/ledger contracts remain unchanged.

## Schedule and activation gate

`market-weekly.yml` remains scheduled only when `PRODUCTION_SCHEDULES_ENABLED=1`; manual dispatch remains available. The repository variable must stay absent or `0` until the owner verifies the first Graph test email and XLSX attachment. The feature does not enable or modify the schedule variable.

The exact next owner action after tag verification is:

> Run exactly one `Market Weekly Intelligence Report` manually while `WEEKLY_MAIL_TEST_MODE=1`, verify the received Outlook HTML report and XLSX attachment, then set `PRODUCTION_SCHEDULES_ENABLED=1`.

The remediation agent must not execute this live action.

## References

[1]: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0 "Microsoft Graph user: sendMail"
[2]: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code "Microsoft identity platform OAuth 2.0 device authorization grant"
[3]: https://learn.microsoft.com/en-us/graph/auth-register-app-v2 "Register an application with the Microsoft identity platform"
[4]: https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc "Scopes and permissions in the Microsoft identity platform"
[5]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611318090 "First promoted-main bootstrap"
[6]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611472483 "Final-SHA bootstrap with batch progress telemetry"
