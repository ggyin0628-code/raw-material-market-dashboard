# Phase 4B — Private Cost Calibration & Process-Time Foundation V1

**Status:** Feature-branch implementation; architecture and deterministic synthetic verification only. **No real company, supplier or private calibration data has been requested, loaded, committed, logged, backed up or exposed.**

## Scope and safety verdict

Phase 4B extends the certified Phase 4A chain conceptually from:

> `ENGINEERING_INPUT → PHYSICAL_CALCULATION → PROCESS_WORKLOAD → ENGINEERING_ESTIMATE`

to:

> `ENGINEERING_INPUT → PHYSICAL_CALCULATION → PROCESS_WORKLOAD → PROCESS_TIME_ESTIMATE → PRIVATE_RATE_PROFILE → COST_ESTIMATE`

The implementation deliberately stops before real private-data onboarding. The public Render service remains an anonymous public market and engineering-reference service. Its engineering endpoint continues to allow `NO_RATE` only in production; `SYNTHETIC_TEST` remains a non-production deterministic fixture mode, and `PRIVATE_CALIBRATED` is rejected by the anonymous public API. The public UI does not provide private rate inputs. The public market chain remains separate from the private calibration chain, and `marketAdjustmentFactor` remains `null`.

This fail-closed boundary follows the principle that a hidden route, query flag, frontend password or obscure URL is not authorization. A future private runtime must establish identity, explicit scope, audit events and redacted responses before reading a private profile. OWASP's REST guidance emphasizes stateless services, HTTPS, authentication, authorization and safe handling of response data. [2]

## Current implementation boundary

| Area | Phase 4B V1 behavior |
|---|---|
| Implemented process family | `SHEET_METAL` only, inherited from Phase 4A |
| Physical quantities | Phase 4A formulas unchanged |
| Workload quantities | Phase 4A cut, pierce, bend, weld, treatment and batch quantities unchanged |
| Process time | Explicit synthetic or protected profile input only; otherwise `CALIBRATION_REQUIRED` and time fields are `null` |
| Surface-treatment time | `NO_MODEL`; treated area remains available, `processingMinutes=null` |
| Public production API | `NO_RATE` only; no `PRIVATE_CALIBRATED` route or profile input |
| Private cost service | Internal module boundary only; not registered in `server.js` or any GET endpoint |
| Persistence | No database schema, migration, private profile table or production write |
| Frontend | Shows calibration-required status; contains no private rate fields or values |
| Market relationship | Read-only conceptual context only; no market multiplier and no automatic company-rate change |

## Process-time contract

The process-time model never derives speed or efficiency solely from material family, thickness, geometry or a market score. A process is calculated only when its required calibration values are explicit and validated. When calibration is absent, the result is `CALIBRATION_REQUIRED` rather than a guessed number.

| Process | Explicit calibration inputs | Formula | Missing calibration behavior |
|---|---|---|---|
| Cutting run | `cuttingSpeedMmPerMin` | `totalCutLengthMm ÷ cuttingSpeedMmPerMin` | `runMinutes=null` and process time remains unavailable |
| Piercing | `pierceTimeSecondsEach` | `totalPierceCount × pierceTimeSecondsEach ÷ 60` | `pierceMinutes=null` and process time remains unavailable |
| Cutting setup | `setupMinutesPerBatch` | `setupMinutesPerBatch × batchCount` | setup is not guessed |
| Bending run | `secondsPerBend` | `totalBendCount × secondsPerBend ÷ 60` | `runMinutes=null` and process time remains unavailable |
| Bending setup | `setupMinutesPerBatch` | `setupMinutesPerBatch × batchCount` | setup is not guessed |
| Welding run | `weldingSpeedMmPerMin` | `totalWeldLengthMm ÷ weldingSpeedMmPerMin` | `runMinutes=null` and process time remains unavailable |
| Welding setup | `setupMinutesPerBatch` | `setupMinutesPerBatch × batchCount` | setup is not guessed |
| Surface treatment | No V1 time calibration | None | `processingMinutes=null`, state `NO_MODEL` |

The returned process-time object keeps setup and run time separate. Its `overall` object exposes `totalSetupMinutes`, `totalRunMinutes` and `totalProcessMinutes`. Disabled processes contribute zero; they do not consume an unreported default duration. No hidden operator efficiency, machine availability, thickness factor, acceleration, queue time, rework, changeover or utilization constant is introduced.

Batch handling is explicit. With a fixed workload and setup calibration, changing `batchCount` changes setup burden while leaving per-part run workload unchanged. This makes the dilution effect visible rather than hiding setup inside a unit rate.

