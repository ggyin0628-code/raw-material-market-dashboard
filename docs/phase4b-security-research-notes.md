# Phase 4B security research notes

## Sources

1. OWASP, *Secrets Management Cheat Sheet*: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
2. OWASP, *REST Security Cheat Sheet*: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html

## Findings applied to the Phase 4B audit

OWASP's secrets-management guidance treats secret handling as a lifecycle with centralized access control, authentication, authorization, rotation/expiration, and secure auditing. The guidance calls for audit records that identify who requested a secret and for what role/system, whether access was approved or rejected, when a secret was used or expired, authentication/authorization errors, updates and administrative actions. Phase 4B therefore keeps real company rates out of Git, static assets, response payloads and logs; it requires server-side access control, versioned identifiers, expiry/revocation semantics and tamper-resistant audit requirements before any real profile onboarding.

OWASP's REST guidance emphasizes stateless services, HTTPS for REST endpoints, explicit authentication and authorization, safe error handling and avoiding sensitive data in HTTP responses. Phase 4B therefore leaves `PRIVATE_CALIBRATED` disabled on the anonymous public API and treats a hidden route, query flag, frontend password or obscure URL as insufficient authorization. A future private path must be separately authenticated and authorized before it can read a private profile or return private cost output.

These sources support security controls and evaluation criteria; they do not provide company rates, supplier quotations or material-price assumptions. No real private data was requested, loaded or added during Phase 4B.

GitHub's Secret scanning documentation states that hardcoded credentials committed to repositories become targets for unauthorized access, and that secret scanning scans the entire Git history on all branches for known credential types. It also recommends immediate rotation when a credential leak is detected. This reinforces the Phase 4B rule that real company rates must not be committed, copied into examples, fixtures, screenshots, docs, or logs; synthetic placeholders are the only permitted values in this branch.

3. GitHub Docs, *Secret scanning*: https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning
