# Raw Material Dashboard — Project Status

## Status verdict

**WEEKLY_REPORT_PRESENTATION_REDESIGN_COMPLETE**

**PRODUCTION_GMAIL_SMTP_TEST = PASS**

**CODEX_HANDOFF_READY = YES**

The approved procurement-management weekly report presentation redesign is complete, committed and pushed to `main`. The authoritative final presentation main SHA is `8a9fd80c30a339b9eeea1a176c174459368a39b9`. The existing Gmail SMTP live test also succeeded: the HTML email was received and the XLSX attachment was received.

## Delivery identity

| Item | Result |
| --- | --- |
| Repository | `ggyin0628-code/raw-material-market-dashboard` |
| Authoritative baseline | `8390a0234fb5d18e28e100ee1ff40750b6b0d95e` |
| Existing bootstrap remediation | `fix/bootstrap-performance-v1` / `bootstrap-performance-certified-v1` |
| Final presentation main SHA | `8a9fd80c30a339b9eeea1a176c174459368a39b9` |
| Presentation status | Approved, committed and pushed; no longer pending |
| Active production mail provider | Gmail SMTP; `MAIL_PROVIDER=smtp` |
| Gmail live test | PASS: HTML received and XLSX attachment received |
| Microsoft Graph | Historical/inactive only; not the production provider |
| Bootstrap | Complete; must not be rerun |
| Schedule state | Owner-controlled; not enabled or modified by this cleanup |
| Company data / company mail integration | None |
| Paid resources / deployment | None added / not performed |

## Permanent product, data and mail boundary

This is an **external public market intelligence and purchasing-reference platform**. Only public external market observations, public-source provenance, canonical quality states and derived public reports may be stored. SAP, company procurement history, supplier quotations or names, company target prices, private thresholds, inventory, MOQ, payment terms, company email systems, private mappings, credentials and private runtime reports remain permanently out of scope.

The active production mail provider is the existing owner-configured Gmail SMTP path. No company Microsoft 365 integration is present or required. GitHub Actions secret values must not be read, printed, exported, rotated or modified by this project state cleanup.

## Existing bootstrap certification retained

The cancelled `Market Production Bootstrap #1` run `32609131444` on the original baseline completed setup, checkout, dependency installation, code validation, migration and storage readiness in approximately 14 seconds, then occupied the 30-minute safety ceiling in `Bootstrap public history`. The bottleneck was **BOTH**: sequential public-history fetching and per-record PostgreSQL lookup/write round-trips.

The remediation kept the complete `--period 3y` bootstrap and 30-minute safety ceiling, added bounded fetch concurrency 3 (cap 4), default Postgres batch upsert size 250 (cap 500), one parameterized multi-row transaction per batch, status-quality preservation, chunk resumability and safe progress. Run `32611318090` established the successful promoted-main Neon bootstrap, and run `32611472483` verified final callback-forwarded batch telemetry. Bootstrap is complete. **Do not rerun bootstrap for this documentation cleanup or for the presentation redesign.**

## Production weekly mail state

The production weekly workflow remains on Gmail SMTP with the existing `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_TO` and `MAIL_TEST_TO` secret references, the existing Gmail host/port/security settings and unchanged `WEEKLY_MAIL_TEST_MODE` behavior. The owner-confirmed manual Gmail test is complete and successful: the HTML email was received, and the XLSX attachment was received.

The manual Gmail test is already complete and must not be listed as a next action. This documentation-only cleanup did not send email or trigger the weekly workflow.

Microsoft Graph is historical/inactive only. Earlier Graph implementation files or references are not an active production dependency and do not change the current Gmail SMTP architecture. No company Microsoft 365 or company mail integration is part of the system.

## Presentation redesign state

The approved procurement-management redesign is committed and pushed at main SHA `8a9fd80c30a339b9eeea1a176c174459368a39b9`. It includes the accepted HTML and XLSX presentation: four KPI cards, weekly change overview, procurement review priorities, category momentum, signal distribution, compact prioritized detail sheet, filters, frozen headers, alternating row shading, directional indicators, warning/data-quality highlighting and a bottom disclaimer.

The accepted offline `2026-W33` preview was generated from synthetic public-safe fixture data with zero network calls and no mail send. Presentation changes did not alter market collection, calculations, `weeklyChangePct`, `fourWeekChangePct`, signals, reason codes, quality gate, Neon/PostgreSQL, bootstrap, mail delivery, recipients, GitHub Actions or schedules.

## Validation status

| Gate or production state | Result |
| --- | --- |
| Presentation redesign preview | PASS: approved offline `2026-W33` preview |
| Final presentation main SHA | `8a9fd80c30a339b9eeea1a176c174459368a39b9` |
| Deterministic regression suite | PASS: 53 passed / 0 failed |
| `npm ci`, check and syntax | PASS |
| Build, audit and YAML validation | PASS |
| Presentation scope guard | PASS |
| Protected runtime unchanged | PASS |
| Gmail SMTP live test | PASS: HTML email received |
| XLSX live attachment receipt | PASS: attachment received |
| Microsoft Graph production use | INACTIVE / historical only |
| Bootstrap / Neon state | COMPLETE; no rerun required |
| Weekly workflow triggered by cleanup | NO |
| Email sent by cleanup | NO |
| Schedule activation by cleanup | NO |
| Company data / company mail integration | NONE |

## Next operational certification

The next operational certification is owner-controlled schedule enablement. When the owner is ready, set `PRODUCTION_SCHEDULES_ENABLED=1` to activate the existing production schedule gate. The Gmail test and HTML/XLSX receipt verification are already complete and must not be repeated as part of this cleanup. No bootstrap rerun, Microsoft Graph setup, company mail integration or additional email is required.

## Weekly PostgreSQL bounded-read production recovery — 2026-W35

狀態：`WEEKLY_POSTGRES_BOUNDED_READ_PRODUCTION_RECOVERY_PASS`

Approved head `366ad99784bcaf19f588ae0930875f6f032af2f5` 已由 `d9b94a40fd0e8f5d8f451951e32fe33382f45e9f` 以 pure fast-forward 推進至 `main`。根因是 2026-08-31 weekly report generation 對 `market_snapshots` 執行無日期條件的 JSONB 全表讀取，觸發 `DATABASE_READ_FAILED` query timeout；mail path 未被到達。修復後 weekly loader 使用 bounded `from`／`to`，`from=2024-07-07`、`to=2026-08-30` 供 W35，並保留 weekly、4-week、3-month、YTD、52-week、rolling volatility與 XLSX history需求。既有 `market_snapshots_date_idx` 足以支援 predicate；8,000 ms default query timeout未提高。

Production read certification：`/api/weekly/report?week=2026-W35` HTTP 200、13.877676 秒、無 `DATABASE_READ_FAILED`；period為 `2026-08-24`–`2026-08-30`、quality gate為 `SEND_OK`。XLSX export HTTP 200、16.778032 秒、PK/XLSX signature有效、433,436 bytes。Pre-send durable job state為 W35 `FAILED`／query timeout，最近成功時間早於 W35；separate `weeklyMail` successful state為 W34，因此未見 W35 successful delivery record。

唯一 recovery run為 GitHub Actions `33600925979`，在 main SHA `366ad99784bcaf19f588ae0930875f6f032af2f5` 成功完成 report、bounded read、quality gate與既有 test-mode mail path；W35 HTML/JSON/XLSX artifacts均生成，post-send `weeklyMail.state=TEST_SENT`、`reportingWeek=2026-W35`、`sent=true`。確認恰好寄出一封 W35 recovery email，沒有第二次 recovery或 test email。Full gates：**172 passed / 0 failed**、0 vulnerabilities；未修改 schedules、`PRODUCTION_SCHEDULES_ENABLED`、`WEEKLY_MAIL_TEST_MODE`、recipients、credentials、database config或 mail config，未執行 bootstrap、backfill、unrelated workflow、manual database mutation或 private/company data operation。下一次正常 scheduled weekly 應沿用 bounded query，不得手動再跑 next-week或重寄 W35。

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32609131444 "Cancelled bootstrap run"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611318090 "Successful promoted-main bootstrap"
[3]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611472483 "Bootstrap batch telemetry verification"
[4]: https://github.com/ggyin0628-code/raw-material-market-dashboard/commit/8a9fd80c30a339b9eeea1a176c174459368a39b9 "Final presentation main commit"

## Phase 2A — CNC／一般加工公開市場參考 V1

**PROMOTED_TO_MAIN_RENDER_VERIFIED**

功能分支 `feat/machining-market-reference-v1` 已完成 CNC／一般加工公開市場參考 V1；首個完整功能 commit SHA 為 `57ccdbf08908f062b3e4b88164986373a59db92b`。新增 canonical 頁面 `/machining` 與 API `/api/machining/reference`，以台灣優先的外部公開指標提供材料、能源、勞動、匯率、製造價格及機械／資本代理構面；結果只表達外部成本壓力方向，不是供應商報價、公司目標價格或任何採購核決。

