# Phase 3A DGBAS PPI findings

Sources:
- https://eng.stat.gov.tw/sdds/cp.aspx?n=4180&s=1803
- https://eng.stat.gov.tw/cp.aspx?n=2327
- https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?k=engmain

DGBAS describes Taiwan producer prices as a Producer Price Index (PPI), a Laspeyres index with base 2021=100, measuring average changes in prices received by domestic producers for their output. It is an index, not a sheet-metal supplier quotation or a per-piece/per-kg/per-hour fabrication price.

The official Statistical Tables page links to a public statistical database and official Time Series of Producer Price Indices Excel/ODF downloads, as well as annual-change tables. These provide a potential stable public source for monthly PPI series, subject to preserving the exact classification, unit, period, download URL, freshness, and revision status.

For Phase 3A, existing verified DGBAS PPI query adapters can be reused for basic metals, manufacturing, energy, and machine-capital proxy series. A fabricated-metal-products PPI series should be added only if an official Taiwan series/classification and stable query are verified; otherwise the category remains unavailable rather than being filled with a foreign index or an invented value.
