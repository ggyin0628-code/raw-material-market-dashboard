# CNC／一般加工公開市場參考：Phase 2B 可靠性規格

## 目的與產品邊界

本功能是 **外部公開市場情報與採購參考層**。它回答「相對近期可比較觀測，加工成本壓力目前偏上升、下降或穩定」；它不回答任何供應商應報多少錢，也不輸出每小時加工費、循環時間、公司目標價或採購核決。

頁面與 API 明確標示「公開市場參考」、「非供應商報價」及「非公司目標價格」。`ENGINEERING_ESTIMATE` 在 V1 固定為 `null`。所有可見分數都必須回溯到外部公開觀測、適合該資料頻率的比較窗口、來源狀態與明確權重；任何來源失敗、資料過舊或沒有可比基準時，系統保留狀態而不製造值。

## 公開來源與 Phase 2B 可靠性策略

DGBAS 的基本分類 PPI 資料集涵蓋製造業產品、水電燃氣、基本金屬及機械設備等分類。[1] 原先使用的 DGBAS XML 仍是第一優先來源，但測試確認 `ws.dgbas.gov.tw` 的憑證鏈在目前 Node 執行環境可能無法驗證；因此本版本不採取 TLS 放寬，而改用官方 DGBAS 統計查詢頁的 UTF-8 CSV 輸出作為安全備援。[2] 這個查詢頁公開列出 CSV、CSV(UTF8)、JSON、XML 等輸出模式，且可選取所需分類。

| 驅動群組 | 第一來源／備援 | 頻率 | Phase 2B 行為 | 資料層 |
| --- | --- | --- | --- | --- |
| 金屬、能源與材料 | 既有 Yahoo Finance／Stooq 公開指標：銅、鋁、熱軋鋼捲、WTI、天然氣；台灣基本金屬 PPI 作補充 | 市場指標為交易日；PPI 為每月 | 保留既有來源狀態與歷史；不代表台灣現貨 | `OBSERVED_PUBLIC_DATA` |
| 製造業／能源 PPI | DGBAS 基本分類 XML；失敗後使用官方 `nstatdb` CSV query | 每月 | 查詢只取總指數、製造業產品、基本金屬、機械設備、水電燃氣五個必要欄位；各序列保留實際 endpoint 與 `FALLBACK` 狀態 | `OBSERVED_PUBLIC_DATA` |
| 製造業勞動成本 | DGBAS 薪資 XML；失敗後使用官方製造業月資料 CSV query | 月資料；資料集 metadata 標示每年一月更新 | 修正 `YYYYMM` 解析；使用月度比較窗口。資料發布落後時標示 `STALE`，不把它當成週資料 | `OBSERVED_PUBLIC_DATA` |
| NTD/USD | 中央銀行官方 60 筆分頁；失敗後使用官方 20 筆首頁 | 營業日 | 60 筆頁面足以提供約 12 週工作日歷史；備援頁面標示 `FALLBACK`，並保留實際分頁 endpoint | `OBSERVED_PUBLIC_DATA` |
| 台電電價 | 台灣電力公司／政府資料開放平臺官方 JSON | 修訂／事件驅動 | 只作結構性來源；沒有指定電壓、契約、用電量與時段時，不推導單一電價或週動能 | `OBSERVED_PUBLIC_DATA` |
| 機械／資本成本代理 | DGBAS「18.機械設備」PPI | 每月 | 僅作設備價格代理；不推導機台購置價、折舊、加工時薪或供應商報價 | `OBSERVED_PUBLIC_DATA` |

DGBAS PPI 的官方統計查詢頁可用 `sys=220`、`outmode=3`、`cycle=1` 及 bounded `fldlst` 查詢必要分類；本實作固定使用已驗證的類別位置：總指數 1、製造業產品 19、基本金屬 56、機械設備 84、水電燃氣 98。[2] 製造業薪資查詢頁則使用製造業欄位位置 4、合計性別分類 `codlst0=100`，同樣輸出 UTF-8 CSV。[3]

