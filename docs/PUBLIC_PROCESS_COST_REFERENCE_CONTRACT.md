# Public Process Cost Reference Contract

## 目的與邊界

本文件定義 machining 與 sheet-metal public monetary references 的唯一公開資料契約。其目的不是建立供應商報價資料庫，也不是把公開市場資料轉成公司內部費率；目的在於讓操作人員先看到**可追溯、可解釋、保留原始 pricing basis 的公開金額參考**，再把 pressure score 作為次級趨勢脈絡。所有 record 都保留來源網址、查核日期、地域範圍、包含與排除項目、confidence、source role 與單位。

`/estimate` 的內部工程成本估算仍是獨立的 browser-local workspace。`publicPriceReferences` 不會自動填入任何 internal rate、material rate、labor rate 或 process time，也不會送到 `/api/engineering/estimate`。公開 reference payload 仍保留 `engineeringEstimate: null`。

## Response shape

machining 與 sheet-metal API response 都保留原有 `state`、`generatedAt`、`reference`、`sourceCoverage` 與 `disclaimer`，並新增同值的 top-level `publicPriceReferences`，方便 UI 先渲染金額參考。`reference.publicPriceReferences` 是 canonical nested location；兩者必須一致，且由 model builder 執行 validator。

| 欄位 | 必要性 | 語意 |
|---|---:|---|
| `process` | 必要 | `CNC` 或 `SHEET_METAL` |
| `machineType` | 必要 | 明確製程／機台類型，例如 `CNC_3_AXIS_MILL`、`LASER_CUTTING`、`BENDING` |
| `material` / `thickness` | 可為 null | 雷射 direct table 時保留材料與板厚；CNC machine-hour reference 不虛構材料條件 |
| `priceMin` / `priceMax` / `priceOpenEnded` | 可為 null／boolean | 只有 accepted monetary source 才可有數值；`priceOpenEnded=true` 時保留 `priceMin` 且 `priceMax=null`，表示來源為「起」而非封頂；不代表最終 job quote |
| `currency` / `unit` | 必要／可為 null | 保留來源幣別與原始單位；`NO_PUBLIC_PRICE_DATA` 的 currency 可為 null；不跨單位平均 |
| `pricingBasis` | 必要 | 明確說明是 machine-hour、marketplace customer quote、per-meter listed fee 等 |
| `sourceName` / `sourceUrl` | 必要／依角色 | accepted monetary record 必須有公開 URL；`NO_PUBLIC_PRICE_DATA` 可沒有 URL |
| `checkedAt` / `geographicScope` | 必要 | 讓使用者知道來源查核時間與適用地域 |
| `includes` / `excludes` | 必要 | 明示包含與不包含項目，避免把材料、setup、margin 或 supplier contract price 誤讀進來 |
| `currencyEvidence` / `currencyEvidenceNote` | 必要 | `EXPLICIT` 表示來源頁明示幣別；`LOCALE_INFERRED` 表示台灣網站語境推定但頁面未明示；`UNKNOWN` 表示不適用或未確認。推定幣別不得以 `NT$` 顯示，且必須保留詢價提醒。 |
| `confidence` / `sourceRole` | 必要 | confidence 不是準確度承諾；source role 控制 UI 與審計語意 |
| `smallHoleFee*` | 可為 null | 只有來源明列時才填入；未明列不得推估 |

## Money-first hierarchy

頁面 DOM 與視覺排序固定為「公開加工金額參考」在前、「參考摘要」其次、「成本趨勢輔助」在後。金額 card 以明確的來源／單位／pricing basis 分組。當多筆來源具有相同製程、材料、板厚、單位與 pricing basis 時，UI 可顯示來源範圍與來源數，但這是**來源範圍**而不是 hidden average；不可把 `TWD/hr` 與 `TWD/min` 相加、換算後平均或混成單一 benchmark。

machining 目前保留四個台灣導向 machine-hour reference：3-axis mill `TWD 1,000–1,600/hr`、2-axis lathe `TWD 900–1,500/hr`、5-axis simultaneous mill `TWD 2,000+/hr`、turn-mill `TWD 1,800+/hr`。5-axis 與 turn-mill 的 record 使用 `priceOpenEnded=true`、`priceMax=null`，不把來源的 `3,500+`／`3,000+` 誤讀成封頂。另保留 PRO360 customer quote statistic `TWD 80–120/min`，明確標示為 marketplace quote statistic，不可與 machine-hour record 平均。[1][2]

