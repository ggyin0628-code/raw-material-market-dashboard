# Raw Material Dashboard — Project Status

## Status verdict

**OUTLOOK_GRAPH_MAIL_IMPLEMENTATION_READY**

**OFFLINE_GAPS = 0**

**CODEX_HANDOFF_READY = YES**

The existing bootstrap-performance certification remains valid. This change adds a production-safe personal Microsoft Graph delegated OAuth2 mail provider without changing public market logic, analytics thresholds, quality semantics, Neon schema, three-year bootstrap behavior or purchasing-reference boundaries.

## Delivery identity

| Item | Result |
| --- | --- |
| Repository | `ggyin0628-code/raw-material-market-dashboard` |
| Authoritative baseline | `8390a0234fb5d18e28e100ee1ff40750b6b0d95e` |
| Existing bootstrap remediation | `fix/bootstrap-performance-v1` / `bootstrap-performance-certified-v1` |
| New feature branch | `feat/outlook-graph-mail-v1` |
| Graph implementation SHA | `1372244d6cb32f696378595f53b6c6072678674f` |
| Final promoted SHA | To be recorded after fast-forward promotion and tag verification |
| Required checkpoint tag | `outlook-graph-mail-v1` |
| Required tag message | `Personal Outlook Graph delegated OAuth2 mail provider — test-mail verification next` |
| Main promotion | Required fast-forward only; no force push |
| Schedule state | Not enabled or modified; `PRODUCTION_SCHEDULES_ENABLED` remains owner-controlled and off/absent |
| Live mail state | Not triggered; no Microsoft OAuth exchange or Graph send performed by this change |
| Paid resources / deployment | None added / not performed |

## Permanent product and data boundary

This is an **external public market intelligence and purchasing-reference platform**. Only public external market observations, public-source provenance, canonical quality states and derived public reports may be stored. SAP, company procurement history, supplier quotations or names, company target prices, private thresholds, inventory, MOQ, payment terms, company email systems, private mappings, credentials and private runtime reports remain permanently out of scope. The account boundary is the owner’s personal `ggyin0628@hotmail.com`; company Microsoft 365 is prohibited.

## Existing bootstrap certification retained

The cancelled `Market Production Bootstrap #1` run `32609131444` on baseline main completed setup, checkout, dependency installation, code validation, migration and storage check in approximately 14 seconds, then occupied the 30-minute safety ceiling in `Bootstrap public history`. The bottleneck was **BOTH**: sequential public-history fetching and per-record PostgreSQL lookup/write round-trips.

The existing remediation kept the complete `--period 3y` bootstrap and 30-minute safety ceiling, added bounded fetch concurrency 3 (cap 4), default Postgres batch upsert size 250 (cap 500), one parameterized multi-row transaction per batch, status-quality preservation, chunk resumability and safe progress. Run `32611318090` established the successful promoted-main Neon bootstrap, and run `32611472483` verified final callback-forwarded batch telemetry. Both were bootstrap-only, with no weekly mail and no schedule activation. No bootstrap rerun is needed for this Graph change.

## Outlook Graph implementation

Production weekly now sets `MAIL_PROVIDER=outlook_graph`, `MICROSOFT_TENANT=consumers`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_REFRESH_TOKEN`, `MAIL_FROM`, `MAIL_TO` and `MAIL_TEST_TO`. Gmail SMTP environment wiring was removed from the production weekly workflow. The old SMTP module remains only for an explicit `MAIL_PROVIDER=smtp` compatibility path and is not a production fallback.

The Graph provider exchanges the delegated refresh token for an access token in memory and posts the existing report as JSON to `/me/sendMail`. It requests only `offline_access` and `https://graph.microsoft.com/Mail.Send`. The XLSX is encoded as a `#microsoft.graph.fileAttachment` with base64 `contentBytes`. Graph `202 Accepted` records `TEST_SENT` or `SENT`; `401`, `403`, refresh-token failure, malformed payload and config errors are explicit redacted failures. `429`, `5xx`, bounded network errors and timeouts use bounded retry. No response body, OAuth token or recipient list is logged or stored in the ledger, and there is no silent SMTP fallback.

`MAIL_TEST_MODE=1` forwards only `MAIL_TEST_TO` and omits production CC／Reply-To. The delivery ledger and duplicate guard are unchanged. `production:weekly` now prints a concise safe summary containing reporting week, quality state/counts, provider/mail state, recipient/attachment counts, artifact basenames and duration; it no longer dumps the full report/history payload.

## Owner OAuth helper

`npm run microsoft:oauth` is a one-time owner-controlled device-code helper. It uses the `consumers` authority, prints only a verification URL, transient user code, tenant, scopes and output path, refuses repository output, writes a mode-600 refresh-token file outside the repository, and never prints access or refresh tokens. The owner must register **Personal Microsoft accounts** only, add delegated Microsoft Graph `Mail.Send` only, sign in as `ggyin0628@hotmail.com`, store the client ID and refresh token in Actions secrets, and delete the temporary file. No client secret, application permission or corporate Microsoft 365 account is used.

## Validation status

| Gate | Result |
| --- | --- |
| Existing bootstrap/storage/report suite | PASS: 43 passed / 0 failed before Graph additions |
| Outlook Graph deterministic suite | PASS: 53 passed / 0 failed |
| OAuth token refresh | PASS: mocked consumers endpoint, required scopes, explicit refresh failure |
| Graph sendMail | PASS: mocked `202`, HTML body and XLSX fileAttachment |
| Graph HTTP failures | PASS: mocked `401`, `403`, `429`, `500`, `503`; sanitized and bounded |
| Test recipient isolation | PASS: only `MAIL_TEST_TO`; production recipients and SMTP not called |
| Duplicate guard | PASS: `TEST_SENT` week returns `DUPLICATE_PREVENTED` |
| OAuth secret redaction | PASS: tokens and authorization values absent from result/ledger/error output |
| Device-code helper | PASS: mocked polling, consumers scopes, no token print, repository-output rejection |
| Concise CLI output | PASS: full report/history excluded |
| Local gates | PASS: `npm ci`, check, explicit syntax, test, build, audit, YAML, diff check and security scan |
| Neon/bootstrap | UNCHANGED / not rerun |
| Weekly live mail | NOT PERFORMED |
| Schedule activation | NOT PERFORMED; gate remains off/absent |

All external Microsoft calls are mocked in tests. No real Microsoft OAuth exchange, Graph sendMail, weekly workflow, bootstrap rerun, schedule activation, Neon write or Actions secret operation was performed for this change.

## Next owner action

The exact next owner action after feature promotion and tag verification is:

> Run exactly one `Market Weekly Intelligence Report` manually while `WEEKLY_MAIL_TEST_MODE=1`, verify the received Outlook HTML report and XLSX attachment, then set `PRODUCTION_SCHEDULES_ENABLED=1`.

The remediation agent must not trigger this workflow, send mail, modify the schedule variable or handle the refresh token.

## References

[1]: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0 "Microsoft Graph user: sendMail"
[2]: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code "Microsoft identity platform OAuth 2.0 device authorization grant"
[3]: https://learn.microsoft.com/en-us/graph/auth-register-app-v2 "Register an application with the Microsoft identity platform"
[4]: https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc "Scopes and permissions in the Microsoft identity platform"
[5]: https://github.com/ggyin0628-code/raw-material-market-dashboard/commit/1372244d6cb32f696378595f53b6c6072678674f "Graph implementation SHA"