## Private rate-profile contract

The internal profile contract is strict and versioned. It defines a conceptual shape for later review; it is not a claim about final company accounting fields. The contract requires `mode`, `rateProfileId`, `version`, `effectiveFrom`, optional `effectiveTo`, `status`, `currency` and explicit process sections. `PRIVATE_CALIBRATED` requires `status=ACTIVE`; `SYNTHETIC_TEST` requires `status=TEST_ONLY`.

| Section | Contract fields | Units |
|---|---|---|
| Material | `carbonSteelRatePerKg`, `stainlessSteelRatePerKg`, `aluminumRatePerKg`, `copperRatePerKg` | currency/kg |
| Cutting | `machineRatePerMinute`, `setupRatePerMinute`, `pierceTimeSecondsEach`, `cuttingSpeedMmPerMin`, `setupMinutesPerBatch` | currency/min, seconds/each, mm/min, min/batch |
| Bending | `machineRatePerMinute`, `setupRatePerMinute`, `secondsPerBend`, `setupMinutesPerBatch` | currency/min, seconds/each, min/batch |
| Welding | `laborRatePerMinute`, `machineRatePerMinute`, `weldingSpeedMmPerMin`, `setupMinutesPerBatch` | currency/min, mm/min, min/batch |
| Surface treatment | `ratePerM2` | currency/m² |
| Engineering setup | `engineeringSetupRatePerMinute`, `engineeringSetupMinutesPerBatch` | currency/min, min/batch |

The schema describes field names and units but never embeds a rate value. `safeProfileMetadata` returns only safe identifiers and lifecycle metadata: mode, source label, profile ID, version, effective dates, status and currency. Formula trace entries use `PROFILE_VALUE_NOT_RETURNED` for rate inputs. A cost response therefore records how the result was calculated without echoing the raw profile.

## Cost calculation and traceability

Cost is calculated only after a valid process-time result and a valid profile. Every component is an explicit engineering quantity multiplied by an explicit profile field. The V1 cost breakdown is:

> `materialCost = totalMaterialMassKg × materialRatePerKg`
>
> `cuttingSetupCost = cutting.setupMinutes × cutting.setupRatePerMinute`
>
> `cuttingRunCost = cutting.runMinutes × cutting.machineRatePerMinute`
>
> `piercingCost = cutting.pierceMinutes × cutting.machineRatePerMinute`
>
> `bendingSetupCost = bending.setupMinutes × bending.setupRatePerMinute`
>
> `bendingRunCost = bending.runMinutes × bending.machineRatePerMinute`
>
> `weldingSetupCost = welding.setupMinutes × (laborRatePerMinute + machineRatePerMinute)`
>
> `weldingRunCost = welding.runMinutes × (laborRatePerMinute + machineRatePerMinute)`
>
> `surfaceTreatmentCost = totalTreatedAreaM2 × ratePerM2`
>
> `engineeringSetupCost = engineeringSetupMinutesPerBatch × batchCount × engineeringSetupRatePerMinute`

`totalEstimatedCost` is the sum of these explicit components, and `estimatedCostPerPart` divides that total by quantity. No opaque market, margin, overhead, efficiency or pressure multiplier is applied. The private output includes process-time trace entries and cost trace entries. Each entry carries a source field, formula, explicit input names, unit conversion, result, output unit and safe profile ID/version. Raw profile rates are never returned.

For the public production path, these monetary fields remain `null`. The public response includes a `CALIBRATION_REQUIRED` process-time object when no approved calibration is available. This lets the UI explain the missing calibration without exposing any confidential input.

## Authorization boundary

The current anonymous public API is intentionally not a private costing interface. `POST /api/engineering/estimate` rejects `PRIVATE_CALIBRATED` with a structured HTTP 403 response and code `PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API`; the production schema declares `NO_RATE` as the only runtime rate mode. There is no `/api/engineering/private-cost` route, no query-parameter bypass and no frontend secret.

The internal protected service requires all of the following before it can calculate a `PRIVATE_CALIBRATED` result:

1. An authenticated private-runtime identity.
2. An explicit authorization scope `engineering:private-cost`.
3. A strict profile with `mode=PRIVATE_CALIBRATED` and `status=ACTIVE`.
4. A required audit logger that records safe access metadata and the approval decision without raw rates.
5. A response that contains identifiers and trace metadata only, not the profile values.

The service rejects missing identity, missing scope, missing audit logger, non-active private profiles and non-private modes. This is an internal architecture boundary, not a claim that the current public Render host has been converted into a secure private service.

