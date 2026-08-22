# 原物料行情查詢系統

本專案是 **原物料市場趨勢／採購參考儀表板**。它以 Node.js 後端取得公開商品期貨與匯率資料，經過單位正規化、快取與可重現的趨勢計算後，提供瀏覽器中的市場參考畫面與 XLSX 匯出。系統不包含、也不應加入公司採購資料、供應商報價、SAP 資料、私人網路資訊或生產憑證。

> **產品邊界：** PUBLIC MARKET DATA 只用於市場趨勢與採購參考；本系統不是供應商報價系統、ERP 採購系統、台灣現貨價資料庫、合約價系統，也不是已確認的採購建議引擎。任何 TWD 數值均是由公開來源換算的市場參考值，不等於供應商報價或採購核決。

## 功能範圍

| 功能 | 說明 |
| --- | --- |
| 行情看板 | 顯示 14 個已註冊原物料的價格、漲跌、資料時間、來源、狀態與 TWD 市場參考值。 |
| 公開來源階層 | Yahoo Finance 為主要來源；個別材料可依 registry 使用 Stooq 報價備援；歷史 Yahoo 路徑另有受限的 Jina 公開代理備援；USD/TWD 使用 Yahoo Finance 後備援 open.er-api.com。 |
| 狀態可見性 | Legacy market API 保留 `OK` 相容狀態；Weekly V1 使用 `LIVE`、`FALLBACK`、`STALE`、`NO_DATA`、`API_ERROR`，禁止把備援或舊快取標成即時 `LIVE`。 |
| 歷史分析 | 支援 1、2、3 年公開歷史資料，提供日期序列、月均價、年度比較、位階與市場趨勢參考訊號。 |
| Excel 匯出 | 支援單一材料與全部材料匯出，工作簿包含來源、單位、期間、狀態、換算欄位及公開資料免責聲明。 |
| 前端操作 | 搜尋、分類篩選、訊號篩選、排序、列選取、歷史查詢、趨勢圖、單一／全部匯出與更新控制。 |
| Weekly Market Intelligence V1 | 以每日公開資料快照建立完成週的上升／下降、高波動、資料品質、變化窗口、HTML 週報與四工作表 XLSX。 |
| 週報預覽與交付 | `/weekly/preview`、`/weekly/export.xlsx`、safe preview CLI、SMTP dry-run、fail-closed delivery 與 duplicate-week ledger。 |

## 架構與目錄

後端入口是 `server.js`，負責安全的 HTTP 邊界、路由、查詢參數驗證、回應標頭與下載檔名。`lib/marketData/` 封裝材料 registry、Yahoo／Stooq／FX 來源、重試與 timeout、正規化、快取、狀態、歷史分析及 Excel 產製；`app.js` 與 `index.html` 實作維持既有視覺識別的瀏覽器介面；`market-seed.json` 是不含私人資料的公開舊快取種子，只在所有即時來源失敗且仍在 stale TTL 內時使用。

| 路徑 | 職責 |
| --- | --- |
| `server.js` | `/health`、`/api/market`、`/api/materials`、`/api/history`、`/api/export/excel`、`/api/export/all` 與安全邊界。 |
| `lib/marketData/materials.js` | 14 個材料的 symbol、exchange、source unit、currency、conversion factor 與 fallback metadata。 |
| `lib/marketData/dataContract.js` | canonical status、公開市場免責聲明、單位驗證與 TWD reference 計算。 |
| `lib/marketData/marketService.js` | FX／材料刷新、fallback、stale hydration、快取及 snapshot 狀態。 |
| `lib/marketData/exportService.js` | 歷史列驗證、月／年度分析、訊號計算與 XLSX 工作簿。 |
| `lib/weekly/` | 每日 snapshot ledger、weekly analytics、report／HTML／XLSX、backfill、mail safety 與 scheduler CLI。 |
| `test/dashboard.test.js` | Node 內建 test runner 的離線 deterministic contract、領域、API、XLSX 與 Weekly V1 測試。 |

## 目前材料 registry

下表是程式實際採用的公開 symbol 與單位解讀。`×` 代表目前沒有配置該材料的 Stooq fallback symbol；這不表示可以用其他商品靜默替代。

