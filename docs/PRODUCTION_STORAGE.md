# Production Storage Contract

## Purpose and boundary

Weekly V1 只持久化公開市場資料、公開來源 provenance、報告 metadata、job state 與 delivery state。任何 supplier quotation、SAP、company purchase history、inventory、MOQ、payment terms、private threshold、personal email 或 credential 都不允許進入這個 storage boundary。

## Storage modes

| Mode | 判定 | 行為 |
| --- | --- | --- |
| `LOCAL_DEVELOPMENT` | 未設定 `NODE_ENV=production`、`REQUIRE_DURABLE_STORAGE` 或 `PRODUCTION_STORAGE_ROOT` | 使用 repository 下 ignored `data/`，適合本機與 deterministic tests；不得宣稱跨 redeploy durable。 |
| `PERSISTENT_CONFIGURED` | production mode 且 `PRODUCTION_STORAGE_ROOT` 是 absolute path，或所有明確 storage paths 都是 absolute | production commands 可執行；owner 必須證明該 mount 跨 restart、instance replacement 與 redeploy 保留。 |
| `STORAGE_CONFIGURATION_REQUIRED` | production mode 但沒有 durable root 或完整 absolute storage paths | `/health/weekly` 回 HTTP 503；production bootstrap、daily、weekly、backup fail closed；不得寫 ephemeral production ledger。 |

Production readiness 使用 `NODE_ENV=production` 或 `REQUIRE_DURABLE_STORAGE=1` 作為 guard。單純將 `MARKET_SNAPSHOT_FILE` 指到 container 內的普通路徑，若 host 未保證 persistence，不足以成為 durable proof。

## Configuration

建議 production 只設定一個 absolute root：

```sh
PRODUCTION_STORAGE_ROOT=/persistent/raw-material-market-dashboard
REQUIRE_DURABLE_STORAGE=1
```

系統會建立以下 public-only layout：

```text
/persistent/raw-material-market-dashboard/
├── market-snapshots/snapshots.json
├── weekly-reports/delivery-ledger.json
├── weekly-reports/report-metadata.json
├── weekly-reports/job-state.json
├── weekly-reports/weekly-market-intelligence-YYYY-Www.{json,html,xlsx}
└── backups/weekly-public-backup-<backup-id>/
```

以下 variables 可在需要時覆寫相對 layout，但 production override 必須是 absolute path：`MARKET_SNAPSHOT_FILE`、`WEEKLY_DELIVERY_LEDGER`、`WEEKLY_REPORT_DIR`、`WEEKLY_REPORT_METADATA`、`WEEKLY_JOB_STATE` 與 `WEEKLY_BACKUP_DIR`。不應在 repository 內提交這些 production values。

## Write guarantees

Snapshot、delivery ledger、report metadata、job state 與 report artifacts 都先寫入同一目錄下的 unique temporary file，再透過 atomic rename 取代目標檔案。Snapshot identity 是 `materialId + date`；同一天較低品質的 `STALE`、`NO_DATA` 或 `API_ERROR` 不會覆蓋既有 `LIVE`／`FALLBACK`。每個 record 保留日期、source、status、unit、currency、collected time、last trade time、error 與 provenance。

JSON 解析失敗會產生 `SNAPSHOT_STORE_INVALID`、`DELIVERY_LEDGER_INVALID`、`REPORT_METADATA_INVALID` 或 `JOB_STATE_INVALID`，不會靜默清空檔案。Production operator 必須保留原檔供鑑識，使用最近一次 public-only backup 或 provider-supported history backfill 復原，再執行 quality gate；不得手動刪除未知狀態的 ledger entry 來繞過 duplicate protection。

## Validation and backup commands

```sh
npm run production:storage-check
npm run production:status
npm run production:backup -- --backup-id 2026-08-24T0930-taipei
```

`production:storage-check` 只回報 safe readiness metadata，不輸出 secret 或 recipient。`production:backup` 複製 snapshot、delivery ledger 與 report metadata，並寫入 `manifest.json`；backup 本身仍是 public-market data only。Backup 目錄必須位於 owner 核准、可持久化且可存取控制的位置。

## Render posture

目前 `render.yaml` 使用 free web service，沒有本次驗證的 persistent volume；因此 production 設定明確保持 `STORAGE_CONFIGURATION_REQUIRED`。這是有意的安全狀態，不是部署失敗。Owner 必須先提供可靠的 persistent mount 或核准另一個相容 durable adapter，再重新執行完整 fresh-clone 與 production simulation。

## References

- [`PRODUCTION_ACTIVATION.md`](PRODUCTION_ACTIVATION.md)
- [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md)
- [`SCHEDULER_RUNBOOK.md`](SCHEDULER_RUNBOOK.md)
