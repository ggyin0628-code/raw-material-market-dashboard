# Phase 4A Engineering Estimate Foundation V1

**文件狀態：`FEATURE_BRANCH_READY_FOR_REVIEW` 候選文件；不得據此推進 `main`。**
**功能分支：`feat/engineering-estimate-foundation-v1`**
**作者：Manus AI**
**範圍：無狀態、純確定性的 `SHEET_METAL` 工程估算基礎層

## 1. 目的與非目的

Phase 4A 建立一條與既有公開市場參考完全分離的新資料鏈：

> `ENGINEERING_INPUT → PHYSICAL_CALCULATION → PROCESS_WORKLOAD → ENGINEERING_ESTIMATE`

它只把使用者明確提供的鈑金幾何、材料與製程條件轉為物理量、製造工作量、公式追溯與可解釋的成本結構。此層不讀取資料庫、不讀取公司或供應商資料、不呼叫既有市場 API，也不將市場壓力分數轉成價格。

既有市場資料鏈維持如下：

> `OBSERVED_PUBLIC_DATA → DERIVED_MARKET_REFERENCE`

因此 `/`、`/machining`、`/sheet-metal` 及既有 market API 的語義不因 Phase 4A 改變；它們的 `engineeringEstimate` 維持 `null`。Phase 4A 只新增獨立的 `/estimate` 頁面與 `/api/engineering/estimate` API。

| 項目 | Phase 4A 行為 |
| --- | --- |
| 已實作製程家族 | 僅 `SHEET_METAL` |
| 幾何 | 只接受明確的矩形毛坯長度、寬度與材料厚度；不推導缺失尺寸 |
| 物理量 | 面積、體積、單件質量、理論總毛坯質量、材料調整後總質量 |
| 工作量 | 切割長度、穿孔次數、折彎次數、焊接長度、表面處理面積、批次量 |
| 預設成本模式 | `NO_RATE`；金額欄位全部為 `null` |
| 測試成本模式 | `SYNTHETIC_TEST`；只接受顯式 fixture rate，明確標為測試／示範 |
| 市場耦合 | 禁止；`marketReference` 與 `marketAdjustmentFactor` 均為 `null` |
| 儲存 | 無狀態；不新增資料表、不新增 migration、不寫入市場觀測資料 |
| 供應商／公司資料 | 不接受、不載入、不推估 |

## 2. 嚴格輸入契約

頂層輸入必須為 JSON object，且只可使用 `processFamily`、`material`、`blank`、`cutting`、`bending`、`welding`、`surfaceTreatment`、`setup`、`materialUtilizationPct`、`scrapPct` 與 `rateProfile`。未知頂層欄位或任何受控巢狀物件欄位都回傳結構化 `UNEXPECTED_FIELD` 錯誤；不會靜默忽略欄位。

材料區塊要求 `materialFamily` 與 `thicknessMm`。`grade` 可為字串或 `null`，但系統不會從材料家族或其他欄位猜測牌號。`densityKgM3` 可由使用者覆寫；材料家族為 `OTHER` 時密度必須明確提供。矩形毛坯要求 `lengthMm`、`widthMm` 與正整數 `quantity`。`setup.batchCount` 必須為正整數，且不得大於數量。

每一個製程區塊都必須明確提供 `enabled` 布林值。當製程啟用時，所需工作量欄位必須存在；停用時，該製程工作量不會被計入。切割要求 `cutLengthMmPerPart` 與 `pierceCountPerPart`；折彎要求 `bendCountPerPart`；焊接要求 `weldLengthMmPerPart`；表面處理要求 `treatedAreaMm2PerPart`。`surfaceTreatment.treatmentType` 可為字串或 `null`，它是標籤而不是價格或工藝推導來源。

所有尺寸、工作量、密度與率值都必須是有限數字。厚度、長度與寬度必須大於零；數量、批次數與啟用製程的工作量不能為負。穿孔、折彎與批次數必須為整數。輸入同時提供 `materialUtilizationPct` 與 `scrapPct` 時回傳 `MUTUALLY_EXCLUSIVE`；兩者都省略時不假設排版效率或隱藏損耗。

## 3. 單位與物理計算

本功能在輸入與輸出中使用毫米、平方毫米、立方毫米、公尺、平方公尺與公斤。公尺與公斤是 SI 基本單位，面積與體積是由基本單位推導的量；NIST 對 SI 基本單位及平方／立方導出單位有明確說明。[1] NIST 亦將立方公尺列為體積的 SI 單位，並列出立方毫米與立方公分的十進位換算關係。[2]

| 結果欄位 | 公式 | 輸出單位 |
| --- | --- | --- |
| `blankAreaMm2` | `lengthMm × widthMm` | `mm²` |
| `blankVolumeMm3` | `blankAreaMm2 × thicknessMm` | `mm³` |
| `blankMassKgPerPart` | `blankVolumeMm3 × densityKgM3 ÷ 1,000,000,000` | `kg/part` |
| `theoreticalTotalBlankMassKg` | `blankMassKgPerPart × quantity` | `kg` |
| `totalMaterialMassKg` | `theoreticalTotalBlankMassKg ÷ utilizationRatio` | `kg` |

