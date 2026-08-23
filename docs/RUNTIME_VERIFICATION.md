# 執行期與驗證紀錄

本文件記錄 dashboard hardening、Weekly V1 與 Zero-Cost Runtime V1 的可重現驗證。所有 deterministic test 都 mock 外部 fetch／database；live smoke 則另行觀測目前配置的 PUBLIC MARKET DATA。兩者不可混為一談：前者證明程式契約與 failure handling，後者只代表觀測時間的外部來源可用性。

## 驗證命令

```bash
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
```

目前預期的 `npm test` 是 Node 內建 test runner 的 36 個 deterministic tests；`npm run check` 與 `npm run build` 都執行 Node syntax checks，保持 CommonJS 與最小工具鏈。`npm audit --omit=dev` 用來檢查 production dependency tree。

## 已完成的離線／API 測試範圍

| 區域 | 驗證內容 |
| --- | --- |
| Material contract | 14 材料都有 symbol、source、exchange、currency、合法 unit 與 numeric conversion factor。 |
| Price/unit | cents-to-USD、USD source unit、missing FX、非有限與字串 quote。 |
| Normalization | malformed Yahoo response、missing finite price、日期排序、duplicate date、invalid row。 |
| Retry | bounded integer、bounded retry 次數與 timeout failure。 |
| Signal/history | 即時與歷史訊號門檻、position、insufficient period、nearest-prior FX、month aggregation。 |
| Cache | fresh／stale row quality、legacy `LIVE` canonicalization、stale snapshot timestamp 與 failed-row policy。 |
| API boundary | `/health`、market／materials、history、兩種 export、invalid symbol／period、path-like input、malformed upstream、timeout。 |
| XLSX | ZIP signature、content type、六個工作表、公開資料 disclaimer、全部材料明細。 |

## Live public-data smoke

控制性 smoke 在 `2026-08-22T16:12:22.859Z` 至 `2026-08-22T16:14:49.865Z` 執行，涵蓋 14 materials、Yahoo quote／history、Stooq quote fallback、Jina history fallback 與 Yahoo／open.er-api FX fallback。

| 觀測項目 | 結果 |
| --- | ---: |
| materials | 14 |
| primary quote OK | 10 |
| quote fallback OK after primary failure | 0 |
| quote unavailable | 4 |
| historical OK | 14 |
| direct historical primary | 11 |
| Jina historical fallback | 3 |
| Yahoo FX primary | timeout／failed |
| open.er-api FX fallback | OK |

4 個 quote unavailable symbol 是 `ALI=F`、`HRC=F`、`TIO=F` 與 `GC=F`；未作靜默替換。每個材料的原始 observation 見稽核工作區的 `/home/ubuntu/raw-material-dashboard-live-smoke.json`，摘要見 `/home/ubuntu/raw-material-dashboard-live-smoke-summary.json`；這些工作區證據不應被當作 repository runtime dependency。

## Local runtime HTTP

在受控本機服務 `http://127.0.0.1:4175` 上，以下 endpoints 均回傳 HTTP 200：

| Endpoint | Result |
| --- | --- |
| `/health` | 200，65 bytes |
| `/api/market` | 200，17,199 bytes |
| `/api/materials` | 200，17,236 bytes |
| `/api/history?symbol=HG%3DF&period=1y` | 200，148,128 bytes |
| `/api/export/excel?symbol=HG%3DF&period=1y` | 200，38,832 bytes |

實際 response 可能因公開來源、時間與快取狀態不同而有不同 bytes；HTTP 200 不表示 external source 一定是即時 `OK`。`/api/market` 與 UI 會保留真實 `STALE`／`FALLBACK`／`API_ERROR` 狀態。

## Browser UI verification

在本機瀏覽器執行 dashboard load、搜尋 `銅`、分類 `工業金屬`、訊號 `快取資料`、排序 `漲幅高到低`、列選取、歷史查詢、趨勢圖、單一 export、全部 export 與 console check。觀察到 14 rows、stale badge、來源與單位、公開資料 disclaimer、1 筆搜尋結果、排序後首列與 detail panel 更新；歷史 query 顯示 `【公開市場資料】`、position、訊號與 SVG chart；兩種匯出均進入 `正在準備 Excel...`。console 無 uncaught output。

