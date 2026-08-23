# Phase 2A：CNC／一般加工公開市場參考 V1

## 目的與產品邊界

本功能是 **外部公開市場情報與採購參考層**。它回答「相對近期可比較觀測，加工成本壓力目前偏上升、下降或穩定」；它不回答任何供應商應報多少錢，也不輸出每小時加工費、循環時間、公司目標價或採購核決。

頁面與 API 會明確標示「公開市場參考」、「非供應商報價」及「非公司目標價格」。V1 的工程估算層保持關閉，所有可見分數都必須回溯到外部公開觀測、比較窗口、來源狀態與明確權重。

## Phase 1：台灣優先公開來源可行性稽核

### 來源覆蓋總覽

| 驅動群組 | V1 來源 | URL／端點 | 地理範圍 | 更新頻率 | 單位 | 授權／存取限制 | V1 狀態規則 | 資料層 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 原材料趨勢 | 既有公開 Yahoo Finance／Stooq 指標：銅、鋁、熱軋鋼捲、WTI、天然氣 | 既有 registry；Yahoo chart 與 Stooq CSV 公開端點 | 國際公開市場指標 | 交易日／資料可得時 | 依指標而定，例如 USD/lb、USD/metric ton、USD/barrel | 來源可用性、符號及網站條款可能變更；不代表台灣現貨 | Yahoo 成功為 LIVE；既有 adapter 的公開備援為 FALLBACK；既有快取可標 STALE；無資料為 NO_DATA；請求或解析失敗為 API_ERROR | OBSERVED_PUBLIC_DATA |
| 能源／公用事業 | DGBAS「生產者物價基本分類指數」中的「四.水電燃氣」；WTI／天然氣沿用既有公開指標 | [資料集頁][1]；XML [pr0701a1m.xml][2] | Taiwan；WTI／天然氣為國際公開指標 | DGBAS 每月；市場指標為交易日 | DGBAS 指數（民國110年=100）；市場指標依指標而定 | DGBAS 資料集免費，Open Government Data License 1.0；市場來源依各網站條款 | XML 有可解析值且在新鮮度門檻內為 LIVE；來源過舊為 STALE；無可解析序列為 NO_DATA；抓取／解析錯誤為 API_ERROR | OBSERVED_PUBLIC_DATA；窗口變化為 DERIVED_MARKET_REFERENCE |
| 勞動／製造業薪資 | DGBAS「每人每月經常性薪資」製造業欄位 | [資料集頁][3]；XML [mp05002.xml][4] | Taiwan | 資料集頁面標示每年一月 | 新臺幣元／人／月 | 免費，Open Government Data License 1.0；資料集含統計範圍與歷史修訂說明 | XML 可取得為 LIVE；過舊為 STALE；無製造業欄位為 NO_DATA；抓取／解析錯誤為 API_ERROR。由於 V1 不把年度值硬轉成 4／12 週方向，若沒有可比較窗口，勞動構面保留來源但不產生壓力分數 | OBSERVED_PUBLIC_DATA；若未來採用年度變化，該變化為 DERIVED_MARKET_REFERENCE |
| 製造業價格 | DGBAS「三.製造業產品」生產者物價指數 | [資料集頁][1]；XML [pr0701a1m.xml][2] | Taiwan | 每月 | 指數（民國110年=100） | 免費，Open Government Data License 1.0；XML 公開下載 | 同 DGBAS PPI：LIVE／STALE／NO_DATA／API_ERROR | OBSERVED_PUBLIC_DATA；窗口變化為 DERIVED_MARKET_REFERENCE |
| USD/TWD | 中央銀行 NT$/US$ Closing Rate | [官方歷史清單][5] | Taiwan official NTD/USD | 營業日 | NTD／USD | 公開 HTML 歷史清單與分頁；需遵守來源網站使用條款 | 可解析日列為 LIVE；最近觀測超過營業日新鮮度門檻為 STALE；頁面沒有可解析列為 NO_DATA；抓取／解析錯誤為 API_ERROR | OBSERVED_PUBLIC_DATA；窗口變化為 DERIVED_MARKET_REFERENCE |
| 機械／資本成本代理 | DGBAS PPI 中「18.機械設備」公開系列 | [資料集頁][1]；XML [pr0701a1m.xml][2] | Taiwan | 每月 | 指數（民國110年=100） | 免費，Open Government Data License 1.0；只作設備價格代理，不是機台購置價 | 同 DGBAS PPI：LIVE／STALE／NO_DATA／API_ERROR | OBSERVED_PUBLIC_DATA；窗口變化為 DERIVED_MARKET_REFERENCE |
| 電價人工核對候選 | 台灣電力公司 Rate Schedules 官方 PDF | [Rate Schedules 頁][6]；[官方 PDF][7] | Taiwan 電價級距 | 修訂／事件驅動 | 依電價表級距而定 | 官方 PDF 公開下載；需以最新版本與適用級距人工確認。V1 不把未解析 PDF 表格值轉成數字 | V1 明確標為 NO_DATA（可行性／人工核對來源）；不因 PDF 存在而發明電價 | OBSERVED_PUBLIC_DATA 僅在未來可靠解析具體級距後啟用 |