| 狀態項目 | 結果 |
| --- | --- |
| 公開來源 | DGBAS PPI（製造、水電燃氣、基本金屬、機械設備）、DGBAS 製造業薪資、中央銀行 NTD/USD、台電費率表可行性候選、既有 Yahoo／Stooq 公開金屬與能源指標 |
| 功能 commit | `57ccdbf08908f062b3e4b88164986373a59db92b`；文件追蹤更新將形成最終 handoff commit |
| 資料契約 | 明確分離 `OBSERVED_PUBLIC_DATA`、`DERIVED_MARKET_REFERENCE`、`ENGINEERING_ESTIMATE`；後者 V1 為 `null` |
| 確定性模型 | 預設權重可配置；4／12 週比較；壓力分數與等級公式公開；最低 3 個可比較構面證據，未達門檻不產生綜合結果 |
| 品質語義 | `LIVE`、`FALLBACK`、`STALE`、`NO_DATA`、`API_ERROR` 保留於來源沿革；缺失值不補假價格 |
| 測試 | 初版新增 8 項，加上本次 routing/navigation refinement 2 項；完整 suite 由 53 增至 63 項，均通過 |
| 生產保護 | 原物料、Neon、Gmail、weekly mail、bootstrap、Render、GitHub Actions、schedules 與 production secrets 未修改、未重跑或未部署 |

本地端到端檢查確認 `/machining`、`/machining/` 與 `/api/machining/reference` 可回應，API 會在公開來源不可用時回傳 `DATA_INSUFFICIENT` 或保留來源 `API_ERROR`，不會假造加工價格。來源可行性、授權、更新頻率、阻塞點與剩餘缺口詳見 `docs/MACHINING_MARKET_REFERENCE.md`。

## UI／Routing Refinement — Ready for Review

本次窄幅 refinement 將 `/machining` 設為 canonical user-facing URL；`/machining/` 同樣服務加工頁，內部 `/machining.html` 只作安全靜態檔案解析並導向 `/machining`。原物料首頁與加工頁現在共用可重用的雙項導覽基礎：`原物料市場 → /`、`加工市場參考 → /machining`；未建立 Sheet Metal、Weekly 或 Sources 假頁面。加工內容仍維持獨立頁，不嵌入原物料首頁。

視覺審查工件已存於 `docs/visual-review-machining-desktop.png`、`docs/visual-review-machining-mobile.png`、`docs/visual-review-homepage-navigation.png`，審查摘要位於 `docs/visual-review-notes.md`。本次已依核准以純 fast-forward 將 main 從 `902af25eac2d29439e2021c348041b25e21d8d7d` 推進至 `976df477f1b7c12265150c9c5a72e1bada7607f8` 並推送。既有 Render 服務已自動部署並完成唯讀驗證：首頁、`/machining`、`/machining/`、`/api/machining/reference`、`/health` 與 `/health/weekly` 均正常；`/machining.html` 回傳 308 導向 `/machining`。Render readiness 為 `WEB_READY`、`DATABASE_READY`、`storage.ready=true`；沒有手動觸發 Actions、寄信、重跑 bootstrap、修改 Neon、schedules 或 secrets。

## Phase 2B — Production certification

**PHASE_2B_MACHINING_DATA_HARDENING_PRODUCTION_PASS**

The migration workflow environment-isolation hotfix `fix/migration-workflow-test-env-isolation-v1` was promoted to `main` by pure fast-forward. The final verified main SHA is `e4621cbfa02a120662af6067c0230dc7110aec96`. The workflow remains manual `workflow_dispatch` only, has no schedule, grants `contents: read`, and exposes production Postgres variables only to the `npm run db:migrate` step; `npm ci`, `npm run check` and `npm test` cannot inherit the production `DATABASE_URL`.

Historical failed migration run `32635052696` is retained as a failed attempt caused by production environment leakage into deterministic tests. New run `32635836462` succeeded on main: checkout, Node 20 setup, `npm ci`, `npm run check`, `npm test` (**70 passed / 0 failed**), `npm run db:migrate`, and `DATABASE_MIGRATED` verification all passed. The migration reported `DATABASE_MIGRATED` with `statementCount: 9`, confirming the idempotent `machining_public_observations` schema migration path. No other workflow was triggered; bootstrap, daily, weekly, backfill, mail, Gmail and SMTP operations were not invoked.

Post-migration read-only Render verification passed for `/`, `/machining`, `/machining/`, `/api/machining/reference?force=true`, `/health` and `/health/weekly` with HTTP 200; `/machining.html` returned HTTP 308 to `/machining`. Render readiness was `WEB_READY`, `DATABASE_READY`, and `storage.ready=true`. The machining API returned score `45.54`, level `NORMAL`, direction `FALLING`, evidence count `6` against minimum evidence `3`, and data quality `STALE`; `engineeringEstimate` remained `null` and no CNC hourly price, supplier quotation, company target price or private/company data appeared. Provenance and frequency semantics remained correct for Yahoo/public materials, DGBAS official fallback, CBC official NTD/USD and Taipower structural JSON.

Remaining public-source limitations are explicit: DGBAS PPI fallback is monthly through `2026-07-01`; manufacturing wages are monthly through `2026-06-01` and `STALE` due to publication lag; CBC daily data is through `2026-08-21`; and Taipower is structural through `2025-10-01` and does not generate weekly momentum. `MAIL_CONFIGURATION_REQUIRED` remains expected because mail configuration and schedule enablement are outside this certification. The final checkpoint tag is `machining-data-hardening-v1`.

## Phase 3A — 鈑金市場參考 V1

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

Phase 3A is implemented on `feat/sheet-metal-market-reference-v1`, based exactly on certified main checkpoint `04de849ae9ae83fceb1cdeaf7aa09c9fcda66c62`. The feature is an independent Taiwan-first public market reference at `/sheet-metal` with `/sheet-metal/` alias, `/sheet-metal.html` 308 redirect, and `GET /api/sheet-metal/reference`. It does not embed sheet-metal content into `/` and does not alter the existing machining or raw-material calculation paths.

| Status item | Result |
| --- | --- |
| Official source audit | PASS: MOEA industrial CSV, DGBAS PPI/wages, CBC NTD/USD, Taipower structural JSON and existing public commodity proxies |
| Capacity/demand proxy | PASS: monthly MOEA exact rows for basic metals, fabricated metal products, machinery and manufacturing |
| Unavailable materials | Explicit `NO_DATA` for Taiwan cold-rolled steel and stainless-steel price proxies; no fabricated substitutes |
| Data contract | PASS: `processFamily=SHEET_METAL`; public observed and derived layers separated; `engineeringEstimate=null` |
| Model | PASS: sheet-metal-specific weights; minimum evidence 3; frequency-aware 4/12-week, 1/3/12-month and 1/3-year windows; structural no momentum |
| Persistence | PASS: reuses certified public-observation store with namespaced IDs; no new schema or migration |
| UI/routing/navigation | PASS: independent page, canonical routing, safe redirect, three real shared-nav pages only |
| Deterministic regression | PASS: 80 passed / 0 failed |
| Offline gates | PASS: npm ci, check, test, build, audit and diff check; 0 vulnerabilities |
| Visual review | PASS: desktop, 390px mobile and homepage navigation screenshots; no observed horizontal overflow |
| Production operations | NONE: no deploy, migration, bootstrap, schedule, mail, Gmail, Neon, secret or main promotion |

Local read-only public-source smoke produced score `48.47`, `NORMAL`, selected 12-week direction `FALLING`, evidence `6/3`, overall `STALE` because the monthly manufacturing wage series lagged. The API exposed 18 source-coverage entries with daily, monthly and structural frequencies; forbidden private/company keys were absent. MOEA activity values remain indexes and are never shown as supplier prices.

Technical specification: `docs/SHEET_METAL_MARKET_REFERENCE.md`. Source audit notes: `docs/phase3a-moea-source-findings.md`, `docs/phase3a-moea-product-findings.md`, `docs/phase3a-moea-operation-findings.md`, `docs/phase3a-dgbas-ppi-findings.md`, `docs/phase3a-dgbas-industrial-findings.md`, `docs/phase3a-data-gov-industrial-findings.md`. Visual artifacts: `docs/visual-review/sheet-metal-desktop.webp`, `docs/visual-review/sheet-metal-mobile.png`, `docs/visual-review/homepage-navigation.webp`, and `docs/visual-review/sheet-metal-visual-findings.md`.

## Phase 3A source-role refinement — Ready for review

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

Phase 3A remains isolated on `feat/sheet-metal-market-reference-v1` from main checkpoint `04de849ae9ae83fceb1cdeaf7aa09c9fcda66c62`. The refinement keeps the independent page/API and adds explicit market semantics for Taiwan domestic, international/import-market and upstream-input evidence.

| Status item | Result |
|---|---|
| Taiwan-first source policy | Taiwan is prioritized, but verified international/import public references are accepted when their product scope, units, frequency and limitations are explicit |
| International references | FRED/BLS cold-rolled steel sheet and strip; limited FRED/BLS stainless pipe/tube; existing HRC, aluminum and copper public market indicators |
| Upstream proxies | FRED/IMF global nickel; existing WTI and natural gas indicators |
| Role contract | Four allowed roles: `TAIWAN_DOMESTIC`, `GLOBAL_IMPORT_REFERENCE`, `GLOBAL_INPUT_PROXY`, `STRUCTURAL`; missing roles become `UNCLASSIFIED` and fail validation |
| Domestic gaps | Taiwan cold-rolled and stainless-sheet price proxies remain `NO_DATA`; no foreign series is relabeled as Taiwan domestic price |
| Response semantics | Market scope, market role, pricing basis, currency, unit, frequency, observation date, fetch time, state, URL and limitations are retained; role summary is exposed |
| Live local smoke | Score `43.21`, `NORMAL`, `FALLING`, evidence `5/3`, overall `STALE`; source coverage `21`; no unclassified sources after the MOEA role fix |
| Source-state evidence | International material/input sources and CBC `LIVE`; DGBAS PPI `FALLBACK`; wages `STALE`; MOEA `API_ERROR` on timeout; domestic cold-rolled/stainless explicit `NO_DATA` |
| Deterministic suite | PASS: 81 passed / 0 failed |
| Offline gates | PASS: npm ci, check, test, build, audit, diff check; 0 vulnerabilities |
| Visual review | PASS: role-refined desktop and 390px mobile artifacts; no horizontal overflow observed |
| Production operations | NONE: no deploy, migration, bootstrap, schedule, mail, Gmail, Neon, secret or main operation |