| 材料 | Symbol | Exchange/source label | Source unit | Currency | Conversion factor | Stooq fallback |
| --- | --- | --- | --- | --- | ---: | --- |
| 銅 | `HG=F` | COMEX | USD/lb | USD | 1 | `HG.F` |
| 鋁 | `ALI=F` | Yahoo Finance Aluminum Futures | USD/metric ton | USD | 1 | × |
| 熱軋鋼捲 | `HRC=F` | U.S. Midwest HRC | USD/short ton | USD | 1 | × |
| 鐵礦砂 | `TIO=F` | Yahoo Finance Iron Ore Futures | USD/metric ton | USD | 1 | × |
| WTI 原油 | `CL=F` | NYMEX | USD/barrel | USD | 1 | `CL.F` |
| Brent 原油 | `BZ=F` | ICE Brent | USD/barrel | USD | 1 | × |
| 天然氣 | `NG=F` | NYMEX | USD/MMBtu | USD | 1 | `NG.F` |
| 黃金 | `GC=F` | COMEX | USD/troy oz | USD | 1 | `GC.F` |
| 白銀 | `SI=F` | COMEX | USD/troy oz | USD | 1 | `SI.F` |
| 鉑金 | `PL=F` | NYMEX | USD/troy oz | USD | 1 | `PL.F` |
| 玉米 | `ZC=F` | CBOT | US cents/bushel | USD | 0.01 | `ZC.F` |
| 黃豆 | `ZS=F` | CBOT | US cents/bushel | USD | 0.01 | `ZS.F` |
| 咖啡 | `KC=F` | ICE Coffee | US cents/lb | USD | 0.01 | `KC.F` |
| 棉花 | `CT=F` | ICE Cotton | US cents/lb | USD | 0.01 | `CT.F` |

## 資料與計算規則

行情值依照 `source unit → USD normalization → USD/TWD FX → displayed TWD reference` 的順序處理。對以美分報價的玉米、黃豆、咖啡與棉花，先乘以 `0.01` 轉成美元單位；其餘 registry 中的 USD 單位使用 `1`。一般 TWD 參考值為 `source price × conversionFactor × valid USD/TWD rate`。若 FX 無有效有限數值，TWD 參考值為 `null`，不以 0、舊錯誤值或虛構匯率補上。

不同 source unit 不可直接互比。例如 USD/lb、USD/metric ton、USD/short ton、USD/barrel、USD/MMBtu、USD/troy oz、US cents/bushel 與 US cents/lb 的數字含義不同。介面與匯出欄位會保留原始單位與幣別，TWD 欄位明確標成市場參考值，不能解讀為台灣供應商相同交貨條件下的價格。

### 市場趨勢參考訊號

歷史訊號是可重現的參考 heuristic，不是買入／停買指令。系統目前保留既有門檻，不在缺乏客觀缺陷證據時重新調參；判斷輸入包括期間資料是否足夠、最新值相對期間 high／low 的位置、近期變動與期間方向。完整門檻與輸入欄位見 [`docs/PURCHASING_SIGNAL_CONTRACT.md`](docs/PURCHASING_SIGNAL_CONTRACT.md)。

## 狀態、快取與錯誤

即時刷新會先查主要來源，再依 registry 進行公開 fallback。主要來源失敗但 fallback 成功時，列狀態為 `FALLBACK`；即時來源全部或部分失敗而使用最近一次成功快取時，列狀態為 `STALE` 並保留資料時間與錯誤原因；沒有可用資料時使用 `NO_DATA` 或 `API_ERROR`。任何狀態都不會被重新命名為虛假的 `LIVE`。

| 設定 | 預設值 | 說明 |
| --- | ---: | --- |
| `MARKET_CACHE_TTL_MS` | 15 分鐘 | 只有至少 70% rows 為新鮮 `OK`／`FALLBACK` 且價格有限時，才可作為 fresh cache。 |
| `MARKET_STALE_TTL_MS` | 24 小時 | 允許讀取 local cache、memory cache 或 bundled seed 的最後成功資料並標成 `STALE`。 |
| retry | 有界 | retry 次數、timeout 與歷史代理 timeout 均有有限上限，不存在無限重試。 |
| cache path | 專案根目錄 `cache/` | 由模組位置解析，不依賴 process working directory；產物已在 `.gitignore`。 |

