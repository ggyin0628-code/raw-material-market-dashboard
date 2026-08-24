# Phase 4F `/estimate` browser-local visual review

Review date: 2026-08-24. The screenshots were captured from the feature branch through a sandbox-only HTTP server at `127.0.0.1:4173`; no production deployment or real company data was used.

| Viewport | Artifact | Review result |
|---|---|---|
| 1440 × 1000 | `estimate-desktop-1440x1000.png` | The existing shell/navigation, Phase 4F boundary tags, browser-local privacy notice, input workspace, and empty result panel render as a coherent two-column operator layout. No visible clipping or horizontal overflow appears in the captured viewport. |
| 390 × 844 | `estimate-mobile-390x844.png` | The input/result columns collapse to a single column; shared navigation wraps into a compact two-row layout; privacy and boundary tags wrap without clipping. No visible horizontal overflow appears in the captured viewport. |

The capture shows the initial blank-result state only. Interaction behavior was separately checked with synthetic `TEST_ONLY` values: local calculation reached `READY`, no post-calculation network calls were observed, clear reset the result state and input values, invalid input remained fail-closed, and a synthetic `pageshow` reset cleared in-memory values.


A final recapture after the terminology refinement removed quote/supplier wording from the public `/estimate` UI. The final screenshots above are the recaptured versions and show only the three boundary tags: `工程估算`, `瀏覽器內計算` and `內部工程成本估算`.


## Blank formal operator page recapture

The final blank-page recapture was made after removing all operational input defaults and unchecking all process switches. The only input default visible in both screenshots is the standard `densityKgM3=7850` engineering default for the default carbon-steel material family.

| Viewport | Artifact | Review result |
|---|---|---|
| 1440 × 1000 | `estimate-blank-desktop-1440x1000.png` | Thickness, length, width, quantity, batch count and internal cost inputs are blank; the result panel is in the initial empty state; no visible clipping or horizontal overflow. |
| 390 × 844 | `estimate-blank-mobile-390x844.png` | The blank fields remain readable in the stacked mobile layout; navigation and privacy boundary wrap correctly; no visible horizontal overflow. |

Blank-form Chromium smoke submitted no values and observed `resultVisible=false`, required-field Traditional-Chinese validation for thickness/length/width/quantity/batch/material rate, `networkCalls=[]`, empty cookie/localStorage/sessionStorage, all five process switches unchecked, and only the density default `7850`.


## Actual Render production certification

Review date: 2026-08-24. These screenshots were captured from the existing Render service at `https://raw-material-market-dashboard-1.onrender.com/estimate` after the final safety hotfix deployment. No real or company data was entered.

| Viewport | Artifact | Review result |
|---|---|---|
| 1440 × 1000 | `production-estimate-blank-desktop-1440x1000.png` | The deployed blank formal operator page shows the existing navigation, privacy notice, density `7850` engineering default, blank operational fields and initial empty result panel with no visible clipping or horizontal overflow. |
| 390 × 844 | `production-estimate-blank-mobile-390x844.png` | The deployed page keeps navigation usable, wraps the boundary tags, stacks the form readably and shows the blank operator state without visible horizontal overflow. |

Production DOM inspection independently confirmed that only `densityKgM3=7850` had an input default, all five process switches were unchecked, the required sections were present and the initial result state was empty. Production browser smoke confirmed blank-submit fail-closed behavior and the synthetic `TEST_ONLY` result of `3,964.75` total / `39.6475` per part without a request or persistence side effect.