中央銀行 60 筆頁面在測試時涵蓋 2026-08-21 至 2026-05-28，足以支援短期窗口；20 筆首頁只作明確備援，不假設單頁包含完整歷史。[4] 台電資料集提供官方 JSON 與實施日期，但不同用電類別具有不同級距與條件；因此本版只把它作為 `structural` 來源，不讓存在的 JSON 被誤解為 CNC 電價。[5]

## 資料契約

API 主資料物件包含 `referenceDate`、`region`、`machiningType`、`materialFamily`、六個壓力構面、`compositePressureScore`、`pressureLevel`、`trend`、`confidence`、`dataQuality`、`sourceProvenance[]`、`explanation[]`、`disclaimer`、`observedPublicData`、`derivedMarketReference` 及 `engineeringEstimate`。三層資料嚴格分開：

| 層級 | 含義 | Phase 2B 行為 |
| --- | --- | --- |
| `OBSERVED_PUBLIC_DATA` | 外部來源實際觀測，例如 PPI、月薪、匯率、金屬／能源歷史列 | 只保留來源值、觀測日期、單位、頻率、抓取時間、endpoint 與來源狀態；不改寫成供應商價格 |
| `DERIVED_MARKET_REFERENCE` | 由公開觀測與確定性規則推導的窗口變化、壓力分數、等級與方向 | 顯示公式、權重、可用構面、最低證據門檻與適頻率比較窗口 |
| `ENGINEERING_ESTIMATE` | 需要工程輸入與文件化假設的估算 | V1 固定為 `null`，不估算時薪、循環時間、設備成本或加工報價 |

來源沿革至少記錄來源 ID、來源名稱、公開來源頁、實際 machine-readable endpoint、地理範圍、更新頻率、資料頻率、單位、存取限制、`LIVE`／`FALLBACK`／`STALE`／`NO_DATA`／`API_ERROR` 狀態、最後觀測日期、抓取時間與備註。DGBAS XML 失敗後的統計查詢 CSV 會以 `FALLBACK` 保留；CBC 60 筆頁失敗後的 20 筆頁也會以 `FALLBACK` 保留。

## 頻率感知的確定性模型

預設權重維持材料 25%、能源 15%、勞動 15%、匯率 15%、製造價格 20%、機械／資本代理 10%。權重只接受非負有限數字並正規化；缺失構面不以中性值補洞，可用構面才按實際權重重新正規化。最低證據門檻維持 3 個具備有效且可比較公開證據的構面。

比較窗口依來源頻率選擇，不跨頻率硬套：

| 資料頻率 | 可用窗口 | 不採用的方式 |
| --- | --- | --- |
| `daily`／`weekly` | 4 週、12 週 | 不把缺少交易日資料的空白補成假觀測 |
| `monthly` | 1 個月、3 個月、1 年 | 不把月資料標示成 4／12 週 |
| `annual` | 1 年、3 年 | 不把年資料轉為短期勞動方向 |
| `structural` | 不產生動能窗口 | 不把電價表或級距 JSON 轉成單一週變化 |
| `unknown` | 不產生比較 | 保留來源狀態但不進入分數 |

每一個有效比較窗口使用：

> `componentPressureScore = clamp(50 + 5 × comparableWindowChangePct, 0, 100)`

變化百分比是最新有效觀測相對於該頻率允許的歷史基準。方向門檻為大於 1% 的變化標示 `RISING`，小於 -1% 標示 `FALLING`，其餘為 `STABLE`。每個構面會同時保留相容的舊欄位 `change4WeekPct`、`change12WeekPct`，以及新的 `comparisonWindows[]` 與 `selectedComparisonWindow`；月資料的舊週欄位保持 `null`，避免 UI 或 API 消費者誤解。

若沒有適頻率的歷史基準，構面分數為 `null`；若有效構面數低於 3，綜合 `compositePressureScore`、`pressureLevel` 與 `trend` 都為 `null`，`dataQuality` 為 `DATA_INSUFFICIENT`。`STALE` 與 `FALLBACK` 觀測可以在證據門檻已滿足時保留並降低信心，但會在說明與 provenance 明確顯示；`NO_DATA` 與 `API_ERROR` 不進入分數。

