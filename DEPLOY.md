# 公開網站部署方式

本系統是需要 Node.js 後端的 **公開市場資料 Web Service**，不能只部署 `index.html` 與靜態檔案。後端會依請求取得 Yahoo Finance、Stooq、Jina 公開代理或 open.er-api.com 的資料；外部來源暫時不可用時，服務會依契約顯示 `FALLBACK`、`STALE`、`NO_DATA` 或 `API_ERROR`，不會補假價格。

## 建議部署設定

Render、Railway、Fly.io 或公司自己的 Linux／Windows Node 主機皆可使用，前提是支援 Node.js 20 以上、可執行 `npm start`，並允許服務連到已配置的公開來源。Render manifest 位於 [`render.yaml`](render.yaml)。

| 設定 | 值 |
| --- | --- |
| Runtime | Node.js 20 或以上 |
| Install／Build | `npm ci`；若平台只接受 build command，可使用 `npm ci` 或 `npm run build`，但正式啟動前應已完成依賴安裝。 |
| Start command | `npm start` |
| Health check | `/health` |
| Host | 應由平台提供的 `HOST`；未指定時程式預設 `0.0.0.0`。 |
| Port | 使用平台提供的 `PORT`；未指定時預設 `4173`。 |
| Secrets | 本專案目前不要求 API key；不要把公司憑證、supplier data 或私人 endpoint 放入 repository。 |

部署前請從乾淨 checkout 執行：

```bash
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
```

## 部署後檢查

先確認健康端點：

```text
https://你的網址/health
```

成功時應得到 HTTP 200 與類似以下內容：

```json
{
  "status": "OK"
}
```

接著檢查：

```text
https://你的網址/api/market
https://你的網址/api/materials
https://你的網址/api/history?symbol=HG%3DF&period=1y
https://你的網址/api/export/excel?symbol=HG%3DF&period=1y
```

`/api/market` 或 `/api/materials` 的 `state` 可以是 `OK`、`FALLBACK`、`STALE`、`NO_DATA` 或 `API_ERROR`；這些是資料可用性的真實狀態，不代表服務程序掛掉。外部公開來源的暫時 timeout 不應被誤判為產品可以自行提供即時報價。

## 快取與執行期注意事項

fresh cache 預設 TTL 是 15 分鐘，stale cache 預設 TTL 是 24 小時。只有至少 70% 的 row 是有限數值且狀態為新鮮 `OK`／`FALLBACK` 時，snapshot 才會被儲存成 fresh cache。stale 結果會保留最近成功時間並在 UI 與 XLSX 中標明 `STALE`。

cache 與 logs 都寫在專案根目錄下的 ignored 目錄；路徑由模組位置解析，不依賴平台啟動時的 current working directory。正式平台應確認檔案系統是否為 ephemeral；若服務重啟後清除 local cache，程式仍會依 bundled `market-seed.json` 或公開來源決定結果，但不能保證 seed 永遠是即時資料。

## 公開可見性與資料邊界

本次稽核未變更 repository visibility，也未部署 production。公開 repository 目前只包含公開市場資料程式、非私人 seed、測試與文件。未來若要加入供應商名稱與報價、公司採購數量、SAP 匯出、內部決策門檻、公司專屬材料 mapping 或私人 API endpoint，應在加入前改為 private repository，並重新進行秘密掃描與資料分級審查。

不應把目前的市場 TWD 參考值當成台灣現貨、含稅含運、交貨條件或合約價。正式上線前仍應由產品負責人確認服務條款、來源授權、監控與對外使用政策；本文件只記錄程式與公開資料的部署就緒條件。
