# Full Production Data Integrity Audit

## Audit scope and operating boundary

本 audit 覆蓋公開 market acquisition、cache／seed fallback、daily snapshot、weekly report、dashboard headline、health metadata、GitHub Actions schedule、machining／sheet-metal public process monetary references，以及 `/estimate` browser-local internal-cost boundary。所有驗證只使用 public fixtures、public source pages 與 synthetic test data；沒有輸入任何真實公司資料、公司費率、private calibration profile 或 customer/supplier record。

本輪所有程式碼與文件均在 feature branch 上完成，最後必須 **STOP BEFORE FINAL MAIN PROMOTION**。不執行 migration、bootstrap、mail、Gmail、Neon mutation、secret/variable 修改、workflow dispatch、real-data pilot 或 production data write。

## End-to-end data-flow map

| Layer | Intended path | Integrity rule | Audit result |
|---|---|---|---|
| Direct acquisition | official/public source adapters → normalized observations | preserve source URL, source role, unit, frequency, observation date and fetch time; classify a successful response by its actual observation age | PASS；source metadata remains visible；old direct quotes cannot remain `OK` |
| In-memory/cache | direct result → cache with `dataAsOf`, `generatedAt`, `servedAt` | served time must not overwrite observation identity | P0 fixed |
| Bundled seed | test/local only; production seed fallback disabled | stale seed must never look live | P0 fixed; May seed becomes `EXPIRED` outside test path |
| Durable snapshot | Postgres/public snapshot read fallback | fallback path is `READ_FALLBACK`; it preserves observation date and collection path | P0 fixed; no credential exposed in payload |
| Daily snapshot | source observation date → `observationDate`; collection time → `collectedAt` | fallback read must not become a new observation | P0 fixed |
| Weekly analytics | current observation freshness + historical comparison window | STALE within documented window may warn; old STALE/EXPIRED cannot produce a clean headline | P0/P1 fixed |
| Quality gate | freshness coverage, expired count, stale-too-old indicators | block a misleading report before mail/send path | P0/P1 fixed |
| Dashboard | market rows + summary helper | only `OK`/`FALLBACK` rows are headline eligible; STALE/EXPIRED remain visible but not ranked | P1 fixed |
| Process price references | contract records → API payload → money-first UI | preserve original pricing basis; no cross-unit hidden average | P1 fixed |
| Internal engineering cost | `/estimate` pure browser JS | no fetch/XHR/WebSocket/beacon/form persistence/API submission | previously certified and preserved |

## P0 findings and remediation

### Seed fallback and expiry

The previous risk was that a bundled May observation could be served during a later reporting period and appear to be a current market row. The remediation introduces a centralized `freshness.js` utility using the original observation date (`dataAsOf`, `lastTradeTimestamp`, or equivalent) rather than `generatedAt` or `collectedAt`. Direct Yahoo/Stooq/FX responses are also classified by their actual `lastTradeAt`: a successful HTTP response older than the configured seven-day policy becomes `EXPIRED` rather than `OK` or `FALLBACK`, and a missing observation timestamp becomes `NO_DATA`. The state machine now distinguishes `LIVE`, `FALLBACK`, `STALE`, `EXPIRED`, `NO_DATA` and `API_ERROR`. Production disables bundled seed fallback; test/local paths may still use explicit seed fixtures for deterministic tests.

### Timestamp separation

`generatedAt` and `servedAt` describe when the application produced or served a payload. `dataAsOf` and row-level observation timestamps describe when the public market actually observed the value. Daily snapshot persistence now writes the original observation date and a separate collection time. A stale or durable fallback read cannot launder an old observation into a new “today” observation.

### Durable fallback

When direct public acquisition fails, the production-only durable public snapshot read path may return a recent `READ_FALLBACK` snapshot. The response preserves the source observation date, `collectionPath`, and age. If the snapshot exceeds the configured observation-age window, it is classified as `EXPIRED`; it is never promoted to `LIVE` and is not written back as a fresh observation. No `DATABASE_URL`, PostgreSQL URI, secret or credential is exposed in public response metadata.

