# Standalone Offline Internal Engineering Cost Calculator V1

## Status and scope

Phase 4F delivers a standalone offline artifact at [`standalone/InternalEngineeringCostCalculator.html`](../standalone/InternalEngineeringCostCalculator.html). It is a single self-contained HTML file containing its own HTML, CSS and JavaScript. It is designed for a non-programmer company-side operator who only opens the file locally, enters engineering and internal cost numbers, clicks calculate and receives an **內部工程成本估算**.

The artifact is intentionally separate from the public raw-material dashboard, Render, the localhost private runtime, the Phase 4D pilot workflow and the Phase 4E operator tooling. It is not registered by `server.js`, not added to public navigation and not deployable through the existing public product path. This Phase 4F implementation stops before main promotion and before any real company value is entered.

> 本工具僅提供內部工程成本估算，不是供應商報價、客戶售價或正式對外報價。

## Offline and privacy contract

The calculator has no CDN, external JavaScript, external CSS, external font, network API, analytics, telemetry or form action. It contains no `fetch()`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `localStorage`, `IndexedDB`, cookie access or persistent cache. All entered values remain in the current browser document and disappear when the page is refreshed or closed. The visible banner states that all inputs are calculated in the local browser and are not uploaded.

The offline contract is checked twice: a static checker runs through `npm run check`, and the deterministic standalone test suite inspects the HTML for prohibited resource, network and persistence patterns. A file-based Chromium smoke additionally records that no non-`file:` request was made, the cookie string was empty and `localStorage.length` was zero.

## Input sections

| Section | Visible inputs and behavior |
|---|---|
| 零件基本資料 | Material family, optional grade, density, thickness, blank length, blank width, quantity and batch count. Standard material families expose engineering default densities that can be overridden; `其他` requires explicit density. |
| 材料成本 | Material cost per kg and either utilization percentage or scrap percentage. Both may not be supplied together; if both are blank, the tool does not assume hidden nesting efficiency or scrap. |
| 雷射切割 / 切割 | Enable switch, cut length per part, pierce count per part, cutting speed, pierce seconds, cutting machine cost per minute, cutting setup cost per minute and setup minutes per batch. |
| 折彎 | Enable switch, bend count per part, seconds per bend, bending machine cost per minute, bending setup cost per minute and setup minutes per batch. |
| 焊接 | Enable switch, weld length per part, welding speed, labor cost per minute, equipment cost per minute and setup minutes per batch. |
| 表面處理 | Enable switch, treated area per part and surface-treatment cost per square meter. No processing time is invented. |
| 工程 / 其他準備 | Enable switch, engineering setup minutes per batch, engineering cost per minute and optional other fixed cost. Other fixed cost is visibly separated from process cost. |
| 結果 | Engineering quantities, process-time components, internal cost components, total internal engineering cost, per-part internal engineering cost, component readiness and expandable formula details. |

Disabled process sections are visibly muted and do not require process rates or times. Enabled sections with missing values return **資料不足** for the affected component and do not silently substitute a guessed number. Filled but invalid values produce Traditional Chinese validation errors and block calculation.

## Calculation formulas

The calculation is deterministic and uses no hidden market factor or external service. Standard density defaults are the documented engineering defaults used by the existing estimator: carbon steel `7850 kg/m³`, stainless steel `8000 kg/m³`, aluminum `2700 kg/m³` and copper `8960 kg/m³`. A user density override takes precedence.

| Output | Formula |
|---|---|
| 單件理論重量 | `長度 × 寬度 × 厚度 × 密度 ÷ 1,000,000,000` |
| 總理論重量 | `單件理論重量 × 數量` |
| 材料重量 | `總理論重量 ÷ 利用率`; with scrap, utilization is `1 − 損耗率`; with both blank, utilization is `1` and the UI states that no hidden efficiency is assumed |
| 總切割長度 | `單件切割長度 × 數量 ÷ 1000` |
| 切割運轉時間 | `總切割長度 mm ÷ 切割速度 mm/min` |
| 穿孔時間 | `總穿孔數 × 每次穿孔秒數 ÷ 60` |
| 折彎時間 | `總折彎數 × 每折秒數 ÷ 60` |
| 焊接時間 | `總焊接長度 mm × 數量 ÷ 焊接速度 mm/min` |
| 表面處理面積 | `單件面積 × 數量 ÷ 1,000,000` |
| Setup time | `各啟用製程每批準備時間 × 批次數`，再加總 |
| Component cost | Each time or area output is multiplied by its explicit internal cost rate; welding separately displays labor, equipment and setup components |
| Total internal engineering cost | Material cost plus cutting, piercing, cutting setup, bending, welding, surface-treatment, engineering setup and other fixed cost |
| Per-part internal engineering cost | `總內部工程成本 ÷ 數量` |