視覺識別未重設計。介面保留原本的 dashboard 結構，僅補上公開市場參考邊界、資料狀態、來源與 escaped dynamic rendering。

## Security verification

HTTP boundary 已加入 path traversal 防護、symbol／period allowlist、輸入長度限制、固定下載檔名、安全 `Content-Disposition`、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Cache-Control: no-store` 與非 debug error body。外部 URL 使用固定 public host allowlist 與 encoded registry symbol。production dependency audit 在 UUID override 後為 0 vulnerabilities；repository 仍不含憑證或公司私有資料。

## Historical filesystem fresh clone

GitHub-only fresh clone 已由 `gh repo clone ggyin0628-code/raw-material-market-dashboard /home/ubuntu/raw-material-dashboard-fresh -- --branch feat/raw-material-dashboard-hardening-v1` 建立，clone SHA 與 remote branch SHA 均為 `0750f6d068bfe4749211678799de569fdb84a1e8`。在該 clone 中，`npm ci` 通過、`npm run check` 通過、`npm test` 為 15 passed／0 failed、`npm run build` 通過、`npm audit --omit=dev` 為 0 vulnerabilities（98 production dependencies），受控啟動後 `/health` 回傳 `OK`，且 clone worktree clean。此結果驗證的是 GitHub 內容，不依賴本機未追蹤檔案或 Manus-only artifact。

## Weekly V1 validation

Weekly V1 local validation was rerun after the final implementation corrections using `npm ci`, `npm run check`, all weekly module syntax checks, `npm test`, `npm run build` and `npm audit --omit=dev`. The historical V1 result was 25 tests passed／0 failed, build PASS and production dependency audit 0 vulnerabilities. A controlled empty-ledger command run generated JSON／HTML／XLSX report artifacts, generated a safe HTML preview and returned `DRY_RUN` with `sent: false`; no SMTP socket or email was used.

The Weekly V1 test suite covers atomic snapshot persistence, provenance, same-day identity deduplication, quality-preserving upsert, missing days, Asia/Taipei reporting weeks, fresh-only comparison windows, volatility, FX separation, `LIVE`／`FALLBACK`／`STALE`／`NO_DATA`／`API_ERROR`, signal threshold boundaries, reason codes, canonical JSON, Traditional Chinese HTML, inline SVG, four-sheet XLSX, invalid-week HTTP 400, safe preview／XLSX routes, public-history backfill idempotence, malformed／missing SMTP configuration, dry-run, duplicate-week delivery guard and scheduler CLI parsing.

## Weekly V1 live public-data smoke

A bounded public smoke ran at `2026-08-22T17:04:53.392Z` with `MARKET_TIMEOUT_MS=5000` and `MARKET_RETRIES=1`. It persisted 15 records (14 configured materials plus the independent FX record) and generated the `2026-W33` JSON／HTML／XLSX weekly artifacts outside the repository.

| Observation | Result |
| --- | ---: |
| configured materials | 14 |
| public snapshot records | 15 |
| `LIVE` material rows | 14 |
| `FALLBACK` material rows | 0 |
| `STALE` material rows | 0 |
| `NO_DATA` material rows | 0 |
| `API_ERROR` material rows | 0 |
| finite material prices | 14 |
| snapshot state | `OK` |
| report week | `2026-W33` |

All 14 material quote observations were `LIVE` from their configured Yahoo Finance labels in this run, including `HG=F`, `ALI=F`, `HRC=F`, `TIO=F`, `CL=F`, `BZ=F`, `NG=F`, `GC=F`, `SI=F`, `PL=F`, `ZC=F`, `ZS=F`, `KC=F` and `CT=F`. This is an observation of provider availability at that run time, not a guarantee of future uptime or market freshness. The exact raw summary is retained outside the repository at `/home/ubuntu/raw-material-weekly-live-smoke.json`.

## Weekly V1 browser verification

The local dashboard at `http://127.0.0.1:4176/` rendered the minimum Weekly V1 panel without redesigning the existing visual identity. With an intentionally empty ledger it showed `2026-W33`, public-data coverage `0%`, 14 visible `DATA_INSUFFICIENT` warnings, the `預覽 HTML` link and the `下載週報 Excel` link; it did not fabricate a price or issue a purchasing instruction. Clicking `載入本週摘要` refreshed the panel without changing the legacy dashboard controls. The `/weekly/preview?week=2026-W33` route rendered the Traditional Chinese report title, public-market disclaimer, riser／decliner／high-volatility／quality sections and complete indicator table. Detailed observations are saved outside the repository at `/home/ubuntu/weekly-ui-verification.md`.