質量換算中的 `1,000,000,000` 是因為 `1 m³ = 1,000,000,000 mm³` 的十進位單位換算。計算結果在回傳前做固定小數位四捨五入，但計算順序固定且不依賴時間、隨機值、資料庫或網路狀態。

### 3.1 密度語義

使用者明確傳入的 `densityKgM3` 優先於任何預設。若只提供基本材料家族而未提供密度，程式可使用下列已文件化的 `ENGINEERING_DEFAULT`：

| `materialFamily` | 預設密度 `kg/m³` | 語義 |
| --- | ---: | --- |
| `CARBON_STEEL` | 7850 | 廣義工程預設 |
| `STAINLESS_STEEL` | 8000 | 廣義工程預設 |
| `ALUMINUM` | 2700 | 廣義工程預設 |
| `COPPER` | 8960 | 廣義工程預設 |
| `OTHER` | 無 | 必須由使用者提供 |

這些數值是本專案為 Phase 4A 定義的可覆寫廣義工程假設，不是特定牌號的認證材料性質、供應商證書值或公司製程標準。回應中的 `densitySource` 會區分 `USER_INPUT` 與 `ENGINEERING_DEFAULT`，並在使用預設時加入警告。

### 3.2 材料利用率與損耗

若提供 `materialUtilizationPct = u`，則：

```text
utilizationRatio = u / 100
總材料質量 = 理論毛坯總重 / utilizationRatio
```

若改提供 `scrapPct = s`，則：

```text
utilizationRatio = 1 - s / 100
總材料質量 = 理論毛坯總重 / utilizationRatio
```

兩者互斥，且利用率必須大於零、不得高於 100%；損耗率必須大於或等於零且小於 100%。兩者皆未提供時 `utilizationRatio = 1`，`totalMaterialMassKg` 等於理論毛坯總重，並明確警告未假設隱藏排版效率或損耗。系統不會自行加入 nesting、板材利用、餘料、刀縫或安全餘量。

## 4. 製程工作量與批次

工作量只做使用者輸入值的單位換算與數量展開，不從幾何外形推算刀路、孔位、折彎補償、焊道或表面處理面積。

| 結果欄位 | 公式 | 輸出單位 |
| --- | --- | --- |
| `totalCutLengthM` | `cutLengthMmPerPart × quantity ÷ 1000` | `m` |
| `totalPierceCount` | `pierceCountPerPart × quantity` | `each` |
| `totalBendCount` | `bendCountPerPart × quantity` | `each` |
| `totalWeldLengthM` | `weldLengthMmPerPart × quantity ÷ 1000` | `m` |
| `totalTreatedAreaM2` | `treatedAreaMm2PerPart × quantity ÷ 1,000,000` | `m²` |
| `quantityPerBatch` | `quantity ÷ batchCount` | `part/batch` |

停用的製程輸出為零，即使停用區塊附帶工作量值，也不會計入結果。批次量允許為小數，因為它是數量除以批次數的衍生結果；`batchCount` 本身仍為正整數。

## 5. 成本模式與貨幣邊界

預設或未提供 `rateProfile` 時，回應的 `rateProfile.mode` 為 `NO_RATE`，來源標記為 `NO_RATE / 未載入公司成本參數`。`costBreakdown` 中的材料、切割、穿孔、折彎、焊接、表面處理、設定、總估算、單件估算與貨幣欄位全部為 `null`。這不是零成本，也不是市場價格；它表示本階段沒有可合法使用的成本率。

`SYNTHETIC_TEST` 只可使用顯式提供的 fixture rate 欄位，包括每公斤材料率、每公尺切割率、每次穿孔率、每次折彎率、每公尺焊接率、每平方公尺表面處理率與每批次設定率。它只用於 deterministic test 或 demo，不是 production UI 預設，不是公司成本，不是供應商報價，也不是任何市場交易價格。來源標記固定為 `SYNTHETIC / DEMO / TEST ONLY`，UI 不提供 production synthetic rate 輸入。

`PRIVATE_CALIBRATED` 在契約中只作未來保留名稱，目前會被拒絕；Phase 4A 不接受私人、公司或供應商 rate。`NO_RATE` 也不接受任何 rate 欄位，以防止呼叫端在模式標記與數值內容間形成歧義。

## 6. 公式追溯與回應結構

每次成功估算都回傳 `estimateMode`、`processFamily`、`physical`、`workload`、`rateProfile`、`costBreakdown`、`formulaTrace`、`warnings`、`marketReference`、`marketAdjustmentFactor` 與 `disclaimer`。`formulaTrace` 對每一個主要輸出保留欄位名稱、公式文字、輸入值、單位轉換、結果與輸出單位，讓前端可以用 expandable details 呈現，不需要重新解釋或複製計算。

成功回應中的兩個市場欄位固定為：

```json
{
  "marketReference": null,
  "marketAdjustmentFactor": null
}
```

