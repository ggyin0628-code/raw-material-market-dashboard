# Phase 4D — Internal Engineering Cost Calibration Pilot V1

**狀態：FEATURE BRANCH READY FOR REVIEW — DO NOT PROMOTE MAIN — DO NOT IMPORT REAL PRIVATE DATA**

本文件描述 Phase 4D 在已核准 Phase 4C localhost/private runtime 上建立的第一版 **內部工程成本估算** pilot workflow。此功能只計算內部工程成本估算與既有歷史內部成本的差異，不建立任何 quotation document，不計算 customer selling price，也不把結果當成 supplier、market 或 customer price。[1]

> 「此結果為內部工程成本估算，不是供應商報價、客戶售價或正式對外報價。」

所有本文件、automated tests、visual captures 與 repository examples 都使用 `SYNTHETIC / DEMO / TEST ONLY` values。Phase 4D 未要求、未讀取、未載入、未保存、未提交、未記錄、未備份任何 real company、supplier 或 historical private value。

## 1. Scope and branch boundary

Phase 4D 的 implementation branch 是 `feat/internal-engineering-cost-calibration-pilot-v1`，由 Phase 4C approved SHA `2d1afa0836688c443202933a7913e52b7e589fab` 建立；certified public main 仍是 `73f1c5ef14266ed162ff8f2127859b877e69a385`。本階段停止於 feature branch review，不能 fast-forward main，也不會部署到既有 Render service。

| Boundary | Phase 4D behavior |
|---|---|
| Public Render / `server.js` | Unchanged; no private pilot route or private cost output is registered |
| Local runtime | Existing `npm run private:estimate`, enabled only by `PRIVATE_RUNTIME_ENABLED=1`, bind only `127.0.0.1` |
| Approved profile | `PRIVATE_RATE_PROFILE_PATH`, absolute repository-external path, strict `PRIVATE_CALIBRATED` / `ACTIVE` / `APPROVED` contract |
| Pilot input | `PRIVATE_CALIBRATION_PILOT_PATH`, absolute repository-external JSON file, loaded at local runtime startup |
| History | Optional local append-only JSONL at `PRIVATE_CALIBRATION_HISTORY_PATH`; external to repository and mode `0600` |
| Private routes | `/private-estimate`, `POST /api/private/estimate`, `POST /api/private/calibration-pilot`, session-protected pilot schema |
| Profile changes | No write-back route; every proposed field is `PROPOSED_ONLY` and raw proposed values are `PROFILE_VALUE_NOT_RETURNED` |
| Public isolation | Public `/estimate` remains `NO_RATE`; anonymous `PRIVATE_CALIBRATED` remains denied; market references keep `engineeringEstimate=null` |

The runtime preserves Phase 4C controls: server-issued `HttpOnly; SameSite=Strict` local session, protected `engineering:private-cost` scope, loopback request enforcement, external audit JSONL and redacted formula traces.[1]

## 2. Single controlled pilot input

The pilot loader accepts only one strict JSON object from outside the repository. The file is not accepted from a request body, is not bundled as an asset, and is not included in a public API. A future operator may create a local file at a path such as `/absolute/path/outside/repository/private-calibration-pilot.json`; this document does not contain or request real values.

The contract has the following shape. Numerical private values may be `null` when the model can still operate, but the implementation never guesses missing calibration or historical values.

