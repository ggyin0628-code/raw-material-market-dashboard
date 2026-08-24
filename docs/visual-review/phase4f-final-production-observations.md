# Phase 4F Final Production Boundary Verification

Initial Render read-only navigation after the main promotion showed a temporary Render application-loading/waking screen, followed by the deployed public homepage at `https://raw-material-market-dashboard-1.onrender.com/`. The loaded homepage title is `原物料行情查詢系統`, and the visible public navigation contains only 原物料市場, 加工市場參考, 鈑金市場參考 and 工程估算. No standalone calculator link, offline calculator label or `InternalEngineeringCostCalculator` link was visible in the homepage navigation or content.

This is a deployment checkpoint only; route/API assertions are recorded after the remaining read-only requests. No form was submitted, no button was clicked, and no job, mail or write operation was triggered.

## Final read-only results

The existing Render service completed normal deployment from the promoted `main`. The safe verification artifact `phase4f-final-production-verification.json` records the exact status results without storing full public response bodies.

| Area | Result |
|---|---|
| Public pages | `/`, `/machining`, `/sheet-metal`, `/estimate`: HTTP 200 |
| Existing assets | `/styles.css`, `/app.js`, `/nav.js`, `/machining.js`, `/sheet-metal.js`, `/estimate.js`: HTTP 200 |
| Standalone namespace | `/standalone`, `/standalone/`, `/standalone/InternalEngineeringCostCalculator.html`, `/standalone/test.html`: HTTP 404 `Not found`; no redirect |
| Encoded path | `/standalone%2FInternalEngineeringCostCalculator.html`: HTTP 404 `Not found`; no redirect |
| Public navigation | No standalone link, calculator title or internal calculator name |
| Engineering schema | HTTP 200; `allowedModes=["NO_RATE"]` |
| NO_RATE | HTTP 200; every monetary field null; `marketReference=null`; `marketAdjustmentFactor=null` |
| PRIVATE_CALIBRATED | HTTP 403; `PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API` |
| SYNTHETIC_TEST | HTTP 400; `SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION` |
| Market isolation | Machining and sheet-metal API HTTP 200; `engineeringEstimate=null` |
| Health | `/health` and `/health/weekly`: HTTP 200; top-level `status=OK` |

All public page, asset and standalone-deny checks were read-only. No public response contained the calculator title, calculator HTML, calculator field names or `TEST_ONLY` content. No form was submitted and no job, workflow, mail or write operation was triggered.
