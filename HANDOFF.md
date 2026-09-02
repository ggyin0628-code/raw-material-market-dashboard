# Raw Material Dashboard — Production Handoff

## Delivery identity

| Item | Value |
| --- | --- |
| Repository | `ggyin0628-code/raw-material-market-dashboard` |
| Authoritative baseline | `8390a0234fb5d18e28e100ee1ff40750b6b0d95e` |
| Existing bootstrap remediation | `fix/bootstrap-performance-v1`, certified by `bootstrap-performance-certified-v1` |
| Final presentation main SHA | `8a9fd80c30a339b9eeea1a176c174459368a39b9` |
| Presentation status | Approved, committed and pushed to `main` |
| Active production mail provider | Gmail SMTP (`MAIL_PROVIDER=smtp`) |
| Approved presentation preview | Offline `2026-W33` HTML/XLSX preview |
| Product boundary | External public market intelligence and purchasing-reference context only |
| Deployment / paid resources | Not performed / none added |

The approved procurement-management presentation redesign is complete and is no longer pending. The final main commit contains the HTML/XLSX presentation renderer, deterministic offline preview generator, presentation regression coverage and the required status/handoff alignment. The remote main SHA was verified against the local main SHA and the working tree was clean after push.

## Permanent safety boundary

> The system stores only external public market observations and derived public-market reference reports. It is not a procurement system, supplier quotation service, company target-price system, ERP purchasing module or buy/sell decision engine.

Do not add SAP, company procurement history, supplier quotations or names, company target prices, private thresholds, inventory, MOQ, payment terms, company email systems, private mappings, credentials or private runtime reports. Do not read, print, export, rotate or modify GitHub Actions secret values. No company data or company mail integration is part of this system. The only mail provider currently active in production is the existing owner-configured Gmail SMTP path.

## Existing bootstrap certification retained

The cancelled `Market Production Bootstrap #1` run `32609131444` on the original baseline completed setup, checkout, dependency installation, code validation, migration and storage readiness in about 14 seconds, then occupied the 30-minute safety ceiling in `Bootstrap public history`. The bottleneck was classified as **BOTH**: sequential public-history fetching and per-record PostgreSQL lookup/write round-trips.

The remediation kept the complete three-year public history and 30-minute safety ceiling. It added bounded history concurrency 3 (cap 4), default Postgres batch size 250 (cap 500), one parameterized multi-row upsert transaction per batch, status-quality preservation, chunk resumability and safe progress. Run `32611318090` established the successful promoted-main Neon bootstrap, and run `32611472483` verified final callback-forwarded batch telemetry. Both were bootstrap-only with no weekly mail and no schedule activation. **Bootstrap is complete and must not be rerun for this handoff or for the presentation redesign.**

## Production mail delivery state

The production weekly workflow remains on the existing Gmail SMTP provider. The owner-confirmed live Gmail test succeeded: the HTML email was received successfully and the XLSX attachment was received successfully. Gmail SMTP is therefore the active production mail provider. The existing recipients, test-mode behavior, delivery ledger, duplicate guard and `WEEKLY_MAIL_TEST_MODE` boundary remain unchanged.

The manual Gmail test is complete. It is not a pending action and must not be repeated as part of this handoff. This documentation cleanup does not send mail or trigger the weekly workflow.

Microsoft Graph is **historical and inactive only**. Any Graph implementation or OAuth helper retained in repository history is not the active production weekly path, is not required for current operations and must not be treated as a production mail dependency. The current workflow uses Gmail SMTP and no company Microsoft 365 integration.

## Presentation redesign state

The approved presentation layer is live in the promoted `main` source at SHA `8a9fd80c30a339b9eeea1a176c174459368a39b9`. It provides the procurement-management HTML report and polished XLSX workbook with four KPI cards, weekly change overview, procurement review priorities, category momentum, signal distribution, compact prioritized detail columns, filters, frozen headers, alternating row shading, directional indicators, warning-row highlighting and a bottom disclaimer.

The accepted offline `2026-W33` preview was generated from synthetic public-safe fixture data with zero network calls and no mail send. The redesign changes presentation only; market collection, calculations, signals, quality gate, Neon/PostgreSQL, bootstrap, mail delivery, recipients, GitHub Actions and schedules remain outside its scope.

## Validation status

| Gate or state | Result |
| --- | --- |
| Presentation redesign approval | PASS: offline `2026-W33` preview accepted |
| Final main SHA | `8a9fd80c30a339b9eeea1a176c174459368a39b9` |
| Deterministic regression suite | PASS: 53 passed / 0 failed |
| `npm ci` / check / syntax | PASS |
| Build / audit / YAML validation | PASS |
| Presentation scope guard | PASS |
| Protected runtime unchanged | PASS |
| Gmail SMTP live test | PASS: HTML received and XLSX attachment received |
| Microsoft Graph production use | INACTIVE / historical only |
| Bootstrap | COMPLETE; do not rerun |
| Schedule activation | Pending owner enablement only |
| Company data / company mail integration | NONE |

## Schedule gate and next operational certification

The daily/weekly schedule gate remains owner-controlled. The agent did not enable or modify `PRODUCTION_SCHEDULES_ENABLED`, and no schedule was triggered by this documentation cleanup.

The next operational certification is for the owner to enable the existing schedule gate by setting `PRODUCTION_SCHEDULES_ENABLED=1` when ready. The Gmail live test and attachment verification are already complete; they are not prerequisites to repeat. No bootstrap rerun, Graph setup, company mail integration or additional live email is required for this handoff.

## Weekly PostgreSQL snapshot-read timeout remediation — feature-only checkpoint

本次 incident remediation 在 `fix/weekly-postgres-read-timeout-v1` 完成。根因為 `loadAndBuildWeeklyReport()` 透過 `listSnapshots()` 對 `market_snapshots` 執行無 date bounds 的全表 JSONB read；修復後以 reporting week end 作為 `to`，以 `min(YTD year start, end - 784 days)` 作為 `from`，並將兩者傳入 PostgreSQL query。784 天覆蓋 52-week target 的 364 天與既有 420-day comparison tolerance；既有 `market_snapshots_date_idx` 已支援 range predicate，DB timeout policy 未提高（default 8,000 ms，maximum 30,000 ms）。

新增 coverage 涵蓋 explicit from/to、各 analytics window、XLSX history、no unbounded weekly read、`DATABASE_READ_FAILED` fail-closed、DB read failure 不觸發 mail及正常 report 進入 mail path。Full gates 為 **172 tests passed / 0 failed**、`npm audit --omit=dev` 0 vulnerabilities、check/build/diff clean。此 checkpoint 僅使用 synthetic public fixtures，未執行 workflow、mail resend、migration、bootstrap、backfill、Neon mutation或 private data操作；main 保持 `d9b94a40fd0e8f5d8f451951e32fe33382f45e9f` 且必須停止於 main promotion 前。

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32609131444 "Cancelled bootstrap run"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611318090 "Successful promoted-main bootstrap"
[3]: https://github.com/ggyin0628-code/raw-material-market-dashboard/actions/runs/32611472483 "Bootstrap batch telemetry verification"
[4]: https://github.com/ggyin0628-code/raw-material-market-dashboard/commit/8a9fd80c30a339b9eeea1a176c174459368a39b9 "Final presentation main commit"

## Phase 2A — CNC／一般加工公開市場參考 V1

**狀態：PROMOTED_TO_MAIN_RENDER_VERIFIED**

本功能在 `feat/machining-market-reference-v1` 上完成，基於本文件所列的正式生產 checkpoint 建立；首個完整功能 commit 為 `57ccdbf08908f062b3e4b88164986373a59db92b`。它新增獨立的 `machining.html` 頁面與 `GET /api/machining/reference` API，使用台灣優先的外部公開指標觀察加工成本壓力方向；不產生供應商報價、不產生公司目標價格，也不估算加工時薪、循環時間或機台內部成本。

| 交接項目 | Phase 2A 結果 |
| --- | --- |
| 公開來源稽核 | DGBAS PPI、DGBAS 製造業薪資、中央銀行 NTD/USD、台電官方費率表候選、既有 Yahoo／Stooq 公開金屬與能源指標 |
| 資料層 | `OBSERVED_PUBLIC_DATA`、`DERIVED_MARKET_REFERENCE`；`ENGINEERING_ESTIMATE` 在 V1 固定為 `null` |
| 模型 | 可配置權重、4／12 週窗口、明確壓力等級、最低 3 構面證據門檻、缺失資料不補洞 |
| UI | 「加工市場參考」頁；顯示整體／構面壓力、4／12 週方向、資料新鮮度、來源沿革與純文字說明 |
| 安全標示 | 「公開市場參考」「非供應商報價」「非公司目標價格」 |
| 生產路徑 | 既有原物料、Neon、Gmail、weekly mail、bootstrap、Render、GitHub Actions 及 schedules 未被重跑或重新設計 |
| 對外操作 | 未部署、未寄信、未重跑 bootstrap、未修改排程、未修改 production secrets |

來源可得性會保留 `LIVE`、`FALLBACK`、`STALE`、`NO_DATA` 及 `API_ERROR`；若最低證據門檻未達成，API 的綜合分數、壓力等級及方向均為 `null`，頁面明確顯示資料不足。DGBAS 大型 XML 與個別公開頁面在執行環境中可能發生傳輸或解析錯誤，這些狀態會直接保留在來源沿革，不會被轉成假價格。完整方法、來源 URL、授權、更新頻率與缺口記載於 `docs/MACHINING_MARKET_REFERENCE.md`。

## Phase 2A 驗證

目前新功能的確定性測試已通過，完整現有回歸套件亦保持通過。正式交接前以 `npm ci`、`npm run check`、`npm test`、`npm run build`、`npm audit --omit=dev` 及 `git diff --check` 重跑並記錄最終結果。首個完整功能 commit SHA 為 `57ccdbf08908f062b3e4b88164986373a59db92b`；文件在此 SHA 後的交接更新會另形成最終文件 commit，並於推送後回報最終 HEAD SHA。

## UI／Routing Refinement — Canonical `/machining`

**狀態：FEATURE_BRANCH_READY_FOR_REVIEW；不得推進 main**

本次窄幅 refinement 將 `/machining` 設為加工頁的 canonical user-facing URL，`/machining/` 亦可安全服務同一頁；內部 `/machining.html` 只保留作靜態檔案解析，直接請求會以 308 導向 `/machining`。所有使用者可見加工連結均已改為 `/machining`。