## Storage and private-data architecture audit

Four candidate storage approaches were evaluated before implementation. OWASP's secrets guidance emphasizes lifecycle controls, least-privilege access, rotation, expiration and secure auditing, including who requested a secret, whether access was approved, when it was used or expired and which administrative actions occurred. [1]

| Option | Decision for Phase 4B | Main rationale |
|---|---|---|
| Environment-secret profile | Not recommended for first real onboarding on current Render | It shares the public service runtime boundary and can leak through configuration or debug logging if mishandled |
| Encrypted/private server-side storage | Future candidate | Suitable only with identity, key separation, least privilege, encrypted backup and a separate private service boundary |
| Separate local/private runtime | **Recommended first real-data path** | Keeps the first calibration outside public Render, anonymous API, public assets and public database |
| Protected database profile | Future multi-user candidate | Requires private network/access roles, key management, redacted logs, backups, restore drills and a separate authorized service |

The local/private recommendation is not based only on convenience. It minimizes the number of components that can observe the first real profile and makes it possible to validate profile lifecycle, approval, rotation and rollback before exposing a shared interface. If collaboration later requires a service, the architecture should move to a separately authenticated internal runtime rather than extending the current anonymous endpoint.

## Repository, log and backup controls

Real profiles must never be committed to Git, examples, fixtures, screenshots, static assets, schema responses, debug metadata, request logs or public market APIs. GitHub documents that hardcoded credentials in repositories become targets for unauthorized access and that secret scanning covers the complete Git history on all branches. [3] Removing a value from the latest commit would therefore not be an adequate response to a leak; revocation and rotation would be required.

Before real onboarding, the owner must define encrypted private backups, retention, recovery-key handling, restore testing, profile approval, expiration, revocation and incident response. Logs must record safe identifiers and access decisions but redact profile values and request bodies. Version and rollback must select immutable approved profile versions; they must not rewrite calculation history or require copying rates into source control.

## Synthetic-only offline demo

The Phase 4B tests use values labeled `SYNTHETIC / DEMO / TEST ONLY` solely to prove:

> `workload → process time → cost formula`

Synthetic profiles require `status=TEST_ONLY`, remain outside the production HTTP allowlist and are not realistic Taiwan, company or supplier prices. The production UI contains no synthetic profile input. No synthetic fixture is stored in documentation examples, screenshots or public response fixtures beyond non-sensitive labels and symbolic field names.

## Verification and future onboarding gates

The implementation test suite covers cutting run, piercing, setup, bending, welding, batch dilution, missing calibration, synthetic deterministic cost, strict profile lifecycle/version validation, formula trace units, no hidden efficiency, no hidden market multiplier, public schema leakage, public response leakage, anonymous API protection, existing market regression and unchanged Phase 4A physical quantities.

Real-data onboarding is explicitly blocked until a separate certification reviews the following items:

| Gate | Required evidence before real calibration |
|---|---|
| Boundary | Selected local/private or separate authenticated service boundary; no anonymous public path |
| Identity | Verified identity, scope, deny-by-default policy and revocation procedure |
| Storage | Encryption, key ownership/separation, private backups and restore test |
| Profile lifecycle | Draft/review/approved/active/expired/revoked states with immutable versions |
| Calculation | Process-time calibration validation, quantity/time/cost reconciliation and independent review |
| Leakage | Repository, static asset, schema, response, log, screenshot and debug scans |
| Audit | Safe access event, approval/denial, profile ID/version, timestamp and administrative audit trail |
| Operations | Rollback, rotation, incident response and change-management plan |
| Production | Separate explicit approval; no automatic enablement through the current public Render service |

## Current blockers and next phase

There is no blocker to reviewing this architecture-only foundation. The blockers to real company calibration are intentional: no approved private deployment boundary, identity provider, authorization scope, encrypted private store, key-management plan, audit trail, backup/restore process, profile approval workflow or independent calibration sign-off has been activated in this phase. No real rates should be supplied until those controls are separately implemented and certified.

Phase 4B V1 does not implement non-rectangular geometry, hole/void subtraction, nesting/remnant models, certified material properties, machine capability, process-time queue/rework models, coating/plating time, multi-tenant policy, ERP integration or supplier quotation behavior. It also does not use a market score to alter a private rate. These remain separately reviewable future work.

## References

[1]: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html "OWASP Secrets Management Cheat Sheet"
[2]: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html "OWASP REST Security Cheat Sheet"
[3]: https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning "GitHub Docs — Secret scanning"
