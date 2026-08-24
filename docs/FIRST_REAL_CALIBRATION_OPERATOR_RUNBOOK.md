# First Real Internal Engineering Cost Calibration — Local Operator Runbook

## 文件目的與限制

本 runbook 只準備 **第一次 real internal engineering calibration** 所需的 local operator workflow；它不會匯入、要求、產生或儲存任何 real company/private value。本次 Phase 4E implementation 只提供空白 template、safe validation、localhost runtime procedure、post-run leakage check 與 operator checklist，並且**停止在 operator 輸入 real value 與執行第一個 real pilot 之前**。

使用者可見術語固定為：

> **內部工程成本估算**

本流程不是報價流程，不得將結果稱為試報價單、報價單、正式報價、客戶售價或供應商報價。

## 事前安全條件

第一次 real pilot 只能由一名已授權的 local OS operator 在受控裝置上執行。private directory 必須在 repository 外，並在可避免時不要放入 cloud-synced folder。裝置應啟用 disk encryption，例如 BitLocker、FileVault 或等效方案；本 runbook 不會也不應自動管理該設定。private directory、profile、pilot、audit 與 history 必須只有 authorized local operator 可讀寫，並且不得上傳至 Render、其他 private cloud 或 Git。

在任何 real value 進入電腦前，operator 必須確認 backup destination 已定義且受保護。若 backup 會保存 private profile 或 pilot，backup 必須位於受控、加密且不在 repository 的位置。不得以 terminal command 印出完整 profile/pilot，不得將 raw values 放入 shell history、CI log、issue、chat、screenshot、browser recording 或錯誤報告；不得在包含 raw rates 的畫面截圖。Operator 也不應把 `git status` 或 private directory listing 貼到公開管道。

## 1. 初始化 repository-external operator directory

先在 shell 中設定一個**由 operator 自行選擇且位於 repository 外的路徑**；不要把公司名稱、供應商名稱或敏感識別資訊寫入 repository。下例的 placeholder 必須由 operator 在 local machine 以實際受控路徑替換：

```sh
cd /path/to/raw-material-market-dashboard
PRIVATE_DIR="<LOCAL_PRIVATE_DIRECTORY_OUTSIDE_REPOSITORY>"
npm run private:init -- "$PRIVATE_DIR"
```

`private:init` 會建立以下 logical layout；已存在的 regular file 不會覆寫：

```text
private-engineering-cost/
  profile/
    private-rate-profile.json
  pilot/
    private-calibration-pilot.json
  audit/
    private-audit.jsonl
  history/
    private-calibration-history.jsonl
  backup/
```

helper 會拒絕 repository 內、relative path、repository symlink path、非 directory destination 與非 regular file。directory 以 `0700` 建立，template/audit/history 以 `0600` 建立。`profile/` 與 `pilot/` 內產生的是 value-empty skeleton，不是可直接執行的 profile/pilot。

安全輸出只包含 status，例如 `REPOSITORY_BOUNDARY: PASS`、`PROFILE_TEMPLATE: VALUE_EMPTY_CREATED`、`PILOT_TEMPLATE: VALUE_EMPTY_CREATED`；不會印出 private directory path、profile payload、pilot payload 或任何 rate/cost。

## 2. Profile template：填值前的 value-empty skeleton

`profile/private-rate-profile.json` 會包含下列欄位；第一次產生時所有 real-value fields 都是 `null`。`mode`、lifecycle、currency、metadata 也保持 `null`，因此這個 skeleton 在填寫並完成 approval 前不能通過 `private:validate`。

| Section | Fields |
|---|---|
| Identity/lifecycle | `rateProfileId`, `version`, `effectiveFrom`, `effectiveTo`, `status`, `approvalStatus`, `currency` |
| Material | `carbonSteelRatePerKg`, `stainlessSteelRatePerKg`, `aluminumRatePerKg`, `copperRatePerKg` |
| Cutting | `machineRatePerMinute`, `setupRatePerMinute`, `pierceTimeSecondsEach`, `cuttingSpeedMmPerMin`, `setupMinutesPerBatch` |
| Bending | `machineRatePerMinute`, `setupRatePerMinute`, `secondsPerBend`, `setupMinutesPerBatch` |
| Welding | `laborRatePerMinute`, `machineRatePerMinute`, `weldingSpeedMmPerMin`, `setupMinutesPerBatch` |
| Surface treatment | `ratePerM2` |
| Engineering setup | `engineeringSetupRatePerMinute`, `engineeringSetupMinutesPerBatch` |
| Non-secret governance metadata | `source`, `owner`, `approvalStatus`, `note` |

