# Codex Handoff

## Repository and authoritative revision

Repository: `ggyin0628-code/raw-material-market-dashboard`.

The audited baseline was public `main` at `7658a8c74dd4a09a7b5bedd5677cd094fdb6770a`. The implementation branch is `feat/raw-material-dashboard-hardening-v1`; it is authoritative for this hardening change. The final commit SHA and remote SHA are filled in after the final push. `main` must not be merged or modified by this task.

## Product boundary

This repository implements a **raw-material public market-trend / purchasing-reference dashboard**. It is not a supplier quotation service, an ERP purchasing module, a Taiwan spot-price database, a contract-price system, or a confirmed purchase recommendation engine. Public futures prices and converted TWD values are market references only. Supplier quotes, taxes, freight, delivery terms, inventory, company thresholds, SAP and purchase approvals are outside this repository.

## Architecture

The service is a small CommonJS Node.js application with no frontend framework. `server.js` uses the built-in HTTP, filesystem, path, URL and OS modules to serve static assets and API routes. `index.html`, `styles.css` and `app.js` provide the browser dashboard. `lib/marketData/` contains the material registry, public provider adapters, normalization, bounded retry and timeout, status contract, cache, stale manager, historical calculations and ExcelJS export. `test/dashboard.test.js` uses Node’s built-in test runner and mocks global fetch so the core suite does not depend on live Yahoo availability.

| Area | Implementation |
| --- | --- |
| Current snapshot | `GET /api/market`; compatibility alias `GET /api/materials`. |
| Health | `GET /health`. |
| Historical analysis | `GET /api/history?symbol=HG%3DF&period=1y`, supporting `1y`, `2y`, `3y`. |
| XLSX | `GET /api/export/excel?symbol=HG%3DF&period=1y` and `GET /api/export/all?period=1y`. |
| Cache | Memory, ignored local `cache/market-cache.json`, and public `market-seed.json`; fresh TTL 15 minutes, stale TTL 24 hours by default. |
| Frontend | Search, category and signal filters, sorting, row selection, detail panel, history SVG chart, refresh and both export controls. |

## Source hierarchy

Yahoo Finance Chart API is the primary provider for commodity quotes, commodity history and USD/TWD `TWD=X`. The Yahoo adapter allows only `query1.finance.yahoo.com` and `query2.finance.yahoo.com`. Materials with explicit `stooqSymbol` may use Stooq CSV as quote fallback. Direct Yahoo history failure may use the fixed `r.jina.ai` public proxy path for the same encoded Yahoo chart target. FX fallback is `open.er-api.com/v6/latest/USD`.

Provider results are never hidden behind a false live label. `OK` means primary success, `FALLBACK` means a configured public fallback succeeded, `STALE` means a last-successful public snapshot was used, and `NO_DATA`／`API_ERROR` mean no acceptable current data or an upstream failure. Legacy `LIVE` input is canonicalized to `OK` only for compatibility; the runtime does not manufacture `LIVE` output.

## Unit and price rules

Every registry row has explicit `exchange`, `unit`, `currency`, `conversionFactor` and source metadata. The TWD reference formula is `sourcePrice × conversionFactor × usdTwdRate`. `US cents/bushel` and `US cents/lb` use factor `0.01`; USD-denominated units use factor `1`. Historical FX aligns by same-day or nearest-prior valid rate. Missing or non-finite FX results in a null TWD reference, not a fabricated value.

The application does not convert pounds, metric tons, short tons, barrels, MMBtu, troy ounces or bushels into a Taiwan delivery unit. The original source unit remains visible in API, UI and XLSX, and every TWD value is explicitly a market-reference value rather than a supplier purchase quotation. See `docs/PRICE_UNIT_CONTRACT.md`.

## Purchasing-signal rules

Live row signals are based on normalized quote `changePercent` in percentage points: `>= 2` is a cost-rising reference, `<= -2` is a negotiable reference, and other finite values are stable. History signals use current position in the observed high／low range and latest historical change ratio, in this precedence: high risk at position `>= .85` or change `>= .05`; cost rising at position `>= .70` or change `>= .02`; cost declining at change `<= -.04`; negotiable at position `<= .30` or change `<= -.02`; staged purchasing at volatility above 25%; otherwise stable. Insufficient or absent history adds an explicit data warning or observation state.

These are deterministic market-trend heuristics. They are not purchase instructions and should not be tuned to force a particular business outcome. See `docs/PURCHASING_SIGNAL_CONTRACT.md`.

## Cache and failure behavior

A snapshot is eligible for fresh cache only when at least 70% of rows are finite numeric `OK`／`FALLBACK` rows. Stale reads may use rows with any usable public status, but are rewritten to `STALE`, retain last-success timestamps and add the stale disclaimer. A shared refresh promise prevents concurrent requests from multiplying the same upstream refresh. Failed materials are isolated; row-level stale hydration occurs only when an ID-matched last-success row exists.

Timeouts, retries, malformed JSON／CSV and missing finite prices are bounded and explicit. The service does not save low-quality snapshots as fresh cache and does not turn missing public data into zeros or fake prices.

## Validation record

Run from the repository root:

```bash
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
```

The deterministic suite contains 15 tests covering material and unit contracts, cents normalization, malformed response handling, bounded retry, signal thresholds, historical calculations, nearest-prior FX, period sufficiency, cache freshness／staleness／canonicalization, health and validation routes, primary and fallback market paths, total source failure, history, single/all XLSX exports, malformed history and timeout. The public smoke is separate: 14 materials were observed, 10 primary quotes succeeded, 4 quote symbols were unavailable, all 14 histories succeeded, 3 histories used the Jina proxy, Yahoo FX failed by timeout and open.er-api fallback succeeded.

The local runtime verification returned HTTP 200 for `/health`, `/api/market`, `/api/materials`, `/api/history?symbol=HG%3DF&period=1y` and `/api/export/excel?symbol=HG%3DF&period=1y`. Browser verification covered load, search, category and signal filters, sorting, row selection, detail panel, history chart, single/all export initiation, stale and public-data labels, and an empty console check. The fresh-clone command results are recorded in `docs/RUNTIME_VERIFICATION.md` after the final GitHub push.

## Known external-data limitations

Live public availability is not guaranteed. The observed quote unavailable symbols were `ALI=F`, `HRC=F`, `TIO=F` and `GC=F`; no symbol was silently changed. Three historical materials needed the fixed Jina proxy. Some materials have no configured Stooq quote fallback. Provider rate limits, timeouts, source licensing, and stale data age remain operational dependencies and must be monitored outside this codebase.

## Company-data-dependent work remaining

If the business later requires supplier quotations, Taiwan spot prices, ERP／SAP data, inventory, MOQ, delivery, tax／freight, contract exposure, company-specific mappings or internal approval thresholds, that work must be designed as a separate private integration. It must not be added to this public repository or encoded into the public heuristic without a new data classification, access-control, secrets, audit and retention review.

## Exact next Codex task

After this handoff commit is available, the next Codex task is: **review the public-data contracts and connect an approved private procurement data service behind a separate authenticated boundary, without changing the public market snapshot semantics; first produce a data-classification and API design, and do not implement or import private data until the owner approves the design.**
