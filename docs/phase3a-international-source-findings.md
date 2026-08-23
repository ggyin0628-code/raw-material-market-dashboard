# Phase 3A international and import-market source audit

Review date: 2026-08-23.

## Decision principle

Taiwan-first means Taiwan-prioritized, not Taiwan-only. International observations may support an import-market reference or upstream input proxy when the public source is reproducible, has a clear product scope, unit and frequency, and is not presented as a Taiwan domestic supplier quotation.

## Accepted public candidates

| Candidate | Public evidence | Role | Runtime decision |
|---|---|---|---|
| U.S. BLS PPI Cold Rolled Steel Sheet and Strip, FRED `WPU101707` | FRED exposes a downloadable graph CSV, monthly frequency, index Jun 1982=100, source U.S. BLS, and history from 1982-06 through 2026-07 at review time.[1] | `GLOBAL_IMPORT_REFERENCE` | Accepted as a reproducible international cold-rolled market reference. It is not called Taiwan cold-rolled price. |
| U.S. BLS PPI Steel Pipe and Tube, Stainless Steel, FRED `WPU10170674` | FRED exposes a downloadable graph CSV, monthly frequency, index Dec 2010=100, source U.S. BLS, and history from 2010-12 through 2026-07.[2] | `GLOBAL_IMPORT_REFERENCE` | Accepted only as a limited stainless public-market reference; UI and note state that its product scope is stainless pipe/tube, not Taiwan stainless sheet. |
| IMF Global Nickel, FRED `PNICKUSDM` | FRED identifies IMF Primary Commodity Prices as the source, monthly frequency, nominal USD/metric ton, period-average global benchmark prices, with history from 1992-01 through 2026-07.[3] | `GLOBAL_INPUT_PROXY` | Accepted as stainless upstream nickel pressure only. No alloy formula, conversion factor or stainless price is fabricated. |
| LME Official Prices | LME describes its Official Prices as daily global reference prices for physically delivered metals and publishes them in USD/metric tonne; the LME page also identifies HRC regional contracts and non-ferrous global reference pricing.[4] | Audit reference | Credible but not used as a new automated collector in V1 because LME historical data access is licensed/purchased outside the stable free runtime path; the existing public Yahoo/Stooq collectors remain explicit international references where their public history is available. |

## Rejected or retained gaps

No verified Taiwan domestic cold-rolled or stainless-sheet public price series was found in the audited sources, so the domestic proxies remain explicit `NO_DATA`. The international FRED series are not silently mapped into Taiwan domestic fields. The current runtime retains both the domestic gap records and accepted international source records in `sourceCoverage`, allowing users to distinguish absence of Taiwan domestic data from availability of global/import context.

HRC and aluminum remain separate international public market references through the existing material registry. Taiwan DGBAS basic-metals PPI remains a `TAIWAN_DOMESTIC` producer-price index. Copper remains an international market reference. Iron ore, WTI and natural gas remain `GLOBAL_INPUT_PROXY` inputs because they influence upstream material or energy context rather than representing finished sheet-metal prices. CBC NTD/USD is `TAIWAN_DOMESTIC` with market role `FX`, and Taipower tariff JSON is `STRUCTURAL` with no momentum calculation.

The audit does not invent Taiwan import shares, CIF, freight, tariff, surcharge or supplier margin. It does not convert nickel, iron ore, WTI or natural gas into a finished sheet price. It does not substitute HRC for CRC. It does not use vendor marketing quote pages or unlicensed LME history as a new automated source.

## Runtime semantics

Each normalized source retains `sourceId`, `sourceName`, `geographicScope`, `marketScope`, `marketRole`, `pricingBasis`, `currency`, `unit`, `frequency`, `status`, `observationDate`, `lastObservationDate`, `fetchedAt`, endpoint and note. The four allowed roles are `TAIWAN_DOMESTIC`, `GLOBAL_IMPORT_REFERENCE`, `GLOBAL_INPUT_PROXY` and `STRUCTURAL`.

The Phase 3A model keeps six major dimensions and minimum evidence of 3. Multiple sources can contribute to one dimension. Material pressure may therefore contain Taiwan basic-metals PPI, international HRC, aluminum, cold-rolled and stainless public references, copper, and nickel upstream pressure, but the response retains role-level provenance and explains the distinction. No company-specific domestic/import weight is assumed.

## References

[1]: https://fred.stlouisfed.org/series/WPU101707 "FRED — U.S. BLS PPI Cold Rolled Steel Sheet and Strip"
[2]: https://fred.stlouisfed.org/series/WPU10170674 "FRED — U.S. BLS PPI Steel Pipe and Tube, Stainless Steel"
[3]: https://fred.stlouisfed.org/series/PNICKUSDM "FRED — IMF Global price of Nickel"
[4]: https://www.lme.com/market-data/reports-and-data/lme-official-prices "London Metal Exchange — Official Prices"
[5]: https://www.lme.com/market-data/accessing-market-data/historical-data "London Metal Exchange — Historical data access"