原物料首頁與加工頁共用 `nav.js` 導覽基礎，現階段只呈現兩個有效頁面：`原物料市場 → /` 與 `加工市場參考 → /machining`。沒有建立 Sheet Metal、Weekly 或 Sources 假頁面，且加工內容仍維持獨立頁架構。

新增 deterministic routing/navigation 測試涵蓋 `/machining`、`/machining/`、`.html` redirect、active navigation 與禁止假頁面；最終完整 suite 為 63 passed / 0 failed。視覺審查工件為 `docs/visual-review-machining-desktop.png`、`docs/visual-review-machining-mobile.png`、`docs/visual-review-homepage-navigation.png`，摘要為 `docs/visual-review-notes.md`。

本次已依核准以純 fast-forward 將 main 從 `902af25eac2d29439e2021c348041b25e21d8d7d` 推進至 `976df477f1b7c12265150c9c5a72e1bada7607f8`，並推送至 GitHub；沒有 force push 或 history rewrite。既有 Render 服務 `https://raw-material-market-dashboard-1.onrender.com` 已由 main 自動部署並完成唯讀驗證：`/`、`/machining`、`/machining/`、`/api/machining/reference`、`/health` 與 `/health/weekly` 均正常，`/machining.html` 回傳 308 並導向 `/machining`。Render 回報 `WEB_READY`、`DATABASE_READY`、`storage.ready=true`；`MAIL_CONFIGURATION_REQUIRED` 仍是 Render 僅作 dashboard hosting 的預期狀態。本次未修改 production schedules、Neon、Gmail、bootstrap、secrets 或 certified production paths，也未手動觸發 Actions。

## Phase 2B — Production certification

**PHASE_2B_MACHINING_DATA_HARDENING_PRODUCTION_PASS**

Phase 2B hotfix `fix/migration-workflow-test-env-isolation-v1` was promoted from the authoritative main `e5e75c74aa1bd64824ce35dff3898fcc28731bfd` by pure fast-forward to `e4621cbfa02a120662af6067c0230dc7110aec96`. The dedicated `.github/workflows/market-db-migrate.yml` remains the only approved schema path: it is `workflow_dispatch` only, has no schedule, uses `permissions: contents: read`, and scopes `NODE_ENV=production`, `STORAGE_PROVIDER=postgres`, `DATABASE_SSL=true`, `REQUIRE_DURABLE_STORAGE=1`, and the existing `DATABASE_URL` secret only to the migration step. Deterministic tests therefore run without production Postgres environment variables.

Historical failed run `32635052696` is retained as a failed attempt caused by production environment leakage into deterministic tests. The corrected new run `32635836462` on hotfix/main SHA `e4621cbfa02a120662af6067c0230dc7110aec96` succeeded: checkout, Node 20 setup, `npm ci`, `npm run check`, `npm test` (**70 passed / 0 failed**), `npm run db:migrate`, and `DATABASE_MIGRATED` verification all passed. Migration output reported `DATABASE_MIGRATED` with `statementCount: 9`, confirming the idempotent `machining_public_observations` schema migration path completed successfully. The workflow did not invoke bootstrap, daily, weekly, backfill, mail, Gmail or SMTP operations.

The existing Render service completed read-only verification after promotion: `/`, `/machining`, `/machining/`, `/api/machining/reference?force=true`, `/health` and `/health/weekly` returned HTTP 200; `/machining.html` continued to return HTTP 308 to `/machining`. Render reported `WEB_READY`, `DATABASE_READY` and `storage.ready=true`. The machining API returned `compositePressureScore=45.54`, `pressureLevel=NORMAL`, `trend=FALLING`, `evidenceCount=6`, `minimumEvidence=3`, and `dataQuality=STALE`; `engineeringEstimate` remained `null`, with no CNC hourly price, supplier quotation, company target price or private/company data. The production response retained Yahoo/public material, DGBAS official fallback, CBC official NTD/USD and Taipower structural provenance with frequency-aware semantics.

Known public-source limitations remain explicit: DGBAS PPI uses the secure official `nstatdb` CSV fallback through `2026-07-01`; manufacturing wages are monthly through `2026-06-01` and remain `STALE` because of publication lag; CBC daily data is through `2026-08-21`; and Taipower is a structural event-driven source through `2025-10-01` and does not generate weekly momentum. `MAIL_CONFIGURATION_REQUIRED` remains the expected Render status because mail configuration and schedule enablement are outside this certification. The final verified main commit is identified by the checkpoint tag `machining-data-hardening-v1` created after this documentation checkpoint.

## Phase 3A — 鈑金市場參考 V1

**狀態：FEATURE_BRANCH_READY_FOR_REVIEW；不得推進 main**

Phase 3A is implemented on feature branch `feat/sheet-metal-market-reference-v1`, created exactly from the certified checkpoint `04de849ae9ae83fceb1cdeaf7aa09c9fcda66c62`. It adds an independent canonical `/sheet-metal` page and `GET /api/sheet-metal/reference` endpoint. The page observes Taiwan-first public indicators for sheet-metal materials, energy, labor, FX, manufacturing prices and capacity/demand heat. It never creates supplier quotations, company target prices, CNC hourly rates, cycle times or engineering estimates.

| Handoff item | Phase 3A result |
| --- | --- |
| Taiwan-first source audit | PASS: official MOEA CSV exact industry rows for `24 基本金屬製造業`, `25 金屬製品製造業`, `29 機械設備製造業`, `C 製造業`; DGBAS PPI/wages; CBC NTD/USD; Taipower structural JSON |
| Explicit source gaps | Taiwan cold-rolled steel and stainless-steel price proxies remain `NO_DATA`; no foreign series is silently substituted |
| Data contract | `SHEET_METAL`; `OBSERVED_PUBLIC_DATA` and `DERIVED_MARKET_REFERENCE`; `ENGINEERING_ESTIMATE=null` |
| Model | Sheet-metal-specific weights; minimum evidence remains 3; daily/weekly 4/12-week, monthly 1/3/12-month, annual 1/3-year, structural no momentum |
| Persistence | Reuses the certified public-observation store with `sheet-metal:` series namespaces; no schema change or migration performed |
| UI/routing | Independent `/sheet-metal`; `/sheet-metal/` alias; `/sheet-metal.html` 308 redirect; shared navigation exposes only real `/`, `/machining`, `/sheet-metal` pages |
| Deterministic tests | PASS: 80 passed / 0 failed |
| Final offline gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; audit 0 vulnerabilities |
| Visual review | PASS: desktop, 390px mobile and homepage navigation artifacts under `docs/visual-review/` |
| Production protection | No deployment, production migration, bootstrap, schedule, mail, Gmail, Neon, secret or main operation performed |

Local read-only smoke against the public sources produced a truthful composite: score `48.47`, `NORMAL`, selected `12 週` direction `FALLING`, evidence `6/3`, overall quality `STALE` because the public manufacturing wage series was monthly and lagged. MOEA fabricated-metal activity was represented as a monthly activity index, not a price. The local response retained `LIVE`, `FALLBACK`, `STALE` and explicit `NO_DATA` coverage, including the cold-rolled and stainless gaps.

Visual artifacts are `docs/visual-review/sheet-metal-desktop.webp`, `docs/visual-review/sheet-metal-mobile.png`, `docs/visual-review/homepage-navigation.webp`, with findings in `docs/visual-review/sheet-metal-visual-findings.md`. The technical source and model specification is `docs/SHEET_METAL_MARKET_REFERENCE.md`; the official source audit notes remain in `docs/phase3a-*.md`.

## Phase 3A source-role refinement — Ready for review

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

The focused refinement remains on `feat/sheet-metal-market-reference-v1`, based on the certified main checkpoint `04de849ae9ae83fceb1cdeaf7aa09c9fcda66c62`. It keeps the independent `/sheet-metal` page, `/sheet-metal/` alias, `/sheet-metal.html` 308 redirect, `/api/sheet-metal/reference`, six public pressure dimensions, minimum evidence of 3, frequency-aware windows and `engineeringEstimate=null`.

| Refinement item | Result |
|---|---|
| Taiwan-first meaning | Taiwan-prioritized, not Taiwan-only; international sources are admitted only with an explicit role and limitation |
| Accepted international/import references | FRED/BLS cold-rolled steel sheet and strip (`WPU101707`), limited FRED/BLS stainless pipe/tube (`WPU10170674`), existing public HRC/aluminum/copper references |
| Accepted upstream proxies | FRED/IMF global nickel (`PNICKUSDM`), existing WTI and natural-gas public indicators |
| Taiwan domestic sources | DGBAS PPI/wages, CBC NTD/USD, MOEA activity rows, Taipower structural tariff metadata |
| Role taxonomy | `TAIWAN_DOMESTIC`, `GLOBAL_IMPORT_REFERENCE`, `GLOBAL_INPUT_PROXY`, `STRUCTURAL`; missing roles are rejected as `UNCLASSIFIED` |
| Domestic gaps | Taiwan cold-rolled and stainless-sheet price proxies remain explicit `NO_DATA`; no foreign index is silently relabeled as Taiwan price |
| Provenance | Every source retains market scope, role, pricing basis, currency, unit, frequency, observation date, fetched time, status, URL and limitation |
| Local live public-source smoke | Score `43.21`, `NORMAL`, `FALLING`, evidence `5/3`, overall `STALE`; scored role summary `GLOBAL_IMPORT_REFERENCE=5`, `GLOBAL_INPUT_PROXY=3`, `TAIWAN_DOMESTIC=9`; source coverage contains `STRUCTURAL` separately |
| Live source states | HRC/aluminum/copper, WTI/natural gas, FRED cold-rolled/stainless/nickel and CBC were `LIVE`; DGBAS PPI was official CSV `FALLBACK`; wages were `STALE`; MOEA timed out as `API_ERROR`; domestic cold-rolled/stainless remained `NO_DATA` |
| Deterministic tests | PASS: 81 passed / 0 failed |
| Offline gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; audit 0 vulnerabilities |
| Visual review | PASS: role-refined desktop and 390px mobile screenshots; provenance cards and public-only boundary labels remained readable without horizontal overflow |
| Production protection | No deployment, main promotion, production migration, bootstrap, schedule, mail, Gmail, Neon, secret or certified machining operation performed |

The international source audit and citations are in `docs/phase3a-international-source-findings.md` and `docs/SHEET_METAL_MARKET_REFERENCE.md`. Visual evidence is in `docs/visual-review/sheet-metal-role-desktop.webp`, `docs/visual-review/sheet-metal-role-mobile.png`, and `docs/visual-review/sheet-metal-visual-findings.md`. The implementation refinement commit SHA is `f6b982a9e25890053dfe9b5813087aa27eb4be73`; this documentation-only follow-up records that SHA, and main remains unchanged until a separate explicit approval.