刷新使用共享 promise，避免同一時間的請求重複打滿外部來源。單一材料失敗不會直接污染其他材料；失敗列會先保留可見的 `API_ERROR`，只有找到對應且可用的最後成功 row 才會以 `STALE` 代替。

## 本機啟動

需求是 Node.js 20 以上。安裝鎖定依賴並啟動：

```bash
npm ci
npm start
```

預設服務會繫結 `0.0.0.0`，使用 `PORT` 環境變數（預設 `4173`）。瀏覽器可開啟 `http://localhost:4173`；健康檢查位於 `http://localhost:4173/health`。`start.command` 是現有的 macOS 便利啟動腳本，但不會替你安裝依賴或設定秘密。

## API

| 路由 | 方法 | 用途 |
| --- | --- | --- |
| `/health` | GET | 回傳 `{ "status": "OK" }` 與安全回應標頭。 |
| `/api/market` | GET | 取得目前 dashboard snapshot、FX、rows、summary、cache 與 disclaimer。 |
| `/api/materials` | GET | 與 market snapshot 相同的相容性資料入口。 |
| `/api/history?symbol=HG%3DF&period=1y` | GET | 取得指定 registry symbol 的 1y／2y／3y 歷史、月分析與參考訊號。 |
| `/api/export/excel?symbol=HG%3DF&period=1y` | GET | 產生單一材料 XLSX。 |
| `/api/export/all?period=1y` | GET | 產生全部材料 XLSX。 |
| `/api/weekly/report?week=YYYY-Www` | GET | 回傳 canonical Weekly V1 JSON report。 |
| `/weekly/preview?week=YYYY-Www` | GET | 回傳 Traditional Chinese HTML 週報預覽，不寄信。 |
| `/weekly/export.xlsx?week=YYYY-Www` | GET | 下載四工作表 public-market intelligence XLSX，不寄信。 |

`symbol` 必須是 registry 中的已知 symbol，`period` 僅接受 `1y`、`2y`、`3y`。不合法輸入會得到 400；外部資料格式錯誤或 timeout 會以明確的 `API_ERROR` 與相應 HTTP status 回傳，不會回傳假資料。

## Weekly V1 操作命令

```bash
npm run daily:snapshot
npm run weekly:backfill -- --period 3y
npm run weekly:report -- --week YYYY-Www --out-dir data/weekly-reports
npm run weekly:preview -- --week YYYY-Www --out /tmp/weekly-preview.html
DRY_RUN=1 npm run weekly:send -- --week YYYY-Www --dry-run --out-dir /tmp/weekly-send
```

Production jobs 必須先通過 durable storage gate：

```bash
npm run production:storage-check
npm run production:status
npm run production:bootstrap -- --period 3y
npm run production:daily
npm run production:weekly -- --dry-run --send
npm run production:backup -- --backup-id <owner-approved-id>
```

在 `NODE_ENV=production` 或 `REQUIRE_DURABLE_STORAGE=1` 時，`PRODUCTION_STORAGE_ROOT` 必須是 owner-approved absolute durable mount；否則回 `STORAGE_CONFIGURATION_REQUIRED`，不可將 Render free／container ephemeral filesystem 當成 durable。Production weekly 先產生 JSON／HTML／XLSX、評估 `SEND_OK`／`SEND_WITH_WARNINGS`／`SEND_BLOCKED`，再依 dry-run → `MAIL_TEST_MODE=1`／`MAIL_TEST_TO` → approved recipients 的 staged workflow 進行 SMTP。完成週預設以 `Asia/Taipei` 的前一個 Monday–Sunday ISO week 計算。完整模型、品質、儲存、SMTP 與 scheduler 說明見 [`docs/WEEKLY_MARKET_INTELLIGENCE.md`](docs/WEEKLY_MARKET_INTELLIGENCE.md)、[`docs/WEEKLY_REPORT_CONTRACT.md`](docs/WEEKLY_REPORT_CONTRACT.md)、[`docs/PRODUCTION_STORAGE.md`](docs/PRODUCTION_STORAGE.md)、[`docs/PRODUCTION_ACTIVATION.md`](docs/PRODUCTION_ACTIVATION.md)、[`docs/EMAIL_DELIVERY.md`](docs/EMAIL_DELIVERY.md)、[`docs/OPERATIONS_RUNBOOK.md`](docs/OPERATIONS_RUNBOOK.md) 與 [`docs/SCHEDULER_RUNBOOK.md`](docs/SCHEDULER_RUNBOOK.md)。