Technical specification and references: `docs/SHEET_METAL_MARKET_REFERENCE.md` and `docs/phase3a-international-source-findings.md`. Visual artifacts: `docs/visual-review/sheet-metal-role-desktop.webp`, `docs/visual-review/sheet-metal-role-mobile.png`, and `docs/visual-review/sheet-metal-visual-findings.md`. Final refinement implementation SHA: `f6b982a9e25890053dfe9b5813087aa27eb4be73`; main remains unchanged pending explicit approval.

## Phase 3A stainless product-scope scoring correction — Ready for review

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

The narrow approved correction is complete on `feat/sheet-metal-market-reference-v1`. FRED/BLS `WPU10170674` (Steel Pipe and Tube, Stainless Steel) remains in source coverage as `GLOBAL_IMPORT_REFERENCE`, with `participatesInScoring=false` and a visible product-scope mismatch reason. It is provenance-only and cannot affect `materialPressure`. Taiwan stainless-sheet domestic pricing remains `NO_DATA`. FRED/BLS `WPU101707` remains an eligible international cold-rolled sheet/strip reference, explicitly not Taiwan domestic or CIF pricing. IMF/FRED `PNICKUSDM` remains an eligible `GLOBAL_INPUT_PROXY` for upstream nickel context.

| Status item | Result |
|---|---|
| Deterministic regression | PASS: **82 passed / 0 failed** |
| Required gates | PASS: npm ci, check, test, build, audit, diff check; 0 vulnerabilities |
| Final local smoke | One HTTP 200 force-refresh smoke; response saved and inspected |
| Revised score | `48.47` |
| Level / direction | `NORMAL` / `FALLING` |
| Evidence | `6/3` |
| Data quality | `STALE` |
| Source coverage | `21`; all roles classified; no unclassified source |
| Scoring roles | `GLOBAL_IMPORT_REFERENCE=4`, `GLOBAL_INPUT_PROXY=3`, `TAIWAN_DOMESTIC=9`; structural remains non-momentum |
| Pipe/tube check | Visible in provenance, `LIVE`, monthly through `2026-07-01`, excluded from `observedValues` and score |
| Remaining gaps | Taiwan cold-rolled and Taiwan stainless-sheet domestic proxies remain explicit `NO_DATA` |
| Protected paths | Machining logic, weights, minimum evidence 3, persistence, routes/navigation and `engineeringEstimate=null` unchanged |
| Production operations | NONE: no deploy, main promotion, migration, workflow, bootstrap, Neon, Gmail, schedules or secrets |

The exact source-role refinement head remains documented at `d308f5c68cba8dbcd5328e924b93c6a1d3aea2e9`; this scoring correction will receive its own feature-branch commit and SHA after final checks.

## Phase 3A — Sheet Metal Market Reference V1 production certification

**PHASE_3A_SHEET_METAL_MARKET_REFERENCE_PRODUCTION_PASS**

The approved Phase 3A head `ce6021dd96463baf1224aa5af8e360c48710fb74` was promoted from authoritative main `04de849ae9ae83fceb1cdeaf7aa09c9fcda66c62` by pure fast-forward. Final main is `ce6021dd96463baf1224aa5af8e360c48710fb74`. Phase 3A adds no database schema and reuses the existing certified public-observation persistence, so no migration was required.

The existing Render service deployed the promoted main and passed read-only checks: `/`, `/machining`, `/machining/`, `/sheet-metal`, `/sheet-metal/`, both machining and sheet-metal reference APIs, `/health` and `/health/weekly` returned HTTP 200; `/sheet-metal.html` returned HTTP 308 to `/sheet-metal`. Render health was `OK`, `WEB_READY`, `DATABASE_READY`, with durable storage ready. `MAIL_CONFIGURATION_REQUIRED` remains the expected owner-controlled status and was not changed or triggered.

| Production item | Result |
|---|---|
| Contract | `processFamily=SHEET_METAL`; `engineeringEstimate=null` |
| Result | score `48.47`; `NORMAL`; `FALLING`; confidence `0.83`; `STALE` |
| Selected window | `12 週`, `-2.52%`, `FALLING` |
| Evidence | `6/3` usable components / minimum evidence |
| Source roles | All exposed sources valid; `GLOBAL_IMPORT_REFERENCE=5`, `GLOBAL_INPUT_PROXY=3`, `TAIWAN_DOMESTIC=9`, `STRUCTURAL=1`; unclassified `0` |
| Scoring roles | `GLOBAL_IMPORT_REFERENCE=4`, `GLOBAL_INPUT_PROXY=3`, `TAIWAN_DOMESTIC=9`; structural and non-scoring observations excluded from scored values |
| Cold-rolled `WPU101707` | `LIVE`, import reference, scoring eligible; U.S. BLS sheet/strip index, not Taiwan domestic, supplier or CIF pricing |
| Stainless pipe/tube `WPU10170674` | `LIVE`, import reference, provenance-only with `participatesInScoring=false`; limitation and exclusion reason visible; absent from scored observed values |
| Nickel `PNICKUSDM` | `LIVE`, `GLOBAL_INPUT_PROXY`, scoring eligible only as upstream context |
| Domestic gaps | Taiwan cold-rolled proxy `NO_DATA`; Taiwan stainless-sheet proxy `NO_DATA` |
| Frequency | Daily/weekly 4/12-week; monthly 1/3/12-month; structural no momentum |
| Machining | Existing machining page/API returned normally; no machining calculation path changed |
| Visual review | Desktop provenance and 390×844 mobile passed; no horizontal overflow or clipped navigation |
| Regression | Pre-promotion **82 passed / 0 failed**; audit **0 vulnerabilities** |
| Safety | No supplier/company/private semantics; no migration, workflow, bootstrap, mail, schedule, secret, Neon or extra Render operation |

This certification used only read-only production verification after normal Render deployment. The annotated checkpoint tag `sheet-metal-market-reference-v1` is to be created at the final verified documentation checkpoint.

## Phase 4A — Engineering Estimate Foundation V1

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

Phase 4A is complete on `feat/engineering-estimate-foundation-v1`, based exactly on authoritative main `30192a4d5202675df11a2e00ee97f02d2c49537d`. It adds an independent, stateless and deterministic `SHEET_METAL` engineering estimator and does not alter the certified raw-material, machining or sheet-metal market semantics.

| Status item | Result |
| --- | --- |
| Data chain | `ENGINEERING_INPUT → PHYSICAL_CALCULATION → PROCESS_WORKLOAD → ENGINEERING_ESTIMATE` kept separate from `OBSERVED_PUBLIC_DATA → DERIVED_MARKET_REFERENCE` |
| Input contract | Strict top-level/nested allowlists; explicit geometry and enabled-process workload; structured validation for missing, invalid, zero/negative, integer, density, units, conflicting utilization/scrap, unexpected fields and rate modes |
| Physical formulas | Area, volume, mm³-to-kg/m³ conversion, theoretical mass, explicit utilization/scrap adjustment and batch quantity |
| Workload formulas | Cut m, pierce each, bend each, weld m, treated m² and quantity per batch |
| Rate behavior | Default `NO_RATE` with every monetary field `null`; explicit `SYNTHETIC_TEST` only for deterministic fixtures; no company, supplier or market rates |
| Market separation | `marketReference=null` and `marketAdjustmentFactor=null`; no market score multiplier or market API dependency |
| UI/routing | Independent Traditional Chinese `/estimate`; `/estimate/` alias; `/estimate.html` 308 redirect; schema GET; estimate POST; real shared navigation link |
| Existing API isolation | Existing raw-material/machining/sheet-metal paths remain unchanged and `engineeringEstimate=null` remains tested |
| Persistence/operations | No schema change, migration, deployment, workflow, bootstrap, daily/weekly, mail, Gmail, schedule, secret or Neon operation |
| Deterministic suite | PASS: **93 passed / 0 failed** |
| Final gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; audit 0 vulnerabilities |
| Visual review | PASS: local calculated desktop and 390×844 mobile; no horizontal overflow; null-cost and boundary labels readable |
| Artifacts | `docs/visual-review/engineering-estimate-desktop.png`, `docs/visual-review/engineering-estimate-mobile.png`, `docs/visual-review/phase4a-capture-metrics.json`, `docs/visual-review/phase4a-visual-findings.md` |
| Specification | `docs/ENGINEERING_ESTIMATE_FOUNDATION.md` |

