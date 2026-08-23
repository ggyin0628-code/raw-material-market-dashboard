# Phase 3A — Sheet Metal Market Reference V1

## Purpose and boundary

Phase 3A answers one narrow question:

> Compared with recent comparable public observations, is external sheet-metal fabrication cost and activity pressure rising, stable, or falling?

It does **not** answer what a supplier should quote per piece, kilogram, hour, setup, bend, weld, or finished assembly. The page is an **external public market intelligence and purchasing-reference** view. It does not use SAP, company purchasing history, supplier quotations or names, internal labor or machine rates, setup/cycle times, company targets, inventory, private thresholds, or private credentials.

The established three-layer separation remains in force:

| Layer | Phase 3A behavior |
|---|---|
| `OBSERVED_PUBLIC_DATA` | Publicly fetched indexes, market indicators, source states, observation dates, frequency and provenance |
| `DERIVED_MARKET_REFERENCE` | Deterministic weighted pressure scores and frequency-appropriate comparison directions |
| `ENGINEERING_ESTIMATE` | Always `null` in V1 |

## Taiwan-first feasibility audit

The audit prioritized official Taiwan sources and used international public market indicators only where a Taiwan-specific sheet or proxy was not available. DGBAS defines Taiwan’s Producer Price Index as a Laspeyres index, base year 2021=100, measuring average changes in prices received by domestic producers; it is an index and not a supplier quotation.[1] DGBAS also publishes official public PPI time-series Excel/ODF downloads and a public statistical database.[2]

