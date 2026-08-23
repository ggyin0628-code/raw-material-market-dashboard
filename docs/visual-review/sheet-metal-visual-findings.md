# Phase 3A sheet-metal visual review findings

Review date: 2026-08-23.

## Desktop

`sheet-metal-desktop.webp` was captured at approximately 893×768 browser viewport. The canonical page header, Taiwan-first Phase 3A kicker, public-only boundary tags, three-item shared navigation, refresh action, four summary cards, and six pressure cards are visible. The populated reference displayed score `48.47｜正常`, evidence `6/3`, quality `STALE`, and reference date `2026-08-23`. Cards show suitable windows: daily sources show 12-week/4-week comparisons, while monthly labor, manufacturing-price and capacity/demand sources show 3-month/1-month/1-year comparisons. The layout uses a three-column pressure grid with no visible clipping or horizontal overflow in the reviewed viewport.

## Mobile

`sheet-metal-mobile.png` was captured at 390×844. The header wraps cleanly, the back link remains visible, the shared navigation collapses into a two-column/third-row arrangement, boundary tags wrap, the refresh control becomes full-width, and summary cards stack vertically. The visible portion shows readable score/evidence/quality content with no horizontal overflow or clipped text. The page continues below the viewport for the remaining cards and provenance, as expected for a long mobile dashboard.

## Review decision

The visual review passed for desktop hierarchy and mobile responsive behavior. The page remains an independent `/sheet-metal` surface and does not merge sheet-metal content into the raw-material homepage.

## Homepage navigation

`homepage-navigation.webp` was captured from the local raw-material homepage. It remains the original raw-material dashboard, and its shared navigation visibly exposes `原物料市場`, `加工市場參考`, and `鈑金市場參考`; the sheet-metal content is not embedded into the homepage.

## Source-role refinement desktop review

The refined desktop view populated the source-provenance panel with explicit labels for `國際／進口市場參考`, `全球上游投入代理`, `台灣國內公開指標`, and `結構性／事件驅動`. Each card shows market scope, pricing basis, currency, unit, frequency, observation date, fetch time, status, URL and limitation. The live local smoke showed score `43.21｜正常`, evidence `5/3`, selected 12-week direction `FALLING`, overall quality `STALE`, and explicit `NO_DATA` cards for Taiwan domestic cold-rolled and stainless proxies. The capacity/demand component remained `API_ERROR` when the official MOEA CSV timed out; the page preserved that state instead of substituting a value. No role-label clipping or horizontal overflow was observed in the desktop review.

## Role-label screenshot review

The desktop provenance screenshot shows the international stainless reference, IMF nickel proxy, and Taiwan domestic gap records with readable role badges, status badges and limitation text; the cards remain within the viewport without horizontal clipping. The 390px mobile screenshot shows the navigation, Taiwan-first-not-only-Taiwan explanation, public-only boundary tags, refreshed status and summary cards stacked cleanly. The visible mobile viewport has no horizontal overflow; the role details continue below the fold in the normal single-column flow.

## Production desktop visual review — 2026-08-23

The promoted Render `/sheet-metal` page loaded with the three-page shared navigation: `原物料市場 → /`, `加工市場參考 → /machining`, and `鈑金市場參考 → /sheet-metal`. The desktop hierarchy, summary cards and six component cards were readable. The live page displayed score `48.47｜正常`, evidence `6/3`, data quality `STALE`, and the public-only boundary labels. The provenance panel showed Taiwan domestic, international/import and global upstream roles, explicit scoring labels, the FRED/BLS stainless pipe/tube limitation and `僅供來源沿革／不計分`, plus the two Taiwan domestic `NO_DATA` gap cards. No horizontal clipping was observed at the desktop viewport.

## Production mobile visual review — 2026-08-23

The production 390×844 screenshot shows the three shared navigation links without clipping, the public-market/non-quotation/non-target-price boundary labels, the refresh control, and the live summary cards in a readable single-column layout. The score `48.47｜正常`, evidence `6/3` and `STALE` quality are visible above the fold. The desktop provenance screenshot shows the international stainless pipe/tube context, nickel upstream proxy, and Taiwan domestic `NO_DATA` cards with role badges, `僅供來源沿革／不計分`, exclusion reason and limitations. No horizontal overflow, clipped navigation or unreadable role text was observed in either production visual review.
