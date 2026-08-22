# 價格與單位契約

本契約說明 dashboard 如何從公開市場 quote 產生 TWD 市場參考值。所有數值都保留原始 `source unit` 與 `currency`；TWD 欄位只代表以公開 USD/TWD 換算後的同一市場單位參考，不代表台灣供應商的交貨價格。

## 標準計算鏈

```text
market quote
  → source unit
  → USD normalization by conversionFactor
  → valid USD/TWD FX rate
  → displayed TWD market-reference value
```

即時與歷史資料採用同一個基本公式：

```text
twdReference = sourcePrice × conversionFactor × usdTwdRate
```

若 `sourcePrice`、`conversionFactor` 或 `usdTwdRate` 不是有限數字，結果是 `null`，不能以 0、空字串、舊錯誤匯率或人工估計補值。歷史資料的 FX 會採用同日或 nearest-prior 的有效 FX；若同日與 prior 均不可用，才依既有實作使用最早可用 FX point。沒有任何有效 FX 時，該歷史 row 不應被標成可換算的 TWD。

## Registry 單位

| 材料 | 原始單位 | Currency | conversionFactor | 正規化解讀 |
| --- | --- | --- | ---: | --- |
| 銅 | `USD/lb` | USD | 1 | 已是 USD/lb。 |
| 鋁 | `USD/metric ton` | USD | 1 | 已是 USD/metric ton。 |
| 熱軋鋼捲 | `USD/short ton` | USD | 1 | 已是 USD/short ton。 |
| 鐵礦砂 | `USD/metric ton` | USD | 1 | 已是 USD/metric ton。 |
| WTI 原油 | `USD/barrel` | USD | 1 | 已是 USD/barrel。 |
| Brent 原油 | `USD/barrel` | USD | 1 | 已是 USD/barrel。 |
| 天然氣 | `USD/MMBtu` | USD | 1 | 已是 USD/MMBtu。 |
| 黃金 | `USD/troy oz` | USD | 1 | 已是 USD/troy oz。 |
| 白銀 | `USD/troy oz` | USD | 1 | registry 的 source unit 已是 USD/troy oz；Stooq quote factor 僅由 fallback adapter 依實際輸入處理。 |
| 鉑金 | `USD/troy oz` | USD | 1 | 已是 USD/troy oz。 |
| 玉米 | `US cents/bushel` | USD | 0.01 | 先將美分數值乘以 0.01 成為 USD/bushel。 |
| 黃豆 | `US cents/bushel` | USD | 0.01 | 先將美分數值乘以 0.01 成為 USD/bushel。 |
| 咖啡 | `US cents/lb` | USD | 0.01 | 先將美分數值乘以 0.01 成為 USD/lb。 |
| 棉花 | `US cents/lb` | USD | 0.01 | 先將美分數值乘以 0.01 成為 USD/lb。 |

## 不可直接互比的單位

`USD/lb`、`USD/metric ton`、`USD/short ton`、`USD/barrel`、`USD/MMBtu`、`USD/troy oz`、`US cents/bushel` 與 `US cents/lb` 不是同一種物理或合約單位。程式不會把它們當成同一個市場籃子，也不會未經明確證據加入 pound、ton、barrel、MMBtu、troy ounce、bushel 或台灣採購交貨單位之間的轉換。

因此，畫面上的 `TWD 34,604.38 市場參考值` 仍然必須與原始 `USD/short ton` 一起解讀；它不是每公斤、每台斤、每片材、每桶到廠價或含稅含運價。需要台灣供應商採購單位的下一層系統，必須另提供經業務確認的單位與交貨條件契約，而不是猜測。

## 測試保證

離線測試明確驗證了玉米 `450 × 0.01 × 32 = 144`、銅 `6.25 × 1 × 32 = 200`、缺失 FX 產生 `null`、字串價格被拒絕，以及 Stooq cents-to-USD normalizer。歷史測試也驗證 nearest-prior FX alignment、日期 row 計算與月均價 reproducibility。
