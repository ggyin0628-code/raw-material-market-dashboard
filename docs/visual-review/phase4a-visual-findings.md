# Phase 4A visual review findings

## Review setup

The review used only the local test server at `http://127.0.0.1:4173/estimate` and submitted the page’s default explicit `SHEET_METAL` input. No production endpoint, database migration, workflow, schedule, mail operation or external market API was invoked. The captured artifacts are `engineering-estimate-desktop.png` at 1440×1774 full-page pixels and `engineering-estimate-mobile.png` at 390×4639 full-page pixels from a 390×844 viewport.

## Desktop result

The desktop layout presents the form and result panels side by side with a clear four-page shared navigation. The result shows 2.355 kg per part, 235.5 kg total material mass, 145 m of cutting, 800 pierces, 400 bends, one batch and 100 parts per batch. The cost card clearly says `尚未設定成本參數`, identifies `NO_RATE`, keeps monetary fields null and does not display a supplier quotation, company rate or market price. The warning block distinguishes the broad `ENGINEERING_DEFAULT` density from certified material properties, and the collapsed formula section is discoverable as `查看公式與計算依據`.

## Mobile result

The 390×844 viewport stacks the input and result panels into a single readable column. The full-page mobile artifact shows the input controls, calculate/reset buttons, physical/workload cards, NO_RATE cost explanation, warning cards and formula-trace section without clipping. Automated page metrics recorded `documentWidth=390`, `bodyWidth=390` and `horizontalOverflow=false`; the page text contained `NO_RATE`, `非供應商報價` and `未載入公司成本參數`, and the rendered formula trace contained 10 entries.

## Acceptance finding

The local visual review passes the Phase 4A requirement for a desktop calculated-result screenshot and a 390×844 mobile screenshot with no horizontal overflow, readable quantities, usable form controls and an understandable null-cost state. The review does not certify production deployment; the feature branch remains `FEATURE_BRANCH_READY_FOR_REVIEW — DO NOT PROMOTE MAIN`.

## Post-hardening visual recheck

After the front-end hardening change, the desktop artifact was regenerated at 1440px width and the mobile artifact at a 390px viewport. The new physical-calculation grid now shows both material utilization and material scrap-rate states; the added card remains readable on desktop and stacks cleanly on mobile. The final screenshots still show the calculated NO_RATE result, the null monetary explanation, the warning boundary and the expandable formula section. Automated metrics remain `documentWidth=390`, `bodyWidth=390`, `horizontalOverflow=false`, `hasNoRate=true`, `hasSupplierQuoteLabel=true`, `hasCompanyRateLabel=true`, `hasScrapMetric=true` and `traceCount=10` for the mobile case.
