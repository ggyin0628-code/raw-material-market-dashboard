# Phase 4C Local Private Calibration Runtime & Real-Data Intake Readiness V1

**狀態：**Feature branch foundation only。此階段已完成 local private runtime 與 synthetic sentinel verification，但**尚未匯入、載入或啟用任何 real company／supplier calibration data，也未連接 public Render**。本文件的作者為 **Manus AI**。

## 1. 目的與安全結論

Phase 4C 將 Phase 4B 的 private-cost architecture 落實為一個 fail-closed 的本地執行邊界。runtime 只接受 `PRIVATE_RUNTIME_ENABLED=1`，只 bind `127.0.0.1`，只從 repository 外部的 absolute path 讀取 profile，並由 local session 保護 private estimate API。public `server.js`、public navigation、public Render、public engineering API 與 market reference API 都不註冊 private route。

這是一個**資料進口前的 readiness foundation**，不是 production private-data deployment。Local runtime 的 session boundary 適合單一受控本機；它不是多使用者 identity provider，也不是可直接暴露在 LAN、Internet 或 Render 上的 authentication／authorization service。任何 real profile onboarding 都必須先建立獨立的 authenticated internal service、least-privilege policy、secret/key management、backup/restore、rotation/revocation 與 tamper-evident audit controls。[1] [2]

> 「A hidden route, query flag, frontend password or obscure URL is not sufficient authorization」是本專案沿用的安全判斷：private endpoint 必須有真正的 access control，不得只靠不公開 URL。[2]

## 2. Runtime boundary

Phase 4C 的 runtime entrypoint 是 `private-runtime.js`，npm command 為 `npm run private:estimate`。public `npm start` 仍然只啟動 `server.js`，因此 Render 的既有 startup path 不會載入 private runtime。

| Control | Required behavior | Failure behavior |
|---|---|---|
| Enable flag | `PRIVATE_RUNTIME_ENABLED=1` | flag 缺少或非 `1` 時 fail closed |
| Binding | `PRIVATE_RUNTIME_HOST=127.0.0.1` | 任何其他 host，包括 `0.0.0.0`，拒絕啟動 |
| Port | 預設 `4174`；測試可使用 ephemeral port | 非法 port 拒絕啟動 |
| Profile path | `PRIVATE_RATE_PROFILE_PATH` 必須是 repository 外部 absolute file path | 缺少、relative、repo 內、repo symlink、非 JSON 或不可讀時拒絕啟動 |
| Audit path | `PRIVATE_AUDIT_LOG_PATH` 必須位於 repository 外部；預設使用 system temporary directory | repo 內或經 symlink 指回 repo 時拒絕；檔案以 mode `0600` 寫入 |
| Public server | `server.js` 不 import、不 mount private runtime | public route `/private-estimate` 與 `/api/private/estimate` 維持 404 |
| Request origin | 只接受 loopback socket address | 非 loopback request 回傳 403 |
| Profile lifecycle | `PRIVATE_CALIBRATED`、`ACTIVE`、approved metadata、生效時間窗 | 任一條件不符時不啟動 |

建議的 local-only invocation 如下。這個命令中的 profile path 必須指向 repository 外部檔案；範例檔僅是 placeholder，不得直接拿來代表 real calibration。

```bash
PRIVATE_RUNTIME_ENABLED=1 \
PRIVATE_RUNTIME_HOST=127.0.0.1 \
PRIVATE_RATE_PROFILE_PATH=/absolute/path/outside/repository/private-rate-profile.json \
PRIVATE_AUDIT_LOG_PATH=/absolute/path/outside/repository/private-audit.jsonl \
npm run private:estimate
```

Runtime startup log 只報告 loopback URL 與「profile loaded outside repository」等 safe status，不印出 profile ID、owner、currency、raw rate、request body 或 cost result。

## 3. External profile loading contract

`privateProfileLoader.js` 複用 Phase 4B strict validator，並在讀檔前後執行 path containment checks。它會檢查 profile file 本身與既有 parent path 的 canonical real path，以避免透過 symlink 寫入或讀取 repository 內檔案。loader 不會將 raw profile 寫入 cache、log、response 或 frontend asset。

