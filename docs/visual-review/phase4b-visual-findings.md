# Phase 4B local visual review

The local test server was started from the Phase 4B feature branch at `http://127.0.0.1:4176/estimate` with `NODE_ENV=test`; no production host or private endpoint was used.

Desktop and 390×844 mobile screenshots were captured after submitting the safe default `SHEET_METAL` input. Both rendered the existing physical/workload result, `NO_RATE` null-cost explanation and the new process-time section. Because no approved calibration profile is supplied to the public page, the result correctly showed `尚未載入製程時間校正參數` and explained that cutting speed, bend seconds, welding speed, setup and operator efficiency were not guessed.

The automated metrics for both viewports were: `documentWidth=viewportWidth`, `bodyWidth=viewportWidth`, `horizontalOverflow=false`, `hasNoRate=true`, `hasCalibrationRequired=true`, `hasPrivateBoundary=true`, `hasPrivateRateInput=false`, `hasTimeCard=true`, `hasFormulaTrace=true` and `quantities=true`. The screenshots showed no private rate field, no synthetic rate entry panel, no company rate and no fake price.

Artifacts:

- `phase4b-estimate-desktop.png`
- `phase4b-estimate-mobile.png`
- `phase4b-capture-metrics.json`