sheet-metal 目前先展示可查證的 laser direct listed price。MINCA 的公開表列出黑鐵、不鏽鋼／鍍鋅與鋁的 per-meter price，並另列直徑 30 mm 以下圓孔費；仲凱公開服務頁列出 SS41、SUS304 與 AL6061 的 per-meter price，且明示少量／打樣與厚板另議。[3][4] 兩個 checked page 都沒有以 `TWD` 或 `NT$` 明示幣別，因此 records 保留數值但標記 `currencyEvidence=LOCALE_INFERRED`；UI 顯示「網站列示：20 / m」與「幣別：來源頁未明示（台灣網站語境推定，需詢價確認）」，不做 FX conversion。折彎、TIG、MIG／CO2 與點焊沒有被接受的現行台灣公開 monetary range，因此各自保留 `NO_PUBLIC_PRICE_DATA`，而不是用 pressure score 代替金額。

## Accepted and rejected source roles

| source role | 接受條件 | UI 語意 | 目前例子 |
|---|---|---|---|
| `DIRECT_VENDOR_LISTED_PRICE` | 公開頁直接列出材料／厚度／單位價格 | 可作 money card；仍非供應商對本公司的報價 | MINCA、仲凱雷射 |
| `MARKETPLACE_QUOTE_STATISTIC` | 平台公開說明為客戶收到的報價統計，保留原單位 | 可作獨立 reference，不得當機台成本 | PRO360 `TWD/min` |
| `INDUSTRY_MACHINE_HOUR_REFERENCE` | 公開 machine-hour table，明確機台類型與範圍 | 可作機台小時 reference，不含材料／setup／margin | 台灣CNC公開成本表 |
| `ACADEMIC_SERVICE_RATE` | 公開學術／設備服務收費，清楚標示適用對象與期間 | 只作 limited institutional reference，不作現行供應商基準 | 台大／成功大學頁面，須注意編碼、年份與適用範圍 |
| `PUBLIC_ESTIMATE_REFERENCE` | 只在來源明示為估算或模型參考時使用 | medium/low confidence；不得包裝成 quote | 目前僅作 contract extension role |
| `NO_PUBLIC_PRICE_DATA` | 沒有足夠可靠的現行 public monetary range | 顯示「公開金額資料不足」 | bending、TIG、MIG／CO2、spot welding |

成功大學設備借用頁的標題明示「收費至113年底」，且頁面表格標記為 110.10.13 會議討論；它是歷史設備借用費，不是現行 job-shop quote，因此在本契約中只作 rejected/limited-source audit evidence。[5] 台大頁面因 legacy encoding 與服務適用脈絡需要人工解讀，亦不被用來覆蓋 current supplier pricing。

## Source records and calculation prohibition

前端對 `currencyEvidence=EXPLICIT` 的 CNC open-ended record 顯示 `NT$ 2,000+ / hr`、`NT$ 1,800+ / hr`；對 `currencyEvidence=LOCALE_INFERRED` 的雷射 record 顯示 `網站列示：20 / m`，不把 `$` 或台灣 locale 推定包裝成 source-explicit NT$。API 仍保留原始 `currency`、evidence note、`TWD/hr`／`TWD/m` unit 與 machine-hour／per-meter basis，方便程式驗證與來源追溯。`priceOpenEnded=true` 且 `priceMin` finite、`priceMax=null` 是有效 monetary card，不得進入 no-data state。

本契約禁止以下行為：用 pressure score 直接當加工單價；將不同單位轉換後做未公開的平均；把 public machine-hour reference 加上材料、setup、人工或 margin 而產生「估算報價」；以舊頁面或搜尋摘要填補沒有公開價格的焊接／折彎 record；將台灣 vendor listed table 標示成公司或供應商對特定工件的 quote。公開 reference 也不會改變 market pressure component weights、minimum evidence 或 existing `engineeringEstimate=null` boundary。Daily execution success 亦不等同 data readiness：daily job 必須保存 freshness counts、`dataAsOf` 與 explicit readiness state，all-expired/all-NO_DATA 不得回報 `DAILY_DATA_READY`。

## Verification references

[1]: https://taiwancnc.org/%E5%8A%A0%E5%B7%A5%E6%88%90%E6%9C%AC%E5%85%AC%E5%BC%8F "台灣CNC產業權威：CNC加工成本公式大公開"
[2]: https://www.pro360.com.tw/price/cnc_milling "PRO360：CNC加工費用價格行情"
[3]: https://www.minca.tw/zh-TW/%E6%9C%80%E6%96%B0%E6%B6%88%E6%81%AF/laser-cutting-price "MINCA：雷射切割價格"
[4]: https://www.zhongkai-laser.com/services "仲凱雷射：雷射切割與折彎成型服務"
[5]: https://machineshop.ncku.edu.tw/p/405-1195-231113,c24466.php?Lang=zh-tw "成功大學機械工廠：工場設備借用計費標準"
