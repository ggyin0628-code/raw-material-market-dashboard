# Microsoft Graph OAuth source notes

These notes preserve the official Microsoft sources consulted for the Outlook Graph mail-provider change.

| Source | Relevant contract |
| --- | --- |
| [Microsoft identity platform OAuth 2.0 device authorization grant](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code) | Device-code requests accept `/common`, `/consumers` or `/organizations`; personal accounts use `/consumers`; the flow returns access and refresh tokens; `offline_access` is required for a refresh token. Device-code polling errors include `authorization_pending`, `slow_down`, `authorization_declined` and `expired_token`. |
| [Microsoft identity platform refresh tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens) | Refresh tokens obtain new access/refresh pairs, are bound to user and client, replace on use, commonly have a 90-day lifetime outside SPA/email-OTP cases, and can be revoked; applications must handle reauthentication. |
| [Microsoft Graph user: sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0) | Delegated `Mail.Send` is the least-privileged permission for personal Microsoft accounts; `POST /me/sendMail` accepts JSON; JSON supports a `#microsoft.graph.fileAttachment` with base64 `contentBytes`; success is HTTP `202 Accepted`; the response does not prove final delivery. |
| [Register an application with the Microsoft identity platform](https://learn.microsoft.com/en-us/graph/auth-register-app-v2) | App registration supports a `Personal Microsoft accounts` audience, including Hotmail; the application/client ID is recorded from the Overview page; public-client/device-code setup does not require a client secret. |
| [Microsoft identity platform scopes and permissions](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc) | Microsoft Graph resource scopes use the `https://graph.microsoft.com/...` form; the required delegated scope is `https://graph.microsoft.com/Mail.Send`; v2.0 requests must explicitly request `offline_access` to receive refresh tokens. |
| [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference) | Least privilege should be used; `Mail.Send` delegated permission is available for personal Microsoft accounts. |

Implementation boundary: the repository uses a native Node device-code helper and direct HTTPS requests so deterministic tests can mock all OAuth/Graph calls without contacting Microsoft. No real OAuth exchange or Graph send was performed during implementation.
