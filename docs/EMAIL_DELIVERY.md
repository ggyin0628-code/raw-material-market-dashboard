# Weekly Email Delivery

## Boundary

Weekly email contains only external public-market intelligence, source/status/provenance, market-reference values, quality warnings and the non-purchasing-instruction disclaimer. It must not contain supplier quotations, company purchase history, SAP, inventory, MOQ, payment terms, company thresholds, credentials or private metadata. The production personal account is `ggyin0628@hotmail.com`; company Microsoft 365 accounts and company systems are permanently out of scope.

The production provider is **Microsoft Graph delegated OAuth2**. The previous Gmail SMTP implementation remains isolated for explicit backward compatibility when `MAIL_PROVIDER=smtp`, but the production weekly workflow uses `MAIL_PROVIDER=outlook_graph` and has no Gmail SMTP dependency.

## Production configuration

The production workflow injects only secret-managed values and non-secret provider settings:

| Variable | Required | Meaning |
| --- | --- | --- |
| `MAIL_ENABLED` | Yes | Truthy before any live delivery |
| `MAIL_PROVIDER` | Yes | `outlook_graph` in production; `smtp` only for isolated compatibility |
| `MICROSOFT_CLIENT_ID` | Yes for Graph | App registration client ID; Actions secret |
| `MICROSOFT_REFRESH_TOKEN` | Yes for Graph | Delegated offline token; Actions secret, never logged |
| `MICROSOFT_TENANT` | Yes for Graph | `consumers` for a personal Microsoft account |
| `MAIL_FROM` | Yes | `ggyin0628@hotmail.com` in owner configuration |
| `MAIL_TO` | After test | Owner-approved recipient list; Actions secret |
| `MAIL_TEST_TO` | First live test | `ggyin0628@hotmail.com` in owner configuration; Actions secret |
| `MAIL_TEST_MODE` | First live test | Truthy to ignore production recipients |
| `WEEKLY_MAIL_TEST_MODE` | Workflow default | Repository variable remains `1` until owner receipt review |
| `MICROSOFT_GRAPH_TIMEOUT_MS` | Optional | Bounded Graph request timeout, clamped to 1–30 seconds |
| `DRY_RUN` | Optional | No network delivery and `DRY_RUN` ledger state |
| `ALLOW_WEEKLY_RESEND` | Optional | Must be truthy together with explicit `--allow-resend` |

`MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER` and `MAIL_PASSWORD` are not required for `outlook_graph`. The weekly workflow does not inject those Gmail SMTP settings. No client secret is required by this design: the workflow uses a delegated refresh token obtained by the owner through the one-time local helper.

## Microsoft Graph OAuth flow

The Graph provider uses the Microsoft identity platform `consumers` tenant and the delegated scopes `offline_access` and `https://graph.microsoft.com/Mail.Send`. At runtime it exchanges `MICROSOFT_REFRESH_TOKEN` for a short-lived access token at the v2.0 token endpoint, keeps the access token only in memory, calls `POST https://graph.microsoft.com/v1.0/me/sendMail`, and never prints either token. A revoked or expired refresh token returns a sanitized `GRAPH_TOKEN_REFRESH_FAILED` state; it never falls back silently to Gmail SMTP.

The request uses JSON format. The body is HTML and the XLSX report is encoded as a Microsoft Graph `#microsoft.graph.fileAttachment` with `contentBytes` base64. A successful Graph call returns HTTP `202 Accepted`; the durable ledger then records `TEST_SENT` or `SENT` according to test mode. HTTP `401`, `403`, malformed payload, token failure and non-recoverable configuration errors are explicit failures. HTTP `429`, HTTP `5xx`, bounded network errors and timeout errors use the existing bounded retry path. Graph errors are reduced to safe codes/messages; response bodies and token values are not written to logs or ledger state.

These choices follow the official Microsoft contracts: delegated `Mail.Send` is the least-privileged permission for a personal Microsoft account, JSON `sendMail` supports file attachments, `202 Accepted` is the success response, device code flow supports `/consumers`, and `offline_access` is required to receive refresh tokens [1] [2] [3] [4].

## One-time owner OAuth helper

The repository includes `npm run microsoft:oauth`, a native Node.js device-code helper. It is not invoked by GitHub Actions and it does not send mail. It prints only the sign-in URL, transient device user code, tenant, scopes and local output path; it never prints an access token, refresh token, authorization response token or secret. The output path must be outside the repository and is written with mode `0600`; the repository also ignores local secret paths and token-shaped JSON filenames.

The owner should perform this setup on a trusted local machine:

