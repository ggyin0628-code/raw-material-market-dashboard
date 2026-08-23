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
