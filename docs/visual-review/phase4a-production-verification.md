# Phase 4A production verification record

Production base URL: `https://raw-material-market-dashboard-1.onrender.com`

The existing Render service was checked read-only after main promotion to `baaec1ba78c0c475d58ac3320c08e55829610e9b`. Routing checks returned HTTP 200 for `/`, `/machining`, `/sheet-metal`, `/estimate`, `/estimate/`, `/api/engineering/estimate/schema`, `/health` and `/health/weekly`. `/estimate.html` returned HTTP 308 with `Location: /estimate`.

The production schema response returned `runtime.environment=production`, `runtime.allowedRateModes=["NO_RATE"]`, `schema.rateProfile.allowedModes=["NO_RATE"]` and separate `testOnlyModes=["SYNTHETIC_TEST"]`. The production page visibly contained `工程估算`, `非供應商報價` and `未載入公司成本參數`.

One production NO_RATE POST, one omitted-rateProfile POST and one intentional production SYNTHETIC_TEST negative POST were executed exactly once each. The NO_RATE and omitted requests returned HTTP 200; their physical/workload values matched the safe fixture and all monetary fields were null, with `marketReference=null` and `marketAdjustmentFactor=null`. The synthetic request returned HTTP 400 with `state=VALIDATION_ERROR`, top-level `code=SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION`, structured path `input.rateProfile.mode`, no `estimate` object and no synthetic monetary result.

The saved production market API responses returned HTTP 200 for `/api/machining/reference?force=true` and `/api/sheet-metal/reference?force=true`; both retained `engineeringEstimate=null`. The production API responses continued to represent public market references rather than engineering prices.

The production `/estimate` UI was opened and the default safe fixture was submitted. The rendered result showed `2.355 kg` per part, `235.5 kg` total material mass, `145 m` total cut length, `800` pierces, `400` bends, batch count `1`, quantity per batch `100`, NO_RATE and the null-cost explanation. The formula-trace summary was available, and no synthetic-rate or company-rate input panel was present.

## Production visual review

Production screenshots were captured after the main deployment at 1440px desktop and 390×844 mobile viewports. Both cases submitted the safe NO_RATE fixture and rendered the completed estimate. Automated metrics for both cases were `documentWidth=viewportWidth`, `bodyWidth=viewportWidth`, `horizontalOverflow=false`, `hasNoRate=true`, `hasSupplierQuoteLabel=true`, `hasCompanyRateLabel=true`, `hasSyntheticRateInput=false`, `hasFormulaTrace=true`, `traceCount=10` and `quantities=true`. The visual review confirmed readable input fields, navigation without clipping, visible engineering quantities, understandable null-cost messaging and a usable expandable formula trace. No company-rate or synthetic-rate input panel and no fake price output were present.