| Section | Fields | Meaning |
|---|---|---|
| `part` | `pilotId`, `materialFamily`, `grade`, `thicknessMm`, `blankLengthMm`, `blankWidthMm`, `quantity`, `batchCount` | One known sheet-metal part and explicit engineering quantity |
| `material` | `densityKgM3`, `actualInternalMaterialRatePerKg` | Optional density override and historical/internal material observation |
| `cutting` | `cutLengthMmPerPart`, `pierceCountPerPart`, observed speed or run minutes, observed pierce seconds, setup minutes, internal rates | Cutting and piercing workload plus local observation inputs |
| `bending` | `bendCountPerPart`, observed seconds/bend or run minutes, setup minutes, internal rates | Bending workload plus local observation inputs |
| `welding` | `weldLengthMmPerPart`, observed speed or run minutes, setup minutes, labor/machine rates | Optional welding workload and observation inputs |
| `surfaceTreatment` | `treatedAreaMm2PerPart`, `internalRatePerM2` | Optional surface-treatment area and internal observation |
| `engineeringSetup` | `observedSetupMinutesPerBatch`, `internalRatePerMinute` | Optional engineering setup observation |
| `historicalReference` | `actualHistoricalTotalInternalCost` or `actualHistoricalInternalCostPerPart`, optional `componentCosts` | Existing internal historical reference, total-only or component-level |

The strict contract rejects unknown fields, missing required engineering quantities, invalid enums, non-finite or invalid numbers, negative values, ambiguous total/per-part historical references and invalid component values. A pilot is classified as `KNOWN_COMPONENT_REFERENCE`, `TOTAL_ONLY_REFERENCE` or `NO_HISTORICAL_REFERENCE`.

## 3. Calculation chain

The local pilot follows the certified chain rather than adding a second estimator:

```text
external pilot engineering conditions
  → pilotToEngineeringInput()
  → physical quantities and process workload
  → approved PRIVATE_CALIBRATED profile
  → process-time estimate
  → internal engineering cost estimate
  → historical comparison
  → component variance and diagnostics
  → PROPOSED_ONLY review candidates
```

The calculated cost uses the existing explicit cost components: material, cutting preparation, cutting processing, piercing, bending preparation, bending processing, welding preparation, welding processing, surface treatment and engineering preparation. There is no market adjustment, no supplier margin and no customer-price transformation.

## 4. Historical comparison contract

The private response includes the following local-only comparison object. The `historicalReference` values are intentionally available only inside the protected local pilot response so the operator can review the comparison; they are not returned by the public server, public assets, public schema, audit event or history record.

```text
calibrationComparison:
  historicalComparison:
    referenceType: KNOWN_COMPONENT_REFERENCE | TOTAL_ONLY_REFERENCE | NO_HISTORICAL_REFERENCE
    internalEngineeringCostEstimate:
      estimatedTotalCost
      estimatedCostPerPart
    historicalReference:
      actualTotalCost
      actualCostPerPart
    variance:
      totalCostDifference
      costPerPartDifference
      variancePct
    quality:
      status: NOT_EVALUATED | LARGE_VARIANCE | MODERATE_VARIANCE | CLOSE_MATCH
      thresholds
      thresholdSource
```

When only `actualHistoricalInternalCostPerPart` is supplied, the total reference is derived by multiplying by explicit quantity. When only `actualHistoricalTotalInternalCost` is supplied, per-part reference is derived by dividing by explicit quantity. If the historical value is missing or zero, `variancePct` is `null` rather than an invented percentage.

The variance formula is:

> `variancePct = (estimated - historical) ÷ historical × 100`

Phase 4D uses configurable local thresholds. The default thresholds are synthetic review defaults of absolute variance at or below 5% for `CLOSE_MATCH`, above 5% through 20% for `MODERATE_VARIANCE`, and above 20% for `LARGE_VARIANCE`. These values are labeled `SYNTHETIC_DEFAULT_ONLY`; they are not documented business acceptance limits and must not be treated as certification criteria.

## 5. Component variance and diagnostics

When component-level historical values exist, the service compares the available components `material`, `cutting`, `piercing`, `bending`, `welding`, `surfaceTreatment` and `setup`. Missing component references are omitted rather than defaulted. A total-only reference remains explicitly total-only and produces `INSUFFICIENT_REFERENCE` when component attribution is needed.

