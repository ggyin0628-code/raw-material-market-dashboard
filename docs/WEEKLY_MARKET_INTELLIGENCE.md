# Weekly Market Intelligence V1

## 定義

本模組將既有公開原物料行情看板延伸為**外部市場情報與採購參考平台**。它的輸入是 Yahoo Finance、registry-configured Stooq、固定 Jina public proxy 與 open.er-api 的公開市場資料；它的輸出是每日快照、完成週的變化分析、Traditional Chinese HTML／XLSX 週報與可供外部 scheduler 執行的命令。

它不提供供應商採購價、公司目標採購價、保證議價價、未經明確來源支持的台灣現貨價，也不提供 BUY／SELL／MUST PURCHASE 指示。任何資料不足、來源錯誤或 stale 狀態都必須在資料、訊號、報告與匯出中保持可見。

## 系統流程

```text
公開行情來源
    ↓
既有 marketService（primary / fallback / stale / API_ERROR）
    ↓
dailySnapshotService（canonical daily record）
    ↓
snapshotStore（atomic JSON ledger，materialId + date identity）
    ↓
weeklyAnalytics（completed ISO week，fresh-only comparisons）
    ↓
canonical report model
    ├── Traditional Chinese HTML / optional inline SVG
    ├── four-sheet XLSX
    ├── dashboard preview routes
    └── SMTP dry-run / fail-closed delivery
```

## 每日快照

預設檔案是 `data/market-snapshots/snapshots.json`，可由 `MARKET_SNAPSHOT_FILE` 指向持久化掛載路徑。每筆資料以 `materialId + date` 去重，並由 temporary file 與 atomic rename 寫回，避免程序中斷留下半份 JSON。每日收集日期是 `Asia/Taipei` 的 collection date；實際交易時間另以 `lastTradeTimestamp` 保存。

| 欄位 | 語意 |
| --- | --- |
| `materialId`、`symbol`、`category`、`exchange` | registry identity 與市場分類 |
| `date` | 台北時區的每日快照 identity 日期 |
| `marketPrice`、`sourceUnit`、`currency` | 原始公開來源數值與單位，不做猜測性換算 |
| `usdTwdRate`、`twdReferenceValue` | 有有效 FX 時的 TWD 市場參考值；缺 FX 時保持 `null` |
| `source`、`status`、`provenance` | 來源 lineage 與品質狀態 |
| `lastTradeTimestamp`、`collectedAt` | 市場時間與系統收集時間 |
| `error`、`sourceReliability` | 失敗原因與 primary／fallback／stale 說明 |

若同一天先取得 `LIVE`，之後因 network failure 取得 `STALE` 或 `API_ERROR`，後者不能降級覆蓋較高品質資料。缺少的市場日不會補成虛構資料；backfill 只會寫入 provider 實際返回的日期。

## 公開資料狀態

| Weekly status | 來源語意 | 是否可作 fresh observation |
| --- | --- | --- |
| `LIVE` | 既有 primary `OK` 正規化後的公開資料 | 是 |
| `FALLBACK` | 明確配置的公開備援成功 | 是，但報告保留 fallback lineage |
| `STALE` | 最近一次成功公開資料的舊快取 | 否 |
| `NO_DATA` | 沒有可接受的有限數值 | 否 |
| `API_ERROR` | 上游 timeout、malformed response 或 provider error | 否 |

Weekly analytics 僅使用 `LIVE` 與 `FALLBACK` 進行數值比較；`STALE`、`NO_DATA` 與 `API_ERROR` 只用於品質摘要、警示與原因代碼。

## 分析窗口

報告使用 `Asia/Taipei` 的 ISO reporting week，預設是執行時點的完成前一週，即 Monday–Sunday。若明確傳入 `YYYY-Www`，所有日期都被限制在該週結束日以前。