profile 必須具備下列治理欄位；本 repository 只提供 `private-rate-profile.example.json` 作為 template，含有明顯的 placeholder values，不是可用的 company profile。

| 區塊 | 必要語義 | 不允許的做法 |
|---|---|---|
| Identity | `rateProfileId` 與 `version` 可追溯且受治理 | 使用無版本的 anonymous profile |
| Lifecycle | `effectiveFrom`、可選 `effectiveTo`、`status=ACTIVE` | 過期、尚未生效或 DRAFT profile 被載入 |
| Governance metadata | `metadata.source`、`metadata.owner`、`metadata.approvalStatus=APPROVED` | 沒有 owner／approval 的數值直接進 runtime |
| Scope | material、cutting、bending、welding、surface treatment、setup 欄位符合 strict contract | 缺 calibration 時用 hidden default 或猜測效率 |
| Units | rate 與 process-time fields 帶有固定單位語義 | 將每件、每批、每分鐘或每平方公尺混用 |
| Confidentiality | 檔案位於 repo 外、private runtime 可讀、其他使用者不可讀 | 將 profile 放在 Git、public static、Render env log 或 screenshot |

## 4. Local authentication and authorization

`GET /private-estimate` 由 local runtime 發出 `HttpOnly; SameSite=Strict` 的短期 `private_session` cookie。private API 不接受沒有 session 或未知 session 的 request；request 也不得自行帶入 `rateProfile`。Profile 永遠由 runtime startup 時載入，避免 caller 以 HTTP body 選擇任意 private profile。

目前的 local authorization model 是 **loopback-only + server-issued local session + protected service scope**。protected service 同時要求 authenticated identity、`engineering:private-cost` scope、`ACTIVE` profile 與 audit logger。`PRIVATE_LOCAL_IDENTITY` 只作為受控 local audit identity metadata，不能被解讀為已完成企業 SSO 或多使用者 IAM。

任何 future shared/private service 都必須在 real-data onboarding 前另行提供真正的 user authentication、authorization policy、TLS、least privilege、administrative audit、revocation 與 rate limiting。REST endpoint 的 safe error handling 與 authentication/authorization 原則依 OWASP guidance 執行。[2]

## 5. Local private API

| Method | Path | Boundary | Response policy |
|---|---|---|---|
| `GET` | `/private-estimate` | loopback only；建立 local session | private UI HTML；不含 raw profile values |
| `GET` | `/private-estimate.js` | loopback-only runtime static asset | client 只送 engineering input；不含 profile data |
| `POST` | `/api/private/estimate` | loopback + `private_session` + JSON | 回傳 physical/workload、process time、internal cost與 safe profile metadata |
| `GET` | `/health` | loopback only | 回傳 `LOCAL_PRIVATE`、binding 與 safe profile ID/version |

Private response 可包含內部工程成本，因為它只通過 local private runtime。它不等同 supplier quotation、market price、customer price 或 formal commercial quote。response 的 `rateProfile` 只包含 mode、source、ID、version、effective dates、status 與 currency；raw rate 欄位永遠不回傳。`formulaTrace` 的 calibration-derived inputs 使用 `PROFILE_VALUE_NOT_RETURNED`，但保留 workload、unit conversion、formula、result 與 unit。

Surface treatment 的 area cost 可以依 explicit profile rate 計算，但目前 process-time model 仍為 `NO_MODEL`；runtime 不猜測表面處理 processing minutes。任何未提供 calibration 的 process-time layer 必須維持 `CALIBRATION_REQUIRED`／`null`，不能默默回到 Phase 4A 的 public `NO_RATE` 或其他隱藏速率。

## 6. Audit event and redaction contract

每次成功 private estimate 都寫入 repository 外部 JSONL。每個 event **只包含**下列七個欄位：

| Field | Meaning | Raw profile value allowed? |
|---|---|---|
| `timestamp` | event time | No |
| `authorizedLocalIdentity` | local authorized identity label | No |
| `rateProfileId` | safe profile identifier | No |
| `rateProfileVersion` | safe profile version | No |
| `processFamily` | currently `SHEET_METAL` | No |
| `estimateId` | request/result correlation ID | No |
| `resultStatus` | result state | No |