Diagnostics describe engineering causes for operator review and do not automatically tune any profile. The V1 categories are `MATERIAL_RATE_VARIANCE`, `CUTTING_TIME_VARIANCE`, `PIERCE_TIME_VARIANCE`, `BENDING_TIME_VARIANCE`, `WELDING_TIME_VARIANCE`, `SETUP_VARIANCE`, `MISSING_CALIBRATION` and `INSUFFICIENT_REFERENCE`. Every diagnostic is labeled `REVIEW_ONLY` and includes an evidence count; it does not contain raw private rates or the pilot payload.

A large or moderate variance is not treated as proof that a particular rate is wrong. One case can reflect material quantity, geometry, setup, machine state, batch behavior, observation quality or an incomplete historical reference. The service therefore reports possible engineering causes instead of silently changing calibration.

## 6. Process-time observation modes

The pilot supports both rate-based and observed-time calibration. Cutting and welding use an observed speed in millimeters per minute or an observed run duration in minutes. Bending uses observed seconds per bend or an observed total run duration.

| Mode | Formula / handling |
|---|---|
| `RATE_BASED` cutting | `totalCutLengthMm ÷ observedCuttingSpeedMmPerMin` |
| `RATE_BASED` bending | `totalBendCount × observedSecondsPerBend ÷ 60` |
| `RATE_BASED` welding | `totalWeldLengthMm ÷ observedWeldingSpeedMmPerMin` |
| `OBSERVED_TIME` | Uses explicit `observedRunMinutes` as the authoritative run observation |
| Setup observation | Compares explicit `observedSetupMinutesPerBatch` with profile-derived setup per batch |

If both rate-based and observed-time fields are present, the pilot must include `authoritativeObservation` set to `OBSERVED_TIME` or `RATE_BASED`. Otherwise the service rejects the input with `OBSERVATION_PRECEDENCE_REQUIRED`; it never silently chooses one mode. The private UI shows the selected mode and safe formula so the operator can verify the precedence.

## 7. Profile update protection and history

The comparison service never writes to the loaded rate profile. Each adjustment candidate contains only:

| Field | Content |
|---|---|
| `status` | `PROPOSED_ONLY` |
| `currentProfileVersion` | Safe profile version identifier |
| `proposedField` | Safe field path such as a calibration field name |
| `proposedValue` | `PROFILE_VALUE_NOT_RETURNED` |
| `reason` | Engineering review reason without raw values |
| `evidenceCount` | Count of supporting pilot evidence |

There is no automatic write-back, no profile mutation endpoint and no overwrite of the external profile after a single case. Any future profile update requires a separate operator approval process and independent review.

The optional local calibration history is append-only JSONL and contains exactly seven safe fields: `pilotId`, `estimateId`, `profileId`, `profileVersion`, `runTimestamp`, `variancePct` and `resultStatus`. It does not duplicate pilot payload, historical actual cost, component values, raw rates, profile metadata or proposed values. The file is repository-external and chmod `0600`; its path is rejected when it resolves inside the repository or through an in-repository symlink.

## 8. Local UI

The existing private page remains the only UI surface. Phase 4D adds a **單一 calibration pilot** control that loads the external pilot already configured at runtime; the page does not accept pilot JSON, historical actual cost or rate fields from the browser. The result sections are:

| UI section | Displayed content |
|---|---|
| 零件工程條件／工程量 | Existing explicit material, geometry and workload inputs |
| 製程時間 | Existing setup, run and piercing components plus pilot observation mode/formula |
| 內部工程成本估算 | Materials, preparation, processing, piercing, welding, surface and engineering setup components; total and per-part result |
| 歷史實際成本比較 | Local historical total/per-part reference, differences, variance percentage and quality status |
| 誤差分析 | Diagnostic categories and review-only causes |
| 校正版本資訊 | Current profile version and `PROPOSED_ONLY` candidates with redacted proposed values |
| 公式與校正依據 | Existing formula trace with all profile-derived values as `PROFILE_VALUE_NOT_RETURNED` |

