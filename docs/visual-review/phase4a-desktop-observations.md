# Phase 4A desktop visual review observations

- Local URL: `http://127.0.0.1:4173/estimate`
- Initial page and calculated NO_RATE result both rendered successfully after replacing an old local server process with the current worktree.
- Desktop viewport observed by the browser was 896×796 CSS pixels; page height exceeded one viewport and remained scrollable.
- Shared navigation displayed the four implemented pages: 原物料市場, 加工市場參考, 鈑金市場參考, 工程估算.
- The page visibly displayed 工程估算, 非供應商報價 and 未載入公司成本參數.
- The calculated result displayed 2.355 kg per part, 235.5 kg total material mass, 145 m cut length, 800 pierces, 400 bends, batch count 1 and quantity per batch 100.
- The cost panel displayed 尚未設定成本參數 and explicitly stated that NO_RATE keeps monetary fields null; no supplier/company/market price appeared.
- Warning cards and the expandable 查看公式與計算依據 section were visible, including unit conversions and formulas.
- Screenshot source after calculation: `/home/ubuntu/screenshots/127_0_0_1_2026-08-23_15-02-43_1599.webp`.