Operator 只有在完成內部 approval、effective date、currency、所有必要 calibration field 與 access controls 後，才可使用受控 local editor 手動填寫 real profile。不得透過 request body、public UI、Render environment、Git commit 或 shell command line 傳入 raw rate。Profile 必須維持 `PRIVATE_CALIBRATED`、`ACTIVE`、`APPROVED`，並且 effective window 必須包含執行時間。

## 3. Single pilot template：一個已知 historical part

`pilot/private-calibration-pilot.json` 是單一 known historical part 的 value-empty skeleton，所有 part dimensions、quantity、observations、historical actual cost 與 component costs 都是 `null`。固定的 `pilotScope` 只表示受控單一 pilot，不是 private value。

| Section | Fields |
|---|---|
| Part | `pilotId`, `materialFamily`, `grade`, `thicknessMm`, `blankLengthMm`, `blankWidthMm`, `quantity`, `batchCount` |
| Material | `densityKgM3`（只有需要 explicit override 時填寫） |
| Cutting | `cutLengthMmPerPart`, `pierceCountPerPart`, `observedCuttingSpeedMmPerMin` 或 `observedRunMinutes`, `authoritativeObservation`, `observedPierceSecondsEach`, `observedSetupMinutesPerBatch` |
| Bending | `bendCountPerPart`, `observedSecondsPerBend` 或 `observedRunMinutes`, `authoritativeObservation`, `observedSetupMinutesPerBatch` |
| Welding | `weldLengthMmPerPart`, `observedWeldingSpeedMmPerMin` 或 `observedRunMinutes`, `authoritativeObservation`, `observedSetupMinutesPerBatch` |
| Surface treatment | `treatedAreaMm2PerPart` |
| Engineering setup | `observedSetupMinutesPerBatch` |
| Historical reference | `actualHistoricalTotalInternalCost` 或 `actualHistoricalInternalCostPerPart`，可選 `componentCosts` |

當同一製程同時有 speed/time observation 時，必須明確指定 `authoritativeObservation`；不得讓 runtime 猜測。Historical reference 的 total 與 per-part 不能同時提供。缺少必要 calibration、ambiguous observation、無效 date 或未核准 profile 都必須 fail closed。

## 4. Safe validation：只輸出 status

在 operator 手動填入並完成 review 後，先以 environment variables 指向 repository-external files。值不要直接寫入 command history；可使用 local process environment、受控 shell session 或 OS secret mechanism。至少需要：

```sh
export PRIVATE_RUNTIME_ENABLED=1
export PRIVATE_RUNTIME_HOST=127.0.0.1
export PRIVATE_RUNTIME_PORT=4174
export PRIVATE_LOCAL_IDENTITY="<AUTHORIZED_LOCAL_OPERATOR_LABEL>"
export PRIVATE_RATE_PROFILE_PATH="$PRIVATE_DIR/profile/private-rate-profile.json"
export PRIVATE_CALIBRATION_PILOT_PATH="$PRIVATE_DIR/pilot/private-calibration-pilot.json"
export PRIVATE_AUDIT_LOG_PATH="$PRIVATE_DIR/audit/private-audit.jsonl"
export PRIVATE_CALIBRATION_HISTORY_PATH="$PRIVATE_DIR/history/private-calibration-history.jsonl"
```

執行：

```sh
npm run private:validate
```

只有看到以下語意的完整 PASS 才能進入下一步：

```text
ENABLE_FLAG: PASS
PROFILE_PATH: EXTERNAL_OK
PROFILE_SCHEMA: VALID
PROFILE_STATUS: ACTIVE
PROFILE_APPROVAL: APPROVED
PILOT_PATH: EXTERNAL_OK
PILOT_SCHEMA: VALID
AUDIT_PATH: EXTERNAL_OK
HISTORY_PATH: EXTERNAL_OK
AUTHORIZATION: READY
LOCALHOST_BOUNDARY: PASS
PUBLIC_LEAKAGE: PASS
READY_FOR_PRIVATE_PILOT: YES
```

實際 output 只包含 safe statuses，不會顯示 material price、machine rate、labor rate、setup rate、historical cost、完整 profile、完整 pilot 或任何 file path。任何 `NO`、`INVALID`、`NOT_READY` 或 command failure 都代表必須停止，不得啟動 runtime。

## 5. Launch localhost runtime

只有 `npm run private:validate` 顯示 `READY_FOR_PRIVATE_PILOT: YES` 後才執行：

```sh
npm run private:estimate
```

Runtime 必須只 bind `127.0.0.1`，且不允許以 `0.0.0.0` 啟動。Operator 在同一台受控裝置開啟：

```text
http://127.0.0.1:4174/private-estimate
```

這個 page 只屬於 private runtime，不存在於 public Render。Operator 只在 UI 輸入工程條件或由 external pilot file 載入 pilot；UI 不提供 raw-rate input。結果名稱固定為 **內部工程成本估算**，可顯示 material、cutting、bending、welding、setup、total internal engineering cost estimate、internal engineering cost estimate per part，以及 historical internal cost comparison、difference、variance % 與 diagnostic category。Raw profile values 必須保持 redacted；safe profile metadata 只能顯示受允許的 identifier/status information。