The visible disclaimer retains the internal-only terminology and states that the result is not an external quotation or selling-price document. Public Render UI is not changed.

## 9. Security and leakage gates

Phase 4D preserves the Phase 4C controls and adds pilot-specific assertions:

| Surface | Required result |
|---|---|
| Public `server.js` route table | No `/api/private/calibration-pilot` or pilot schema route |
| Public engineering API/schema | No historical actual cost, pilot identifier, private rates or private comparison fields |
| Public HTML/JS/nav/status/handoff | No synthetic sentinel or real-value placeholder that could be mistaken for company data |
| Private response | Historical comparison is allowed only in local protected response; raw rates and pilot raw input fields are not returned |
| Private formula trace | Profile-derived values remain `PROFILE_VALUE_NOT_RETURNED` |
| Audit JSONL | Existing Phase 4C seven-field audit contract remains unchanged and excludes pilot/historical payload |
| History JSONL | Safe seven-field history contract only; `0600`, external and append-only |
| Request body | Pilot data and profile data rejected; runtime loads both from external local files |
| Runtime network | `127.0.0.1` only and disabled unless `PRIVATE_RUNTIME_ENABLED=1` |

No real historical case was loaded to exercise these gates. Tests use only explicit synthetic sentinel strings, `TEST_UNITS` and DEMO identifiers; they prove those sentinels do not cross public assets, public APIs, public schema, errors, logs or public documentation.

## 10. Deterministic validation and visual review

The Phase 4D test file covers strict pilot contract validation, repo-external loader behavior, total and per-part historical comparison, variance formula, zero denominator, missing historical reference, component comparison, total-only classification, rate-based and observed-time modes, conflict rejection, quality statuses, diagnostics, proposed-only adjustment, no automatic profile overwrite, safe history schema, mode `0600`, private route/session behavior, request-pilot rejection, raw-rate redaction, pilot/historical leakage prevention, localhost isolation, public API isolation and existing Phase 4A/4B/4C/market regression.

A synthetic local visual smoke was run at desktop `1440×1000` and mobile `390×844`. Both captures reported `horizontalOverflow=false`, `privateResult=true`, `pilotComparison=true`, `proposedOnly=true`, `redactedTrace=true`, `rawRateInput=false` and `sentinel=false`. The artifacts are `docs/visual-review/phase4d-private-pilot-desktop.png`, `phase4d-private-pilot-mobile.png`, `phase4d-capture-metrics.json` and `phase4d-private-ui-observations.md`.

## 11. Stop condition and remaining work before the first real pilot

Phase 4D intentionally ends before real data intake. Before any real profile or historical case is used, a separate approval must complete the value-free intake worksheet and establish an authenticated internal operator boundary, least-privilege identity and scope, encryption/key management, private backup/restore, profile lifecycle and revocation, access audit, retention/deletion rules, redacted logging, leakage scanning, reconciliation protocol, threshold approval and independent calibration certification.[2] [3]

The first real pilot must be exactly one known sheet-metal part with explicit material, thickness, quantity, cutting/piercing/bending and optional welding conditions, plus a known historical internal-cost reference. It must not be expanded to every material, machine, supplier or process in this phase. Missing values remain explicit `null`; no value may be guessed. A successful single case must not be described as proof of model accuracy.

The following operations are prohibited for this Phase 4D delivery: importing real company or supplier data, writing real data to Git or repository assets, public Render deployment, main promotion, Neon migration, Gmail changes, schedule changes, secret changes, workflow triggers, bootstrap, daily/weekly jobs, backfill, mail or any production configuration change.

## References

[1]: ./LOCAL_PRIVATE_CALIBRATION_RUNTIME.md "Phase 4C local private calibration runtime"
[2]: ./phase4b-storage-authorization-audit.md "Phase 4B storage, authorization and audit review"
[3]: ./PRIVATE_CALIBRATION_INTAKE_WORKSHEET.md "Value-free private calibration intake worksheet"
