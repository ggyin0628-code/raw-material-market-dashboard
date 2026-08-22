# 公開資料來源契約

本契約定義 dashboard 可以使用的 **PUBLIC MARKET DATA**。產品永久限定為外部公開市場情報與採購參考，不接收供應商報價、公司採購數量、SAP、私人網路資料、合約條件或任何生產憑證；這些資料不屬於本產品，也不得透過未來功能混入資料層。

## 來源階層

| 資料類型 | 主要來源 | 公開備援 | 成功時的來源標籤 |
| --- | --- | --- | --- |
| 即時商品 quote | Yahoo Finance Chart API；依序嘗試 `query1.finance.yahoo.com` 與 `query2.finance.yahoo.com` | 僅對 registry 配置 `stooqSymbol` 的材料使用 Stooq CSV | `Yahoo Finance - ...` 或 `Stooq - ...` |
| 歷史商品資料 | Yahoo Finance Chart API | direct Yahoo history 失敗後，使用固定 `r.jina.ai` 公開代理讀取 Yahoo chart URL | `Yahoo Finance - ...` 或 `Yahoo Finance - ... via Jina` |
| 即時 USD/TWD | Yahoo Finance Chart API，symbol `TWD=X` | `https://open.er-api.com/v6/latest/USD` | `Yahoo Finance - USD/TWD` 或 `open.er-api.com - USD/TWD` |
| 最後公開快照 | 專案內 `market-seed.json` | 無其他人工資料層 | 使用時一律改標 `STALE`，並保留 seed timestamp |

所有 upstream host 都是程式碼中的固定 allowlist 或固定 URL，symbol 只接受 registry 中的值並作 URL encoding。使用者輸入不能指定任意 host、scheme 或 path，因此外部 fetch 不應被當成開放式 SSRF proxy。

## 狀態契約

| 狀態 | 意義 | UI／匯出要求 |
| --- | --- | --- |
| `OK` | 主要公開來源回傳可驗證且有限的數值 | 可標示即時公開資料，但仍必須保留來源與非供應商報價說明。 |
| `FALLBACK` | 主要來源失敗，配置的公開備援成功 | 必須顯示 fallback 來源與 fallback 狀態，不能標成 `LIVE`。 |
| `STALE` | 即時來源失敗，使用最後一次成功的真實快取或 bundled seed | 必須顯示最後成功時間、`STALE` 標籤與非即時說明。 |
| `NO_DATA` | 沒有可接受的即時或 stale row | 價格、TWD reference 與訊號不能用假值填補。 |
| `API_ERROR` | upstream HTTP、timeout、格式或正規化失敗 | API 回傳明確 error 狀態；UI 顯示資料來源錯誤，不得暗示報價可用。 |
| `LOADING` | 前端操作尚未完成 | 僅為暫態畫面狀態，不得作為已取得市場資料。 |

舊版輸入中的 `LIVE` 會在 shared data contract 先 canonicalize 成 `OK`；runtime 不會重新產生錯誤的 `LIVE`。對部分失敗的 snapshot，只有對應的最近成功 row 才能被 hydrated 為 `STALE`；沒有對應資料的 row 必須維持 `API_ERROR` 或 `NO_DATA`。

## Timeout、retry 與 rate limit

quote 與 FX 的 timeout 與 retry 都是 bounded，預設 quote timeout 為 5 秒、`MARKET_RETRIES` 為 2，因此單一 retry wrapper 最多執行三次 operation。歷史 Yahoo direct 與固定 Jina proxy 各有自己的 bounded retry；代理 timeout 上限同樣受限。上游 HTTP 非 2xx、JSON／CSV malformed、缺少有限價格與 timeout 都會進入明確 failure path。

程式不以失敗重試來繞過 rate limit，也不在 response 中偽造成功時間。外部來源是否即時可用是 operational dependency；公開 API 偶發不可用不構成可以補假資料的理由。

## 本次 live smoke 觀測

本次控制性觀測時間為 `2026-08-22T16:12:22.859Z` 至 `2026-08-22T16:14:49.865Z`，逐一檢查 14 個 registry materials 的 quote、history、主要／備援與失敗狀態。觀測結果如下：

| 指標 | 結果 |
| --- | ---: |
| registry materials | 14 |
| Yahoo primary quote 成功 | 10 |
| quote primary 失敗且 configured quote fallback 成功 | 0 |
| quote 無可用來源 | 4 |
| history 成功 | 14 |
| history direct primary | 11 |
| history 透過固定 Jina proxy | 3 |
| FX Yahoo primary | 失敗（timeout） |
| FX open.er-api fallback | 成功 |

quote 無可用的 4 個 symbol 是 `ALI=F`、`HRC=F`、`TIO=F` 與 `GC=F`；程式依真實觀測保留 unavailable／stale 行為，沒有擅自替換 symbol。history 14 個材料均取得資料，其中 3 個需要歷史公開代理。這些 live 結果只描述觀測時刻，不能保證未來每次 request 都成功。

## 資料邊界

任何 source failure 都不會產生台灣現貨價、供應商價、含稅含運價、合約價或 confirmed purchase instruction。TWD 只是依 source unit 與公開 FX 換算的 market-reference value；完整公式見 [`PRICE_UNIT_CONTRACT.md`](PRICE_UNIT_CONTRACT.md)。
