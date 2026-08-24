# Public process reference visual review

## Local sandbox review

The screenshots were generated from the sandbox-only server at `http://127.0.0.1:4173` using synthetic/public-source payloads only. No company rate, private calibration value or real customer data was entered.

| Page | Desktop | Mobile | Result |
|---|---|---|---|
| `/machining` | `machining-desktop-1440x1000.png` | `machining-mobile-390x844.png` | Public CNC machine-hour and marketplace cards appear before the secondary pressure section; the 390px layout stacks cards and navigation without visible horizontal overflow. |
| `/sheet-metal` | `sheet-metal-desktop-1440x1000.png` | `sheet-metal-mobile-390x844.png` | Laser direct listed cards appear before the secondary pressure section; the formal page includes explicit NO_PUBLIC_PRICE_DATA for bending/welding; the 390px layout remains readable without visible horizontal overflow. |

The desktop machining view visibly shows the four machine-hour ranges and the separate PRO360 TWD/min card. The desktop sheet-metal view visibly shows material/thickness/per-meter laser cards and keeps the `/estimate` action separate. The mobile screenshots confirm that the money-first panel remains the first detailed content after the summary and that pressure context is not visually presented as a price.

## Interaction smoke

After the initial asynchronous loading placeholders, a subsequent page view confirmed that `/api/machining/reference` and `/api/sheet-metal/reference` completed and rendered the public cards. The local API returned five CNC records and sixty sheet-metal records. `/standalone` returned HTTP 404. No real company data was entered and no production service was contacted.