1. Open **Microsoft Entra admin center → App registrations → New registration**.
2. Choose a name such as `raw-material-market-dashboard-mail`.
3. Choose **Supported account types: Personal Microsoft accounts**. Do not choose a company-only tenant and do not use a corporate Microsoft 365 account.
4. Register the application and copy its **Application (client) ID** into the owner’s secret manager as `MICROSOFT_CLIENT_ID`. No client secret is needed for the public-client device-code helper.
5. Under **API permissions**, add **Microsoft Graph → Delegated permissions → Mail.Send** only. Do not add application permissions, directory permissions, calendar permissions or mailbox-read permissions.
6. Under **Authentication**, enable the public-client/device-code flow if the portal exposes that setting. The device-code flow uses the `consumers` authority and does not require a redirect URI.
7. Run `npm run microsoft:oauth -- --client-id <client-id> --output /tmp/raw-material-dashboard-microsoft-refresh-token.json` from the repository checkout. Sign in only as `ggyin0628@hotmail.com` and consent only to `offline_access` and `Mail.Send`.
8. Supply the JSON file’s `refreshToken` value directly to the secret manager as `MICROSOFT_REFRESH_TOKEN`; do not paste it into Git, issue text, documentation or ordinary shell history. Delete the temporary file securely after secret configuration.
9. Configure `MICROSOFT_TENANT=consumers`, `MAIL_PROVIDER=outlook_graph`, `MAIL_FROM=ggyin0628@hotmail.com`, `MAIL_TEST_TO=ggyin0628@hotmail.com`, and retain `WEEKLY_MAIL_TEST_MODE=1`. Keep `PRODUCTION_SCHEDULES_ENABLED` absent or `0`.

Microsoft refresh tokens can expire or be revoked. If the workflow reports `GRAPH_TOKEN_REFRESH_FAILED`, rerun the owner-controlled helper interactively and replace only the `MICROSOFT_REFRESH_TOKEN` Actions secret. Never expose the old or new token to the agent or repository.

## Staged activation

### Stage A — dry-run

```bash
MAIL_PROVIDER=outlook_graph MAIL_TEST_MODE=1 DRY_RUN=1 \
  npm run production:weekly -- --dry-run --send
```

The command must generate JSON／HTML／XLSX, evaluate the quality gate, write `DRY_RUN`, return `sent: false` and make no token or Graph request. It does not prove OAuth credentials or network reachability.

### Stage B — owner-controlled live test

Keep `WEEKLY_MAIL_TEST_MODE=1` and configure `MAIL_TEST_TO` to the owner-approved personal recipient. Run exactly one manual weekly workflow after the owner has configured the Graph secrets. In test mode, production `MAIL_TO`, CC and Reply-To are not forwarded. This step is owner-controlled and was intentionally not executed by the remediation agent.

### Stage C — receipt and attachment review

Confirm the subject `採購市場情報週報｜YYYY-Www`, sender, test recipient, HTML at desktop and narrow/mobile widths, XLSX opening, timestamps, source labels, status warnings and public-data disclaimer. Do not advance if any item is wrong.

### Stage D — approved production recipient

After Stage C passes, set `WEEKLY_MAIL_TEST_MODE=0`, provide the owner-approved `MAIL_TO`, and run one explicitly approved production-recipient workflow. The Postgres delivery ledger and duplicate guard remain active.

### Stage E — scheduled workflow activation

Only after the owner’s review and approved production-recipient test may the owner set `PRODUCTION_SCHEDULES_ENABLED=1`. Until then, scheduled daily／weekly jobs safely skip while manual dispatch remains available. This remediation did not enable schedules.

## Delivery states and recovery

| State | Meaning | Safe retry |
| --- | --- | --- |
| `DRY_RUN` | Report／attachment built; no network delivery | Repeat freely |
| `TEST_SENT` | Graph accepted a live test-mode message with HTTP 202 | Do not resend automatically |
| `SENT` | Graph accepted a live approved-recipient message with HTTP 202 | Same week is duplicate-blocked |
| `FAILED` | Configuration, OAuth, Graph, timeout, attachment or other failure | Follow the sanitized error and owner review |
| `DUPLICATE_PREVENTED` | Same week already `SENT` or `TEST_SENT` | Explicit owner-approved resend only |

The durable ledger stores state, timestamp, provider, test-mode flag, recipient count, attachment count and redacted error only. It does not store access tokens, refresh tokens, authorization codes or full recipient lists.

A `202 Accepted` response means Graph accepted the request for processing; it does not guarantee final mailbox delivery. For an uncertain post-acceptance operational issue, inspect the mailbox and ledger before considering any owner-approved resend. Refresh-token failure is never retried silently and never falls back to Gmail.

## Verification boundary

The final Outlook Graph implementation was deterministic-test validated only. No real Microsoft OAuth exchange, Graph `sendMail`, weekly live email, bootstrap rerun or schedule activation was performed during this change. Existing Neon data, three-year bootstrap state, weekly report generation, analytics, quality gate, database schema and purchasing-reference boundary were not changed.

## References

[1]: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0 "Microsoft Graph user: sendMail"
[2]: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code "Microsoft identity platform OAuth 2.0 device authorization grant"
[3]: https://learn.microsoft.com/en-us/graph/auth-register-app-v2 "Register an application with the Microsoft identity platform"
[4]: https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc "Scopes and permissions in the Microsoft identity platform"
[5]: https://learn.microsoft.com/en-us/graph/permissions-reference "Microsoft Graph permissions reference"