## Historical Weekly V1 fresh-clone evidence

GitHub-only fresh clone verification completed from `feat/weekly-market-intelligence-production-v1` at `85697cdcad9c7c6c126722b61a550713816b627a`. In `/home/ubuntu/raw-material-dashboard-production-fresh`, `npm ci`, `npm run check`, `npm test` (31 passed／0 failed), `npm run build` and `npm audit --omit=dev` (0 vulnerabilities) passed. Unconfigured production storage／daily commands returned expected exit 2; `/health` returned HTTP 200; clone-targeted synthetic production simulation passed; the fresh clone remained clean and did not require local artifacts.

## Historical filesystem production activation verification contract

| Gate | Required result | Classification |
| --- | --- | --- |
| Starting checkpoint | `weekly-market-intelligence-v1` target `b78ba1e6302a30b8231711c15d5945d3223687c5` | PASS |
| Production branch | `feat/weekly-market-intelligence-production-v1`, based on the checkpoint and not `main` | PASS |
| Storage guard | Unconfigured production returns `STORAGE_CONFIGURATION_REQUIRED`; synthetic absolute root returns durable configured status | PASS when both simulations pass |
| Production commands | `storage-check`, `status`, `bootstrap`, `daily`, `weekly`, `backup` have safe JSON output／exit behavior | PASS when fresh clone rerun passes |
| Quality gate | `SEND_OK`, `SEND_WITH_WARNINGS`, `SEND_BLOCKED` documented and deterministic | PASS |
| Email safety | dry-run has no socket; test mode isolates `MAIL_TEST_TO`; duplicate guard and resend approval exist | PASS |
| Observability | `/health/weekly` safe redaction; 503 when storage missing; 200 with synthetic durable root | PASS |
| Scheduler | Asia/Taipei contract and UTC conversion documented; no live cron activated | PASS |
| Live owner configuration | Persistent storage, SMTP credentials, approved sender／recipients and test recipient | `EXTERNAL_CONFIGURATION_REQUIRED` |
| Scheduler activation | Owner-controlled after test-recipient receipt review | `EXTERNAL_CONFIGURATION_REQUIRED` |

The last two rows are intentionally not offline code gaps. They are owner/runtime dependencies and must remain explicit until the owner performs the controlled activation sequence. The final handoff must state `OFFLINE_GAPS = 0` and `CODEX_HANDOFF_READY = YES` only after all repository and GitHub-only fresh-clone evidence is complete.

## Production simulation contract

Use only a temporary absolute `PRODUCTION_STORAGE_ROOT` and synthetic/public-safe records. Required sequence is storage check → public bootstrap or deterministic backfill → daily snapshot → completed-week analytics／quality gate → JSON／HTML／XLSX → SMTP dry-run → duplicate guard → `/health/weekly` → public backup. Never use real recipient addresses, owner secrets or generated private runtime reports in Git.

A separate bounded live public smoke may report current source availability, material counts, history and FX; provider failures are operational observations, not offline code gaps. Real SMTP receipt and scheduler enablement are intentionally excluded from this repository verification.

## Production simulation result

Historical filesystem production simulation completed with synthetic public-safe records on `feat/weekly-market-intelligence-production-v1`: unconfigured storage returned `STORAGE_CONFIGURATION_REQUIRED`／not ready; configured absolute temporary root returned `DURABLE_CONFIGURED`; bootstrap returned `BOOTSTRAP_COMPLETE` with 45 persisted records; daily snapshot returned `OK` with 15 records／15 inserted; weekly generated JSON／HTML／XLSX and returned `SEND_WITH_WARNINGS` plus mail `DRY_RUN`／`sent: false`; duplicate guard returned `DUPLICATE_PREVENTED`; `/health/weekly` returned HTTP 200 with no path or secret leak; public-only backup manifest was created. No SMTP socket or real email was used. Exact safe output is retained outside the repository at `/home/ubuntu/raw-material-production-simulation.md`.