## Phase 3A stainless product-scope scoring correction — Ready for review

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

The approved narrow correction is implemented on `feat/sheet-metal-market-reference-v1`. FRED/BLS `WPU10170674` remains visible in `sourceCoverage` and component provenance as `GLOBAL_IMPORT_REFERENCE`, but now carries `participatesInScoring=false` and the explicit reason: `Product scope mismatch: stainless pipe/tube is retained only as external stainless-market context, not sheet-metal price evidence.` It is excluded before material-pressure evidence counts, comparison windows and scores are calculated. It is not relabeled as Taiwan stainless-sheet data.

FRED/BLS `WPU101707` remains `GLOBAL_IMPORT_REFERENCE` with `participatesInScoring=true` because its documented product scope is cold-rolled steel sheet and strip; it remains a U.S. BLS producer-price index and is explicitly not a Taiwan supplier price or an import transaction/CIF price. IMF/FRED `PNICKUSDM` remains `GLOBAL_INPUT_PROXY` with `participatesInScoring=true`; it contributes upstream nickel context only and is not treated as finished stainless-sheet pricing. Taiwan stainless-sheet domestic pricing remains an explicit `NO_DATA` gap.

| Correction evidence | Result |
|---|---|
| Deterministic test suite | PASS: **82 passed / 0 failed** |
| Required offline gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; audit 0 vulnerabilities |
| Final local smoke | One HTTP 200 `GET /api/sheet-metal/reference?force=true`; saved response inspected without another live request |
| Corrected score | `48.47` |
| Level / direction | `NORMAL` / `FALLING` |
| Evidence | `6` usable components against minimum `3` |
| Data quality | `STALE` |
| Source coverage | `21` records; all four roles represented; no unclassified role |
| Scoring role summary | `GLOBAL_IMPORT_REFERENCE=4`, `GLOBAL_INPUT_PROXY=3`, `TAIWAN_DOMESTIC=9`; structural metadata remains outside scoring |
| Stainless pipe/tube | Visible in provenance; `LIVE`, monthly through `2026-07-01`, `participatesInScoring=false`; does not appear in `observedValues` or scoring evidence |
| Domestic gaps | Taiwan cold-rolled and Taiwan stainless-sheet proxies remain `NO_DATA` |
| Safety | `engineeringEstimate=null`; no supplier quote, company target price, internal rate, inventory or other private/company fields |

The implementation preserves minimum evidence 3, all component weights, machining logic, persistence architecture, routes/navigation and public-only boundaries. No deployment, main promotion, migration, workflow, bootstrap, Neon, Gmail, schedule or secret operation was performed. The feature branch remains pending separate main-promotion approval.

## Phase 3A — Sheet Metal Market Reference V1 production certification

**PHASE_3A_SHEET_METAL_MARKET_REFERENCE_PRODUCTION_PASS**

The approved feature head `ce6021dd96463baf1224aa5af8e360c48710fb74` was promoted from authoritative main `04de849ae9ae83fceb1cdeaf7aa09c9fcda66c62` to main by pure fast-forward. The final promoted main SHA is `ce6021dd96463baf1224aa5af8e360c48710fb74`. No database migration was required because Phase 3A reuses the certified public-observation persistence and adds no schema.

The existing Render service `https://raw-material-market-dashboard-1.onrender.com` deployed from main and passed read-only verification. `/`, `/machining`, `/machining/`, `/sheet-metal`, and `/sheet-metal/` returned HTTP 200. `/sheet-metal.html` returned HTTP 308 with `Location: /sheet-metal`. `/api/machining/reference?force=true`, `/api/sheet-metal/reference?force=true`, `/health`, and `/health/weekly` returned HTTP 200. The health response reported `OK`, `WEB_READY`, `DATABASE_READY` and `storage.ready=true`; `MAIL_CONFIGURATION_REQUIRED` remains the expected owner-controlled mail status and was not modified or triggered by this certification.

| Production certification item | Result |
|---|---|
| Sheet-metal process family | `SHEET_METAL` |
| Composite score | `48.47` |
| Pressure level / trend | `NORMAL` / `FALLING` |
| Confidence | `0.83` |
| Data quality | `STALE` |
| Selected comparison | `12 週`, `-2.52%`, `FALLING` |
| Evidence | `6` usable components / minimum `3` |
| All source roles | `GLOBAL_IMPORT_REFERENCE=5`, `GLOBAL_INPUT_PROXY=3`, `TAIWAN_DOMESTIC=9`, `STRUCTURAL=1`; unclassified `0` |
| Scoring source roles | `GLOBAL_IMPORT_REFERENCE=4`, `GLOBAL_INPUT_PROXY=3`, `TAIWAN_DOMESTIC=9`; structural and non-scoring records excluded from scored values |
| FRED/BLS `WPU101707` | `LIVE`, `GLOBAL_IMPORT_REFERENCE`, `participatesInScoring=true`; U.S. BLS cold-rolled sheet/strip index, not Taiwan domestic, supplier quotation or CIF/import transaction price |
| FRED/BLS `WPU10170674` | `LIVE`, `GLOBAL_IMPORT_REFERENCE`, `participatesInScoring=false`; retained in source coverage and material provenance with the pipe/tube product-scope exclusion reason, absent from scored `observedValues` |
| IMF/FRED `PNICKUSDM` | `LIVE`, `GLOBAL_INPUT_PROXY`, `participatesInScoring=true`; upstream nickel context only, not finished stainless-sheet, Taiwan or supplier pricing |
| Taiwan domestic gaps | Cold-rolled domestic proxy `NO_DATA`; stainless-sheet domestic proxy `NO_DATA` |
| Engineering boundary | `engineeringEstimate=null`; no supplier quotation, company target price, price-per-piece/kg, hourly rate, internal rate, cycle time, inventory, import share or private/company data |
| Machining regression | PASS: machining page/API remained HTTP 200 and no machining calculation path changed |
| Visual production review | PASS: desktop provenance and 390×844 mobile review; navigation, cards, source roles, limitations and public-only labels readable; no horizontal overflow |

Frequency semantics remained correct: daily sources used 4/12-week comparisons, monthly indexes used 1/3/12-month comparisons, and structural tariff metadata produced no momentum. The production response retained explicit source states, observation dates, frequencies, roles, pricing bases, currencies, limitations and `NO_DATA` gaps. The full pre-promotion regression was **82 passed / 0 failed**, with audit reporting **0 vulnerabilities**. The route/API response artifacts and visual review notes are preserved under `/tmp/phase3a-production-verification/` during the verification session; the committed visual evidence is under `docs/visual-review/`.

No workflow, migration, bootstrap, daily/weekly job, mail send, Gmail change, schedule change, secret change, Neon change or additional Render service was used. The annotated checkpoint tag is created only after this documentation checkpoint and points to the final verified main commit.

## Phase 4A — Engineering Estimate Foundation V1

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

Phase 4A is complete on feature branch `feat/engineering-estimate-foundation-v1`, created from the authoritative production main checkpoint `30192a4d5202675df11a2e00ee97f02d2c49537d`. This branch adds a strict, deterministic and stateless `SHEET_METAL` engineering estimator; it does not promote `main`, deploy, migrate, trigger workflows or change Render.

| Handoff item | Phase 4A result |
| --- | --- |
| Independent chain | `ENGINEERING_INPUT → PHYSICAL_CALCULATION → PROCESS_WORKLOAD → ENGINEERING_ESTIMATE` |
| Implemented process family | `SHEET_METAL` only; future process names are reserved and rejected |
| Geometry and physical quantities | Explicit rectangle length/width/thickness; area, volume, kg/part, theoretical total kg and explicit utilization/scrap adjustment |
| Workload quantities | Cut length, pierce count, bend count, weld length, treatment area, batch count and quantity per batch |
| Formula traceability | Every principal calculation returns formula text, inputs, conversion and output unit; UI exposes expandable formula details |
| Density | User override wins; documented `ENGINEERING_DEFAULT` values are broad configurable assumptions, not certified or supplier properties; `OTHER` requires explicit density |
| Rate behavior | Default and omitted profile are `NO_RATE`, all monetary fields `null`; `SYNTHETIC_TEST` accepts explicit fixture rates only and is labeled `SYNTHETIC / DEMO / TEST ONLY`; `PRIVATE_CALIBRATED` rejected |
| Market separation | `marketReference=null`, `marketAdjustmentFactor=null`; no market API call or multiplier |
| Routes | `/estimate`, `/estimate/`, `/estimate.html` → `308 /estimate`; `POST /api/engineering/estimate`; `GET /api/engineering/estimate/schema` |
| Existing market APIs | Raw-material, machining and sheet-metal paths retain existing semantics; `engineeringEstimate=null` remains asserted for market references |
| Persistence and operations | No schema change, migration, database write, bootstrap, daily/weekly job, mail, Gmail, schedule, secret or Neon operation |
| Deterministic suite | PASS: **93 passed / 0 failed** |
| Final offline gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; audit reported 0 vulnerabilities |
| Visual review | PASS: local desktop calculated result and local 390×844 mobile full-page review; automated width metrics show `390/390` and no horizontal overflow |
| Visual artifacts | `docs/visual-review/engineering-estimate-desktop.png`, `docs/visual-review/engineering-estimate-mobile.png`, `docs/visual-review/phase4a-capture-metrics.json`, `docs/visual-review/phase4a-visual-findings.md` |
| Technical specification | `docs/ENGINEERING_ESTIMATE_FOUNDATION.md` |

The local calculated example returned 2.355 kg per part, 235.5 kg total material mass, 145 m cut length, 800 pierces, 400 bends, one batch and 100 parts per batch. The cost panel remained a null-cost `NO_RATE` state and did not show synthetic, supplier, company or market prices. The 390×844 review rendered a stacked form/result layout with readable quantities, visible boundary labels and no horizontal overflow.

The next review boundary is Phase 4B. Candidate gaps include non-rectangular geometry, hole/void subtraction, nesting and remnant models, certified material properties, process-time models, machine capability, setup/changeover detail, private rate governance and any ERP or quotation integration. None of these are implemented in Phase 4A. The current branch must remain separate from `main` until explicit review and approval.

## Phase 4A production safety correction — Synthetic rates blocked in production

**FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