The final local example displayed 2.355 kg/part, 235.5 kg total material mass, 145 m total cut length, 800 pierces, 400 bends, one batch and 100 parts per batch. `NO_RATE` remained visibly null-cost rather than zero-cost; no synthetic fixture rate appeared in the UI. The mobile metrics recorded viewport width 390, document width 390, body width 390 and `horizontalOverflow=false`.

Phase 4B remains unimplemented and requires a separate review for richer geometry, nesting/remnant, certified material properties, process-time models, internal/private rate governance, quotation inputs or ERP integration. No main promotion is authorized by this status entry.

## Phase 4A production safety correction — Synthetic rates blocked in production

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

A narrow production-safety correction is complete on `feat/engineering-estimate-foundation-v1`. The core estimator retains deterministic `SYNTHETIC_TEST` support for non-production tests, while `NODE_ENV=production` HTTP runtime rejects synthetic rate profiles before any estimate or cost calculation is produced.

| Status item | Result |
| --- | --- |
| Implementation SHA | `dc67b11bfbd87e093ce298ae91f8bd5c4be8a93d` |
| Production synthetic rejection | PASS: HTTP 400, `state=VALIDATION_ERROR`, `code=SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION`, explicit message and structured `input.rateProfile.mode` error |
| Production NO_RATE | PASS: explicit and omitted `rateProfile` both return HTTP 200; all monetary fields remain `null` |
| Production schema | PASS: runtime `allowedRateModes` and `schema.rateProfile.allowedModes` contain only `NO_RATE`; `SYNTHETIC_TEST` is separately identified as `testOnlyModes` and rejected by production HTTP |
| Internal/test schema | PASS: non-production service/schema retains `SYNTHETIC_TEST` metadata for deterministic tests |
| Core synthetic formulas | PASS: non-production synthetic fixture still returns deterministic cost totals; underlying estimator support was not removed |
| PRIVATE_CALIBRATED | PASS: remains reserved/unimplemented and rejected |
| UI | PASS: `/estimate` remains NO_RATE-only; no synthetic-rate panel; boundary labels unchanged |
| Existing market behavior | PASS: raw-material, machining and sheet-metal API isolation and `engineeringEstimate=null` regressions remain covered |
| Full deterministic suite | PASS: **94 passed / 0 failed** |
| Required gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; 0 vulnerabilities |
| Local production HTTP smoke | PASS: fresh local production-mode server accepted NO_RATE with null cost and exposed production-aware schema; synthetic rejection returned HTTP 400 with the required code |
| Production operations | NONE: no deploy, main promotion, migration, Neon, workflow, bootstrap, daily/weekly, mail, Gmail, schedule or secret operation |

The authoritative production main remains `30192a4d5202675df11a2e00ee97f02d2c49537d`. This correction must be reviewed separately and must not be promoted automatically.

## Phase 4A — Engineering Estimate Foundation V1 production certification

**PHASE_4A_ENGINEERING_ESTIMATE_FOUNDATION_PRODUCTION_PASS**

The approved Phase 4A head `baaec1ba78c0c475d58ac3320c08e55829610e9b` was promoted from authoritative main `30192a4d5202675df11a2e00ee97f02d2c49537d` by pure fast-forward to main. The production runtime code checkpoint is main SHA `83494511adcf52c77cb3af3965e2b35d4598f2e6`, and the existing Render service automatically deployed it; this documentation-only certification checkpoint records the verified deployment. No new Render service was created, and no database migration was required because Phase 4A is stateless and introduces no schema.

| Status item | Result |
|---|---|
| Promotion SHA | `baaec1ba78c0c475d58ac3320c08e55829610e9b` |
| Verified production runtime main SHA | `83494511adcf52c77cb3af3965e2b35d4598f2e6` |
| Final certification checkpoint | Documentation-only checkpoint commit; annotated tag `engineering-estimate-foundation-v1` targets the verified final documentation state |
| Render deployment | PASS: existing service deployed normally from main and became available for read-only checks |
| Routing | PASS: `/`, `/machining`, `/sheet-metal`, `/estimate`, `/estimate/`, schema endpoint, `/health` and `/health/weekly` returned HTTP 200; `/estimate.html` returned HTTP 308 to `/estimate` |
| Production schema | PASS: `runtime.environment=production`; runtime and schema allowed modes are `NO_RATE` only; `SYNTHETIC_TEST` is test-only metadata; `PRIVATE_CALIBRATED` unavailable |
| Production NO_RATE POST | PASS: HTTP 200; physical/workload fixture matched; every monetary field was `null`; `marketReference` and `marketAdjustmentFactor` were `null` |
| Omitted rateProfile | PASS: HTTP 200; safe production default `NO_RATE`; every monetary field `null` |
| Production synthetic rejection | PASS: one intentional HTTP 400; `state=VALIDATION_ERROR`; top-level code `SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION`; path `input.rateProfile.mode`; no estimate or synthetic money returned |
| Physical/workload fixture | PASS: 2.355 kg/part; 235.5 kg theoretical and total material mass; 145 m cut; 800 pierces; 400 bends; 0 m weld; 0 m² treatment; batch 1; 100 parts/batch |
| Formula trace | PASS: 10 entries; formulas, input values, conversions and explicit units retained |
| Hidden factors | PASS: no hidden nesting, scrap, utilization, market multiplier, supplier margin or company rate; omitted utilization/scrap equals theoretical mass |
| Existing market isolation | PASS: machining and sheet-metal force-reference APIs returned HTTP 200 and kept `reference.engineeringEstimate=null` |
| Health | PASS: `/health` and `/health/weekly` top-level `status=OK`; existing readiness and durable storage remained available |
| Production UI | PASS: desktop and 390×844 mobile; readable form/results, formula trace, NO_RATE and boundary labels; no horizontal overflow or synthetic/company rate UI |
| Regression / audit | PASS: **94 passed / 0 failed**; all required gates passed; 0 vulnerabilities |
| Production operations | No migration, workflow, bootstrap, daily/weekly, backfill, mail, Gmail, schedule, secret, Neon or extra Render operation |

The production visual and payload evidence is recorded under `docs/visual-review/phase4a-production-verification.md`, `production-estimate-desktop.png`, `production-estimate-mobile.png` and `phase4a-production-capture-metrics.json`. The production page continues to expose engineering quantities only; it does not show supplier quotations, company cost parameters or market-derived prices.

There is no Phase 4A production blocker. The existing owner-controlled `MAIL_CONFIGURATION_REQUIRED` notice remains a non-blocking health status and was not changed or triggered by this certification. Phase 4B remains separate future scope. The final documentation-only commit and annotated tag are the certification handoff records; they do not alter the verified runtime behavior.

## Phase 4B — Private Cost Calibration & Process-Time Foundation V1

**Status: FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN — DO NOT IMPORT REAL PRIVATE DATA**

| Item | Status |
|---|---|
| Feature branch | `feat/private-cost-calibration-foundation-v1`, based on certified Phase 4A main checkpoint `73f1c5ef14266ed162ff8f2127859b877e69a385` |
| Scope | Architecture foundation and deterministic synthetic verification only |
| Real private data | NONE requested, loaded, persisted, logged, committed, backed up or exposed |
| Process family | `SHEET_METAL` only |
| Process time | Explicit cutting, piercing, bending, welding and batch setup calibration; missing calibration is `CALIBRATION_REQUIRED`; surface treatment is `NO_MODEL` |
| Private profile | Strict version/lifecycle contract; `PRIVATE_CALIBRATED` requires `ACTIVE`, safe metadata only, no raw rate return |
| Authorization | Protected service requires authenticated identity, `engineering:private-cost` scope and audit logger; anonymous public API denied |
| Public API/schema/UI | Public production remains `NO_RATE`; no private endpoint, raw rate field or private-rate input |
| Market isolation | `marketReference=null`, `marketAdjustmentFactor=null`; existing market APIs remain outside private cost chain |
| Storage decision | First real calibration should use local/private runtime; later multi-user use requires separate authenticated private service or protected database |
| Security audit | Completed in `docs/phase4b-storage-authorization-audit.md`; OWASP/GitHub research saved in `docs/phase4b-security-research-notes.md` |
| Tests | **105 passed / 0 failed** |
| Gates | `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check` passed; 0 vulnerabilities |
| Visual review | Desktop and 390×844 local screenshots; calibration-required, NO_RATE, no private-rate UI and no horizontal overflow |
| Production operations | NONE: no migration, schema change, workflow, deployment, Render config, schedule, bootstrap, daily/weekly, backfill, mail, Gmail, secret, Neon or real-data operation |

The detailed foundation is documented in `docs/PRIVATE_COST_CALIBRATION_FOUNDATION.md`. The feature is intentionally blocked from real private-rate onboarding until identity, authorization, encryption and key management, private storage, backup/restore, profile approval and revocation, audit trail, leakage scans, calibration reconciliation and independent production certification are complete. Existing Phase 4A production certification and annotated checkpoint remain unchanged.

## Phase 4C — Local Private Calibration Runtime & Real-Data Intake Readiness V1

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN — DO NOT IMPORT REAL PRIVATE DATA**

Phase 4C is complete on `feat/local-private-calibration-runtime-v1`, created from Phase 4B approved SHA `0e4a84bff00c8846888e45906a2682986c6df16c` and certified Phase 4A main checkpoint `73f1c5ef14266ed162ff8f2127859b877e69a385`. It implements a local-only private calibration runtime and real-data intake readiness foundation. No real company or supplier data was requested, loaded, persisted, logged, committed, backed up or exposed.