| 指標 | 規則 |
| --- | --- |
| 近一週 | 報告週最新有效觀測，相對於約 7 天前最近且可接受的有效觀測 |
| 近四週 | 報告週最新有效觀測，相對於約 28 天前的有效觀測 |
| 近三個月 | 相對於約 90 天前；資料缺口超過容忍範圍則 `null` |
| YTD | 相對於該年度 1 月 1 日以前最近的有效觀測 |
| 52 週 | 相對於約 364 天前；資料不足則 `null` |
| 週高／週低 | 僅使用 reporting week 內的 fresh 有效觀測 |
| 滾動波動 | 最多最近 20 個 daily percent returns 的 sample standard deviation |
| USD/TWD | 使用獨立 `__fx_usd_twd__` public record，缺少 FX 不填假值 |

變化公式是 `((current - previous) / previous) × 100`。原始 source unit 與 currency 始終保留；TWD 只稱為 market-reference value，不等於供應商報價。

## 外部市場訊號

訊號依固定優先順序產生：current status 為 stale／error 時先顯示 `DATA_QUALITY_WARNING`；沒有 current 或必要 comparison 時顯示 `DATA_INSUFFICIENT`；rolling volatility ≥ 3 percentage points 時顯示 `HIGH_VOLATILITY`；weekly change ≥ 2% 或 four-week change ≥ 4% 時顯示 `COST_PRESSURE_RISING`；weekly change ≤ -2% 或 four-week change ≤ -4% 時顯示 `MARKET_WEAKENING`；其餘資料充足狀態為 `STABLE`。每個訊號都帶有可重現的 reason code 與 Traditional Chinese reason。

這些訊號描述公開市場觀察，不是買進、賣出、停買、必須採購、議價承諾或公司決策。產品不讀取、不保存也不延伸至 supplier quotation、交期、MOQ、付款條件、庫存或內部政策；上述私人資料永久不屬於本產品。

## 產出

`reportService.js` 建立唯一 canonical weekly report，再由 HTML、inline SVG 與 XLSX renderer 消費。HTML 先展示主要上升、主要下降、高波動與資料品質警示，再展示全部 tracked indicators；即使圖片無法載入，表格與文字仍包含必要資訊。XLSX 固定有「本週摘要」、「市場明細」、「歷史資料」、「資料來源與說明」四個工作表。

## 外部限制

Public provider availability、rate limit、timeout、資料延遲、來源授權與 runtime filesystem persistence 都是 operational dependency。若部署環境的本地檔案系統會在 instance replacement 後消失，production jobs 必須先配置 owner-approved durable storage root；未配置時一律 `STORAGE_CONFIGURATION_REQUIRED`，不得把 ephemeral filesystem 當成 durable。本次沒有新增公司資料庫、私人 connector、付費資源或 production cron。

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/feat/weekly-market-intelligence-production-v1 "Weekly Market Intelligence V1 source branch"
[2]: https://query1.finance.yahoo.com/ "Yahoo Finance public chart host used by the existing adapter"
[3]: https://r.jina.ai/ "Fixed public proxy used only for Yahoo history fallback"
[4]: https://open.er-api.com/ "Public FX fallback endpoint used by the existing adapter"

## Production activation contract

Production storage paths are resolved by the shared storage configuration. `PRODUCTION_STORAGE_ROOT` must be an absolute owner-approved durable mount when `NODE_ENV=production` or `REQUIRE_DURABLE_STORAGE=1`; otherwise every production command fails closed with `STORAGE_CONFIGURATION_REQUIRED`. Snapshot, job state, report metadata, delivery ledger and report artifacts use atomic file replacement; backup exports only public-market data and safe operational metadata.

Before an email attempt, the weekly report evaluates the quality gate. `SEND_OK` means usable public observations and complete artifacts; `SEND_WITH_WARNINGS` means the report is materially usable but exposes fallback, stale, provider error, insufficient-history or FX warnings; `SEND_BLOCKED` means no usable data, usable ratio below the documented threshold or incomplete artifact integrity. Blocked reports never send.

The production commands are `production:storage-check`, `production:status`, `production:bootstrap`, `production:daily`, `production:weekly` and `production:backup`. SMTP remains provider-neutral, environment-only and staged through dry-run → `MAIL_TEST_MODE=1`／`MAIL_TEST_TO` → approved recipients. No production scheduler or live recipient send is enabled by this repository task. The explicit next human action is to configure approved persistent storage and SMTP variables, perform TEST_RECIPIENT live email verification, and then enable the Asia/Taipei weekly scheduler.