A narrow safety correction was applied on `feat/engineering-estimate-foundation-v1` after the Phase 4A foundation commit. The core deterministic estimator still supports `SYNTHETIC_TEST` for unit tests and explicitly non-production local/test execution, but the production HTTP runtime now rejects `rateProfile.mode=SYNTHETIC_TEST` with HTTP 400, `state=VALIDATION_ERROR`, top-level `code=SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION`, a matching message, and a structured field error at `input.rateProfile.mode`.

| Handoff item | Result |
| --- | --- |
| Implementation commit | `dc67b11bfbd87e093ce298ae91f8bd5c4be8a93d` (`fix: block synthetic rates in production runtime`) |
| Production HTTP synthetic behavior | PASS: `NODE_ENV=production` rejects `SYNTHETIC_TEST`; no synthetic monetary estimate is generated |
| Production NO_RATE behavior | PASS: explicit `NO_RATE` and omitted `rateProfile` return HTTP 200 with every monetary field `null` |
| Production schema behavior | PASS: `schema.rateProfile.allowedModes=["NO_RATE"]`; `SYNTHETIC_TEST` appears separately under `testOnlyModes` with an explicit rejection note; runtime allowlist is `NO_RATE` only |
| Core deterministic behavior | PASS: non-production estimator/service tests still calculate the explicit synthetic fixture cost deterministically |
| Private rate reservation | PASS: `PRIVATE_CALIBRATED` remains reserved and rejected; no private/company/supplier rate was added |
| Existing paths | PASS: existing raw-material, machining and sheet-metal APIs, routes and `engineeringEstimate=null` isolation remain covered |
| Final deterministic suite | PASS: **94 passed / 0 failed** |
| Final gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; audit reported 0 vulnerabilities |
| Local production HTTP smoke | PASS: fresh local `NODE_ENV=production` server accepted NO_RATE with null cost and returned production-aware schema; synthetic rejection was also verified with HTTP 400 and structured code |
| Production operations | NONE: no main promotion, deployment, migration, workflow, bootstrap, daily/weekly, backfill, mail, Gmail, schedule, secret or Neon operation |

The Phase 4A UI remains NO_RATE-only and continues to show `尚未設定成本參數`, `非供應商報價` and `未載入公司成本參數`; no synthetic-rate input panel was added. The technical specification was updated to distinguish the internal test-only mode from the production HTTP allowlist. The feature branch remains pending explicit review and must not be promoted to `main`.

## Phase 4A — Engineering Estimate Foundation V1 production certification

**PHASE_4A_ENGINEERING_ESTIMATE_FOUNDATION_PRODUCTION_PASS**

The approved Phase 4A head `baaec1ba78c0c475d58ac3320c08e55829610e9b` was promoted from authoritative main `30192a4d5202675df11a2e00ee97f02d2c49537d` by pure fast-forward. The production runtime code checkpoint is main SHA `83494511adcf52c77cb3af3965e2b35d4598f2e6`, and the existing Render service automatically deployed it; this documentation-only certification checkpoint records the verified deployment. No new Render service was created. The annotated tag `engineering-estimate-foundation-v1` targets the final verified documentation checkpoint.

| Production certification item | Result |
| --- | --- |
| Promotion SHA | `baaec1ba78c0c475d58ac3320c08e55829610e9b` |
| Verified production runtime main SHA | `83494511adcf52c77cb3af3965e2b35d4598f2e6` |
| Final certification checkpoint | Documentation-only checkpoint commit; annotated tag `engineering-estimate-foundation-v1` targets the verified final documentation state |
| Render deployment | PASS: existing Render service auto-deployed from main and became available for read-only verification |
| Routing | PASS: `/`, `/machining`, `/sheet-metal`, `/estimate`, `/estimate/`, `/api/engineering/estimate/schema`, `/health` and `/health/weekly` returned HTTP 200; `/estimate.html` returned HTTP 308 to `/estimate` |
| Production schema | PASS: `runtime.environment=production`; `runtime.allowedRateModes=["NO_RATE"]`; `schema.rateProfile.allowedModes=["NO_RATE"]`; `SYNTHETIC_TEST` appears only in test-only metadata; `PRIVATE_CALIBRATED` remains unavailable |
| Explicit NO_RATE POST | PASS: HTTP 200; safe fixture returned all monetary fields `null`, `marketReference=null` and `marketAdjustmentFactor=null` |
| Omitted rateProfile POST | PASS: HTTP 200; production defaulted safely to `NO_RATE` with all monetary fields `null` |
| Synthetic negative POST | PASS: one intentional HTTP 400 request returned `state=VALIDATION_ERROR`, top-level `code=SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION`, structured path `input.rateProfile.mode`, test/demo-only message and no `estimate` object |
| Physical reference fixture | PASS: `blankMassKgPerPart=2.355 kg`, `theoreticalTotalBlankMassKg=235.5 kg`, `totalMaterialMassKg=235.5 kg`, with no utilization/scrap input |
| Workload reference fixture | PASS: `totalCutLengthM=145`, `totalPierceCount=800`, `totalBendCount=400`, `totalWeldLengthM=0`, `totalTreatedAreaM2=0`, `batchCount=1`, `quantityPerBatch=100` |
| Formula trace | PASS: 10 principal trace entries with formulas, explicit inputs, conversions and units `mm`, `mm²`, `mm³`, `m`, `m²`, `kg` |
| Hidden adjustments | PASS: no hidden nesting, scrap, utilization, market adjustment, supplier margin or company rate; omitted utilization/scrap kept total material mass equal to theoretical mass |
| Market isolation | PASS: `/api/machining/reference?force=true` and `/api/sheet-metal/reference?force=true` returned HTTP 200; both retained `reference.engineeringEstimate=null` and no engineering price injection |
| Production health | PASS: `/health` and `/health/weekly` returned top-level `status=OK`; existing readiness and durable storage remained available; no health operation triggered mail or scheduled work |
| Production UI | PASS: `/estimate` desktop and 390×844 mobile screenshots show readable inputs, quantities, formula trace, NO_RATE null-cost state and boundary labels; no horizontal overflow, synthetic-rate panel, company-rate UI or fake price output |
| Regression and security gates | PASS: **94 passed / 0 failed**; `npm ci`, check, build, audit and diff check passed; audit reported 0 vulnerabilities |
| Database/schema | PASS: stateless Phase 4A introduced no database schema; no migration was required or run |
| Private/company/supplier rates | NONE introduced |

The production verification record and screenshots are preserved in `docs/visual-review/phase4a-production-verification.md`, `production-estimate-desktop.png`, `production-estimate-mobile.png` and `phase4a-production-capture-metrics.json`. Existing public market outputs retain their established states and provenance; this certification does not reinterpret market references as engineering prices.

No production workflow, migration, bootstrap, daily/weekly job, backfill, mail, Gmail, schedule, secret or Neon operation was performed. The only remaining non-blocking operational notice is the existing owner-controlled `MAIL_CONFIGURATION_REQUIRED` health warning. Phase 4B remains a separate future scope for richer geometry, nesting/remnant, certified properties, process-time models, private-rate governance, quotations or ERP integration. The final documentation-only commit and annotated checkpoint tag are the certification handoff records; they do not alter the verified runtime behavior.

## Phase 4B — Private Cost Calibration & Process-Time Foundation V1

**Status: FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN — DO NOT IMPORT REAL PRIVATE DATA**

A new feature branch `feat/private-cost-calibration-foundation-v1` was created from the certified Phase 4A main checkpoint `73f1c5ef14266ed162ff8f2127859b877e69a385`. This phase is architecture-only plus deterministic synthetic verification. No real company rate, supplier quotation, private calibration profile, private backup or private access credential was requested, loaded, persisted, logged, committed or exposed.

The branch adds a strict internal private-profile contract, explicit process-time formulas for cutting, piercing, bending, welding and batch setup, a `CALIBRATION_REQUIRED`/`NO_MODEL` null path, a protected private-cost service boundary, safe profile metadata, redacted formula trace, explicit authorization scope `engineering:private-cost` and required audit logger. The public Render/API path remains anonymous and `NO_RATE` only; `PRIVATE_CALIBRATED` is rejected with structured HTTP 403, no private endpoint is registered, and the public schema/UI contain no raw rate values or private-rate input.

The storage and authorization audit recommends a local/private runtime for first real calibration and a separate authenticated internal service or private database only for later multi-user operation. Environment secrets on the existing public Render runtime are not recommended as the first real-data store. The audit is recorded in `docs/phase4b-storage-authorization-audit.md`, with OWASP and GitHub references in `docs/phase4b-security-research-notes.md`.

Process-time and protected cost tests use only values marked `SYNTHETIC / DEMO / TEST ONLY`. The deterministic formula suite covers explicit speed/time units, setup/run/pierce separation, batch burden, disabled processes, surface-treatment `NO_MODEL`, strict lifecycle/version validation, safe metadata, raw-rate non-return, authorization/scope/audit requirements, public API denial, public schema/UI leakage and market-reference isolation. The final local suite passed **105 tests with 0 failures**; required check, build, audit and diff gates passed with 0 vulnerabilities.

Local UI artifacts are `docs/visual-review/phase4b-estimate-desktop.png`, `phase4b-estimate-mobile.png`, `phase4b-capture-metrics.json` and `phase4b-visual-findings.md`. At 1440px and 390×844, the public page displayed physical/workload quantities, `NO_RATE`, calibration-required process time, no private-rate input and no horizontal overflow.

No migration, database schema change, workflow, deployment, Render configuration change, schedule, bootstrap, daily/weekly job, backfill, mail, Gmail, secret, Neon or real private-data operation was performed. The implementation must not be promoted or used with real private rates until the storage boundary, identity provider, authorization scopes, encryption/key management, backup/restore, lifecycle approval, audit trail, leakage scan and independent calibration review are separately certified. Phase 4B remains stopped before real private-data import.

## Phase 4C — Local Private Calibration Runtime & Real-Data Intake Readiness V1

**Status: FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN — DO NOT IMPORT REAL PRIVATE DATA**

Phase 4C is implemented on `feat/local-private-calibration-runtime-v1`, based on the Phase 4B approved checkpoint `0e4a84bff00c8846888e45906a2682986c6df16c` and certified Phase 4A main checkpoint `73f1c5ef14266ed162ff8f2127859b877e69a385`. This phase provides a fail-closed local private runtime and data-intake readiness foundation only. No real company rate, supplier quotation, private profile, private backup or private credential was requested, loaded, persisted, logged, committed or exposed.

