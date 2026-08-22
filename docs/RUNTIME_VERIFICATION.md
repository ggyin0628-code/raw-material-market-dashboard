# 執行期與驗證紀錄

本文件記錄本次 hardening 的可重現驗證。所有 deterministic test 都 mock 外部 fetch；live smoke 則另行觀測目前配置的 PUBLIC MARKET DATA。兩者不可混為一談：前者證明程式契約與 failure handling，後者只代表觀測時間的外部來源可用性。

## 驗證命令

```bash
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
```

預期的 `npm test` 是 Node 內建 test runner 的 15 個 deterministic tests；`npm run check` 與 `npm run build` 都執行 Node syntax checks，保持 CommonJS 與最小工具鏈。`npm audit --omit=dev` 用來檢查 production dependency tree。

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

## Fresh clone

fresh clone 必須只來自 GitHub 的 authoritative feature branch，依序執行 `npm ci`、`npm run check`、`npm test`、`npm run build`，再啟動本機服務檢查 `/health` 與 deterministic/mock-supported runtime path。完成 fresh clone 後，將 exact commit、HTTP 結果與 working tree 狀態補入本文件與 [`HANDOFF.md`](../HANDOFF.md)。
