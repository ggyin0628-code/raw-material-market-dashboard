# Private Calibration Intake Worksheet Specification

**Status:** Template specification only. Do not fill with real company or supplier values in this repository.

This worksheet is the intake contract for a future approved private calibration profile. It is intentionally value-free here. A completed worksheet must be stored outside Git and outside public Render, then reviewed before it can produce an internal engineering cost estimate.

## Profile governance

| Field | Required content | Repository placeholder |
|---|---|---|
| Profile ID | Immutable approved identifier | `REPLACE_WITH_APPROVED_PRIVATE_PROFILE_ID` |
| Version | Monotonic or otherwise governed version | `REPLACE_WITH_VERSION` |
| Source | Internal source or controlled calibration record | `REPLACE_WITH_APPROVED_INTERNAL_SOURCE` |
| Effective from | ISO date-time | `REPLACE_WITH_EFFECTIVE_DATE` |
| Effective to | ISO date-time or open-ended policy value | `REPLACE_WITH_EFFECTIVE_TO_OR_NULL` |
| Owner | Named accountable owner or controlled identity | `REPLACE_WITH_PROFILE_OWNER` |
| Approval status | Must reach `APPROVED` before activation | `REPLACE_WITH_APPROVAL_STATUS` |
| Runtime status | Must be `ACTIVE` for private estimate | `ACTIVE_ONLY_AFTER_APPROVAL` |
| Currency | Controlled currency identifier | `REPLACE_WITH_APPROVED_CURRENCY` |
| Review cadence | Renewal/expiry rule | `REPLACE_WITH_REVIEW_CADENCE` |

## Material calibration

| Material family | Required field | Unit | Value in this repository |
|---|---|---|---|
| `CARBON_STEEL` | Material rate per kg | currency/kg | Not supplied |
| `STAINLESS_STEEL` | Material rate per kg | currency/kg | Not supplied |
| `ALUMINUM` | Material rate per kg | currency/kg | Not supplied |
| `COPPER` | Material rate per kg | currency/kg | Not supplied |

The worksheet must state whether the value is an internal accounting input, an approved planning input or another controlled category. It must not be described as a market quote or supplier quotation unless a separate commercial process approves that terminology.

## Cutting calibration

| Field | Unit | Value in this repository |
|---|---|---|
| Cutting speed | mm/min | Not supplied |
| Pierce time each | seconds/each | Not supplied |
| Machine rate | currency/min | Not supplied |
| Setup rate | currency/min | Not supplied |
| Setup time per batch | min/batch | Not supplied |

The owner must document machine scope, material/thickness scope, measurement method, whether setup includes tooling/changeover, and the date and version of the observation set.

## Bending calibration

| Field | Unit | Value in this repository |
|---|---|---|
| Seconds per bend | seconds/each | Not supplied |
| Machine rate | currency/min | Not supplied |
| Setup rate | currency/min | Not supplied |
| Setup time per batch | min/batch | Not supplied |

The owner must document whether the seconds-per-bend observation includes handling, inspection, repositioning or only machine actuation. Any excluded burden must be modeled separately or declared outside scope.

## Welding calibration

| Field | Unit | Value in this repository |
|---|---|---|
| Welding speed | mm/min | Not supplied |
| Labor rate | currency/min | Not supplied |
| Machine rate | currency/min | Not supplied |
| Setup time per batch | min/batch | Not supplied |

The owner must document process family, joint/material scope, preparation assumptions, consumables policy and whether inspection/rework is excluded. No implied efficiency factor may be inserted without a separately approved model.

## Engineering/setup calibration

| Field | Unit | Value in this repository |
|---|---|---|
| Engineering setup time per batch | min/batch | Not supplied |
| Engineering/setup rate | currency/min | Not supplied |

The intake owner must define whether this is programming, drawing review, nesting preparation or another controlled activity. A single field must not silently combine unrelated commercial overhead.

## Surface treatment calibration

| Field | Unit | Value in this repository |
|---|---|---|
| Surface treatment rate | currency/m² | Not supplied |
| Treatment process scope | controlled description | Not supplied |
| Processing time | min | **No Phase 4C model** |

Phase 4C can calculate surface-treatment cost from area if an approved rate is later provided, but it intentionally does not infer surface-treatment processing time.

## Review and security checklist

Before a real profile is activated, the owner must attach evidence for the source, measurement period, effective date, scope, approval decision, version, expiry/revocation rule and reconciliation against an independent sample. The completed file must live at a repo-external `PRIVATE_RATE_PROFILE_PATH`, be readable only by the private runtime account, remain absent from logs and screenshots, and be covered by backup, restore, rotation and incident-response procedures.

The current public Render endpoint must not receive the completed worksheet or profile. The public schema, public API response, public HTML/JavaScript and market reference APIs must remain free of raw private values. Activation is a separate certification decision and is outside Phase 4C.