| Handoff item | Phase 4C result |
|---|---|
| Runtime entrypoint | `npm run private:estimate` → `private-runtime.js`; public `npm start` remains `server.js` only |
| Enable/binding | Requires `PRIVATE_RUNTIME_ENABLED=1`; binds only `127.0.0.1`; non-loopback host is rejected |
| Profile loading | `PRIVATE_RATE_PROFILE_PATH` must be an absolute repository-external file; canonical path and parent symlink checks are enforced |
| Profile lifecycle | Strict `PRIVATE_CALIBRATED` contract; `ACTIVE`, `APPROVED` metadata and valid effective-date window required; invalid/missing/expired/future profiles fail closed |
| Private UI/API | Local `/private-estimate` and `POST /api/private/estimate`; session cookie and protected scope; request body cannot provide a profile |
| Private output | Physical/workload, process time and internal cost may be returned only by the local/private path; profile response is safe metadata only and raw calibration values are never returned |
| Audit | Repository-external JSONL, mode `0600`, exactly timestamp, authorized local identity, profile ID/version, process family, estimate ID and result status |
| Public separation | Public `server.js`, public assets, navigation, Render API and market APIs do not register or call the private runtime; public `PRIVATE_CALIBRATED` remains denied |
| Repository guard | Common private profile, calibration worksheet and audit filenames are ignored; tracked example template contains placeholders only |
| Intake worksheet | `docs/PRIVATE_CALIBRATION_INTAKE_WORKSHEET.md`; value-free governance template for future separate approval |
| Security research/audit | `docs/phase4b-security-research-notes.md`, `docs/phase4b-storage-authorization-audit.md` and `docs/LOCAL_PRIVATE_CALIBRATION_RUNTIME.md` |
| Leakage tests | Synthetic sentinel absent from private UI/result/error/audit/public assets/schema/status; no raw rate literal in public surface |
| Deterministic suite | PASS: **111 passed / 0 failed** |
| Final gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; audit 0 vulnerabilities |
| Local visual review | PASS: 1440×1000 desktop and 390×844 mobile; private result, safe metadata, redacted trace, no rate input and no horizontal overflow |
| Visual artifacts | `docs/visual-review/phase4c-private-estimate-desktop.png`, `phase4c-private-estimate-mobile.png`, `phase4c-capture-metrics.json`, `phase4c-private-ui-observations.md` |
| Production operations | NONE: no Render deployment, main promotion, migration, workflow, schedule, bootstrap, daily/weekly, backfill, mail, Gmail, secret, Neon or real-data operation |

The local synthetic smoke returned 2.355 kg/part, 235.5 kg total material, 313 process minutes, 3,566 `TEST_UNITS` total internal cost and 35.66 `TEST_UNITS`/part. These are test-only fixture outputs and are not company calibration, supplier pricing, market data or a quotation. The private runtime was stopped and its repo-external synthetic profile, audit file, PID and temporary health artifacts were removed after review.

Before any real profile is used, a separate approval must select the deployment boundary, authenticate the operator, enforce least privilege, provide encryption/key management, backup/restore, rotation/revocation, redacted logging, access audit and independent certification. The present public Render service remains permanently outside the private profile trust boundary. Phase 4C stops before real-data intake.

## Phase 4D — Internal Engineering Cost Calibration Pilot V1

**Status: FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN — DO NOT IMPORT REAL PRIVATE DATA**

Phase 4D is implemented on `feat/internal-engineering-cost-calibration-pilot-v1`, based on Phase 4C approved SHA `2d1afa0836688c443202933a7913e52b7e589fab`; certified public main remains `73f1c5ef14266ed162ff8f2127859b877e69a385`. The feature prepares one controlled, local-only pilot workflow for **內部工程成本估算**. It does not create a quotation document, customer selling price or public market/supplier price.

| Handoff item | Phase 4D result |
|---|---|
| Local runtime | Reuses `npm run private:estimate`; enabled only with `PRIVATE_RUNTIME_ENABLED=1`, loopback-only `127.0.0.1` |
| Pilot source | `PRIVATE_CALIBRATION_PILOT_PATH`; strict JSON from an absolute repository-external path; request body cannot submit pilot data |
| Pilot scope | One controlled `SINGLE_CONTROLLED_PILOT`; explicit part/material/workload fields and optional historical total/per-part/component reference |
| Comparison route | Local session-protected `POST /api/private/calibration-pilot`; no corresponding public `server.js` route |
| Historical comparison | `KNOWN_COMPONENT_REFERENCE`, `TOTAL_ONLY_REFERENCE` or `NO_HISTORICAL_REFERENCE`; explicit total/per-part difference and variance percentage; zero/missing denominator returns `null` |
| Observation modes | Explicit `RATE_BASED` and `OBSERVED_TIME`; conflicting speed/run input is rejected unless `authoritativeObservation` is supplied |
| Quality | `NOT_EVALUATED`, `CLOSE_MATCH`, `MODERATE_VARIANCE` or `LARGE_VARIANCE`; thresholds are configurable local synthetic defaults, not business acceptance limits |
| Diagnostics | Engineering review categories for material, cutting, piercing, bending, welding, setup, missing calibration and insufficient reference; no automatic tuning |
| Profile protection | Adjustment candidates are `PROPOSED_ONLY`; proposed values are `PROFILE_VALUE_NOT_RETURNED`; no profile write-back endpoint |
| History | Optional repository-external append-only JSONL, mode `0600`, exactly seven safe fields; raw rates, historical actual values and full pilot payload are excluded |
| UI | Private page shows engineering quantities, time observations, internal engineering cost estimate, historical comparison, variance, diagnostics, profile version and redacted formulas; no raw-rate or pilot-data input |
| Public isolation | Public `/estimate` remains `NO_RATE`; anonymous `PRIVATE_CALIBRATED` remains denied; public assets/schema/status and market APIs receive no private pilot or historical output; market `engineeringEstimate=null` semantics remain unchanged |
| Repository guard | `.gitignore` covers private pilot and history filenames; no real profile/pilot/history artifact is tracked |
| Documentation | `docs/INTERNAL_ENGINEERING_COST_CALIBRATION_PILOT.md`, `docs/PRIVATE_CALIBRATION_INTAKE_WORKSHEET.md` and visual review artifacts |
| Deterministic suite | PASS: **118 passed / 0 failed** |
| Visual review | PASS: synthetic desktop `1440×1000` and mobile `390×844`; no horizontal overflow, pilot comparison and proposed-only output visible, raw-rate input absent, sentinel absent |
| Production operations | NONE: no real data import, Render deployment, main promotion, Neon, Gmail, schedule, secret, workflow, bootstrap, daily/weekly, backfill or mail operation |

The synthetic local visual fixture produced 2.355 kg/part, 235.5 kg total material, 313 process minutes, 3,566 `TEST_UNITS` total internal cost and a 250 `TEST_UNITS` historical reference, resulting in a 1,326.4% synthetic variance. These are DEMO/TEST ONLY outputs and must never be interpreted as company, supplier, market or customer values. Visual artifacts are `docs/visual-review/phase4d-private-pilot-desktop.png`, `phase4d-private-pilot-mobile.png`, `phase4d-capture-metrics.json` and `phase4d-private-ui-observations.md`.

No real historical case was requested or loaded. Before a first real pilot, a separate approval must establish authenticated operator identity, least-privilege authorization, deployment boundary, encryption/key management, private backup/restore, profile lifecycle and revocation, retention/deletion, access audit, leakage scanning, reconciliation and independent certification. The branch stops before real-data intake and before main promotion.

## Phase 4BCD — Private Cost Foundation Production Certification

**PHASE_4BCD_PRIVATE_COST_FOUNDATION_PRODUCTION_PASS**

The approved chained foundation head `03ca44e2a22dbcb7177e258fc1e2a67e0958a70f` was promoted from authoritative main `73f1c5ef14266ed162ff8f2127859b877e69a385` by pure fast-forward. The promotion contained only code, deterministic tests, documentation and synthetic visual artifacts. No real company, supplier, customer or private calibration data was imported, committed, logged, backed up or exposed. No force push or history rewrite was used.

| Certification item | Result |
|---|---|
| Promotion SHA | `03ca44e2a22dbcb7177e258fc1e2a67e0958a70f` |
| Final main before documentation checkpoint | `03ca44e2a22dbcb7177e258fc1e2a67e0958a70f` |
| Feature lineage | Phase 4B `0e4a84bff00c8846888e45906a2682986c6df16c` → Phase 4C `2d1afa0836688c443202933a7913e52b7e589fab` → Phase 4D `03ca44e2a22dbcb7177e258fc1e2a67e0958a70f` |
| Final regression | **118 passed / 0 failed** |
| Final gates | `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check` PASS; 0 vulnerabilities |
| Existing Render service | PASS: deployed normally from main and served public pages |
| Public pages | PASS: `/`, `/machining`, `/sheet-metal`, `/estimate` HTTP 200 |
| Public health | PASS: `/health` and `/health/weekly` HTTP 200 with top-level `status=OK`; existing `MAIL_CONFIGURATION_REQUIRED` and readiness reporting were not modified or triggered |
| Private public routes | PASS: `GET /private-estimate` HTTP 404; `POST /api/private/estimate` and `POST /api/private/calibration-pilot` HTTP 405 method-gate responses; no private runtime content returned |
| Public engineering schema | PASS: production allowed mode is `NO_RATE` only |
| Public NO_RATE | PASS: HTTP 200; monetary fields including total and per-part cost are `null` |
| Public PRIVATE_CALIBRATED | PASS: HTTP 403 with `PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API` |
| Public SYNTHETIC_TEST | PASS: HTTP 400 with `SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION` |
| Market isolation | PASS: machining and sheet-metal market APIs HTTP 200; `engineeringEstimate=null`; no private-cost result or market multiplier entered either response |
| Public visual review | PASS: desktop `1440×1000` and mobile `390×844` captures for home, machining, sheet-metal and estimate; no horizontal overflow, no pilot button, no private profile metadata, public estimate remains NO_RATE |
| Private runtime | Remains separate `npm run private:estimate`, disabled by default and localhost-only `127.0.0.1`; no private configuration was added to Render |
| Repository leakage precheck | PASS: no tracked real profile/pilot/history/audit payload; `.gitignore` protects private profiles, pilots, histories, audits and worksheets; tracked examples are synthetic/placeholders only |
| Production operations | NONE beyond the authorized pure fast-forward main push and read-only Render verification; no real-data import, secret, Neon, Gmail, schedule, workflow, migration, bootstrap, daily/weekly, backfill or mail operation |