它們不是待填入的市場 multiplier 介面。若未來要提供市場脈絡，也必須另訂只讀、不可進入成本計算的契約與權限邊界。

## 7. HTTP API 與頁面

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| `GET` | `/estimate` | canonical 工程估算頁 |
| `GET` | `/estimate/` | canonical page 的安全 alias |
| `GET` | `/estimate.html` | `308` 導向 `/estimate`；保留內部靜態檔名但不作 user-facing URL |
| `GET` | `/api/engineering/estimate/schema` | 回傳嚴格輸入、單位、rate mode 與輸出契約 metadata |
| `POST` | `/api/engineering/estimate` | 只接受 `Content-Type: application/json` 的明確輸入，成功回傳估算或結構化驗證錯誤 |

估算 endpoint 的 request body 上限為 256 KiB。未知方法、錯誤 Content-Type、無效 JSON、超過 body 上限、未知製程家族、零／負值、缺少啟用製程輸入、無效密度、未知欄位與非法 rate mode 都會保留明確錯誤，不會產生部分估算。既有 GET-only 市場與靜態路由仍拒絕 POST；engineering POST 不會放寬既有 API。

回應錯誤採用 `state = "VALIDATION_ERROR"`、`generatedAt`、`errors[]` 與 disclaimer。每個錯誤至少含 `path`、`code` 與 `message`，例如 `input.blank.lengthMm`、`OUT_OF_RANGE`。這使 UI 能按欄位顯示問題，也讓測試能穩定驗證契約，而不必依賴自然語言全文。

## 8. 使用者介面與安全標示

`/estimate` 是獨立的 Traditional Chinese 工程估算頁，顯示並固定標示：**工程估算**、**非供應商報價**、**未載入公司成本參數**。使用者可填寫材料、毛坯、切割、折彎、焊接、表面處理、利用率／損耗與批次條件；預設頁面只送 `NO_RATE` 估算。結果區分物理量、製程工作量、成本結構、警告與「公式與計算依據」展開區。NO_RATE 的金額以 null 語義顯示，不顯示為零，不顯示 synthetic fixture rate，也不把市場 score 轉成價格。

頁面採獨立 HTML/CSS/JS，不把工程輸入嵌入首頁、加工市場頁或鈑金市場頁。導覽只新增一個已實作的 `工程估算 → /estimate` 連結；不存在假的 future page。

## 9. 測試與驗證要求

Phase 4A deterministic suite 包含公式、單位換算、密度優先順序、利用率／損耗互斥、停用製程、批次分配、NO_RATE 全 null、SYNTHETIC_TEST 固定成本、公式 trace、strict validation、schema GET、POST 成功與錯誤、Content-Type、方法 gate、canonical routing、legacy redirect、mobile CSS contract、navigation contract 與 market isolation。既有 machining、sheet-metal 與 raw-material 回歸測試仍必須通過。

在本文件建立時，聚焦工程測試為 10 項，完整 repository suite 為 93 項且 0 failed；最終 gate 仍須重新執行 `npm ci`、`npm run check`、`npm test`、`npm run build`、`npm audit --omit=dev` 與 `git diff --check`。本文件中的測試數字不是替代最終 gate 的承諾值；交接時應以最後一次完整執行輸出為準。

## 10. 生產與資料隔離

Phase 4A 不執行部署、不推進 `main`、不執行 migration、不觸發 GitHub Actions、不執行 bootstrap、daily、weekly、backfill、mail、Gmail、schedule、secret 或 Neon 操作。既有 Render 服務仍跟隨 `main`，本分支只做本地檢查與視覺審查。

既有 market API 的 `engineeringEstimate=null` 是隔離回歸條件，而不是缺漏。工程 estimate 不會反向寫入 market snapshot、public observation store、weekly report 或任何資料庫；同樣地，market score 不會反向調整工程成本。

## 11. Phase 4B 候選缺口

Phase 4B 若要擴充，必須另行審查並維持本文件的邊界。候選工作包括非矩形或多輪廓幾何、孔／缺口扣除、實際 nesting 與餘料模型、板材規格與厚度公差、材料證書密度、製程時間模型、機台能力與工藝限制、setup／換線時間、批量折扣、公司內部 rate 的權限與版本管理、供應商報價輸入、幣別／稅／運費／交期，以及與 ERP 或採購流程的權限隔離。

這些項目在 Phase 4A 均刻意未實作。特別是市場 API 與工程成本之間沒有 multiplier；任何未來整合都必須提供獨立版本化契約、審計軌跡、資料來源標示、權限控制與明確的估算／報價區隔，不能透過目前的 `marketReference` 或 `marketAdjustmentFactor` 直接接線。

## References

[1]: https://www.nist.gov/pml/owm/metric-si/si-units "NIST — SI Units"

[2]: https://www.nist.gov/pml/owm/si-units-volume "NIST — SI Units: Volume"

[3]: https://www.nist.gov/pml/owm/si-units-mass "NIST — SI Units: Mass"
