# Weekly Market Intelligence V1

## 定義

本模組將既有公開原物料行情看板延伸為**外部市場情報與採購參考平台**。輸入是 Yahoo Finance、registry-configured Stooq、固定 Jina public proxy 與 open.er-api 的公開市場資料；輸出是每日快照、完成週的變化分析、Traditional Chinese HTML／XLSX 週報與可由 GitHub Actions 執行的命令。

它不提供供應商採購價、公司目標採購價、保證議價價、未經明確來源支持的台灣現貨價，也不提供 BUY／SELL／MUST PURCHASE 指示。任何資料不足、來源錯誤或 stale 狀態都必須在資料、訊號、報告與匯出中保持可見。

## 系統流程

```text
公開行情來源
    ↓
既有 marketService（primary / fallback / stale / API_ERROR）
    ↓
dailySnapshotService（canonical daily record）
    ↓
Storage provider boundary
    ├── filesystem（local／deterministic tests）
    └── postgres（Neon-compatible durable production）
    ↓
weeklyAnalytics（completed ISO week，fresh-only comparisons）
    ↓
唯一 canonical report model
    ├── Traditional Chinese HTML / optional inline SVG
    ├── four-sheet XLSX
    ├── dashboard preview routes
    └── GitHub Actions Gmail dry-run／test delivery／approved delivery
```

Postgres mode 不複製 analytics；provider 只負責 canonical record、delivery ledger、report metadata、job state 的 persistence。`buildWeeklyReport`、quality gate、HTML 與 XLSX renderer 在兩種 provider 間共用。

## 每日快照

`STORAGE_PROVIDER=filesystem` 時，local default 是 ignored `data/market-snapshots/snapshots.json`，可由 `MARKET_SNAPSHOT_FILE` 指定測試路徑。`STORAGE_PROVIDER=postgres` 時，快照寫入 `market_snapshots`，由 secret-managed `DATABASE_URL` 指向 Neon-compatible PostgreSQL。每筆資料以 `material_id + observation_date` 去重；filesystem 使用 atomic rename，Postgres 使用 transaction／row lock／conflict-safe upsert。

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

## 產出與 quality gate

`reportService.js` 建立唯一 canonical weekly report，再由 HTML、inline SVG 與 XLSX renderer 消費。HTML 先展示主要上升、主要下降、高波動與資料品質警示，再展示全部 tracked indicators；即使圖片無法載入，表格與文字仍包含必要資訊。XLSX 固定有「本週摘要」、「市場明細」、「歷史資料」、「資料來源與說明」四個工作表。

Weekly quality gate 在任何 mail attempt 前評估 `SEND_OK`、`SEND_WITH_WARNINGS` 或 `SEND_BLOCKED`。它統計 tracked／usable／`STALE`／`API_ERROR`／`NO_DATA`、insufficient history、missing FX 與 artifact integrity。無 usable data、usable ratio 低於 50% 或 artifact 不完整時為 `SEND_BLOCKED` 且不得送信；可用但 degraded 時保留所有 warnings。

## Production runtime

Postgres production 由 GitHub Actions 執行 `db:migrate`、`production:bootstrap`、`production:daily`、`production:weekly` 與 `production:backup`。Daily workflow 約於週二至週六 `07:17 Asia/Taipei`，UTC cron 為 `17 23 * * 1-5`；weekly workflow 約於週一 `09:17 Asia/Taipei`，UTC cron 為 `17 1 * * 1`。兩者都提供 manual dispatch。Weekly Gmail delivery 僅使用 owner-approved personal Gmail SMTP，且 first live workflow 必須以 `MAIL_TEST_MODE=1`／`MAIL_TEST_TO` 開始。

Render Free 只作 optional dashboard hosting，不承擔 scheduled SMTP，也不依賴 local filesystem durability。缺少 `DATABASE_URL` 時 production 回 `DATABASE_URL_REQUIRED`；filesystem production 未配置 approved durable root 時回 `STORAGE_CONFIGURATION_REQUIRED`。不會將 ephemeral filesystem 假裝成 durable。

## 外部限制與 recovery

Public provider availability、rate limit、timeout、資料延遲與來源授權都是 operational dependencies。Postgres connection failure、migration failure、query timeout、transaction rollback、malformed payload、Gmail authentication failure、SMTP timeout、attachment failure 與 duplicate delivery 都必須以明確 failure state 可觀測。Provider-supported public re-backfill 與 public export 是 recovery source；不得製造資料或使用私有採購資料補洞。

## Explicit owner activation

本次不建立 Neon project、不設定 GitHub Actions secrets、不取得 Gmail App Password、不發送 real mail、不啟用 schedule、不部署或啟用 paid resources。Owner 後續需建立 owner-approved Neon Free project，將 `DATABASE_URL` 與 Gmail credentials 僅放在 Actions secrets，執行 manual bootstrap，完成一次 `MAIL_TEST_MODE=1` live send 並驗證收件與 attachment，最後才啟用 daily／weekly schedules。

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/feat/zero-cost-runtime-v1 "Zero-Cost Runtime V1 source branch"
[2]: https://query1.finance.yahoo.com/ "Yahoo Finance public chart host used by the existing adapter"
[3]: https://r.jina.ai/ "Fixed public proxy used only for Yahoo history fallback"
[4]: https://open.er-api.com/ "Public FX fallback endpoint used by the existing adapter"