The existing Render health payload continues to report its owner-controlled operational state, including `WEB_READY`, `DATABASE_READY`, `WEEKLY_REPORT_READY`, `MAIL_CONFIGURATION_REQUIRED`, `DAILY_DATA_NOT_READY` and prior job/test history. The Phase 4BCD promotion did not trigger or modify those jobs, mail records, schedules or configuration.

The code foundation is now promoted, but **no real calibration has occurred**. The private runtime remains disabled by default and is not exposed through public Render. The first real pilot remains a separate local/private operation requiring authenticated operator identity, least privilege, encryption/key management, private backup/restore, lifecycle and revocation, access audit, leakage scanning, reconciliation, retention/deletion controls and independent certification. This certification does not authorize real private-data import or customer/supplier quotation behavior.

Production visual artifacts are under `docs/visual-review/phase4abcd-production-*.png`, with metrics in `docs/visual-review/phase4abcd-production-visual-metrics.json` and read-only deployment observations in `docs/visual-review/phase4abcd-render-deployment-observations.md`.

## Phase 4E — First Real Calibration Operator Readiness V1 production certification

**PHASE_4E_FIRST_REAL_CALIBRATION_OPERATOR_READINESS_PRODUCTION_PASS**

The approved Phase 4E feature head `7eb416dbf85685231f2eecda6574405f4817fc05` was promoted from authoritative main `c846c2837f0666334d26e464a0e0552dcf91c8ff` by pure fast-forward. No force push or history rewrite was used. This promotion covers code, runbook and operator tooling only. No real company/private data was requested, created, imported, filled, loaded, persisted, committed, logged, backed up or exposed; no real private directory, real profile, real pilot or first real pilot execution occurred.

| Certification item | Result |
|---|---|
| Promotion SHA | `7eb416dbf85685231f2eecda6574405f4817fc05` |
| Feature lineage | Phase 4C approved `2d1afa0836688c443202933a7913e52b7e589fab` → Phase 4D `03ca44e2a22dbcb7177e258fc1e2a67e0958a70f` → Phase 4E `7eb416dbf85685231f2eecda6574405f4817fc05` |
| Full deterministic suite | PASS: **126 passed / 0 failed** |
| Final gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check`; audit reported 0 vulnerabilities |
| Operator commands | `private:init`, `private:validate`, `private:estimate`, `private:leak-check` present and syntax-covered |
| Directory safety | `private:init` refuses relative, repository-contained and symlink-contained destinations; external directories use `0700`, files use `0600`, and existing regular templates are not overwritten |
| Empty templates | Profile and pilot skeletons contain field names only; all real-value fields start `null`; no synthetic rates are inserted |
| Safe validation | `private:validate` checks enable flag, external paths, profile lifecycle/approval/effective dates, pilot schema, local identity, loopback boundary and public leakage; output is status-only and excludes paths, rates, historical cost and payloads |
| Post-run leak check | PASS in deterministic suite and synthetic smoke: no tracked private payload, no sensitive untracked repository file, public assets/documents safe, public API unchanged; output contains safe status only |
| Localhost boundary | `private:estimate` remains disabled by default and bind-only `127.0.0.1`; no private runtime is registered by public `server.js` |
| Existing private runtime/pilot regression | PASS: Phase 4C/4D behavior remains covered by the 126-test suite; no automatic profile write-back exists |
| Existing Render service | PASS: normal deployment from main and read-only public regression completed; no new Render service created |
| Public pages | PASS: `/`, `/machining`, `/sheet-metal`, `/estimate` HTTP 200 |
| Public health | PASS: `/health` and `/health/weekly` HTTP 200 with top-level `status=OK`; existing owner-controlled operational notices were not modified or triggered |
| Private public routes | PASS: `/private-estimate`, `/api/private/estimate` and `/api/private/calibration-pilot` do not expose private runtime content |
| Public engineering | PASS: production schema/runtime allow `NO_RATE` only; `NO_RATE` returns monetary fields `null`; `PRIVATE_CALIBRATED` is rejected; `SYNTHETIC_TEST` is rejected |
| Market isolation | PASS: machining and sheet-metal public references retain `engineeringEstimate=null` |
| Production configuration | PASS: Render continues `npm start → server.js`; no private environment variables or private paths were added to Render |

The existing Render service `https://raw-material-market-dashboard-1.onrender.com` served the promoted public pages. Read-only verification confirmed canonical legacy redirects where applicable, public-only navigation and wording, public `/estimate` NO_RATE behavior, no private operator content, and no private marker/raw-rate leakage. The public market pages may truthfully show existing `API_ERROR`, `NO_DATA` or readiness states; these are not private calibration failures and no fabricated value was inserted.

The next action is **manual local operator execution of the first real pilot**, not another coding phase. That future operation requires the operator to choose a repository-external private directory, complete the value-empty templates locally, validate with `npm run private:validate`, run exactly one controlled pilot only after all statuses pass, stop the runtime, preserve only protected external audit/history and run `npm run private:leak-check`. This certification does not itself authorize or execute that real pilot.

No Render/private cloud upload, Neon change, Gmail change, schedule change, secret change, workflow dispatch, migration, bootstrap, daily/weekly job, backfill or mail send was performed. Public Render remains outside the private trust boundary. Read-only browser observations are recorded in `docs/visual-review/phase4e-promotion-browser-observations.md`.

## Phase 4F — Standalone public exposure remediation

**PHASE_4F_STANDALONE_PUBLIC_EXPOSURE_REMEDIATION_PASS — FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN**

A narrow remediation was applied on `feat/standalone-offline-public-exposure-remediation-v1`, based on the approved Phase 4F calculator head `6f13df19066b9fdd6c0d2427def7de094317afe1`. The public `server.js` generic static fallback now rejects the decoded `/standalone` namespace before legacy redirects, static-path resolution or root file serving. `/standalone`, `/standalone/`, `/standalone/InternalEngineeringCostCalculator.html`, arbitrary descendants and encoded equivalents return HTTP 404 with security headers, `cache-control: no-store` and body `Not found`; no public redirect or alternate route is provided.

| Handoff item | Result |
|---|---|
| Remediation branch | `feat/standalone-offline-public-exposure-remediation-v1` |
| Base | Approved Phase 4F SHA `6f13df19066b9fdd6c0d2427def7de094317afe1` |
| Standalone repository artifact | Retained at `standalone/InternalEngineeringCostCalculator.html`; valid for direct local `file://` opening |
| Public namespace | PASS: `/standalone`, `/standalone/`, `/standalone/InternalEngineeringCostCalculator.html` and `/standalone/test.html` return HTTP 404 `Not found` |
| Public page regression | PASS: `/`, `/machining`, `/sheet-metal`, `/estimate` remain HTTP 200 |
| Public asset regression | PASS: `/styles.css`, `/app.js`, `/nav.js`, `/machining.js`, `/sheet-metal.js`, `/estimate.js` remain HTTP 200 |
| Navigation | PASS: no public navigation link points to standalone calculator |
| Offline/network/persistence regression | PASS: existing standalone self-contained/no-network/no-persistence tests retained |
| Deterministic tests | PASS: full suite and new public-exposure assertions pass; no standalone content returned by public route |
| Company/private data | NONE: no company values, real rates, private profile, pilot or operator workflow used |
| Main | NOT PROMOTED; authoritative main remains `479774bb362881928587573ebb577d169fa35e02` |
| Production | NONE: no deploy, Render change, Neon, Gmail, schedules, secrets, migration, workflow, private runtime or job operation |

The remediation intentionally does not redesign the calculator, change its formulas or UI, add authentication, remove the repository artifact, expose another route or modify Render configuration. It is a required pre-promotion safety fix. A separate explicit approval is required before any main promotion; the first real pilot remains outside this remediation and is not authorized by this pass.

## Phase 4F — Standalone Offline Internal Engineering Cost Calculator V1 production certification

**PHASE_4F_STANDALONE_OFFLINE_INTERNAL_COST_CALCULATOR_PRODUCTION_BOUNDARY_PASS**

The approved remediation head `324937a10ef6d81dd22508ba8fc45e32bf1d0b0a` was promoted from authoritative main `479774bb362881928587573ebb577d169fa35e02` to `main` by pure fast-forward. This promotion includes the standalone offline calculator and the public static-serving remediation. The annotated checkpoint tag `standalone-offline-internal-engineering-cost-calculator-v1` is created after the final verified documentation checkpoint.

| Handoff item | Result |
|---|---|
| Final code promotion | `324937a10ef6d81dd22508ba8fc45e32bf1d0b0a`; no force push or history rewrite |
| Final main | Documentation checkpoint after the read-only certification update; pushed to `origin/main` |
| Standalone artifact | `standalone/InternalEngineeringCostCalculator.html` remains a single self-contained `file://` artifact |
| Public namespace deny | `/standalone`, `/standalone/`, calculator path, arbitrary child path and URL-encoded equivalent return HTTP 404 `Not found`; no redirect or alternate alias |
| Public website | `/`, `/machining`, `/sheet-metal`, `/estimate` remain HTTP 200; existing JS/CSS assets remain HTTP 200 |
| Public navigation | No standalone/offline calculator link or calculator marker |
| Public engineering | Production schema remains `NO_RATE` only; NO_RATE monetary fields remain null; `PRIVATE_CALIBRATED` and `SYNTHETIC_TEST` remain rejected |
| Market isolation | Machining and sheet-metal public references retain `engineeringEstimate=null` |
| Health | `/health` and `/health/weekly` return HTTP 200 with `status=OK` |
| Full regression | **137 passed / 0 failed**; audit reported 0 vulnerabilities |
| Offline behavior | Direct `file://` calculation, clear/reset, formula detail, print-summary and responsive behavior verified with synthetic `TEST_ONLY` inputs; no non-file requests or persistence |
| Company/private data | NONE: no company value, real rate, private profile, pilot or operator workflow was entered or used |
| Production operations | No Render configuration, Neon, Gmail, schedule, secret, workflow, migration, bootstrap, daily/weekly, backfill or mail operation was performed |

The existing Render service `raw-material-market-dashboard-1.onrender.com` deployed normally from `main` and passed read-only certification. The standalone artifact is intentionally not a public Render page. The next action is controlled human distribution/use of the offline HTML, not another automatic development phase; this certification does not enter company values or authorize a real pilot.


## Phase 4F follow-up — Public `/estimate` browser-local internal engineering cost workspace

