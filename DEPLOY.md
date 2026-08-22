# 公開網站與 Zero-Cost Runtime V1

本系統是需要 Node.js 後端的**外部公開市場情報與採購參考平台**。它只取得 Yahoo Finance、registry-configured Stooq、固定 Jina public proxy 與 open.er-api 的外部公開資料，並保留 `LIVE`、`FALLBACK`、`STALE`、`NO_DATA` 或 `API_ERROR` 的真實狀態。本 repository 不包含 SAP、公司採購歷史、供應商報價、公司目標價、庫存、MOQ、付款條件、私人門檻、公司 email system 或生產憑證。

## Runtime architecture

零成本 production path 為：

```text
Public market APIs
    ↓
GitHub Actions daily／weekly workflows
    ↓
Node.js weekly runtime
    ↓
STORAGE_PROVIDER=postgres
    ↓
Neon-compatible PostgreSQL
    ↓
Gmail SMTP to approved personal TEST_RECIPIENT／recipient
```

Render Free 保留為 optional dashboard／web hosting。它不負責排程 SMTP，不把 local filesystem 當 durable storage，亦不需要 persistent disk。當 dashboard 使用 `STORAGE_PROVIDER=postgres` 時，web process 可讀取同一個 PostgreSQL public market history；restart／spindown 不會遺失市場歷史。

## Runtime contract

| 設定 | 值 |
| --- | --- |
| Runtime | Node.js 20 以上 |
| Install／Build | `npm ci`；workflow 不使用未鎖定的 `npm install` |
| Start | `npm start` |
| Process health | `GET /health`；只代表 web process 可回應 |
| Weekly operational health | `GET /health/weekly`；不暴露 URL、password、recipient 或 credentials |
| Local/test storage | `STORAGE_PROVIDER=filesystem` |
| Zero-cost durable storage | `STORAGE_PROVIDER=postgres` + secret-managed `DATABASE_URL` |
| Database migration | `npm run db:migrate`；idempotent、non-destructive |
| Public scheduled jobs | `.github/workflows/market-daily.yml`、`.github/workflows/market-weekly.yml` |
| Secrets | 只由 Actions secrets／runtime environment 讀取；不寫入 source |

Postgres mode 未配置 `DATABASE_URL` 時回 `DATABASE_URL_REQUIRED` 並以 non-zero exit 結束。Filesystem production mode 未配置 durable root 時回 `STORAGE_CONFIGURATION_REQUIRED`。兩者都不得繼續執行會造成虛假 durability claim 的 job。

## GitHub Actions activation

Daily workflow 約於週二至週六 `07:17 Asia/Taipei` 執行，使用 `17 23 * * 1-5` UTC cron；它執行 `npm ci`、`npm run check`、`npm run db:migrate`、database／storage check、`production:daily` 與 status validation，不寄送週報。Weekly workflow 約於週一 `09:17 Asia/Taipei` 執行，使用 `17 1 * * 1` UTC cron；它執行 migration、storage check、completed prior-week quality gate、HTML／XLSX generation 與 Gmail SMTP delivery，並保留 duplicate-send protection。兩個 workflow 都提供 `workflow_dispatch` 手動 recovery。

GitHub schedule 是 best-effort，可能延遲；public repository 長期沒有活動時 scheduled workflows 可能被停用。不得以 artificial commit 掩蓋 inactivity，應使用 `workflow_dispatch` 與 [`docs/GITHUB_ACTIONS_OPERATIONS.md`](docs/GITHUB_ACTIONS_OPERATIONS.md) 的 recovery procedure。

## Required secret contract

| Secret／variable | 用途 |
| --- | --- |
| `DATABASE_URL` | Neon-compatible PostgreSQL connection string |
| `MAIL_USER` | owner-approved personal Gmail username |
| `MAIL_PASSWORD` | Gmail App Password；只作 runtime secret |
| `MAIL_FROM` | owner-approved sender |
| `MAIL_TO` | approved production recipient，TEST_RECIPIENT verification 後才使用 |
| `MAIL_TEST_TO` | first live test recipient |
| `WEEKLY_MAIL_TEST_MODE` | repository variable；預設 `1`，手動確認收件後才可設 `0` |

Gmail production configuration is `smtp.gmail.com:465` with secure TLS. 本 task 不會向 Gmail 建立連線、不會要求或保存 App Password、不會送出 real email。

## Safe owner activation sequence

Owner 先建立或選用 owner-approved free PostgreSQL project，將 `DATABASE_URL` 與 Gmail credentials 僅放入 GitHub Actions secrets，再手動執行 daily workflow 確認 `DATABASE_READY`／`DAILY_DATA_READY`。接著保持 `WEEKLY_MAIL_TEST_MODE=1`，手動執行 weekly workflow，確認郵件只到 `MAIL_TEST_TO`、內容為 public-only、HTML／XLSX attachment 可讀。完成人工 receipt review 後，才可設定 `WEEKLY_MAIL_TEST_MODE=0` 並啟用 approved production-recipient 行為。

```bash
npm ci
npm run check
npm test
npm run build
npm audit --omit=dev
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run db:migrate
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:storage-check
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:bootstrap -- --period 3y
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:daily
STORAGE_PROVIDER=postgres DATABASE_URL="$DATABASE_URL" npm run production:weekly -- --dry-run --send
```

## Deployment posture

本次只完成 branch／code／docs／tests／workflow source；**不部署、不建立 Neon project、不啟用付費資源、不啟用 Actions schedule、不設定 Gmail secrets、不發送 real mail**。Render Free 仍可作 dashboard hosting，但 scheduled data collection 與 SMTP 僅由 GitHub Actions workflow 承擔。完整 schema、migration、transaction、export、failure recovery 與 workflow operations 見 [`docs/ZERO_COST_RUNTIME.md`](docs/ZERO_COST_RUNTIME.md)、[`docs/POSTGRES_STORAGE.md`](docs/POSTGRES_STORAGE.md) 與 [`docs/GITHUB_ACTIONS_OPERATIONS.md`](docs/GITHUB_ACTIONS_OPERATIONS.md)。

## Product direction

本產品永久只處理外部公開市場情報與採購參考。下一個功能擴展是**外部加工／鈑金市場參考情報**，仍然只使用公開外部市場資料；任何公司私有採購資料、SAP、供應商資料、公司目標價格、private thresholds、inventory、MOQ、payment terms、company email system 或 credentials 都不屬於本產品。
