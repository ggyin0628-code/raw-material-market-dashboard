# Phase 4D private pilot visual smoke observations

本次 visual smoke 只使用 `/tmp/phase4d-private-profile.json` 與 `/tmp/phase4d-private-pilot.json` 的 SYNTHETIC / DEMO / TEST ONLY values；沒有 real company、supplier 或 market values。

## Result observed

The local-only private page rendered `內部工程成本估算` and completed `DEMO_PILOT_4D_VISUAL_001`. The synthetic result showed 2.355 kg/part, 235.5 kg total material, 313 process minutes, and 3,566 TEST_UNITS total internal cost. The historical synthetic reference was 250 TEST_UNITS, yielding 3,316 TEST_UNITS difference and 1,326.4% LARGE_VARIANCE. These monetary and pilot values are local synthetic fixtures only.

Desktop `1440x1000` and mobile `390x844` full-page captures were reviewed. The desktop capture was `1440x4319`; the mobile capture was `390x9277`. Both preserve the two-column/stacked responsive layout, readable comparison cards, diagnostic warnings, proposed-only cards, profile metadata and redacted formula trace. The generated metrics report `horizontalOverflow=false`, `privateResult=true`, `pilotComparison=true`, `proposedOnly=true`, `redactedTrace=true`, `rawRateInput=false` and `sentinel=false` for both viewports.

The page displayed `KNOWN_COMPONENT_REFERENCE`, material/cutting/piercing/bending/setup component variance, `RATE_BASED` observations for cutting and bending, `OBSERVED_TIME` for engineering setup, diagnostics including `MATERIAL_RATE_VARIANCE`, `CUTTING_TIME_VARIANCE`, `PIERCE_TIME_VARIANCE`, `BENDING_TIME_VARIANCE` and `SETUP_VARIANCE`, and proposed fields marked `PROPOSED_ONLY` with `PROFILE_VALUE_NOT_RETURNED`.

Raw rate values were not shown. The existing formula trace retained calibration field names but all profile-derived values were `PROFILE_VALUE_NOT_RETURNED`. The private result included historical actual cost because this is the protected localhost-only pilot comparison response; public server routes remain separate and do not receive the response.

## Follow-up fix required before final gates

The visual result exposed a semantic labeling issue in the bending observation display: the UI showed `observedRunMinutes` correctly as total observed run minutes, but the comparison core’s rate-based bending calculation must remain explicitly documented as `bendCount × observedSecondsPerBend ÷ 60`, not as a speed in mm/min. The pilot-not-configured route is already a safe 503 path with a user-facing local intake message; no profile or pilot path is included in the response. The follow-up visual pass added explicit safe observation formulas, including `totalBendCount × observedSecondsPerBend ÷ 60`; the updated desktop/mobile captures visually show `KNOWN_COMPONENT_REFERENCE` instead of a numeric formatter placeholder and retain the metrics above.