## 測試與驗證

本專案保留 CommonJS 與 Node 內建 test runner，提供最小且可維護的驗證鏈：

```bash
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
```

`npm test` 會 mock 外部 fetch，涵蓋材料與單位契約、conversion factor、malformed quote、日期排序與去重、bounded retry、訊號門檻、歷史計算、FX nearest-prior、fresh／stale cache、`LIVE` canonicalization、fallback、total failure、無效 symbol／period、timeout、健康檢查、兩種歷史 API 與兩種 XLSX export，以及 production storage gate、quality gate、bootstrap、SMTP test mode、auth／timeout／uncertain acceptance／attachment failure 與 safe weekly health。最新 deterministic suite 為 31 passed／0 failed，測試不依賴 Yahoo 當下可用性。

## 公開資料部署

這是需要 Node.js 後端的 Web Service，不是只把靜態檔案丟到 CDN。Render 設定見 [`render.yaml`](render.yaml)，部署步驟與非生產檢查見 [`DEPLOY.md`](DEPLOY.md)。部署前至少執行 `npm ci`、`npm run check`、`npm test`、`npm run build`，並確認 `/health` 與公開資料 API 的實際狀態。

本次未部署新 production site、未啟用 paid resources、未建立 production cron、未加入認證、私人 connector 或生產憑證。公開 repository 永久只含外部公開市場情報與採購參考實作及 public seed；供應商報價、公司採購資料、SAP、內部門檻、公司目標價格、inventory、MOQ、payment terms、private mapping 與 private runtime reports 永遠不屬於本產品，也不得作為未來功能方向。下一個功能擴展固定為 external machining／sheet-metal public market reference intelligence。

## 詳細契約與交接

| 文件 | 內容 |
| --- | --- |
| [`PROJECT_STATUS.md`](PROJECT_STATUS.md) | 目前完成度、baseline、分支與風險狀態。 |
| [`HANDOFF.md`](HANDOFF.md) | 不依賴對話紀錄的 Codex 接手說明與下一個明確任務。 |
| [`docs/DATA_SOURCE_CONTRACT.md`](docs/DATA_SOURCE_CONTRACT.md) | 公開來源階層、fallback、狀態與來源可見性。 |
| [`docs/PRICE_UNIT_CONTRACT.md`](docs/PRICE_UNIT_CONTRACT.md) | 材料單位、conversion factor、FX 與 TWD reference 規則。 |
| [`docs/PURCHASING_SIGNAL_CONTRACT.md`](docs/PURCHASING_SIGNAL_CONTRACT.md) | 歷史訊號輸入、門檻與非採購指示邊界。 |
| [`docs/RUNTIME_VERIFICATION.md`](docs/RUNTIME_VERIFICATION.md) | deterministic、live smoke、runtime、UI、security 與 fresh-clone 證據。 |
| [`docs/WEEKLY_MARKET_INTELLIGENCE.md`](docs/WEEKLY_MARKET_INTELLIGENCE.md) | Weekly V1 架構、快照、分析與限制。 |
| [`docs/WEEKLY_REPORT_CONTRACT.md`](docs/WEEKLY_REPORT_CONTRACT.md) | Canonical JSON、公式、品質狀態與訊號門檻。 |
| [`docs/EMAIL_DELIVERY.md`](docs/EMAIL_DELIVERY.md) | SMTP dry-run、fail-closed、ledger 與 live mail 操作。 |
| [`docs/SCHEDULER_RUNBOOK.md`](docs/SCHEDULER_RUNBOOK.md) | Asia/Taipei weekly scheduler、backfill 與持久化 runbook。 |
