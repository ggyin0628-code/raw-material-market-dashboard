# Phase 4G currency/card visual review

## Machining local review

The sandbox-only local `/machining` page completed its API fetch and rendered five public monetary cards before the pressure summary. The 5-axis card displayed `NT$ 2,000+ / hr`; the turn-mill card displayed `NT$ 1,800+ / hr`; these were rendered as normal green monetary cards rather than no-data cards. TaiwanCNC and PRO360 cards displayed `幣別：來源明示 TWD`. The pressure section remained below the monetary panel under `成本趨勢輔助`.

The page footer displayed the corrected boundary wording: `本頁僅列示可追溯的公開市場／公開價目參考；不包含公司內部機台費率、供應商正式報價或公司目標價格。工程估算層在 V1 保持 browser-local。` The local desktop viewport showed no visible horizontal overflow in the reviewed state.

The rendered local public data was treated as public-source smoke only. No company/private data, production endpoint, database mutation, mail, schedule or workflow was used.

## Sheet-metal local review

The local `/sheet-metal` visual state was reviewed at desktop viewport after navigation and fetch wait. The page showed the monetary panel before the summary and `成本趨勢輔助`, preserved `NO_PUBLIC_PRICE_DATA` in the primary panel contract copy, and displayed the corrected footer: `本頁的金額僅來自可追溯公開價目；不代表供應商正式報價、公司內部成本或目標價格。工程估算層保持 browser-local。`

The first captured state remained on the loading shell because the public source fetch was still in progress at the viewport check; the deterministic UI tests and API-backed machining review separately verified the shared formatter and card state. No horizontal overflow was visible in the reviewed shell. No production or private data path was used.

The subsequent sheet-metal wait completed the public fetch. The rendered cards visibly showed `網站列示：10 / m`, `網站列示：12 / m`, and similar per-meter values, followed by `幣別：來源頁未明示（台灣網站語境推定，需詢價確認）`; they did not show `NT$`. MINCA small-hole rows rendered as `網站列示：2.5 / hole` with the source basis. Cards were primary above the pressure summary and no visible horizontal overflow appeared in the reviewed desktop viewport.

## Headless screenshot review

`machining-phase4g-desktop-1440x1000.png` and `machining-phase4g-mobile-390x844.png` were reviewed. Desktop showed the public monetary panel first with normal monetary cards for 5-axis and turn-mill open-ended ranges; mobile showed the same panel in a single readable column with the explicit `幣別：來源明示 TWD` note. No visible horizontal overflow or clipped card content was observed in either reviewed viewport.

## Sheet-metal screenshot review

`sheet-metal-phase4g-desktop-1440x1000.png` and `sheet-metal-phase4g-mobile-390x844.png` were reviewed. Desktop cards show `網站列示：10 / m`, `幣別：來源頁未明示（台灣網站語境推定，需詢價確認）` and the separately preserved small-hole basis. The mobile view preserves the same wording in a single-column card and keeps the public monetary panel above the secondary pressure section. No visible horizontal overflow or clipped currency note was observed.