**Status: FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN — DO NOT ENTER REAL COMPANY DATA**

The approved standalone calculator remains the certified repository-controlled `file://` artifact and the public `/standalone` namespace remains fail-closed with HTTP 404. This follow-up is implemented only on `feat/estimate-browser-local-internal-cost-v1`, created from the current certified main checkpoint `b4666ae5c840e29a23cb747e54eac22d5adb1c76`. It makes the existing public `/estimate` page the primary operator UX without creating another calculator product, changing Render architecture or exposing the standalone artifact.

| Handoff item | Result |
|---|---|
| Primary page | `/estimate` is a complete Traditional-Chinese `內部工程成本估算` workspace; `/estimate/` remains the existing route alias |
| Input sections | 零件基本資料、材料成本、雷射切割／切割、折彎、焊接、表面處理、工程／其他準備、結果、成本拆解與公式明細 |
| Formula source | `local-cost-calculator.js` is a pure CommonJS/browser module extracted from the certified Phase 4F formula core; deterministic JSON-normalized comparison matches the standalone calculator on the full synthetic fixture |
| Manual internal costs | Material, cutting, bending, welding, surface-treatment, setup and other fixed-cost values are read and calculated only in the current browser document |
| Server/API boundary | `estimate.js` never calls `POST /api/engineering/estimate`; no fetch, XHR, WebSocket, sendBeacon, form action, background sync, storage or cookie path exists for entered values |
| Privacy lifecycle | `pageshow` and `清除全部` reset in-memory inputs/results; invalid populated values fail closed with Traditional-Chinese validation and no result; blank enabled component data remains `資料不足`/null rather than guessed |
| Market separation | Public market references remain informational only; no market pressure, score or multiplier populates an internal rate or enters the formula |
| Public API contract | Existing production `/api/engineering/estimate` remains `NO_RATE` only; `PRIVATE_CALIBRATED` and `SYNTHETIC_TEST` behavior is unchanged; machining and sheet-metal `engineeringEstimate=null` behavior remains covered |
| Standalone protection | `standalone/InternalEngineeringCostCalculator.html` remains a local file artifact; `/standalone` and all descendants remain HTTP 404 and no navigation link is added |
| Targeted regression | PASS: syntax checks plus estimate browser-local, standalone and engineering suites: **29 passed / 0 failed** |
| Browser smoke | Synthetic `TEST_ONLY` fixture reached `3,964.75` total and `39.6475` per part; post-click network calls `[]`; cookie, localStorage and sessionStorage were empty; clear removed result content; invalid input stayed fail-closed; pageshow cleared in-memory values |
| Visual review | PASS: `artifacts/phase4f-estimate-browser-local/estimate-desktop-1440x1000.png` and `estimate-mobile-390x844.png`; mobile navigation/tags wrap without visible horizontal overflow |
| Production operations | NONE: no Render deployment, main promotion, private runtime, real company value, real rate, Neon, Gmail, schedule, secret, migration, workflow, bootstrap, job, telemetry or API data operation |

This follow-up stops before main promotion and before any real company-data entry. The feature branch must receive separate review and approval before any promotion; a future production check must verify that the existing public `/standalone` 404, public API `NO_RATE` boundary and market-reference isolation remain intact.


### Final feature-branch delivery checkpoint

The completed feature head is `29fe7df546301b76777b431d4ce72e4502db44bf` and was pushed to `origin/feat/estimate-browser-local-internal-cost-v1`. Final gates passed on the completed worktree: `npm ci`, `npm run check`, `npm test` (**143 passed / 0 failed**), `npm run build`, `npm audit --omit=dev` (**0 vulnerabilities**) and `git diff --check`. The visual artifacts and review note are committed under `artifacts/phase4f-estimate-browser-local/`.

`main` and `origin/main` both remain `b4666ae5c840e29a23cb747e54eac22d5adb1c76`; this follow-up was not promoted. No Render deployment, real company-data entry, private runtime execution, API submission, database, mail, schedule, secret, workflow or telemetry operation was performed.


## Phase 4F follow-up refinement — Formal blank operator page and fail-closed basic inputs

**Status: FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN — DO NOT ENTER REAL COMPANY DATA**

A narrow refinement was applied on `feat/estimate-browser-local-internal-cost-v1` after the browser-local workspace handoff. The pure local calculator now validates `thicknessMm`, `lengthMm` and `widthMm` as required positive numbers, and `quantity` and `batchCount` as required positive integers. Null and blank-string values fail closed with field-specific `不可留白。` errors; zero and non-integer values remain rejected.

The public `/estimate` formal operator page no longer carries operational numeric defaults or enabled process defaults. The only retained input default is the standard carbon-steel density `7850 kg/m³`; dimensions, quantity, batch count, process quantities and all process switches are blank/unchecked. Standard material density constants remain documented engineering defaults, not company data.

| Refinement item | Result |
|---|---|
| Basic validation | PASS: thickness/length/width required + positive; quantity/batch required + positive + integer |
| Null/blank coverage | PASS: deterministic tests cover `null` and `""` for all five basic required fields |
| Operational defaults | PASS: HTML input scan finds only `densityKgM3=7850`; all process checkboxes are unchecked |
| Blank formal smoke | PASS: blank submit shows required-field validation, no result, zero additional network calls, empty cookie/storage |
| Visual recapture | PASS: `artifacts/phase4f-estimate-browser-local/estimate-blank-desktop-1440x1000.png` and `estimate-blank-mobile-390x844.png` |
| Full gates | PASS: `npm ci`, `npm run check`, `npm test` (**145 passed / 0 failed**), `npm run build`, `npm audit --omit=dev` (**0 vulnerabilities**), `git diff --check` |
| Main boundary | Main promotion intentionally not performed; no Render, Neon, Gmail, schedules, secrets, workflows, private runtime or real company-data operation |

The refinement keeps the certified standalone artifact, public API `NO_RATE` boundary, market isolation and `/standalone` 404 protection unchanged. It remains stopped before main promotion.


## PHASE_4F_ESTIMATE_BROWSER_LOCAL_PRODUCTION_PASS

**Status: PRODUCTION CERTIFIED — FINAL — STOP**

The approved Phase 4F browser-local Internal Engineering Cost workspace is now integrated into the existing public application. `/estimate` is the primary operator workspace for `內部工程成本估算`; internal cost entries are calculated only inside the current browser document and no entered internal value is sent to the server/API, Render logs, Neon, Gmail, analytics/telemetry, or browser persistence. The formal production page starts blank except for the documented standard carbon-steel density engineering default `7850 kg/m³`; all operational numeric inputs are blank and all five process switches are unchecked.

The approved head `2b38c6830a56eb53ec7e369fd107715aa4e78a05` was promoted to `main` by pure fast-forward and pushed. During read-only production certification, an encoded leading-slash `/standalone` bypass was detected before final certification. The narrow safety fix `fca2755e35852b37dbcb04335ed6676d27aa3000` canonicalizes leading decoded slashes before the existing namespace guard and adds deterministic regression coverage. This hotfix was also pushed to `main` by fast-forward only. Final `main` and `origin/main` are both `fca2755e35852b37dbcb04335ed6676d27aa3000`.

| Certification item | Result |
|---|---|
| Pre-promotion lineage/gates | PASS: approved head was 3 commits ahead, 0 behind, merge-base was current main; `npm ci`, `npm run check`, `npm test` (**145 passed / 0 failed**), `npm run build`, `npm audit --omit=dev` (**0 vulnerabilities**) and `git diff --check` passed |
| Existing Render service | PASS: `raw-material-market-dashboard-1.onrender.com` deployed normally from main; no new service or environment/config change |
| Production `/estimate` | PASS: `/estimate` and `/estimate/` HTTP 200; all required operator sections present; formal blank state verified |
| Production browser smoke | PASS: blank submit showed required validation with no result and no additional request; `TEST_ONLY` fixture produced total `3,964.75` and per-part `39.6475`; pageshow cleared entered values/results |
| Browser privacy | PASS: production browser smoke observed no fetch/XHR/sendBeacon calls, no resource delta from calculation, empty cookie/localStorage/sessionStorage |
| Public engineering API | PASS: schema advertises `NO_RATE` only; production `NO_RATE` POST returned HTTP 200 with monetary and market-adjustment fields null; `PRIVATE_CALIBRATED` returned 403 and `SYNTHETIC_TEST` returned 400 |
| Market isolation | PASS: production machining and sheet-metal references returned `engineeringEstimate: null`; public market references remained informational |
| Standalone namespace | PASS: `/standalone`, `/standalone/`, artifact/test descendants, double-slash and encoded equivalents all returned HTTP 404 `Not found` with no calculator/HTML content and no redirect |
| Production visual certification | PASS: actual deployed blank page reviewed at `1440×1000` and `390×844`; density default clearly identified, process switches unchecked, result panel empty, mobile layout stacked, navigation usable, no visible horizontal overflow |
| Real data boundary | PASS: no real company data, real rate, private runtime, database, mail, schedule, secret, workflow, migration, bootstrap, backfill or telemetry operation |

The final production checkpoint is complete. No real-data pilot is authorized by this record, and no further phase should be started automatically.


## Phase 4F — Public production data-integrity audit & process monetary references

**FEATURE_BRANCH_READY_FOR_REVIEW — STOP BEFORE FINAL MAIN PROMOTION**

本次完整稽核與 remediation 位於 `feat/production-data-integrity-public-process-reference-v1`，從 authoritative main `096005640b08fc31c340a38d41c0f2c41655757d` 建立；implementation checkpoint 為 `7d8f321eb9100ca27446737c1a588a4d4433b1d6`。`main` 未被修改，沒有部署、production read/write、migration、bootstrap、daily/weekly、mail、Gmail、Neon、schedule、secret 或 workflow dispatch。

