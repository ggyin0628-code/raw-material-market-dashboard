# Phase 4B Private Cost Calibration — Storage and Authorization Architecture Audit

**Status:** Architecture-only foundation; no real company, supplier or private rate data is present.

## Executive conclusion

Phase 4B must not place a `PRIVATE_CALIBRATED` profile behind the existing anonymous public Render endpoint. The current application is a public, request-scoped Node HTTP service. A hidden URL, query parameter, frontend password or unadvertised route would not establish identity, authorization or an auditable access decision. OWASP REST guidance treats REST services as stateless and requires explicit transport, authentication, authorization and safe response controls; this audit therefore treats the current public API as permanently `NO_RATE` for the duration of Phase 4B. [2]

The recommended future onboarding order is **local-only private runtime for the first real calibration**, followed by a separately authenticated internal service or private network service only if multi-user operation becomes necessary. A protected database profile can be considered for that later service, but it must not be added to the current public database or anonymous HTTP path. Environment secrets on the existing public Render service are not recommended as the primary store for material and process rates because the service boundary is public and the profile would share the runtime trust domain with public request handling.

This recommendation is deliberately conservative. The current Phase 4B branch implements contracts, deterministic synthetic placeholders, process-time formulas and security tests only. It does not request, import, persist, log, expose or back up any real company data.

## Repository and runtime facts

| Fact | Current Phase 4B implication |
|---|---|
| Main application | Plain Node.js CommonJS HTTP service with static public pages and API routes |
| Existing public host | Render service is publicly reachable and serves anonymous market and engineering endpoints |
| Current engineering production policy | Production HTTP allows `NO_RATE` only; `SYNTHETIC_TEST` is rejected; `PRIVATE_CALIBRATED` is reserved and rejected |
| Existing market storage | Public market observations use the certified public-observation persistence; this is not a private-rate store |
| Phase 4B database scope | No schema change, migration or private profile table in this phase |
| Frontend trust | Browser JavaScript is public and must never contain private rates or private profile material |
| Logging trust | Request logs and error paths must be assumed observable by operators/platform tooling; raw rates must never be logged |

The most important boundary is not the field name but the execution path. Public market intelligence follows `OBSERVED_PUBLIC_DATA → DERIVED_MARKET_REFERENCE`, while private calibration would follow `PRIVATE_RATE_PROFILE → PROCESS_TIME_ESTIMATE → COST_ESTIMATE`. No code path in this phase may join those chains through a market multiplier.

## Candidate storage options

The following evaluation uses the requested dimensions. “Render exposure” means exposure to the existing public service's runtime, deployment, operators and configuration surface; it does not assert that a platform provider is malicious. The risk labels describe the architecture's residual exposure if controls are implemented as stated.

| Option | Confidentiality | Git exposure | Render exposure | API exposure | Log exposure | Backup considerations |
|---|---|---|---|---|---|---|
| A. Environment-secret profile | Medium when correctly injected; weakens if many processes can read the environment | Low if never committed; high if copied into examples or debug output | **High for this project** because the existing service is public and the profile shares its runtime boundary | Low only if never returned and route stays disabled; otherwise high | Medium; accidental startup/config logging can expose values | Secret-manager backup and rotation required; ordinary repository backup must not contain values |
| B. Encrypted/private server-side storage | High when encryption keys, identity, least privilege and network isolation are independently enforced | Low if only identifiers and schemas are committed | Medium if the public Render service can reach the store; low only with a separate private service/network | Low with separate authenticated service; high if mounted into anonymous API | Medium without field redaction and access-event controls | Encrypted backups, key recovery, retention and restore drills required |
| C. Separate local/private runtime | **Highest for initial single-owner calibration** when the machine and storage are controlled | Low if the private workspace is excluded from Git and scanned before sharing | None for the private profile; the public Render service never receives it | None for public API; local/private interface can be bound to a controlled context | Low to medium under local redaction and restricted operator access | Owner-controlled encrypted backup, documented recovery key, retention and offline copy policy required |
| D. Protected database profile | High for a properly isolated private database with KMS/key separation, network controls and least-privilege roles | Low if migrations contain only schema and no fixtures with values | Medium to high if the existing public Render process shares network credentials or database access | Low only through a separately authenticated private service; unacceptable through anonymous public API | Medium; query parameters, SQL errors and debug traces need redaction | Encrypted database backups, key escrow/recovery, point-in-time restore, retention and audit logs required |