| Status item | Result |
|---|---|
| Runtime | `npm run private:estimate`; separate from public `npm start` / `server.js` |
| Fail-closed enablement | `PRIVATE_RUNTIME_ENABLED=1` required; disabled otherwise |
| Network boundary | Bind host is fixed to `127.0.0.1`; non-loopback configuration rejected; request socket is loopback-only |
| Profile source | `PRIVATE_RATE_PROFILE_PATH` must be an absolute repository-external file; canonical file and parent symlink containment checks enforced |
| Profile contract | Strict Phase 4B contract; `PRIVATE_CALIBRATED`, `ACTIVE`, `APPROVED` metadata and valid effective window required |
| Local authorization | Server-issued HttpOnly/SameSite local session plus protected `engineering:private-cost` scope; request cannot submit `rateProfile` |
| Private response | Local path may return internal cost, process time and physical/workload result; profile contains safe metadata only; raw rates never returned |
| Audit | External JSONL mode `0600`; exactly timestamp, authorized local identity, profile ID/version, process family, estimate ID and result status |
| Public API/UI | No private route on `server.js`; public UI/nav/schema remain without private rate input; public `PRIVATE_CALIBRATED` remains denied |
| Repository protection | Ignore rules cover common private profile, calibration worksheet and audit artifacts; example profile is placeholder-only with future effective date |
| Intake worksheet | `docs/PRIVATE_CALIBRATION_INTAKE_WORKSHEET.md` contains no real values |
| Security audit | Existing Phase 4B storage/authorization audit extended with Phase 4C local-runtime addendum; OWASP/GitHub references retained |
| Leakage regression | Synthetic sentinel absent from private page/result/error/audit and public assets/schema/status; no raw private rate in public surface |
| Market isolation | Existing raw-material/machining/sheet-metal market paths and `engineeringEstimate=null` semantics remain covered |
| Deterministic suite | PASS: **111 passed / 0 failed** |
| Final gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; 0 vulnerabilities |
| Visual review | PASS: local private desktop 1440×1000 and mobile 390×844; safe metadata, private cost, redacted trace and no horizontal overflow |
| Visual artifacts | `docs/visual-review/phase4c-private-estimate-desktop.png`, `phase4c-private-estimate-mobile.png`, `phase4c-capture-metrics.json`, `phase4c-private-ui-observations.md` |
| Production state | NONE: no Render deployment, main promotion, migration, workflow, schedule, bootstrap, mail, Gmail, secret, Neon or real-data operation |

The synthetic local smoke produced 2.355 kg/part, 235.5 kg total material, 313 process minutes, 3,566 `TEST_UNITS` total internal cost and 35.66 `TEST_UNITS`/part. These figures are synthetic test outputs only and are not company calibration, supplier pricing, market data or quotation data. The local runtime and all repo-external synthetic profile/audit/temp artifacts were stopped and cleaned after visual review.

The next permitted boundary is a separate real-data onboarding review. It must first establish a controlled internal deployment, authenticated identity, least-privilege authorization, encryption/key management, private backup/restore, profile lifecycle and revocation, redacted audit, leakage scans and independent certification. This Phase 4C status does not authorize real-data import or main promotion. Existing Phase 4A production certification remains unchanged.

## Phase 4D — Internal Engineering Cost Calibration Pilot V1

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN — DO NOT IMPORT REAL PRIVATE DATA**

Phase 4D is implemented on `feat/internal-engineering-cost-calibration-pilot-v1`, based on Phase 4C approved SHA `2d1afa0836688c443202933a7913e52b7e589fab`. The certified public main checkpoint remains `73f1c5ef14266ed162ff8f2127859b877e69a385`. This phase builds the first controlled, local-only workflow for **內部工程成本估算** and stops before any real pilot import.

| Status item | Result |
|---|---|
| Runtime | Existing `npm run private:estimate`; `PRIVATE_RUNTIME_ENABLED=1` required; bind and request boundary remain `127.0.0.1` loopback-only |
| External pilot | `PRIVATE_CALIBRATION_PILOT_PATH` loads one strict `SINGLE_CONTROLLED_PILOT` JSON from outside repository; no request-body pilot import |
| Input contract | Explicit part, material, cutting, piercing, bending, welding, surface-treatment, setup and historical-reference fields; missing modelable values remain null; no guessing |
| Historical contract | `KNOWN_COMPONENT_REFERENCE`, `TOTAL_ONLY_REFERENCE`, `NO_HISTORICAL_REFERENCE`; total/per-part derivation is explicit; zero or missing denominator yields `variancePct=null` |
| Observation modes | `RATE_BASED` and `OBSERVED_TIME`; conflicting speed/run inputs require explicit `authoritativeObservation`, otherwise rejected |
| Quality | Configurable thresholds with synthetic defaults only; statuses are `NOT_EVALUATED`, `CLOSE_MATCH`, `MODERATE_VARIANCE`, `LARGE_VARIANCE`; no undocumented business acceptance limit |
| Diagnostics | Material, cutting, piercing, bending, welding, setup, missing-calibration and insufficient-reference review categories; no automatic rate tuning |
| Profile update | `PROPOSED_ONLY` candidates show current version, proposed field, reason and evidence count; proposed values are `PROFILE_VALUE_NOT_RETURNED`; no automatic write-back |
| History | Optional external append-only `0600` JSONL with exactly pilotId, estimateId, profileId, profileVersion, runTimestamp, variancePct and resultStatus; no raw rates or historical actual cost duplication |
| UI | Local private page now shows pilot comparison, component variance, observation mode/formula, internal engineering cost components, historical actual internal cost, diagnostics, profile version and redacted trace; public Render UI unchanged |
| Security/leakage | Pilot/historical synthetic sentinel and raw-rate values absent from public API/schema/assets/docs/status/logs; public private routes remain absent; request pilot data rejected |
| Public/market isolation | Public `/estimate` remains `NO_RATE`; anonymous `PRIVATE_CALIBRATED` remains denied; market references continue `engineeringEstimate=null` and no market multiplier |
| Deterministic suite | PASS: **118 passed / 0 failed** including Phase 4A/4B/4C and machining/sheet-metal market regression |
| Visual review | PASS: synthetic desktop `1440×1000` and mobile `390×844`; no horizontal overflow, pilot comparison/proposed-only/redacted trace present, raw-rate input absent, sentinel absent |
| Documentation | `docs/INTERNAL_ENGINEERING_COST_CALIBRATION_PILOT.md`; intake governance remains in `docs/PRIVATE_CALIBRATION_INTAKE_WORKSHEET.md` |
| Production state | NONE: no real company/supplier data, Render deployment, main promotion, Neon migration, Gmail, schedule, secret, workflow, bootstrap, daily/weekly, backfill, mail or production configuration operation |

The synthetic visual fixture produced 2.355 kg/part, 235.5 kg total material, 313 process minutes, 3,566 `TEST_UNITS` total internal cost, a 250 `TEST_UNITS` historical reference and a 1,326.4% synthetic variance. These values are test-only and are not company or supplier data. Before a real pilot is considered, the project still requires a separately approved authenticated operator boundary, least privilege, encryption/key management, private backup/restore, lifecycle/revocation, access audit, leakage scanning, reconciliation and independent certification. Phase 4D is not approved for real-data intake or main promotion.

## Phase 4BCD — Private Cost Foundation Production Certification

**PHASE_4BCD_PRIVATE_COST_FOUNDATION_PRODUCTION_PASS**

The Phase 4B–4D code foundation was promoted to `main` by pure fast-forward from authoritative main `73f1c5ef14266ed162ff8f2127859b877e69a385` to promotion SHA `03ca44e2a22dbcb7177e258fc1e2a67e0958a70f`. Phase lineage is intact: Phase 4B `0e4a84bff00c8846888e45906a2682986c6df16c`, Phase 4C `2d1afa0836688c443202933a7913e52b7e589fab`, Phase 4D `03ca44e2a22dbcb7177e258fc1e2a67e0958a70f`. Only code, tests, docs and synthetic visual artifacts were promoted; no real private/company data was imported.

| Certification item | Result |
|---|---|
| Main promotion | PASS: pure fast-forward, no force push or history rewrite |
| Final regression | PASS: **118 passed / 0 failed** |
| Final gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; 0 vulnerabilities |
| Render deployment | PASS: existing Render service deployed normally from main; no new service created |
| Public routes | PASS: `/`, `/machining`, `/sheet-metal`, `/estimate` HTTP 200; legacy machining/sheet-metal HTML routes remained canonical redirects |
| Health | PASS: `/health` and `/health/weekly` HTTP 200, top-level `status=OK`; existing owner-controlled readiness and mail notices unchanged |
| Public private routes | PASS: `/private-estimate` HTTP 404; POST `/api/private/estimate` and POST `/api/private/calibration-pilot` HTTP 405 method-gate responses; no private runtime content |
| Public engineering | PASS: production schema allows `NO_RATE` only; NO_RATE POST HTTP 200 with all monetary fields `null` |
| Rejected modes | PASS: `PRIVATE_CALIBRATED` HTTP 403 with `PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API`; `SYNTHETIC_TEST` HTTP 400 with `SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION` |
| Market isolation | PASS: machining and sheet-metal reference APIs HTTP 200; both retain `engineeringEstimate=null`; no private cost or market multiplier injection |
| Public visual review | PASS: home, machining, sheet-metal and estimate at desktop `1440×1000` and mobile `390×844`; all no-overflow, no pilot button, no private profile metadata; estimate remains NO_RATE |
| Runtime configuration | PASS: public Render continues `npm start → server.js`; no `PRIVATE_RUNTIME_ENABLED`, profile path, pilot path, audit path or history path added to Render |
| Leakage precheck | PASS: no tracked real profile/pilot/history/audit payload; private artifact ignore rules verified; templates/examples synthetic/placeholders only |
| Real calibration | NONE: no real profile or pilot was loaded; no calibration has occurred |
| Production operations | No migration, Neon, Gmail, schedule, workflow, bootstrap, daily/weekly, backfill, mail or secret operation was performed |