Audit records do not contain material rate, machine rate, labor rate, speed, seconds-per-bend, setup rate, profile metadata note or request body. The runtime creates the parent directory with restrictive permissions, creates the file with mode `0600`, and re-applies mode `0600` after append. OWASP secret-management guidance supports lifecycle control, authentication/authorization, rotation/expiration and auditable access records; Phase 4C applies those principles without placing any real secret or rate in this repository.[1]

## 7. Public separation and leakage gates

Public `server.js` intentionally does not import `private-runtime.js`; public UI does not import `private-estimate.js`; shared `nav.js` does not advertise `/private-estimate`; and public engineering schema continues to deny `PRIVATE_CALIBRATED`. Existing market APIs continue to return their established `reference.engineeringEstimate=null` semantics.

Phase 4C tests use a synthetic sentinel embedded only in a repo-external test profile, including one unused numeric rate field. The tests assert that the sentinel is absent from the private HTML, private result, safe error payloads, audit JSONL, public source files, public schema and handoff/status documents. They also assert that:

| Gate | Result |
|---|---|
| Runtime disabled without flag | Pass; startup fails closed |
| Non-loopback host | Pass; startup fails closed |
| Relative/repo-contained/symlinked profile path | Pass; load rejected |
| Missing, invalid, inactive, expired, future or unapproved profile | Pass; safe code only |
| Request-supplied `rateProfile` | Pass; rejected |
| Missing/unknown local session | Pass; HTTP 401 |
| Invalid JSON or invalid engineering input | Pass; safe structured error |
| Raw rate in response/formula trace/audit | Pass; not present |
| Public private route | Pass; 404 |
| Public `PRIVATE_CALIBRATED` API | Pass; 403 |
| Public UI private-rate input | Pass; absent |
| Public market API coupling | Pass; existing isolation retained |
| Desktop/mobile layout | Pass; 1440px and 390×844, no horizontal overflow |

Hardcoded credentials and other secrets in Git history can become an unauthorized-access target; GitHub documents secret scanning across repository history and recommends rotation when exposure occurs.[3] Accordingly, this branch uses ignore rules for common private profile, calibration worksheet and audit filenames, while the tracked example template contains no real values.

## 8. Intake worksheet and real-data onboarding stop condition

`docs/PRIVATE_CALIBRATION_INTAKE_WORKSHEET.md` defines the future intake fields for material, cutting, bending, welding, engineering setup and surface treatment. It deliberately contains no real numeric values. Before a real profile can be activated, the following sequence is mandatory:

1. An accountable owner supplies an approved worksheet and source evidence outside Git.
2. A private runtime operator converts the worksheet to strict versioned profile JSON outside the repository.
3. Independent review checks units, scope, dates, material/process applicability, calibration method and reconciliation sample.
4. The profile is stored with least-privilege file access, private backup/restore, key management, rotation and revocation procedures.
5. An authenticated internal service or controlled local operator is selected; public Render is explicitly excluded.
6. Synthetic sentinel tests and public leakage scans pass against the deployment artifact, logs and backup path.
7. A separate certification decision approves activation of `PRIVATE_CALIBRATED` for a named environment.

Phase 4C stops before step 1 is executed. No real company or supplier data has been requested, imported, loaded, logged, committed or backed up. Phase 4D, if approved, should focus on a governed authenticated internal service, not on adding real values to this public repository.

## 9. Validation record

The Phase 4C local visual smoke used only the repo-external synthetic fixture. It produced 2.355 kg/part, 235.5 kg total material, 313 process minutes, 3,566 `TEST_UNITS` total internal cost and 35.66 `TEST_UNITS`/part. These are synthetic test outputs only and must not be interpreted as company calibration, supplier pricing or market data.

The final local capture used desktop `1440×1000` and mobile `390×844` viewports. Both reported `documentWidth` and `bodyWidth` equal to the viewport, `horizontalOverflow=false`, `hasPrivateResult=true`, `hasSafeProfileMetadata=true`, `hasRedactedTrace=true`, `hasRawRateInput=false`, `hasSentinel=false` and `hasPrivateBoundary=true`.

## References

[1] [OWASP, *Secrets Management Cheat Sheet*](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

[2] [OWASP, *REST Security Cheat Sheet*](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)

[3] [GitHub Docs, *Secret scanning*](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)