The UI exposes the formula and the evaluated synthetic example under **查看計算依據**. Missing process time or rate never becomes zero unless the process is explicitly disabled. The surface-treatment calculation contains area and cost only and does not create a hidden processing-time estimate.

## Validation behavior

All numeric inputs must be finite. Dimensions and quantity must be positive, batch count must be a positive integer and cannot exceed quantity. Rates and times must be nonnegative; speeds and seconds-per-bend must be positive when their process is enabled. `OTHER` requires a positive explicit density. Utilization must be greater than zero and at most 100%; scrap must be nonnegative and less than 100%; utilization and scrap are mutually exclusive.

Validation messages are field-oriented Traditional Chinese messages such as `厚度：必須大於 0。`, `數量：必須是整數。`, `其他材質密度：不可留白。` and `材料利用率／損耗率：不可同時提供。請只填一個。` The calculator returns no result for basic validation failure. For an enabled component with blank required time/rate fields, the result distinguishes `資料不足` from a disabled component and keeps the affected cost/time null.

## Controls and lifecycle

The primary button is **計算內部工程成本**. **清除全部** calls native form reset, restores the default material and process switches and removes all result/error state. The page also resets its in-memory UI state on `pageshow`, so a refresh begins without previous inputs. **列印結果摘要** calls the browser print dialog; print CSS hides the input form, privacy banner, action buttons and formula details, leaving only the calculated result summary. No file export or persistent save is implemented.

## Test coverage

The standalone test file is [`test/standalone-offline-calculator.test.js`](../test/standalone-offline-calculator.test.js). It covers self-contained resource checks, no-network markers, no-persistence markers, required Traditional Chinese labels, default density, weight, utilization, scrap, cutting, piercing, bending, welding, surface treatment, setup, other fixed cost, total cost, per-part cost, disabled components, missing enabled component data, invalid and non-finite inputs, `OTHER` density, clear/reset contract and responsive CSS presence.

The static checker is [`scripts/check-standalone-calculator.js`](../scripts/check-standalone-calculator.js) and is included in `npm run check`. It parses the inline JavaScript with Node's VM and rejects external scripts/styles, URLs, network primitives, persistence primitives and external form actions.

## Local visual review

The artifact was opened directly as a `file://` URL with an existing Chromium executable. The review used synthetic values marked `TEST_ONLY`; no company, supplier or market value was used. The desktop capture is [`phase4f-offline-calculator-desktop.png`](visual-review/phase4f-offline-calculator-desktop.png), and the mobile capture is [`phase4f-offline-calculator-mobile.png`](visual-review/phase4f-offline-calculator-mobile.png). Metrics and observations are recorded in [`phase4f-offline-calculator-metrics.json`](visual-review/phase4f-offline-calculator-metrics.json) and [`phase4f-offline-calculator-observations.md`](visual-review/phase4f-offline-calculator-observations.md).

The desktop review used a `1440 × 1000` viewport and the mobile review used `390 × 844`. Both had document and body widths equal to the viewport, no horizontal overflow, a visible offline/privacy boundary and a visible synthetic result. The synthetic review displayed total internal engineering cost `3,964.75` and per-part internal engineering cost `39.6475`; these are test fixture outputs only.

## Product boundary and stop condition

The calculator must remain a standalone offline artifact. It must not be added to public navigation, served through `server.js`, deployed to Render, connected to Neon or Gmail, scheduled, instrumented, or changed into a quotation/customer-price workflow. Phase 4F does not import or request real company values, does not create a real operator folder, does not start the private runtime with real data and does not execute a real pilot.

The next permissible action is a separately authorized human operator opening the standalone file on a controlled device and manually entering approved internal numbers. That action is outside this implementation task. The current feature branch must stop before main promotion and before any company real-data entry.

## References

[1]: ../docs/ENGINEERING_ESTIMATE_FOUNDATION.md "Existing engineering estimator foundation"
[2]: ../lib/engineering/engineeringContract.js "Existing engineering input contract"
[3]: ../lib/engineering/engineeringEstimator.js "Existing engineering formulas and density defaults"