| Candidate | Official source / endpoint | Frequency and unit | Phase 3A use | State and limitations |
|---|---|---|---|---|
| Taiwan fabricated-metal activity | [MOEA industrial-production CSV](https://service.moea.gov.tw/EE520/opendata/d.csv), dataset metadata [data.gov.tw/6607](https://data.gov.tw/en/datasets/6607) | Monthly observations as published; index, 2021=100; dataset metadata says irregular updates | **Scoring:** capacity/demand heat; exact code `25 金屬製品製造業` | Taiwan-specific production activity proxy, not a quote. Actual observation date controls freshness. |
| Taiwan basic-metal activity | Same MOEA CSV; official industry code `24 基本金屬製造業` | Monthly as published; index, 2021=100 | **Scoring:** supporting capacity/demand evidence | Upstream activity proxy, not steel-sheet price. |
| Taiwan machinery activity | Same MOEA CSV; official industry code `29 機械設備製造業` | Monthly as published; index, 2021=100 | **Scoring:** supporting capacity/demand evidence | Broader manufacturing proxy; does not represent a supplier or CNC rate. |
| Taiwan manufacturing activity | Same MOEA CSV; official industry code `C 製造業` | Monthly as published; index, 2021=100 | **Scoring:** broad capacity/demand context | Broad rather than sheet-metal-specific; weight is kept below the material dimension. |
| Taiwan PPI: basic metals, manufacturing and energy | [DGBAS Statistical Tables](https://eng.stat.gov.tw/cp.aspx?n=2327), public database [nstatdb](https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?k=engmain) | Monthly; index, 2021=100 | **Scoring:** material, manufacturing-price and energy context | Official XML is primary in the shared adapter; secure official `nstatdb` CSV query is fallback when XML TLS/transport/parse fails. |
| Taiwan manufacturing wages | DGBAS official manufacturing wage XML/CSV adapter | Monthly when published; NTD/person/month | **Scoring:** labor pressure | Low-frequency labor cost direction only. Publication lag may produce `STALE`; never converted into hourly internal labor cost. |
| Taiwan NTD/USD | [CBC official 60-row page](https://www.cbc.gov.tw/en/lp-700-2-1-60.html), official 20-row fallback | Business day; NTD/USD | **Scoring:** FX pressure | Currency input-cost direction only; not a supplier exchange rate or quote. |
| Taiwan electricity tariff schedule | [Taipower structured JSON](https://service.taipower.com.tw/data/opendata/apply/file/d007008/001.json) | Structural/event-driven; tariff schedule fields | **Provenance-only:** energy context | No generic CNC electricity price and no weekly momentum. Contract/voltage/time-of-use applicability requires human interpretation. |
| International aluminum, HRC steel and copper | Existing public Yahoo Finance/Stooq-compatible material registry | Trading day; instrument-specific public-market units | **Scoring:** material pressure | International futures/market proxies only. They must not be labeled Taiwan sheet prices. |
| International WTI and natural gas | Existing public Yahoo Finance/Stooq-compatible registry | Trading day; USD/barrel or USD/MMBtu | **Scoring:** energy pressure | Public energy direction only; not Taiwan electricity or fabrication pricing. |
| Cold-rolled steel | No stable, verified Taiwan-first public series passed the audit | — | **Not scored** | Remains explicit `NO_DATA`; no foreign index is silently substituted. |
| Stainless steel | No stable, verified Taiwan-first public series passed the audit | — | **Not scored** | Remains explicit `NO_DATA`; no foreign index is silently substituted. |
| Quarterly investment/operation survey | [MOEA Manufacturing Investment & Operation Overview Survey](https://service.moea.gov.tw/EE520/investigate/InvestigateEC.aspx?lang=E) | Quarterly/yearly; revenue and fixed-assets measures | **Provenance / future candidate** | Fabricated-metal category exists, but the current implementation uses the stable monthly MOEA CSV production proxy; quarterly values are never forced into weekly windows. |

The MOEA official selector exposes production, shipment, inventory and value measures and visibly includes Basic Metals, Fabricated Metal Products, Aluminum and Machinery classifications.[3] Its official open-data CSV was inspected for the exact rows `24 基本金屬製造業`, `25 金屬製品製造業`, and `29 機械設備製造業`; sample latest inspected values for ROC period `11506` were 79.12, 110.03 and 108.68 respectively, all with unit `110年=100`. These values are activity indexes, not prices. The government open-data record identifies the Ministry of Economic Affairs as agency, the CSV resource, Open Government Data License version 1.0, free access, and irregular updates.[4]

## Contract

The endpoint is `GET /api/sheet-metal/reference`, with `?force=true` for an explicit refresh. The page is canonical at `/sheet-metal`; `/sheet-metal/` is a safe alias; `/sheet-metal.html` redirects with HTTP 308 to `/sheet-metal`. The reference object contains:

| Field | Meaning |
|---|---|
| `referenceDate` | Generated reference date, not a fabricated observation date |
| `region` | `Taiwan` |
| `processFamily` | `SHEET_METAL` |
| `materialPressure` | Steel, aluminum, copper and Taiwan basic-metal public pressure |
| `energyPressure` | Public energy indicators plus Taiwan energy PPI; structural tariff is not momentum-scored |
| `laborPressure` | Taiwan manufacturing monthly wage direction |
| `fxPressure` | Official CBC NTD/USD direction |
| `manufacturingPricePressure` | Taiwan manufacturing PPI direction |
| `capacityDemandPressure` | MOEA metal-product, basic-metal, machinery and manufacturing production activity proxies |
| `compositePressureScore` | Weighted 0–100 derived reference, or `null` below evidence threshold |
| `pressureLevel` / `trend` | `LOW`/`NORMAL`/`ELEVATED`/`HIGH` and `FALLING`/`STABLE`/`RISING`, or `null` when insufficient |
| `sourceProvenance` | Public source name, URL, endpoint, scope, unit, access limits, status, last observation, frequency and fetch time |
| `engineeringEstimate` | Always `null` |

The visible page includes `公開市場參考`, `非供應商報價`, and `非公司目標價格`. It displays the overall result, evidence count, data quality, materials, energy, labor, FX, manufacturing price, capacity/demand heat, explanations, freshness and source provenance.

## Sheet-metal-specific model

Phase 3A does not copy machining weights. The default normalized weights are:

| Component | Weight | Rationale |
|---|---:|---|
| Material pressure | 0.30 | Sheet stock and upstream metal inputs are the largest public cost-pressure proxy available |
| Energy pressure | 0.15 | Cutting, forming, finishing and facility energy context, without inventing electricity rates |
| Labor pressure | 0.12 | Monthly manufacturing wages provide a low-frequency labor-cost direction only |
| FX pressure | 0.10 | Imported material and energy exposure context through official NTD/USD |
| Manufacturing price pressure | 0.18 | Taiwan manufacturing PPI provides producer-price context |
| Capacity/demand heat | 0.15 | Taiwan metal-product and related industrial production activity provides demand/capacity context |

The model is deterministic and explainable. For daily or weekly observations it uses 4-week and 12-week windows. For monthly observations it uses 1-month, 3-month and 1-year windows. For annual observations it uses 1-year and 3-year windows. Structural and unknown-frequency sources have no comparison window and cannot generate momentum. The component score is `clamp(50 + 5 × frequency-appropriate percentage change, 0, 100)`. Available component weights are renormalized only after evidence is validated; the model never changes scoring merely to force a composite.

The default minimum evidence guard remains **3 usable components**. Missing, stale, fallback and API-error states remain visible. `LIVE`, `FALLBACK` and explicitly recovered `STALE` observations may be used according to the existing public-observation semantics, while `NO_DATA` and `API_ERROR` do not create a score. A composite is `null` when fewer than three components have a valid comparable history.

## Persistence and production safety

The implementation reuses the certified `publicObservationStore` and `machining_public_observations` Postgres/filesystem parity architecture with `sheet-metal:` series namespaces. It does not add a duplicate persistence subsystem or schema. No production migration is part of Phase 3A. Any future schema change must use the existing idempotent migration contract and be separately approved.

No deployment, main promotion, migration, bootstrap, daily or weekly job, backfill, email, Gmail, schedule, secret, Neon, or certified machining-calculation operation is part of this feature phase. Existing machining routes and calculations remain independently implemented and tested.

## Test and audit evidence

Deterministic coverage includes MOEA source normalization, source failure, public-history recovery, freshness, daily/monthly/structural windows, sheet-metal weights, minimum evidence, provenance, no fabricated price, no private/company fields, canonical routing, shared navigation, page/mobile contract, API wrapper, and existing machining model construction. The full repository regression suite is required before delivery: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, and `git diff --check`.

## References

[1]: https://eng.stat.gov.tw/sdds/cp.aspx?n=4180&s=1803 "DGBAS Taiwan SDDS — Producer prices"
[2]: https://eng.stat.gov.tw/cp.aspx?n=2327 "DGBAS Statistical Tables — Producer Price Indices"
[3]: https://service.moea.gov.tw/EE520/investigate/InvestigateDB.aspx?lang=E "MOEA Industrial Production, Shipment & Inventory Statistics Survey"
[4]: https://data.gov.tw/en/datasets/6607 "Taiwan Government Open Data — Industrial production"
[5]: https://service.moea.gov.tw/EE520/investigate/InvestigateDA.aspx?lang=E "MOEA Product Statistics Survey"
[6]: https://service.moea.gov.tw/EE520/investigate/InvestigateEC.aspx?lang=E "MOEA Manufacturing Investment & Operation Overview Survey"
[7]: https://www.cbc.gov.tw/en/lp-700-2-1-60.html "CBC official 60-row NTD/USD closing-rate page"
[8]: https://service.taipower.com.tw/data/opendata/apply/file/d007008/001.json "Taipower official structured tariff JSON"