## P1 findings and remediation

### Dashboard truthfulness

The homepage now exposes separate counts for usable `OK`／`FALLBACK`, `STALE`, `EXPIRED`, and API／no-data rows. The pure `dashboard-summary.js` helper defines headline eligibility. Maximum gain and loss are calculated only from finite changes on `OK`／`FALLBACK` rows. STALE and EXPIRED rows remain visible for auditability but cannot become headline winners or losers. When no eligible rows exist, the page states that the headline is unavailable rather than showing a misleading rank.

The `/api/market` response exposes safe metadata including `latestMarketObservationAt`, `servedAt`, and freshness counts. This metadata does not expose database credentials or private configuration.

### Weekly reporting and alert safety

Weekly analytics now distinguishes historical comparison records from the current observation record. A STALE record inside the documented observation-age window may be retained with a `DATA_QUALITY_WARNING` and `SEND_WITH_WARNINGS` gate state. A materially old STALE record or an EXPIRED record causes insufficient freshness coverage and blocks the clean weekly report path. The gate preserves the existing severe checks for missing coverage, abnormal row count, insufficient changes, and source failure. It does not silently convert old data into a successful report.

The pre-promotion follow-up also ranks every stale-cache candidate by the original `dataAsOf` before classification. The newest freshness-eligible candidate is returned as `STALE`; only when no eligible candidate exists is the newest expired candidate returned as `EXPIRED`. This prevents an older in-memory entry from shadowing a newer usable local cache.

Daily collection now separates command execution from data readiness. A normally completed `collectAndPersistDailySnapshot` records `executionState=SUCCEEDED` plus `freshCount`, `fallbackCount`, `staleCount`, `expiredCount`, `noDataCount`, `apiErrorCount`, `freshnessEligibleCount`, `dataAsOf` and an explicit `dataReadinessState`. `readProductionStatus` reports `DAILY_DATA_READY` only when the persisted freshness contract says data is ready; all-expired data becomes `DAILY_DATA_STALE`, all-NO_DATA becomes `DAILY_DATA_NOT_READY`, without pretending the command crashed. The weekly delivery gate remains independent and fail-closed.

### Schedule audit

The existing daily and weekly workflow configuration remains read-only in this task. The audit verified that schedule execution and mail/report paths are separate from the browser-local `/estimate` values. No workflow was dispatched, no schedule variables or secrets were changed, and no bootstrap or migration job was run. The only accepted implementation changes are data-integrity classification, safe metadata, deterministic tests and UI contract work.

## Public process monetary reference audit

The public money contract is implemented in `lib/publicProcessPriceContract.js`. It is intentionally separate from internal engineering cost calculation. CNC records preserve `TWD/hr` machine-hour ranges for standard 3-axis milling and standard 2-axis lathe, plus open-ended `TWD 2,000+/hr` for high-end 5-axis simultaneous milling and `TWD 1,800+/hr` for turn-mill. These open-ended records use `priceOpenEnded=true` and `priceMax=null`, so a source value such as `3,500+` is not turned into a false cap. A separate PRO360 `TWD/min` marketplace customer-quote statistic remains independently grouped. The Taiwan-oriented CNC table and PRO360 page are not averaged across pricing bases.[1][2]

Sheet-metal records prioritize direct laser listed tables. MINCA publishes per-meter prices by material and plate thickness plus a separately listed small circular-hole fee; Zhongkai publishes per-meter prices for SS41, SUS304 and AL6061 and states that thick plate and low-volume/sample work are separately discussed.[3][4] The checked pages do not explicitly identify `TWD` or `NT$`, so their numeric records retain `currencyEvidence=LOCALE_INFERRED`; the UI says `網站列示：20 / m` and preserves a source-not-explicit currency note instead of displaying source-explicit `NT$`. No FX conversion is invented. Bending, TIG, MIG／CO2 and spot welding remain `NO_PUBLIC_PRICE_DATA` because no accepted current public Taiwan monetary range was established. Pressure scores are not used as a substitute for missing money data.