The historical filesystem production gate recorded `31 passed／0 failed`; the current pre-remediation zero-cost deterministic gate was `38 passed／0 failed`; the current bootstrap-remediation gate is `43 passed／0 failed`; `npm run check`, `npm run build` and `npm audit --omit=dev` pass with 0 vulnerabilities. Production storage, SMTP credentials, approved sender／recipients, TEST_RECIPIENT receipt and scheduler activation remain `EXTERNAL_CONFIGURATION_REQUIRED` by design.

## Zero-Cost Runtime V1 verification

The current bootstrap-remediation branch is `fix/bootstrap-performance-v1`, based on main `8390a0234fb5d18e28e100ee1ff40750b6b0d95e`. Its deterministic suite is **43 passed／0 failed**. `npm run check`, `npm run build` and `npm audit --omit=dev` pass; the Postgres adapter and performance tests do not require a real Neon account.

| Area | Verification |
| --- | --- |
| Provider boundary | `filesystem` local/test adapter and `postgres` Neon-compatible adapter use shared canonical records and shared analytics |
| Bootstrap timeout diagnosis | Cancelled run `32609131444`: setup／migration／storage check completed in approximately 14 seconds; `Bootstrap public history` occupied the remaining 30-minute ceiling |
| Batch write remediation | `POSTGRES_UPSERT_BATCH_SIZE=250` default, max 500; one parameterized multi-row upsert per batch; no per-record `SELECT FOR UPDATE` |
| History fetch remediation | Bounded concurrency 3, capped at 4; existing timeout／retry and per-material isolation retained |
| Resumability | Each batch commits independently; prior committed batches survive interruption; rerun is identity／quality-safe |
| Schedule safety | Daily／weekly scheduled jobs require `PRODUCTION_SCHEDULES_ENABLED=1`; manual dispatch remains allowed; bootstrap is dispatch-only |
| Live bootstrap | Not yet executed on remediation branch; post-promotion owner-controlled single bootstrap is required before certification |
| Database migration | `db:migrate` creates required tables/indexes idempotently and non-destructively |
| Postgres semantics | Snapshot uniqueness, quality-preserving upsert, transaction rollback, invalid payload, database failure, query timeout contract and safe redaction |
| Parity | Same fixture data produces equivalent weekly indicators and quality summary through filesystem／Postgres reads |
| Durable operational state | PostgreSQL delivery ledger, report metadata, job state and public export／manifest |
| Actions daily | `market-daily.yml` has schedule／manual dispatch, npm ci, migration, storage check, daily collection and no mail |
| Actions weekly | `market-weekly.yml` has Monday schedule／manual dispatch, migration, quality gate, JSON／HTML／XLSX, Gmail delivery and duplicate guard |
| Gmail safety | Personal Gmail configuration only; `MAIL_TEST_MODE`／`MAIL_TEST_TO`, dry-run, failure recovery and no automatic uncertain acceptance retry |
| Health | `/health/weekly` readiness states and redaction; database URL／password／recipient lists absent |
| Product boundary | Public external market intelligence only; no company or supplier private data |

A controlled production simulation uses only a synthetic public-safe fixture and a temporary root／fake pool. It verifies migration contract, storage provider selection, bootstrap／daily／weekly lifecycle, quality gate, dry-run, duplicate guard, health and public export. No real Neon connection, Gmail connection, Actions activation, paid resource or deployment is used.

The final GitHub-only fresh clone must be created from `feat/zero-cost-runtime-v1` after push and before the final tag. It must run `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm audit --omit=dev`, `db:migrate` contract checks, workflow source checks and safe production simulation. Remaining Neon project creation, Actions secrets, first `MAIL_TEST_MODE=1` live send and workflow activation are `EXTERNAL_CONFIGURATION_REQUIRED`, not offline code gaps.