| Handoff item | Result |
|---|---|
| Full public data path | Audited from Yahoo/Stooq/FX → market service/cache/seed → `/api/market`/dashboard → daily snapshots/Postgres → weekly analytics/quality/mail boundaries → machining/sheet-metal |
| P0 freshness | PASS: production seed fallback disabled; direct Yahoo/Stooq/FX observations use actual `lastTradeAt`; old direct observations become `EXPIRED` rather than `OK`; `generatedAt`, `servedAt`, `dataAsOf`, observation date and collection time remain separate |
| Durable fallback | PASS: production Postgres public snapshot read path is `READ_FALLBACK`, preserves observation identity, never becomes `LIVE`, expires by observation age and exposes no credentials |
| Weekly/dashboard | PASS: current observation freshness is explicit; old/expired data blocks clean weekly delivery; dashboard counts `OK/FALLBACK`, `STALE`, `EXPIRED`, API/no-data separately and excludes ineligible rows from top gain/loss |
| Public monetary contract | PASS: `publicPriceReferences` is validated, source-linked and separated by pricing basis; CNC `TWD/hr` and PRO360 `TWD/min` are never hidden-averaged; `engineeringEstimate=null` remains intact |
| Open-ended CNC references | PASS: TaiwanCNC 5-axis is represented as `priceMin=2000`, `priceMax=null`, `priceOpenEnded=true`; turn-mill is `1800+`; UI renders `NT$ 2,000+ / hr` and `NT$ 1,800+ / hr`, not false caps |
| Sheet-metal references | PASS: MINCA/Zhongkai laser rows preserve material, thickness, per-meter and small-hole semantics; bending, TIG, MIG/CO2 and spot welding remain explicit `NO_PUBLIC_PRICE_DATA` |
| Money-first UI | PASS: `/machining` and `/sheet-metal` DOM/visual order is public monetary panel → summary → `成本趨勢輔助`; pressure remains secondary and never fills `/estimate` |
| Local visual review | PASS: sandbox-only desktop `1440×1000` and mobile `390×844` captures for both pages; navigation, public price cards, NO_PUBLIC_PRICE_DATA and no visible horizontal overflow reviewed |
| Deterministic regression | PASS: **160 passed / 0 failed** |
| Required gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev` with **0 vulnerabilities**, and `git diff --check` |
| Production boundary | PASS: no real company/private data, supplier/customer quote, private rate, production variable/secret, schedule, workflow, database mutation, mail or deployment operation |
| Main | **UNCHANGED** at `096005640b08fc31c340a38d41c0f2c41655757d`; no promotion authorized by this checkpoint |

Public source acceptance and limitations are documented in `docs/FULL_PRODUCTION_DATA_INTEGRITY_AUDIT.md` and `docs/PUBLIC_PROCESS_COST_REFERENCE_CONTRACT.md`. Visual evidence is committed under `artifacts/phase4f-pasted13-public-process-reference/`. A later promotion, if separately approved, must independently rerun the complete gates and verify branch lineage; this handoff intentionally stops before main promotion.


## Phase 4G — Narrow pre-promotion remediation after independent review

**FEATURE_BRANCH_READY_FOR_REVIEW — STOP BEFORE MAIN PROMOTION**

本次只針對第二次獨立 review 指出的五項 blocker 修正，未重新設計已完成的 public data-integrity／money-first architecture。修正位於既有 `feat/production-data-integrity-public-process-reference-v1`，承接前一 checkpoint `7a28ca1176f72137ddf5afcadcaa24eec91891d3`；implementation commit 為 `fff1a4ccb55fb4452ee2f1fd5957eac0049026e1`。

| Handoff item | Result |
|---|---|
| Stale candidate selection | PASS: `getStaleCache()` inspects memory/local/seed candidates, ranks original `dataAsOf`, chooses newest eligible STALE, and only falls back to newest EXPIRED when no eligible candidate exists |
| Daily execution vs readiness | PASS: daily job records `executionState=SUCCEEDED` separately from explicit freshness counts/readiness; all expired becomes `DAILY_DATA_STALE`, all NO_DATA becomes `DAILY_DATA_NOT_READY`, adequate fresh/fallback coverage becomes `DAILY_DATA_READY` |
| Currency provenance | PASS: `currencyEvidence=EXPLICIT` for TaiwanCNC/PRO360; `LOCALE_INFERRED` for MINCA/Zhongkai because checked pages do not explicitly state currency; no FX conversion or source-explicit `NT$` claim is made for inferred rows |
| Machining wording | PASS: footer now states that the page lists traceable public market/public price references and excludes internal machine rates, formal supplier quotes and company target prices |
| Sheet-metal wording | PASS: footer now states amounts come from traceable public price tables and do not represent supplier quotes, internal cost or target price |
| Open-ended cards | PASS: 5-axis and turn-mill render as valid monetary cards `NT$ 2,000+ / hr` and `NT$ 1,800+ / hr`, not no-data cards |
| UI review | PASS: recaptured desktop/mobile screenshots for both pages; money-first hierarchy, inferred-currency wording and no visible horizontal overflow reviewed |
| Deterministic regression | PASS: **168 passed / 0 failed**; targeted blocker suite passed **103 / 103** before final full suite |
| Required gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev` with **0 vulnerabilities**, `git diff --check` |
| Production boundary | NONE: no deploy, main promotion, schedule/secret/Neon/Gmail change, workflow dispatch, migration, bootstrap, mail or real company/private data |
| Main | **UNCHANGED** at `096005640b08fc31c340a38d41c0f2c41655757d` |

Visual artifacts are under `artifacts/phase4f-pasted13-public-process-reference/`, including `machining-phase4g-desktop-1440x1000.png`, `machining-phase4g-mobile-390x844.png`, `sheet-metal-phase4g-desktop-1440x1000.png`, `sheet-metal-phase4g-mobile-390x844.png` and `phase4g-currency-visual-review.md`. The external currency evidence audit is recorded in the public contract/audit documents and the source pages remain linked there. This checkpoint stops before main promotion.


## Production certification — public data integrity and process monetary references

**PRODUCTION_DATA_INTEGRITY_PUBLIC_PROCESS_MONETARY_REFERENCE_PASS**

The approved feature head `909cb2bf64fc060358b55730319017ed154b5dfb` was promoted from authoritative main `096005640b08fc31c340a38d41c0f2c41655757d` to `main` by pure fast-forward and pushed without force push, rebase or history rewrite. The existing Render service `https://raw-material-market-dashboard-1.onrender.com` was allowed to deploy normally. No second Render service was created and no Render environment, secret, schedule, Neon or Gmail configuration was changed.

| Certification item | Result |
|---|---|
| Final main code SHA before documentation checkpoint | `909cb2bf64fc060358b55730319017ed154b5dfb` |
| Pre-promotion lineage | PASS: feature was 4 ahead / 0 behind; merge-base was authoritative main |
| Final gates | PASS: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `git diff --check` |
| Regression count | PASS: **168 passed / 0 failed** |
| Dependency audit | PASS: **0 vulnerabilities** |
| Render deployment | PASS: existing service responded normally from main; no new service or configuration change |
| `/` and navigation | PASS: HTTP 200; shared navigation remained usable and weekly public summary loaded |
| `/api/market` | PASS: HTTP 200; `state=FALLBACK`, `acquisitionPath=READ_FALLBACK`, 14 rows |
| Market timestamps | PASS: `generatedAt=2026-08-23T01:54:08.760Z`; `servedAt=2026-08-24T08:33:56.398Z`; `dataAsOf=2026-08-21T00:00:00.000Z`; `latestMarketObservationAt=2026-08-21T00:00:00.000Z` |
| Market counts | PASS: `fresh=0`, `fallback=14`, `stale=0`, `expired=0`, `apiError=0`, `noData=0`; no May 2026 row was present |
| May bundled seed | PASS: the May 2026 bundled seed did not serve as current production market data; production rows retained August 21 observation identity and `READ_FALLBACK` provenance |
| Dashboard headlines | PASS: maximum gain/loss both remained `--` because fallback rows had no finite rankable change data; no stale/expired/old seed row became a headline |
| `/health` | PASS: HTTP 200, top-level `status=OK` |
| `/health/weekly` | PASS: HTTP 200, top-level `status=OK`, `WEB_READY`, `DATABASE_READY`, `storage.ready=true`, `WEEKLY_REPORT_READY`; legacy `DAILY_DATA_NOT_READY` is accepted until the next normal scheduled daily collection establishes the new freshness contract; `MAIL_CONFIGURATION_REQUIRED` remains owner-controlled |
| Weekly quality boundary | PASS by deployed code contract and 168-test regression: severely old STALE/EXPIRED blocks with `SEND_BLOCKED`, defensible STALE may use `SEND_WITH_WARNINGS`, adequate current coverage remains eligible; no weekly mail was resent |
| `/machining` | PASS: HTTP 200; public monetary references precede `成本趨勢輔助`; CNC 3-axis, 2-axis lathe, 5-axis `NT$ 2,000+ / hr`, turn-mill `NT$ 1,800+ / hr` and PRO360 `NT$ 80–120 / min` remain distinct pricing bases |
| `/api/machining/reference` | PASS: HTTP 200; 5 references, `engineeringEstimate=null`, no hidden hourly/minute average |
| `/sheet-metal` | PASS: HTTP 200; laser public price cards precede pressure; locale-inferred rows display `網站列示：… / m` and source-not-explicit currency wording without source-explicit `NT$` or FX conversion |
| `/api/sheet-metal/reference` | PASS: HTTP 200; 60 public price records, including 56 direct laser records and 4 `NO_PUBLIC_PRICE_DATA` records for bending/TIG/MIG-CO2/spot welding |
| Existing boundaries | PASS: `/estimate` remains browser-local; production engineering schema is `NO_RATE` only; both process references retain `engineeringEstimate=null`; no public price auto-fills internal rates |
| `/standalone` | PASS: ordinary, trailing-slash, calculator path and encoded equivalents all returned HTTP 404 `Not found` |
| Canonical routes | PASS: `/machining/` and `/sheet-metal/` HTTP 200; `/machining.html` and `/sheet-metal.html` HTTP 308 to canonical routes |
| Production visual review | PASS: `/`, `/machining` and `/sheet-metal` reviewed at desktop `1440×1000` and mobile `390×844`; monetary panels are primary, pressure is secondary, currency evidence is readable, navigation remains usable and no visible horizontal overflow appeared |
| Data safety | PASS: no real company/private data, supplier/customer quote, private rate, production secret, schedule mutation, Neon/Gmail change or workflow dispatch was used |

The certification visual evidence is retained in the session under `/tmp/phase5-prod-cert/visual/`, with findings in `/tmp/phase5-prod-cert/homepage-browser-findings.md`, `/tmp/phase5-prod-cert/machining-browser-findings.md`, `/tmp/phase5-prod-cert/sheet-metal-browser-findings.md`, `/tmp/phase5-prod-cert/homepage-visual-findings.md`, `/tmp/phase5-prod-cert/machining-visual-findings.md` and `/tmp/phase5-prod-cert/sheet-metal-visual-findings.md`. This certification records the final verified production state and stops after the final main/tag push; it does not authorize manual workflow dispatch, mail resend, bootstrap, migration or schedule changes.
