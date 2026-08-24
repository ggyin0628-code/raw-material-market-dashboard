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
