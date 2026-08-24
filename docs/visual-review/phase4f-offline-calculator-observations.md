# Phase 4F Offline Calculator Visual Review

The standalone artifact was opened directly with a `file://` URL using only the existing Chromium executable. The synthetic review fixture was explicitly marked `TEST_ONLY`; it is not company, supplier or market data. No network request was observed during either viewport capture, and no browser persistence was used.

| Review | Result |
|---|---|
| Desktop viewport | `1440 × 1000`; full-page capture `1440 × 3305`; document/body width `1440`; `horizontalOverflow=false` |
| Mobile viewport | `390 × 844`; full-page capture `390 × 7705`; document/body width `390`; `horizontalOverflow=false` |
| Offline title | `內部工程成本估算｜離線計算工具` |
| Privacy banner | Visible: `所有輸入僅在本機瀏覽器計算，不會上傳。` |
| Result state | Synthetic calculation visible; total `3,964.75`; per-part `39.6475` |
| Network | No non-`file:` request; static network markers absent from rendered document |
| Persistence | `localStorage.length=0`; cookie empty; no localStorage, IndexedDB or cookie code |

The desktop layout presents the complete grouped input workflow on the left and a sticky result panel on the right. The result side clearly separates 工程量、製程時間、內部工程成本估算、component status and 查看計算依據. The teal result card highlights the total internal engineering cost without using quotation or customer-price terminology.

The mobile layout collapses to one column. Inputs remain readable with full-width controls, enabled/disabled process sections remain visually distinct, action buttons remain reachable, and the result panel follows the form without horizontal clipping. The full-page mobile capture includes all seven input sections, the action row, engineering quantities, process-time cards, cost breakdown, component statuses and formula details.

The browser review used only synthetic `TEST_ONLY` values and did not create a real operator directory, real profile, real pilot or persistent company-data artifact. The committed screenshots are visual review evidence only and must not be interpreted as production company-cost data.