DGBAS 的政府資料開放平台明確描述 PPI 基本分類涵蓋製造產品及水、電、燃氣，資料集頁面標示每月更新、免費及 Open Government Data License 1.0；因此 V1 優先採用同一個機器可讀 XML 作為台灣製造、能源、公用事業、基本金屬及機械設備代理的公共來源。[1] [2] 另一方面，勞動來源雖然具備製造業欄位及清楚的單位，但資料集頁面標示每年一月更新，所以 V1 對它採取保守策略：保留觀測與來源沿革，不把年度資料冒充短期加工成本方向。[3] [4]

中央銀行頁面提供日期與 NTD/USD 收盤值的公開歷史清單，適合支援營業日匯率壓力觀察；這個序列表達的是外幣投入的相對方向，不是供應商報價條件。[5] 台電官方費率表則是有價值的人工核對候選，但 PDF 的級距、時段與適用條件不應在沒有可靠解析與版本確認時被轉成數值；因此 V1 將它列為 NO_DATA／feasibility-only，不阻塞其他安全工作。[6] [7]

### 公開來源障礙與剩餘缺口

目前最可靠的短期覆蓋來自既有國際金屬／能源公開指標、DGBAS 月度 PPI 與中央銀行營業日匯率。勞動成本公開資料的主要缺口是可用頻率不足，無法在 V1 嚴格支持 4 週／12 週方向；台電費率表的主要缺口是官方 PDF 需要依電壓、時段、契約條件正確解析，V1 不以未解析表格冒充數據；台灣本地 CNC 供應商實際加工單價沒有可安全泛化的公開官方序列，故本功能不聲稱能知道該價格。

## Phase 2：資料契約

API 的主資料物件包含 `referenceDate`、`region`、`machiningType`、`materialFamily`、六個壓力構面、`compositePressureScore`、`pressureLevel`、`trend`、`confidence`、`dataQuality`、`sourceProvenance[]`、`explanation[]`、`disclaimer`，並把三層資料明確拆開：

| 層級 | 含義 | V1 行為 |
| --- | --- | --- |
| `OBSERVED_PUBLIC_DATA` | 外部來源實際觀測，例如 PPI、薪資、匯率、公開金屬／能源歷史列 | 只保留來源值、觀測日期、單位、來源狀態與 URL；不把觀測值改寫成供應商價格 |
| `DERIVED_MARKET_REFERENCE` | 只由公開觀測與設定規則計算出的窗口變化、壓力分數、等級與方向 | 顯示公式、權重、最低證據數、可用構面與說明，確保每一項可回溯 |
| `ENGINEERING_ESTIMATE` | 若未來需要，才在公開文件化模型與工程輸入完整後提供的透明估算 | V1 固定為 `null`，不估算時薪、循環時間、機台費或供應商報價 |