The production read-only visual and deployment records are preserved under `docs/visual-review/phase4abcd-production-*.png`, `docs/visual-review/phase4abcd-production-visual-metrics.json` and `docs/visual-review/phase4abcd-render-deployment-observations.md`.

The private runtime remains localhost-only, disabled by default and separate from Render. The first real pilot remains a separate local/private operation and is blocked until authenticated internal identity, least-privilege authorization, deployment boundary, encryption/key management, private backup/restore, profile lifecycle/revocation, access audit, leakage scanning, reconciliation, retention/deletion and independent certification are approved. The production certification does not authorize real private-data import or quotation behavior.

## Phase 4E — First Real Calibration Operator Readiness V1 production certification

**PHASE_4E_FIRST_REAL_CALIBRATION_OPERATOR_READINESS_PRODUCTION_PASS**

The approved Phase 4E head `7eb416dbf85685231f2eecda6574405f4817fc05` was promoted from authoritative main `c846c2837f0666334d26e464a0e0552dcf91c8ff` by pure fast-forward and pushed to `main`. This is a code/runbook/operator-tooling promotion only. No real company/private value was requested, created, imported, filled, loaded, persisted, committed, logged, backed up or exposed; no real private directory, real profile, real pilot or first real pilot execution occurred.

| Status item | Result |
|---|---|
| Promotion SHA | `7eb416dbf85685231f2eecda6574405f4817fc05` |
| Final main before documentation checkpoint | `7eb416dbf85685231f2eecda6574405f4817fc05` |
| Feature lineage | Phase 4C `2d1afa0836688c443202933a7913e52b7e589fab` → Phase 4D `03ca44e2a22dbcb7177e258fc1e2a67e0958a70f` → Phase 4E `7eb416dbf85685231f2eecda6574405f4817fc05` |
| Full deterministic suite | PASS: **126 passed / 0 failed** |
| Final gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; audit 0 vulnerabilities |
| Operator commands | `private:init`, `private:validate`, `private:estimate`, `private:leak-check` present and syntax-covered |
| Directory safety | `private:init` refuses relative, repository-contained and symlink-contained destinations; external directories use `0700`, files use `0600`, and existing regular templates are not overwritten |
| Empty templates | Profile and pilot skeletons contain field names only; all real-value fields start `null`; no synthetic rates are inserted |
| Safe validation | `private:validate` checks enable flag, external paths, profile lifecycle/approval/effective dates, pilot schema, local identity, loopback boundary and public leakage; output is status-only and excludes paths, rates, historical cost and payloads |
| Post-run leak check | PASS in deterministic tests and synthetic smoke: no tracked private payload, no sensitive untracked repository file, public assets/documents safe and public API unchanged; output contains safe status only |
| Localhost boundary | `private:estimate` remains disabled by default and bind-only `127.0.0.1`; public `server.js` does not register private runtime routes |
| Profile write-back | NONE; no automatic profile tuning or write-back endpoint exists |
| Render runtime | PASS: existing service continues `npm start → server.js`; no private environment variables or private paths were added |
| Public pages | PASS: `/`, `/machining`, `/sheet-metal`, `/estimate` HTTP 200 |
| Public health | PASS: `/health` and `/health/weekly` HTTP 200 with top-level `status=OK`; existing owner-controlled states were not modified or triggered |
| Private public routes | PASS: `/private-estimate`, `/api/private/estimate` and `/api/private/calibration-pilot` did not expose private runtime content |
| Public engineering | PASS: production schema/runtime allow `NO_RATE` only; NO_RATE returns monetary fields `null`; `PRIVATE_CALIBRATED` and `SYNTHETIC_TEST` are rejected |
| Market isolation | PASS: machining and sheet-metal public references retain `engineeringEstimate=null` |
| Regression scope | PASS: public navigation, canonical routes, public-only UI and existing private runtime/pilot regressions remain covered |

The existing Render service `https://raw-material-market-dashboard-1.onrender.com` completed normal deployment from main. Read-only regression confirmed public pages, canonical redirects, public-only navigation, public `/estimate` NO_RATE behavior, private-route absence and no private marker/raw-rate leakage. Public market pages may truthfully show existing `API_ERROR`, `NO_DATA` or readiness states; this certification did not fabricate values and did not treat those public states as private calibration output. Browser observations are recorded in `docs/visual-review/phase4e-promotion-browser-observations.md`.

The next action is **manual local operator execution of the first real pilot**, not another coding phase. It is not executed automatically by this certification. The future operator must use a repository-external private directory, complete the value-empty templates locally, run `npm run private:validate`, execute exactly one controlled pilot only after all statuses pass, stop the localhost runtime, preserve only protected external audit/history and run `npm run private:leak-check`. This status does not itself authorize the operator to enter values.

No Render/private cloud upload, Neon change, Gmail change, schedule change, secret change, workflow dispatch, migration, bootstrap, daily/weekly job, backfill or mail send was performed. The final annotated checkpoint tag `first-real-calibration-operator-readiness-v1` is created after the documentation-only checkpoint commit and points to the final verified main state.

## Phase 4F — Standalone public exposure remediation

**PHASE_4F_STANDALONE_PUBLIC_EXPOSURE_REMEDIATION_PASS — FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

The Phase 4F standalone calculator remains a repository artifact for controlled offline `file://` copying, but a narrow public-server remediation now blocks the entire `/standalone` namespace before generic static-file serving. The change is on `feat/standalone-offline-public-exposure-remediation-v1`, based on approved Phase 4F SHA `6f13df19066b9fdd6c0d2427def7de094317afe1`.

| Status item | Result |
|---|---|
| Exact deny behavior | HTTP 404, body `Not found`, no redirect for `/standalone`, `/standalone/`, `/standalone/InternalEngineeringCostCalculator.html`, `/standalone/test.html` and decoded descendants |
| Server boundary | `server.js` checks `/standalone` namespace before legacy redirects, static resolution and generic root serving |
| Local artifact | PASS: repository file remains present and valid for direct `file://` opening; calculator formulas/UI unchanged |
| Public pages | PASS: `/`, `/machining`, `/sheet-metal`, `/estimate` remain HTTP 200 |
| Public assets | PASS: `/styles.css`, `/app.js`, `/nav.js`, `/machining.js`, `/sheet-metal.js`, `/estimate.js` remain HTTP 200 |
| Public navigation | PASS: no standalone calculator link |
| Offline contract | PASS: existing no-external-resource, no-network and no-persistence tests remain passing |
| Full regression | PASS: **137 passed / 0 failed** after adding the remediation assertions |
| Final gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; audit 0 vulnerabilities |
| Private/company data | NONE: no company/private value, real rate, real profile, real pilot or operator workflow used |
| Main | NOT PROMOTED; remains `479774bb362881928587573ebb577d169fa35e02` |
| Production operations | NONE: no deploy, Render configuration, Neon, Gmail, schedule, secret, migration, workflow, bootstrap, job or mail operation |

The standalone calculator must not be re-exposed through another public route, added to public navigation or served by Render. This remediation is a pre-promotion requirement and does not authorize main promotion or first real pilot execution.

## Phase 4F — Standalone Offline Internal Engineering Cost Calculator V1 production certification

**PHASE_4F_STANDALONE_OFFLINE_INTERNAL_COST_CALCULATOR_PRODUCTION_BOUNDARY_PASS**

The approved public-exposure remediation head `324937a10ef6d81dd22508ba8fc45e32bf1d0b0a` was promoted from authoritative main `479774bb362881928587573ebb577d169fa35e02` by pure fast-forward. The final code promotion includes the self-contained offline calculator and the public `/standalone` namespace deny rule; no force push or history rewrite was used.

