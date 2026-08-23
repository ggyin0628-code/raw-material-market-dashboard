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

**狀態：FEATURE_BRANCH_READY_FOR_REVIEW**

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

本次僅完成本地驗證與功能分支更新，未部署、未修改 production schedules、Neon、Gmail、bootstrap、secrets 或 certified production paths，也未推進 main。