## 6. Execute one controlled pilot

第一次 real pilot 只允許一個已核准的 known historical part。Operator 應先核對 part identity、material/dimensions、quantity/batch count、觀測時間單位、historical reference type、approval date 與 profile version，再按一次 calibration pilot action。不可批量匯入、批次執行、調整多個 profile、反覆嘗試閾值或用 pilot 結果自動改寫 profile。

Comparison 應保存 historical actual internal cost、cost difference、variance percentage 與 diagnostic category；任何 adjustment 只能顯示為 `PROPOSED_ONLY`，不得自動寫回 profile，也不得改成 public market multiplier、supplier quote、customer price 或其他 quotation terminology。若 observation、history 或 profile 不完整，operator 應停止並記錄 safe failure status，不可猜測或補值。

## 7. Stop runtime

完成一個 controlled pilot 後，operator 必須停止 runtime：

```text
Ctrl+C
```

停止後確認沒有 private runtime process 或 `127.0.0.1:4174` listener。不要把 terminal output、browser screenshot 或 private UI recording 上傳到 ticket、Git、Render 或 chat。若需要 evidence，只保存不含 raw values 的 safe status record。

## 8. Preserve only protected local audit/history

`audit/private-audit.jsonl` 與 `history/private-calibration-history.jsonl` 必須留在 external private directory，且維持 `0600`。它們只應包含 safe identifiers、timestamp、profile ID/version、process family、estimate/pilot ID、variance 與 result status；不得包含 raw rates、actual historical cost、完整 profile、完整 pilot 或 customer/company payload。Backup 只能寫入 operator 事前定義的受控加密 backup destination，不能複製進 repository。

## 9. Post-run leakage check

完成 stop 與 external audit/history preservation 後，在 repository root 執行：

```sh
npm run private:leak-check
```

期待的輸出只包含安全狀態：

```text
TRACKED_PRIVATE_PROFILE: NONE
TRACKED_PRIVATE_PILOT: NONE
TRACKED_PRIVATE_AUDIT_HISTORY: NONE
PUBLIC_ASSETS: PASS
DOCUMENTS: PASS
UNTRACKED_SENSITIVE_FILES: NONE
PUBLIC_API: UNCHANGED
READY: PASS
```

`private:leak-check` 不會列出 private value、private path、完整 Git status 或檔案內容。若結果不是 `READY: PASS`，立即停止分發或分享結果，不要 commit、push、deploy 或截圖；先由 authorized operator 以受控方式處理。

## 10. Exact first-real-pilot checklist

| Gate | Operator action | Stop condition |
|---|---|---|
| Local host | 確認由 authorized local OS user 執行、device encryption 已啟用、非 cloud-synced folder（如可避免） | 身分、裝置或位置不明確 |
| Directory | 執行 `npm run private:init -- <external directory>` | destination 在 repository 內或 path 不安全 |
| Templates | 只在 external file 內手動填寫一個 approved profile 與一個 known historical part | template 被複製進 repo、Git、ticket 或 cloud |
| Profile | 完成 `PRIVATE_CALIBRATED`、`ACTIVE`、`APPROVED`、date window、required fields 與內部 approval | 缺 calibration、過期、未批准或 schema error |
| Pilot | 明確選擇 observed time precedence，填入 single pilot 與一種 historical reference | 同時有 conflicting observations、total/per-part ambiguity 或缺值 |
| Validation | 執行 `npm run private:validate`，確認 `READY_FOR_PRIVATE_PILOT: YES` | 任一 status 不是 PASS/READY |
| Runtime | 執行 `npm run private:estimate`，只用 `127.0.0.1` | 非 loopback、public URL、Render 或 private cloud |
| Comparison | 在 private page 執行一次，核對內部工程成本估算與 historical internal cost | 要求第二個 pilot、profile auto-tuning 或 quotation language |
| Stop | 按 `Ctrl+C` 停止 runtime | process/listener 未停止 |
| Preserve | 只保留 external `0600` audit/history 與受控 encrypted backup | raw values 進入 repo、log、screenshot 或公開管道 |
| Leak check | 執行 `npm run private:leak-check` | 不是 `READY: PASS` |

## Current Phase 4E stop condition

本文件不會建立、填寫或載入 real profile/pilot；也不會執行第一個 real pilot。本次交付只包含 value-empty templates 與 safe operator controls。任何實際 company rate、historical internal cost、supplier/customer value、credential 或 private payload 都必須由 user 在另一次受控且獨立批准的 local operation 中手動輸入；不得在本 task、CI、Render、Git 或 public API 中出現。
