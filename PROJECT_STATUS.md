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

## Phase 2B — Migration-only workflow readiness

Phase 2B code remains on `feat/machining-data-source-hardening-v1` and is not promoted to `main`. A dedicated `.github/workflows/market-db-migrate.yml` has been added for the new `machining_public_observations` schema: it is manual `workflow_dispatch` only, has no schedule, grants `contents: read`, uses the existing production Postgres environment contract, and runs only checkout, Node 20 setup, `npm ci`, `npm run check`, `npm test`, `npm run db:migrate`, and a `DATABASE_MIGRATED` result assertion. It cannot call bootstrap, daily, weekly, backfill, mail, Gmail, or any market data collection job. The workflow has not been executed in this task.

The existing deterministic migration test runs `migratePostgres` twice against the synthetic Postgres pool and passes both runs with the same statement count and `DATABASE_MIGRATED` state, confirming repeat-safe migration semantics. The full suite passed **70 tests / 0 failures** after the workflow contract test was added. The validated workflow implementation commit is `1aeee5fff08e8562ebef4af016cbb16d25740aaf`.
