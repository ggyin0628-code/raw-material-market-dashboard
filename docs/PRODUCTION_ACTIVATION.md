# Production Activation Readiness

## Verdict semantics

Weekly V1 的 **production-ready** 意義是程式、storage boundary、quality gate、mail safety、observability、recovery runbook 與 scheduler contract 已可被 owner 配置與驗證；它不表示本次已替 owner 購買 persistent storage、取得 SMTP credentials、批准 recipients 或啟用 production cron。

| 狀態 | 意義 | 排程／寄信行為 |
| --- | --- | --- |
| `READY` | 程式與現有 configuration gate 通過 | 可進入 owner-approved activation stage |
| `CONFIG_REQUIRED` | local／production configuration 尚未完整 | 不啟用 live operation |
| `STORAGE_CONFIGURATION_REQUIRED` | production 沒有 durable root | `/health/weekly` 503；production jobs fail closed |
| `SEND_OK` | 全部 tracked indicators 可用且 artifacts 完整 | 可在 mail stage 寄出 |
| `SEND_WITH_WARNINGS` | report 可用但含 fallback／stale／API error／insufficient history／missing FX warning | 可選擇寄送，但 warning 必須留在 report；不可靜默遮蔽 |
| `SEND_BLOCKED` | report 沒有 tracked indicators、usable ratio < 50% 或 artifacts 不完整 | 不寄信；job state 可恢復 |

## Activation sequence

### Stage 0 — owner configuration review

Owner 先確認 host 提供 persistent storage mount、network egress 至公開 providers、Node.js 20+、`npm ci`、`npm start`、`/health` 與 external cron capability。Render free 現況沒有已驗證的 persistent volume，因此只可作為 public UI／API host，不能直接啟用 production snapshot scheduler。

設定：

```sh
NODE_ENV=production
REQUIRE_DURABLE_STORAGE=1
PRODUCTION_STORAGE_ROOT=/approved/persistent/path
```

確認：

```sh
npm run production:storage-check
npm run production:status
curl -fsS https://<host>/health
curl -i https://<host>/health/weekly
```

`/health/weekly` 必須回 `status: OK`、`storage.state: DURABLE_CONFIGURED`，並且只顯示 safe job／coverage metadata。它不會顯示 absolute paths、recipient list、password 或 token。

### Stage 1 — public history bootstrap

執行：

```sh
npm run production:bootstrap -- --period 3y
npm run production:status
```

Bootstrap 順序固定為 public history backfill → normalize → atomic persist → quality validation → first completed-week report artifact。Backfill 只使用 provider-supported history；missing market dates 保持缺失，FX 缺失時 TWD reference 保持 null。命令可重跑，same identity 不會產生 duplicate record。

若某些 provider 失敗，結果必須保留 `API_ERROR`／`NO_DATA` 與 reason；只有 material usable ratio < 50% 或 artifact integrity failure 才會成為 `BOOTSTRAP_REPORT_BLOCKED`。

### Stage 2 — daily job

建議在台灣工作日 `18:30 Asia/Taipei` 執行：

```sh
npm run production:daily
npm run production:status
```

這個時間點是在主要公開市場日內資料通常可取得後的實務窗口，但不同 exchange close 不同，因此 `LIVE` 只代表當次 provider response；不代表所有市場已同步收盤。每次執行都保留 `lastAttemptedAt`、`lastSuccessfulAt`、snapshot date、record count、coverage、status 與 error count。

### Stage 3 — weekly dry-run

建議每週一 `09:30 Asia/Taipei`，先執行：

```sh
npm run production:weekly -- --dry-run --send
```

它只會對 completed prior Monday–Sunday week 建立 canonical JSON／HTML／XLSX、評估 quality gate、寫 `DRY_RUN` ledger state 並回報 `sent: false`。不會連 SMTP，也不會將資料寄到任何地址。報告檢查項目至少包括 tracked count、usable count、API_ERROR、NO_DATA、STALE、FALLBACK、insufficient history、missing FX 與 artifact integrity。

### Stage 4 — controlled test recipient

先設定只允許測試地址的 environment：

```sh
MAIL_ENABLED=1
MAIL_HOST=<approved-smtp-host>
MAIL_PORT=587
MAIL_SECURE=0
MAIL_USER=<secret-managed-user>
MAIL_PASSWORD=<secret-managed-password>
MAIL_FROM=<approved-sender>
MAIL_TO=<production-list-is-ignored-in-test-mode>
MAIL_TEST_MODE=1
MAIL_TEST_TO=<approved-test-recipient>
```

保留 `DRY_RUN=1` 直到 Stage 3 完成。接著僅以 `MAIL_TEST_MODE=1` 執行 live test，確認實收郵件的 subject、sender、HTML、mobile readability、XLSX attachment、timestamps、source labels 與 public-data disclaimer。任何 failure 都回到 Stage 3／Stage 4，不得直接切換 production recipients。

### Stage 5 — approved recipients

Owner 確認 Stage 4 實收無誤後，移除 `MAIL_TEST_MODE` 或設為 false，提供 approved `MAIL_TO`／optional `MAIL_CC`，再以一個指定 week 做 owner-approved live send。Recipient parser 會 trim、拆分逗號／分號／空白、去除 case-insensitive duplicates，任何 invalid address 都 fail closed。

### Stage 6 — scheduler activation

最後才啟用外部 scheduler。Scheduler 必須先執行 readiness／storage check，失敗即停止後續 job；weekly 流程順序固定為 history／snapshot readiness → completed week → analytics → quality gate → HTML → XLSX → mail or dry-run → ledger。實際 scheduler expression 與 UTC 換算見 [`SCHEDULER_RUNBOOK.md`](SCHEDULER_RUNBOOK.md)。

## Explicit next human action

**Configure approved persistent storage and SMTP environment variables, perform TEST_RECIPIENT live-email verification, then enable the weekly scheduler.** Do not add company/private purchasing data. The next product feature after activation remains external machining／sheet-metal market reference intelligence using public sources only.

## References

- [`PRODUCTION_STORAGE.md`](PRODUCTION_STORAGE.md)
- [`EMAIL_DELIVERY.md`](EMAIL_DELIVERY.md)
- [`SCHEDULER_RUNBOOK.md`](SCHEDULER_RUNBOOK.md)
- [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md)
