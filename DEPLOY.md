# 公開網站與 Weekly V1 Production Readiness

本系統是需要 Node.js 後端的 **外部公開市場情報與採購參考平台**，不只是靜態網站。服務取得 Yahoo Finance、registry-configured Stooq、固定 Jina public proxy 與 open.er-api 的公開資料，並在來源失敗時保留 `FALLBACK`、`STALE`、`NO_DATA` 或 `API_ERROR`。本專案不包含 SAP、公司採購歷史、供應商報價、公司目標價、庫存、MOQ、付款條件、私人門檻或生產憑證。

## 已驗證的 runtime contract

| 設定 | 值 |
| --- | --- |
| Runtime | Node.js 20 以上 |
| Install／Build | `npm ci`；正式 pipeline 不使用未鎖定的 `npm install` |
| Start | `npm start` |
| Host | `HOST`；未指定時 `0.0.0.0` |
| Port | `PORT`；未指定時 `4173` |
| Process health | `GET /health`；只證明 web process 可回應 |
| Weekly operational health | `GET /health/weekly`；storage 未配置時回 HTTP 503 並回報 `STORAGE_CONFIGURATION_REQUIRED` |
| Production storage guard | `REQUIRE_DURABLE_STORAGE=1` 或 `NODE_ENV=production` 時，未配置 durable root 會阻擋 production jobs |
| Public sources | Yahoo Finance、明確配置的 Stooq、固定 Jina public proxy、open.er-api |
| Secrets | 僅由 environment 讀取；本 repository 不存放 SMTP credentials 或 recipient list |

## Render current posture

`render.yaml` 保持 `plan: free`，並使用 `npm ci`、`npm start` 與 `/health`。Free web service 沒有本次已驗證的 persistent volume；因此 manifest 明確設定 `REQUIRE_DURABLE_STORAGE=1`，production daily／bootstrap／weekly／backup commands 會在未提供 durable storage 時 fail closed，`/health/weekly` 會顯示 `STORAGE_CONFIGURATION_REQUIRED`。這不是把 ephemeral filesystem 假裝成 durable，也沒有在本次任務中購買或啟用付費資源。

在 owner 批准 persistent storage 後，才可將 `PRODUCTION_STORAGE_ROOT` 指向平台提供的持久化 mount，並重新執行全部 validation gates。若平台不能提供可靠的 persistent mount，應使用與現有 Node architecture 相容且由 owner 批准的 durable storage adapter；不得讓 scheduler 直接寫 ephemeral local disk。

## 安全啟用順序

先由 owner 配置並驗證 durable storage，再執行 public-history bootstrap；接著執行 daily snapshot 與 `/health/weekly` 檢查，確認 job state、coverage 與 reporting week；之後以 `DRY_RUN=1` 產生 HTML／XLSX 並檢查 report quality gate。SMTP 必須依 `docs/EMAIL_DELIVERY.md` 先進行 TEST_RECIPIENT live verification，完成實收信件檢查後，才可批准 production recipients，最後才啟用外部 scheduler。

```sh
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
npm run production:storage-check
npm run production:status
npm run production:bootstrap -- --period 3y
npm run production:daily
npm run production:weekly -- --dry-run --send
```

在 storage 尚未配置時，`production:storage-check` 與 `production:status` 必須清楚回報 `STORAGE_CONFIGURATION_REQUIRED`；`production:bootstrap`、`production:daily`、`production:weekly` 與 `production:backup` 必須拒絕執行，不得產生虛假的 durable claim。

## Deployment checks

部署後先檢查 `/health`，再檢查 `/health/weekly`。`/health` HTTP 200 不代表 weekly durable storage、資料快照、report 或 mail 已就緒。只有 `/health/weekly` 回報 storage ready，且 production readiness matrix 沒有 `FIX_REQUIRED`、`HOSTING_REQUIRED`、`SECRET_REQUIRED` 或未核准的 external dependency，才可把 production scheduler 從 blocked 改為可執行。

## Product direction

本產品的下一個功能擴展是 **外部加工／鈑金市場參考情報**，仍然只使用公開外部市場資料。任何公司私有採購資料、SAP、供應商資料或 credentials 都不在本 repository 的下一步。

## References

- [`render.yaml`](render.yaml)
- [`docs/PRODUCTION_ACTIVATION.md`](docs/PRODUCTION_ACTIVATION.md)
- [`docs/PRODUCTION_STORAGE.md`](docs/PRODUCTION_STORAGE.md)
- [`docs/EMAIL_DELIVERY.md`](docs/EMAIL_DELIVERY.md)
- [`docs/SCHEDULER_RUNBOOK.md`](docs/SCHEDULER_RUNBOOK.md)
- [`docs/OPERATIONS_RUNBOOK.md`](docs/OPERATIONS_RUNBOOK.md)
