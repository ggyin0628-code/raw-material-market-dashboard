# 專案狀態

## 最終判定目標

本專案的安全離線工作與公開資料硬化以 `OFFLINE_AND_PUBLIC_DATA_WORK_COMPLETE` 為目標，並在所有驗證、fresh clone、commit、push 與 tag 完成後標記 `CODEX_HANDOFF_READY = YES`。本文件不把外部公開 API 偶發不可用視為離線實作缺口；外部 availability 會在 runtime 狀態中如實呈現。

## Baseline

| 項目 | 結果 |
| --- | --- |
| Repository | `ggyin0628-code/raw-material-market-dashboard` |
| Visibility | PUBLIC；本次未自動變更 visibility。 |
| Default branch | `main` |
| Verified baseline main SHA | `7658a8c74dd4a09a7b5bedd5677cd094fdb6770a` |
| Product boundary | 公開原物料市場趨勢／採購參考，不是 supplier quotation、ERP、台灣現貨、contract-price 或 confirmed purchase recommendation system。 |

## Feature branch

| 項目 | 結果 |
| --- | --- |
| Authoritative implementation branch | `feat/raw-material-dashboard-hardening-v1` |
| Final commit | 於最後 push 後補入 exact SHA。 |
| Working tree | 在最後 commit 前應為 clean；不得修改或 merge `main`。 |
| Checkpoint tag | `raw-material-dashboard-hardened-v1`，應指向 final handoff-ready commit。 |

## 已完成的安全離線工作

材料 registry 已明確加入 exchange、source unit、currency、conversion factor、source 與 fallback metadata。Yahoo、Stooq、Jina history proxy 與 open.er-api 皆有固定來源邊界；retry、timeout、malformed response、日期 row、cache freshness、stale hydration、FX 缺失、path traversal、輸入驗證、下載檔名、安全 headers 與非 debug error body 已完成硬化。未更換任何 symbol，也未加入公司資料或憑證。

歷史 API 與 XLSX 匯出已保留來源、單位、期間、狀態、FX、TWD market reference 與公開市場 disclaimer。前端已把採購 wording 限定為市場趨勢參考，並對動態值進行 escaping；原本視覺識別與互動布局未重設計。

## 外部資料現況

本次 live smoke 觀察 14 materials：10 個 Yahoo quote primary 成功、4 個 quote 無可用來源，history 14 個全部成功，其中 3 個透過固定 Jina public proxy；Yahoo USD/TWD primary timeout，但 open.er-api fallback 成功。這些是觀測時間的 operational 結果，不是可永久保證的資料 SLA。

## 離線缺口

若 deterministic tests、fresh clone、runtime 與文件更新均通過，`OFFLINE_GAPS = 0`。仍存在的不是離線實作缺口，而是明確的外部依賴：公開供應商可用性、來源 rate limit、來源授權與資料延遲，以及未配置 Stooq fallback 的材料在 Yahoo quote 失敗時會進入 stale／API_ERROR 流程。

## 公司資料依賴工作

目前不應加入 supplier names／quotes、SAP、採購量、庫存、交期、MOQ、付款條件、公司內部門檻、公司專屬 symbol mapping 或 production secrets。未來若業務需要這些功能，應先建立 private repository／private service、權限控制、資料保留政策與稽核規範，再由 Codex 另案設計 integration；不要把它們寫入目前公開 dashboard。

## 文件入口

詳細 source、unit、signal、runtime 與接手規則分別見 [`docs/DATA_SOURCE_CONTRACT.md`](docs/DATA_SOURCE_CONTRACT.md)、[`docs/PRICE_UNIT_CONTRACT.md`](docs/PRICE_UNIT_CONTRACT.md)、[`docs/PURCHASING_SIGNAL_CONTRACT.md`](docs/PURCHASING_SIGNAL_CONTRACT.md)、[`docs/RUNTIME_VERIFICATION.md`](docs/RUNTIME_VERIFICATION.md) 與 [`HANDOFF.md`](HANDOFF.md)。