| Certification item | Result |
|---|---|
| Final code promotion | `324937a10ef6d81dd22508ba8fc45e32bf1d0b0a` |
| Final main documentation checkpoint | Created after this read-only certification update; pushed to `origin/main` |
| Annotated tag | `standalone-offline-internal-engineering-cost-calculator-v1` targets the final verified documentation checkpoint |
| Full regression | PASS: **137 passed / 0 failed** |
| Dependency audit | PASS: **0 vulnerabilities** |
| Public pages | PASS: `/`, `/machining`, `/sheet-metal`, `/estimate` HTTP 200 |
| Public assets | PASS: `/styles.css`, `/app.js`, `/nav.js`, `/machining.js`, `/sheet-metal.js`, `/estimate.js` HTTP 200 |
| `/standalone` namespace | PASS: `/standalone`, `/standalone/`, calculator path, arbitrary child path and URL-encoded equivalent all HTTP 404 `Not found`; no redirect |
| Public navigation | PASS: no standalone/offline calculator link or calculator marker |
| Public engineering | PASS: schema `NO_RATE` only; NO_RATE HTTP 200 with monetary fields null; `PRIVATE_CALIBRATED` rejected; `SYNTHETIC_TEST` rejected |
| Market isolation | PASS: machining and sheet-metal references retain `engineeringEstimate=null` |
| Health | PASS: `/health` and `/health/weekly` HTTP 200 with top-level `status=OK` |
| Standalone artifact | PASS: repository file retained and valid for direct `file://` opening; inline HTML/CSS/JavaScript; no server, Node runtime, CDN, external resources, API, network, analytics, telemetry or persistence dependency |
| Offline smoke | PASS: synthetic `TEST_ONLY` desktop/mobile calculations, calculate, clear/reset, formula detail and print-safe behavior; no non-file request, no persistent storage, no horizontal overflow |
| Company/private data | NONE used, entered, imported, loaded, persisted, committed, logged, backed up or exposed |
| Production operations | NONE beyond the authorized main push and read-only Render verification; no Render configuration, Neon, Gmail, schedule, secret, workflow, migration, bootstrap, daily/weekly, backfill, mail or private-runtime operation |

The existing Render service `raw-material-market-dashboard-1.onrender.com` deployed normally from `main`. The standalone calculator is not a public Render page and is not discoverable from public UI. The public website remains unchanged except for the required fail-closed `/standalone/` namespace block. The next action is controlled human distribution/use of the offline HTML, not another automatic development phase; this certification does not enter company values or execute a real pilot.

## Phase 4F follow-up — `/estimate` browser-local internal engineering cost workspace

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN — DO NOT ENTER REAL COMPANY DATA**

This follow-up is implemented on `feat/estimate-browser-local-internal-cost-v1`, from certified main `b4666ae5c840e29a23cb747e54eac22d5adb1c76`. It makes the existing public `/estimate` page the primary operator workspace for `內部工程成本估算`; it does not create another calculator product and does not alter the certified standalone `file://` artifact or its public `/standalone` 404 protection.

| Status item | Result |
|---|---|
| `/estimate` UI | PASS: complete browser-local Traditional-Chinese workspace for basic part data, material, cutting/piercing, bending, welding, surface treatment, engineering/setup, other fixed cost, results, breakdown and formula trace |
| Shared formula core | PASS: pure `local-cost-calculator.js` reproduces the certified standalone full synthetic fixture exactly after JSON normalization; standalone artifact remains unchanged |
| Browser-local privacy | PASS: manual internal cost values never enter server/API/Render logs/Neon/Gmail/analytics/telemetry; no fetch, XHR, WebSocket, sendBeacon, form submission, background sync, localStorage, IndexedDB, sessionStorage or cookie path |
| Lifecycle | PASS: `pageshow` and `清除全部` reset in-memory inputs/results; clear removes output/breakdown/formula DOM; invalid values show field validation and no result; missing enabled component data is explicit `資料不足`/null |
| Market separation | PASS: market references remain informational; no market pressure, score or multiplier is used to populate internal rates or cost formulas |
| Public API | PASS: existing production engineering API remains `NO_RATE` only; `PRIVATE_CALIBRATED`/`SYNTHETIC_TEST` handling and market `engineeringEstimate=null` isolation remain regression-covered |
| `/standalone` | PASS: namespace deny behavior remains covered; local artifact retained only for controlled `file://` use and no public navigation link added |
| Targeted deterministic suite | PASS: **29 passed / 0 failed** across estimate integration, standalone and engineering regression tests |
| Browser smoke | PASS: synthetic `TEST_ONLY` values produced total `3,964.75` and per-part `39.6475`; calculation generated zero additional network calls; cookie/localStorage/sessionStorage were empty; clear, invalid fail-closed and pageshow reset passed |
| Visual review | PASS: desktop `1440×1000` and mobile `390×844`; navigation/tags wrap on mobile and no visible horizontal overflow; artifacts under `artifacts/phase4f-estimate-browser-local/` |
| Production boundary | NONE: no Render deploy, main push, private runtime, real company data, real rate, Neon, Gmail, schedules, secrets, migration, workflow, bootstrap, daily/weekly job, mail or telemetry operation |

The branch remains stopped before main promotion and before real company-data entry. Final gates passed on the completed worktree (`npm ci`, `npm run check`, `npm test`: 143 passed / 0 failed, `npm run build`, `npm audit --omit=dev`: 0 vulnerabilities, `git diff --check`), and feature commit `29fe7df546301b76777b431d4ce72e4502db44bf` was pushed to `origin/feat/estimate-browser-local-internal-cost-v1`. Main and `origin/main` remain `b4666ae5c840e29a23cb747e54eac22d5adb1c76`; no promotion occurred.


## Phase 4F follow-up refinement — Formal blank operator page and fail-closed basic inputs

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN — DO NOT ENTER REAL COMPANY DATA**

The `/estimate` browser-local workspace received a narrow validation/default refinement on `feat/estimate-browser-local-internal-cost-v1`. `thicknessMm`, `lengthMm` and `widthMm` are now required positive inputs; `quantity` and `batchCount` are required positive integers. Null and blank-string inputs fail closed with explicit Traditional-Chinese `不可留白。` errors, while zero and non-integer values remain invalid.

The formal blank operator page removes all operational synthetic defaults. An HTML input scan finds only the standard carbon-steel density default `densityKgM3=7850`; dimensions, quantity, batch count, process quantities and all process switches start blank/unchecked. The standard density table remains the only engineering default family and does not represent company data.

| Status item | Result |
|---|---|
| Validation | PASS: five basic required fields enforce required + positive, with quantity/batch also integer |
| Null/blank tests | PASS: all five fields covered for both `null` and `""`; zero and fractional integer cases covered |
| Formal blank page | PASS: no operational numeric defaults or checked process switches; only density `7850` remains |
| Blank browser smoke | PASS: blank submit produced no result, required-field validation, `networkCalls=[]`, empty cookie/storage and all process switches unchecked |
| Visual artifacts | PASS: blank formal desktop `1440×1000` and mobile `390×844` screenshots under `artifacts/phase4f-estimate-browser-local/` |
| Final gates | PASS: `npm ci`, `npm run check`, `npm test` (**145 passed / 0 failed**), `npm run build`, `npm audit --omit=dev` (**0 vulnerabilities**), `git diff --check` |
| Production boundary | NONE: no deployment, main promotion, Render/Neon/Gmail/schedule/secret/workflow/private-runtime operation or real company-data entry |

The certified standalone artifact, public API `NO_RATE` behavior, market `engineeringEstimate=null` isolation and `/standalone` 404 protection remain unchanged. This branch stops before main promotion.


## PHASE_4F_ESTIMATE_BROWSER_LOCAL_PRODUCTION_PASS

**PRODUCTION CERTIFIED — FINAL — STOP**

The approved Phase 4F browser-local Internal Engineering Cost workspace is now live in the existing public application. `/estimate` is the primary operator workspace for `內部工程成本估算`. Manual internal cost values are calculated only in the current browser document; no entered value is sent to the server/API, Render logs, Neon, Gmail, analytics/telemetry or browser persistence. The production formal page starts blank except for the documented standard carbon-steel density engineering default `7850 kg/m³`; all operational numeric inputs are blank and all five process switches are unchecked.

The approved head `2b38c6830a56eb53ec7e369fd107715aa4e78a05` was promoted to `main` by pure fast-forward. A read-only production probe then found an encoded leading-slash `/standalone` namespace bypass before final certification. The narrow safety hotfix `fca2755e35852b37dbcb04335ed6676d27aa3000` canonicalizes leading decoded slashes before the namespace guard and adds deterministic coverage. It was pushed to main by fast-forward only. Final `main` and `origin/main` both equal `fca2755e35852b37dbcb04335ed6676d27aa3000`.

| Production certification | Result |
|---|---|
| Lineage and gates | PASS: approved head was 3 ahead / 0 behind; final post-hotfix suite **145 passed / 0 failed**; `npm ci`, check, build, audit and diff check passed; audit **0 vulnerabilities** |
| Existing Render service | PASS: `raw-material-market-dashboard-1.onrender.com` deployed normally from main; no new service or configuration change |
| `/estimate` routes | PASS: `/estimate` and `/estimate/` HTTP 200; all required sections present; formal blank state verified |
| Browser smoke | PASS: blank submit fail-closed with no result; `TEST_ONLY` fixture total `3,964.75`, per-part `39.6475`; pageshow cleared values/results |
| Browser-local isolation | PASS: no fetch/XHR/sendBeacon calls or resource delta during calculation; cookie/localStorage/sessionStorage remained empty |
| Public engineering API | PASS: schema and production behavior remain `NO_RATE` only; NO_RATE HTTP 200 with monetary fields null; PRIVATE_CALIBRATED HTTP 403; SYNTHETIC_TEST HTTP 400 |
| Market isolation | PASS: machining and sheet-metal production references returned `engineeringEstimate: null`; market references remained informational |
| `/standalone` | PASS: ordinary, double-slash and encoded equivalents all returned HTTP 404 `Not found`, without redirect or calculator/HTML content |
| Visual certification | PASS: actual deployed blank page reviewed at `1440×1000` and `390×844`; density default identified, process switches unchecked, result empty, mobile stacked, navigation usable and no visible horizontal overflow |
| Real-data boundary | PASS: no real company data, real rate, private runtime, database, mail, schedule, secret, workflow, migration, bootstrap, backfill or telemetry operation |