每個構面都是帶有 `pressureScore`、`pressureLevel`、`trend`、`direction4Week`、`direction12Week`、窗口變化百分比、`evidenceCount`、`confidence`、`dataQuality`、`sourceProvenance[]` 與 `explanation[]` 的物件。來源沿革記錄來源名稱、URL、地理範圍、更新頻率、單位、存取限制、`LIVE`／`FALLBACK`／`STALE`／`NO_DATA`／`API_ERROR` 狀態及最後觀測日期。

## Phase 3：確定性參考模型

V1 使用可配置的預設權重：材料 25%、能源 15%、勞動 15%、匯率 15%、製造價格 20%、機械／資本代理 10%。權重會在程式中驗證為非負值並正規化；每個壓力構面若缺少可比較的 4 週或 12 週歷史，就不產生構面分數，也不會以中性值補洞。

對每個可用觀測，模型計算最近值相對於約 28 日及 84 日前可得值的百分比變化。壓力分數使用透明公式：

> `componentPressureScore = clamp(50 + 5 × comparableWindowChangePct, 0, 100)`

分數低於 25 為 `LOW`，25 至未滿 50 為 `NORMAL`，50 至未滿 75 為 `ELEVATED`，75 以上為 `HIGH`。方向門檻為窗口變化大於 1% 代表 `RISING`，小於 -1% 代表 `FALLING`，其餘為 `STABLE`。綜合分數只使用具有效公開證據且權重大於零的構面，並按實際可用權重重新正規化。

最低證據門檻預設為 3 個具備有效可比較歷史的構面。若未達門檻，`compositePressureScore`、`pressureLevel` 與 `trend` 都是 `null`，`dataQuality` 為 `DATA_INSUFFICIENT`；API 與頁面會顯示「未產生綜合分數」，不以假數字維持版面。`STALE` 與 `FALLBACK` 不會被靜默移除，而會降低信心並在說明中標示；`NO_DATA` 與 `API_ERROR` 會保留來源狀態且不進入分數。

## Phase 4：頁面與 API

V1 新增 `/machining.html` 與 `GET /api/machining/reference`。頁面提供整體加工成本壓力、材料、能源、勞動、匯率、製造價格及機械／資本代理六個構面；每個構面都顯示分數、壓力等級、資料品質、4 週／12 週方向、證據數及信心。頁面另外顯示整體參考日期、最低證據門檻、來源沿革與純文字解釋，並與既有看板共用色彩變數與行動版布局。

既有 `/api/market`、`/api/materials`、`/api/history`、週報、郵件、bootstrap、Render、GitHub Actions 及排程程式碼沒有被重新設計或重跑。新頁面只在使用者開啟或按下更新時呼叫新的公開來源組合；沒有部署、寄信、重跑 bootstrap、修改排程或變更 production secrets。

## 驗證範圍

測試涵蓋 DGBAS PPI／薪資 XML 與中央銀行 HTML 正規化、確定性壓力計算、權重設定、缺失／STALE 行為、最低證據門檻、來源沿革、三層資料契約、API 包裝及禁止私有／公司欄位。完整檢查命令依交接紀錄執行：`npm ci`、`npm run check`、`npm test`、`npm run build`、`npm audit --omit=dev` 與 `git diff --check`。

## References

[1]: https://data.gov.tw/en/datasets/148439 "Taiwan Open Government Data — Basic producer price index"
[2]: https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230534/pr0701a1m.xml "DGBAS Basic producer price index XML"
[3]: https://data.gov.tw/en/datasets/9663 "Taiwan Open Government Data — The monthly ordinary wages of each employee in recent years"
[4]: https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230037/mp05002.xml "DGBAS ordinary wage XML"
[5]: https://www.cbc.gov.tw/en/lp-700-2.html "Central Bank of the Republic of China — NT$/US$ Closing Rate"
[6]: https://www.taipower.com.tw/2764/2765/2801/56429/normalPost "Taiwan Power Company — Rate Schedules"
[7]: https://www.taipower.com.tw/media/vqplk13w/20251124_TAIWAN%20POWER%20COMPANY%20RATE%20SCHEDULES.pdf?mediaDL=true "Taiwan Power Company Rate Schedules PDF"
