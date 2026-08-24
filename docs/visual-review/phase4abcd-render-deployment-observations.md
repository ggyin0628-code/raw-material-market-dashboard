# Phase 4B–4D Render deployment observation

At 2026-08-24 00:16 GMT+8, the existing Render service `raw-material-market-dashboard-1.onrender.com` was read after the main push. Render displayed its application-loading interstitial with the sequence `SERVICE WAKING`, `ALLOCATING COMPUTE RESOURCES`, `PREPARING INSTANCE`, `STARTING THE INSTANCE`, `ENVIRONMENT VARIABLES INJECTED`, `FINALIZING STARTUP`, and `OPTIMIZING DEPLOYMENT`. No application route response was available yet. This is a read-only observation; no new Render service or configuration was created.

## Production read-only verification result

After the main push, the existing Render service served the application normally. Read-only `GET /`, `/machining`, `/sheet-metal`, `/estimate`, `/health` and `/health/weekly` returned HTTP 200. The legacy `/machining.html` and `/sheet-metal.html` returned HTTP 308 to their canonical routes.

Public API checks returned HTTP 200 for `/api/engineering/estimate/schema`, `/api/engineering/estimate` with NO_RATE, `/api/machining/reference?force=true` and `/api/sheet-metal/reference?force=true`. The production schema allowed `NO_RATE` only. NO_RATE returned null monetary output, and both market APIs retained `engineeringEstimate=null`. `PRIVATE_CALIBRATED` returned HTTP 403 with `PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API`; `SYNTHETIC_TEST` returned HTTP 400 with `SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION`.

Public private-route checks returned no private runtime content: `GET /private-estimate` returned 404, while `POST /api/private/estimate` and `POST /api/private/calibration-pilot` returned 405 method-gate responses with no private content. The responses are clearly unregistered on the public server.

Production visual review used read-only screenshots at desktop `1440x1000` and mobile `390x844` for `/`, `/machining`, `/sheet-metal` and `/estimate`. All eight captures returned HTTP 200 and `horizontalOverflow=false`; all had `privatePilotButton=false`, `privateRuntimeTitle=false` and `privateProfileMetadata=false`. The public estimate retained NO_RATE labels and contained no pilot button or private profile metadata.

The homepage showed the existing public navigation and public market-data dashboard. The mobile public estimate showed the NO_RATE state, null-cost boundary language and stacked responsive layout. Public source failures/STALE/API_ERROR states observed on the homepage were presented as truthful data-quality states, not private-calibration failures.