This is the final production certification checkpoint. No real-data pilot is authorized by this record, and no additional development phase should be started automatically.


## Phase 4F — Public data-integrity audit & public process money references

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

本次工作在 `feat/production-data-integrity-public-process-reference-v1` 完成，從 main `096005640b08fc31c340a38d41c0f2c41655757d` 建立；implementation checkpoint 為 `7d8f321eb9100ca27446737c1a588a4d4433b1d6`。本階段沒有 production deployment、database mutation、migration、bootstrap、schedule、workflow dispatch、mail、Gmail、Neon、secret/variable 修改，也沒有使用真實公司或 private data。

| Status item | Result |
|---|---|
| End-to-end integrity | PASS: public acquisition、cache/seed、market API/dashboard、daily/Postgres snapshots、weekly quality/mail boundary與 process pages均完成 freshness/provenance audit |
| Direct observation policy | PASS: successful Yahoo/Stooq/FX fetches are age-classified by actual `lastTradeAt`; older observations cannot remain `OK`; missing timestamps fail closed |
| Seed/durable fallback | PASS: production bundled seed disabled; durable public snapshot is `READ_FALLBACK`, observation date preserved, never relabeled `LIVE`, expired data remains `EXPIRED` |
| Weekly/dashboard truthfulness | PASS: observation age and headline eligibility are explicit; expired/old observations block clean weekly delivery; dashboard freshness counts and top gain/loss exclusion are deterministic |
| Machining money-first | PASS: TaiwanCNC machine-hour references and separate PRO360 TWD/min statistic; 5-axis/turn-mill preserve open-ended `+` semantics; no hidden average |
| Sheet-metal money-first | PASS: laser direct listed tables with material/thickness/unit/hole metadata; bending/TIG/MIG/CO2/spot welding are `NO_PUBLIC_PRICE_DATA` rather than invented rates |
| Estimate/privacy boundary | PASS: `/estimate` remains browser-local; public references do not auto-fill internal rates; `engineeringEstimate=null`; `/standalone` remains 404 |
| UI | PASS: public monetary panels precede summary and `成本趨勢輔助`; local 1440×1000 and 390×844 screenshots reviewed for both process pages with no visible horizontal overflow |
| Tests | PASS: **160 passed / 0 failed** |
| Gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev` (**0 vulnerabilities**), `git diff --check` |
| Main | **UNCHANGED** at `096005640b08fc31c340a38d41c0f2c41655757d`; promotion remains explicitly out of scope |

Detailed audit and public monetary contract documentation are `docs/FULL_PRODUCTION_DATA_INTEGRITY_AUDIT.md` and `docs/PUBLIC_PROCESS_COST_REFERENCE_CONTRACT.md`. Local visual evidence is under `artifacts/phase4f-pasted13-public-process-reference/`. The current feature head is ready for separate review only and must stop before final main promotion.


## Phase 4G — Narrow pre-promotion remediation

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

第二次獨立 review 指出的五項 blocker 已在既有 `feat/production-data-integrity-public-process-reference-v1` 完成窄幅修正；承接 head `7a28ca1176f72137ddf5afcadcaa24eec91891d3`，implementation commit 為 `fff1a4ccb55fb4452ee2f1fd5957eac0049026e1`。未重新設計已完成的資料完整性與 money-first architecture。

| Status item | Result |
|---|---|
| Stale candidate | PASS: 全部 memory/local/seed candidates 依原始 `dataAsOf` 排序；最新 eligible candidate優先為 STALE，無 eligible 才選最新 EXPIRED |
| Daily readiness | PASS: execution `SUCCEEDED` 與 data readiness 分離；fresh/fallback/stale/expired/no-data/API-error/freshness-eligible counts與`dataAsOf`持久化；read status不再只看 command success |
| Currency provenance | PASS: TaiwanCNC/PRO360 `EXPLICIT`；MINCA/Zhongkai `LOCALE_INFERRED`；numeric table保留但 UI顯示網站列示與詢價確認，不做 FX conversion |
| Copy consistency | PASS: machining與sheet-metal footer改為準確 public price/reference boundary，不再否認頁面實際列示的公開金額 |
| Open-ended card | PASS: `priceOpenEnded=true`, finite `priceMin`, null `priceMax` rendered as valid `NT$ 2,000+ / hr`／`NT$ 1,800+ / hr` cards |
| Visual | PASS: phase4g desktop/mobile captures for both pages; public monetary panels remain primary, inferred-currency notes readable, no visible horizontal overflow |
| Tests | PASS: **168 passed / 0 failed**; blocker-targeted suite **103 passed / 0 failed** |
| Gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev` (**0 vulnerabilities**), `git diff --check` |
| Production operations | NONE: no deploy, main promotion, workflow/schedule/mail/Neon/Gmail/secret change, migration, bootstrap or real company/private data |
| Main | **UNCHANGED** at `096005640b08fc31c340a38d41c0f2c41655757d` |

Detailed records remain in `docs/FULL_PRODUCTION_DATA_INTEGRITY_AUDIT.md` and `docs/PUBLIC_PROCESS_COST_REFERENCE_CONTRACT.md`; visual artifacts are under `artifacts/phase4f-pasted13-public-process-reference/`. The branch requires separate review and must stop before main promotion.


## Production certification — public data integrity and process monetary references

**PRODUCTION_DATA_INTEGRITY_PUBLIC_PROCESS_MONETARY_REFERENCE_PASS**

Approved feature head `909cb2bf64fc060358b55730319017ed154b5dfb` was promoted to `main` from authoritative main `096005640b08fc31c340a38d41c0f2c41655757d` by pure fast-forward and pushed. The existing Render service was allowed to deploy normally. No force push, rebase, history rewrite, second Render service, configuration change, workflow dispatch, mail resend, migration, bootstrap, schedule update, secret change, Neon change or Gmail change was performed.

| Status item | Result |
|---|---|
| Final code main SHA | `909cb2bf64fc060358b55730319017ed154b5dfb` before this documentation-only checkpoint |
| Lineage | PASS: feature was 4 ahead / 0 behind; merge-base was authoritative main |
| Gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check` |
| Tests / vulnerabilities | **168 passed / 0 failed**; **0 vulnerabilities** |
| Render | PASS: existing `raw-material-market-dashboard-1.onrender.com` responded normally after main deployment |
| `/api/market` | PASS: HTTP 200; `FALLBACK` / `READ_FALLBACK`; 14 rows; counts fresh 0, fallback 14, stale 0, expired 0, API error 0, no-data 0 |
| Market timestamps | PASS: `generatedAt=2026-08-23T01:54:08.760Z`; `servedAt=2026-08-24T08:33:56.398Z`; `dataAsOf` and `latestMarketObservationAt` = `2026-08-21T00:00:00.000Z` |
| May seed | PASS: no May 2026 bundled-seed row served as current production data; public fallback retained August 21 observation identity |
| Dashboard | PASS: fallback/usable, stale, expired and API/no-data states remained distinguishable; maximum gain/loss stayed unavailable because no finite rankable change data existed; stale/expired rows cannot headline |
| `/health` | PASS: HTTP 200, `status=OK` |
| `/health/weekly` | PASS: HTTP 200, `status=OK`, `WEB_READY`, `DATABASE_READY`, `storage.ready=true`, `WEEKLY_REPORT_READY`; legacy `DAILY_DATA_NOT_READY` is accepted until the next normal scheduled daily collection; `MAIL_CONFIGURATION_REQUIRED` remains owner-controlled |
| Weekly gate | PASS by deployed contract/regression: severely old STALE/EXPIRED → `SEND_BLOCKED`; defensible STALE may warn; adequate current coverage remains eligible |
| Machining production | PASS: `/machining` and `/api/machining/reference` HTTP 200; monetary panel first; 5-axis `NT$ 2,000+ / hr`, turn-mill `NT$ 1,800+ / hr`, separate PRO360 `NT$ 80–120 / min`; `engineeringEstimate=null` |
| Sheet-metal production | PASS: `/sheet-metal` and `/api/sheet-metal/reference` HTTP 200; 56 laser monetary rows and 4 `NO_PUBLIC_PRICE_DATA`; MINCA/Zhongkai show locale-inferred wording without source-explicit `NT$` or FX conversion |
| Boundaries | PASS: `/estimate` browser-local; public engineering schema `NO_RATE` only; no public amount auto-fills internal rates; `/standalone` namespace and encoded equivalents HTTP 404 |
| Routes | PASS: `/machining/`, `/sheet-metal/` HTTP 200; `.html` legacy routes HTTP 308 to canonical routes |
| Visual | PASS: production `/`, `/machining`, `/sheet-metal` reviewed at `1440×1000` and `390×844`; cards stack correctly, navigation usable, currency evidence readable, pressure secondary, no visible horizontal overflow |
| Data safety | PASS: no real company/private data used; no schedule/secret/Neon/Gmail configuration changed |

The final documentation-only checkpoint and annotated tag are created after this production read-only certification update. The certification stops after the main/tag push and does not begin another development phase.