## Accepted, limited and rejected sources

| Source | Role | Decision | Reason |
|---|---|---|---|
| TaiwanCNC public cost formula table | `INDUSTRY_MACHINE_HOUR_REFERENCE` | Accepted with medium confidence | Explicit machine types and TWD/hr ranges; excludes material, setup, margin and supplier contract price |
| PRO360 CNC page | `MARKETPLACE_QUOTE_STATISTIC` | Accepted separately | Explicit 2024–2026 customer quote statistic at TWD/min; not a machine-hour accounting rate |
| MINCA laser table | `DIRECT_VENDOR_LISTED_PRICE` | Accepted with high confidence, currency locale-inferred | Direct material/thickness per-meter table and explicit small-hole rule; checked page does not explicitly state currency |
| Zhongkai laser service page | `DIRECT_VENDOR_LISTED_PRICE` | Accepted with high confidence, currency locale-inferred | Direct per-meter table for three materials; checked `$` lacks an explicit currency code; unlisted small-hole fee remains null |
| National Taiwan University academic service page | `ACADEMIC_SERVICE_RATE` | Limited | Public institutional service rate, but legacy encoding and scope require careful interpretation; not current supplier benchmark |
| National Cheng Kung University equipment borrowing page | Limited/rejected current benchmark | Rejected for current market benchmark | Page states fee standard through ROC 113 and carries an older meeting date; institutional equipment borrowing is not a current job-shop quote |
| Unpublished company rate sheets, private calibration, supplier quotes | Not accepted | Rejected | Out of scope and prohibited in this task |

## Acceptance tests

The deterministic suite covers seed disable/expiry, timestamp separation, direct-fetch-old-observation expiry, fallback classification, stale laundering prevention, newest stale-candidate selection, daily execution/readiness separation for expired/no-data/adequate coverage, dashboard headline eligibility, safe market-health metadata, within-window STALE warning versus old-data blocking, public price schema completeness, explicit versus locale-inferred currency evidence, CNC unit separation and open-ended ranges, valid open-ended monetary card state, laser material/thickness/hole metadata, corrected public boundary copy, DOM money-first ordering, and explicit NO_PUBLIC_PRICE_DATA for welding/bending. The model builders validate both the original machining/sheet-metal contract and every public price reference record before returning a reference. Sandbox-only desktop/mobile screenshots were reviewed for both process pages; `/estimate` remains browser-local and `/standalone` remains 404.

## Remaining external-source limitations

The public source layer still has real limitations. Direct Taiwan current monetary coverage is strong for selected laser materials and thicknesses but not universal for all thicknesses, quantity tiers, setup, material sheet cost, bevel, thick plate or sample work. CNC machine-hour ranges and marketplace quote statistics describe different economic bases. Current public monetary ranges for bending and welding processes remain unavailable under the accepted-source standard. These gaps are shown as limitations rather than filled with fabricated values.

## Final boundary

This audit is a feature-branch delivery checkpoint. It does not authorize final main promotion. Before any later promotion, the repository must rerun the complete final gates, verify branch lineage and worktree scope, perform a read-only deployment review if separately authorized, and independently confirm that no private/company data entered the public data path.

## References

[1]: https://taiwancnc.org/%E5%8A%A0%E5%B7%A5%E6%88%90%E6%9C%AC%E5%85%AC%E5%BC%8F "台灣CNC產業權威：CNC加工成本公式大公開"
[2]: https://www.pro360.com.tw/price/cnc_milling "PRO360：CNC加工費用價格行情"
[3]: https://www.minca.tw/zh-TW/%E6%9C%80%E6%96%B0%E6%B6%88%E6%81%AF/laser-cutting-price "MINCA：雷射切割價格"
[4]: https://www.zhongkai-laser.com/services "仲凱雷射：雷射切割與折彎成型服務"
