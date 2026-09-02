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

## Weekly PostgreSQL snapshot-read timeout remediation — 2026-09-02

本次 narrow incident review 確認 weekly report 的 storage path 為 `loadAndBuildWeeklyReport()` → `listSnapshots()` → `SELECT payload FROM market_snapshots ORDER BY material_id, observation_date`，未帶日期條件，因此在 PostgreSQL 端對 JSONB snapshot table 做無界全表讀取；production default query timeout 為 8,000 ms。事故發生於 report generation，mail 尚未到達；本修復不假設 Gmail failure，也不 resend mail。

Weekly report loader 現在先解析 reporting week，將 `to` 設為 reporting week end，並將 `from` 設為 report-year YTD 起點與 `end - 784 days` 的較早者。784 天由 52-week target 的 364 天加上既有 420-day comparison tolerance 組成，足以保留 weekly、four-week、three-month、YTD、52-week、rolling volatility與 XLSX history 所需資料。PostgreSQL query 現在帶有 `observation_date >= $1 AND observation_date <= $2`，不再先讀全表再於 Node 過濾。

既有 `market_snapshots_date_idx` 已支援日期 range predicate，未新增不必要 index；8,000 ms default與 30,000 ms maximum timeout 維持不變。新增 deterministic tests 證明 explicit from/to、各 analytics comparison window、XLSX history rows、`DATABASE_READ_FAILED` fail-closed、DB read failure 不觸發 mail，以及正常成功 report 進入 mail path。所有測試使用 synthetic public fixtures。

## Final boundary

This audit was completed on the approved feature branch and then certified in production after the required pure fast-forward promotion. The promotion and certification record is appended below. The production certification did not authorize any schedule, secret, Neon, Gmail, workflow, migration, bootstrap or mail mutation; it used read-only public endpoint and visual checks only. An existing legacy daily job state may remain `DAILY_DATA_NOT_READY` until the next normal scheduled daily collection establishes the new freshness contract, and this is not treated as a deployment failure.

## Production certification checkpoint

**PRODUCTION_DATA_INTEGRITY_PUBLIC_PROCESS_MONETARY_REFERENCE_PASS**

The approved feature head `909cb2bf64fc060358b55730319017ed154b5dfb` was promoted to `main` from authoritative main `096005640b08fc31c340a38d41c0f2c41655757d` by pure fast-forward. The required pre-promotion gates passed with **168 tests passed / 0 failed** and **0 vulnerabilities**. The existing Render service was allowed to deploy normally; no second service was created and no Render configuration was changed.

| Production check | Result |
|---|---|
| Render deployment and `/` | PASS: HTTP 200; shared navigation, weekly public summary and dashboard loaded |
| `/api/market` | PASS: HTTP 200; `state=FALLBACK`, `acquisitionPath=READ_FALLBACK`, 14 rows |
| Market freshness counts | `fresh=0`, `fallback=14`, `stale=0`, `expired=0`, `apiError=0`, `noData=0`; dashboard shows fallback/usable rows separately from stale, expired and API/no-data categories |
| Market timestamps | `generatedAt=2026-08-23T01:54:08.760Z`, `servedAt=2026-08-24T08:33:56.398Z`, `dataAsOf=2026-08-21T00:00:00.000Z`, `latestMarketObservationAt=2026-08-21T00:00:00.000Z` |
| May bundled seed | PASS: no May 2026 row was present in the production market response; the returned rows retained August 21 observation identity and `READ_FALLBACK` provenance |
| Dashboard headlines | PASS: maximum gain/loss both display `--` because no rows had rankable finite change data; stale/expired rows are excluded by the summary contract and no old seed became a headline |
| `/health` | PASS: HTTP 200, top-level `status=OK` |
| `/health/weekly` | PASS: HTTP 200, top-level `status=OK`, `WEB_READY`, `DATABASE_READY`, `storage.ready=true`, `weeklyReport=WEEKLY_REPORT_READY`; legacy `dailyData=DAILY_DATA_NOT_READY` is accepted until the next normal scheduled daily collection; `MAIL_CONFIGURATION_REQUIRED` remains owner-controlled and was not changed |
| Weekly quality boundary | PASS by code contract and regression suite: severely old STALE/EXPIRED data blocks with `SEND_BLOCKED`, defensible within-window STALE may warn, and adequate current coverage remains eligible; no weekly mail was resent |
| `/machining` and API | PASS: HTTP 200; public monetary panel precedes `成本趨勢輔助`; cards include `NT$ 1,000–1,600 / hr`, `NT$ 900–1,500 / hr`, `NT$ 2,000+ / hr`, `NT$ 1,800+ / hr` and separate `NT$ 80–120 / min` PRO360 statistic; no hourly/minute averaging |
| `/sheet-metal` and API | PASS: HTTP 200; 60 public price records including 56 direct vendor-listed laser rows and 4 `NO_PUBLIC_PRICE_DATA` rows; locale-inferred MINCA/Zhongkai values render `網站列示：… / m` and source-not-explicit currency wording without source-explicit `NT$` or FX conversion |
| Engineering boundary | PASS: production engineering schema allows `NO_RATE` only; `/estimate` remains browser-local; machining and sheet-metal `engineeringEstimate` are `null` |
| `/standalone` namespace | PASS: ordinary, trailing-slash, calculator-path and URL-encoded equivalents returned HTTP 404 `Not found` |
| Legacy routes | PASS: `/machining.html` returned HTTP 308 to `/machining`; `/sheet-metal.html` returned HTTP 308 to `/sheet-metal`; `/machining/` and `/sheet-metal/` returned HTTP 200 |
| Production visual review | PASS: production `/`, `/machining` and `/sheet-metal` reviewed at desktop `1440×1000` and mobile `390×844`; navigation remained usable, process monetary panels were primary, pressure was secondary, currency evidence was readable and no visible horizontal overflow appeared |
| Private/company boundary | PASS: no real company/private data, supplier/customer quote, private rate, production secret, schedule mutation, Neon/Gmail change or workflow dispatch was used |

The public fallback observation was August 21 rather than the May seed and was surfaced with `FALLBACK`/`READ_FALLBACK` identity. The production homepage therefore correctly avoids presenting old rows as live; because fallback rows had no finite current change value, maximum gain/loss remained unavailable rather than being fabricated. The detailed read-only evidence and screenshots were retained in the certification session under `/tmp/phase5-prod-cert/`.

## References

[1]: https://taiwancnc.org/%E5%8A%A0%E5%B7%A5%E6%88%90%E6%9C%AC%E5%85%AC%E5%BC%8F "台灣CNC產業權威：CNC加工成本公式大公開"
[2]: https://www.pro360.com.tw/price/cnc_milling "PRO360：CNC加工費用價格行情"
[3]: https://www.minca.tw/zh-TW/%E6%9C%80%E6%96%B0%E6%B6%88%E6%81%AF/laser-cutting-price "MINCA：雷射切割價格"
[4]: https://www.zhongkai-laser.com/services "仲凱雷射：雷射切割與折彎成型服務"