Every option can fail through process rather than cryptography. OWASP's secrets guidance emphasizes lifecycle controls, authentication, authorization, rotation, expiration and secure auditing, including who requested a secret, whether access was approved, when it was used or expired, failed access attempts and administrative changes. [1] Those controls are prerequisites for real onboarding, not optional enhancements after the first import.

## Versioning, rollback and auditability requirements

A private profile must be versioned by non-secret identifiers: `rateProfileId`, `version`, `effectiveFrom`, `effectiveTo` and `status`. A cost response may record only safe identifiers and a calculation timestamp. It must not echo the rate values. A profile should be immutable after activation; corrections create a new version, and rollback selects a previously approved version without rewriting calculation history.

| Control | Minimum future requirement | Phase 4B status |
|---|---|---|
| Identity | Verified user or service identity, not a shared URL or frontend flag | Design only; no private endpoint enabled |
| Authorization | Explicit scope such as `engineering:estimate:private`; deny by default | Design only; anonymous public API remains denied |
| Profile lifecycle | Draft, review, approved, active, expired, revoked states | Contract/documentation design only |
| Versioning | Identifier and version in output; secret values excluded | Synthetic metadata only |
| Rollback | Select approved prior version; preserve audit history | No real profile store exists |
| Audit | Access request, approval/denial, actor, purpose, profile identifier, timestamp and administrative change; no raw rates | Required future control; no real access events in this phase |
| Rotation/revocation | Expiry, revocation and replacement without Git history edits | Required future control |
| Backups | Encrypted, access-controlled, tested restore; no values in public artifacts | No private backup created |

GitHub documents that hardcoded credentials committed to a repository become targets for unauthorized access and that secret scanning covers the complete Git history on all branches. [3] Therefore, deleting a private rate from the latest commit would not be a sufficient remediation. The Phase 4B branch keeps real rates absent from code, fixtures, screenshots, documentation examples, generated assets, logs and test output.

## Authorization strategy

The existing anonymous public API is a deliberate fail-closed boundary. It accepts `NO_RATE`, rejects `SYNTHETIC_TEST` in production and must continue rejecting `PRIVATE_CALIBRATED`. The Phase 4B architecture may define a future private service interface, but it must not register that interface on the current public host. A future implementation must establish authentication, authorization, tenant or owner scope, request purpose, audit event creation, response redaction and revocation behavior before reading a private profile.

The first real calibration should therefore run in a local-only private runtime with no public endpoint and with the profile supplied through a controlled private file or local secret store. If the company later requires shared access, the next candidate is a separately deployed internal service with an identity provider, short-lived credentials, least-privilege profile access, encrypted storage, audit logging and network restrictions. The current Render service should remain a public market/engineering reference service and continue to return `NO_RATE`.

## Phase 4B decision

| Decision | Rationale |
|---|---|
| Implement profile contract and version metadata | Makes later onboarding explicit and reviewable without importing values |
| Implement synthetic placeholder fixtures only | Proves workload → time → cost formulas without representing company pricing |
| Implement process-time estimates before cost | Allows useful deterministic engineering output while keeping monetary calibration gated |
| Keep `PRIVATE_CALIBRATED` unavailable to anonymous production HTTP | Existing public service has no approved identity or authorization boundary |
| Do not add private database schema | Avoids irreversible production data/storage changes before security design is certified |
| Recommend local-only first real onboarding | Minimizes Render/API exposure and keeps private data outside public runtime |
| Re-evaluate separate authenticated private service for multi-user use | Provides a path for identity, audit, versioning, key management and controlled backups |

This audit does not approve real-data onboarding. Before any real company calibration, a separate review must approve the selected deployment boundary, identity provider, authorization scopes, encryption/key management, backup and restore plan, profile lifecycle, redacted logging, incident response, access audit, test fixtures and production certification gates.

## References

[1]: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html "OWASP Secrets Management Cheat Sheet"
[2]: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html "OWASP REST Security Cheat Sheet"
[3]: https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning "GitHub Docs — Secret scanning"