## 公開歷史 persistence 與 last-known-good

Phase 2B 新增獨立的 `machining_public_observations` 公開資料表，以及 filesystem parity 的 `data/machining/public-observations.json` fallback。記錄鍵為 `sourceId + seriesId + observationDate`，只儲存公開觀測值、日期、頻率、狀態、來源 endpoint、抓取時間與 provenance。它不共用或改寫 `market_snapshots`，因此不改動既有原物料計算。

| 儲存情況 | 行為 |
| --- | --- |
| Postgres mode | 由既有 `db:migrate` 顯式建立表；以 source／series／date upsert，依 `LIVE > FALLBACK > STALE > API_ERROR > NO_DATA` 保留較可靠狀態 |
| Durable filesystem mode | 寫入既有 production storage root 下的 `machining/public-observations.json`，使用 atomic rename |
| 未配置 durable storage | 不在 production 靜默建立永久本地資料；回傳 `SKIPPED_NO_DURABLE_STORAGE`，不阻塞公開回應 |
| 即時來源暫時失敗 | 讀取同一 source／series 的 last-known-good 公開觀測；依年齡標示 `FALLBACK` 或 `STALE`，不標示 `LIVE` |

persistence 是 best-effort：資料庫或檔案儲存暫時失敗不應刪除或污染當次公開回應；若沒有可恢復歷史，仍保留 `API_ERROR` 或 `NO_DATA`。備份與既有原物料快照仍維持原有 public-only 邊界；本版本沒有執行 bootstrap、重跑排程或改動 production secrets。

## 頁面與 API

頁面 canonical URL 為 `/machining`，`/machining/` 可正常服務，內部 `/machining.html` 只作 308 redirect。加工頁維持獨立頁架構，不把加工內容嵌入原物料首頁。共用導覽只呈現目前已存在的兩頁：`原物料市場 → /` 與 `加工市場參考 → /machining`；Sheet Metal、Weekly、Sources 尚未建立，沒有假頁面。

頁面上的比較窗口使用「依資料頻率」的標籤。每個構面顯示狀態、適頻率變化、證據數、信心與來源沿革；結構性台電來源可列在 provenance，但不會產生加工電價或週動能。API 不含供應商名稱、公司內部價格、目標價格、勞動費率、循環時間或 CNC 購置價格欄位。

既有 `/api/market`、`/api/materials`、`/api/history`、週報、郵件、bootstrap、Render、GitHub Actions 及排程程式碼未被重設或重新執行。新增程式只在加工參考讀取時收集公開來源；來源與 persistence 狀態都 fail-soft 且可追溯。

## 驗證範圍

測試涵蓋 DGBAS PPI／薪資 XML 與官方 query CSV 正規化、`YYYYMM` 月薪解析、DGBAS fallback 順序、CBC 60 筆／20 筆頁 fallback、頻率窗口、last-known-good persistence、filesystem contract、權重設定、缺失／STALE 行為、最低證據門檻、來源沿革、三層資料契約、API 包裝及禁止私有／公司欄位。Phase 2B 新增 16 項 machining tests；完整 repository regression 必須以 `npm ci`、`npm run check`、`npm test`、`npm run build`、`npm audit --omit=dev` 與 `git diff --check` 驗證。

## References

[1]: https://data.gov.tw/en/datasets/148439 "Taiwan Open Government Data — Basic producer price index"
[2]: https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?funid=A030701015&sys=210 "DGBAS — Basic producer price index query"
[3]: https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?sys=210&funid=A046301010 "DGBAS — Monthly regular wage query"
[4]: https://www.cbc.gov.tw/en/lp-700-2.html "Central Bank of the Republic of China — NT$/US$ Closing Rate"
[5]: https://data.gov.tw/dataset/17060 "Taiwan Power Company — Electricity tariff schedules and calculation examples"
[6]: https://data.gov.tw/en/datasets/9663 "Taiwan Open Government Data — Monthly ordinary wages of each employee in recent years"
[7]: https://eng.stat.gov.tw/Point.aspx?sid=t.4&n=4203&sms=11713 "DGBAS — Monthly regular earnings of all employees indicator"
