# Phase 2B 公開資料可靠性稽核筆記

## DGBAS PPI

官方 National Statistics「Statistical Tables」頁面提供 Producer Price Indices 的時間序列下載，除了統計資料庫入口，也列出官方 Excel 與 ODF 檔案。已確認的官方下載端點為：

- PPI time series Excel: https://ws.dgbas.gov.tw/001/Upload/464/relfile/10320/2683/ppiidx.xls
- PPI time series ODF: https://ws.dgbas.gov.tw/001/Upload/464/relfile/10320/2683/ppiidx.ods
- Official tables page: https://eng.stat.gov.tw/cp.aspx?n=2327
- Existing basic-classification XML: https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230534/pr0701a1m.xml

The Excel/ODF paths are official downloadable files and are candidates for deterministic fallback when the large basic-classification XML is unavailable. The fallback must still parse exact series labels, retain source endpoint and fetched time, and mark the result according to freshness; it must never assume that a successful file download means every required series is present.

## CBC NTD/USD

The official Central Bank page `https://www.cbc.gov.tw/en/lp-700-2.html` exposes a regular HTML table with Date and NTD/USD columns. The page currently shows 20 rows per page, 3,352 list items over 168 pages, with links such as `lp-700-2-1-20.html`, `lp-700-2-2-20.html`, and `lp-700-2-168-20.html`. The page reports an update date of 2026-08-20. The pagination path provides a safer official historical fallback than treating one page as the entire history; page traversal must be bounded, preserve observation dates, and retain the source URL used for each fetched page.

The current HTML shape is `<td data-th="Date"><span>YYYY/MM/DD</span></td>` followed by `<td data-th="NTD/USD"><span>value</span></td>`. Parser tests should cover this shape, compact fixture markup, pagination ordering, malformed rows, and explicit freshness states.

## Scope boundary

These findings are source-availability evidence only. They do not authorize a change to the minimum evidence threshold, a fabricated short-term labor or tariff signal, any company/private data, or a production deployment.

## DGBAS monthly earnings

The official DGBAS latest-indicator page is explicitly titled `Monthly Regular Earnings of All Employees (Industry and Services)`. It exposes a current June 2026 aggregate for industry and services, including monthly regular earnings and monthly working hours, but the page itself does not expose a manufacturing-specific breakdown. A manufacturing-specific monthly series therefore still requires verification through the underlying statistical database or a published industry-and-services release; the aggregate page alone must not be relabeled as manufacturing.

Official indicator page: https://eng.stat.gov.tw/Point.aspx?sid=t.4&n=4203&sms=11713

## Taiwan Power tariff data

The official data.gov.tw dataset `台灣電力公司各類電價表及計算範例` provides a direct CSV resource at `https://service.taipower.com.tw/data/opendata/apply/file/d007008/001.csv`. The dataset page states that it is provided by Taiwan Power Company, is free under the Government Open Data License 1.0, and is updated irregularly when tariffs change. This is a safer structured source candidate than PDF parsing, but the row schema and effective-date semantics must be inspected before using any tariff values. Because tariff changes are event-driven and structural, the model should treat them as low-frequency structural observations, not weekly momentum.

Dataset page: https://data.gov.tw/dataset/17060

The official dataset page also links a related tariff-category/scope dataset, which may be useful for matching tariff rows to a declared class without inventing a machine voltage, time-of-use, or contract category.

## DGBAS earnings release audit

The official DGBAS earnings release page `https://eng.dgbas.gov.tw/News_Content.aspx?n=4438&s=235868` is an industry-and-services monthly release with post date 2026-02-11 and a linked PDF. Its HTML article reports aggregate all-employee regular earnings, total earnings, median earnings, and payroll counts; it does not expose a manufacturing-specific monthly row in the article body. The recurring release/PDF family is a candidate for further schema inspection, but the aggregate HTML text must not be relabeled as manufacturing evidence.

## Wage dataset metadata

The official data.gov.tw page `https://data.gov.tw/en/datasets/9663` confirms that the resource is the DGBAS XML `https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230037/mp05002.xml`, contains monthly regular salary data, and includes related industry/citizenship/employment-type datasets. The page states an update frequency of Every January, Open Government Data License version 1.0, and a 2026-08-10 metadata update. Direct inspection of the XML shows records such as `202605Ⓡ` and `202606Ⓟ` with a `製造業_Manufacturing_金額_新臺幣元` field, so a monthly manufacturing series genuinely exists; the adapter must parse `YYYYMM` (including revision/preliminary suffixes) and must use monthly comparison windows, while documenting the publication lag rather than treating the dataset's annual metadata refresh as annual observations.

## DGBAS query export reliability

The official DGBAS query page `https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?funid=A030701015&sys=210` exposes output modes Web, Excel, ODS, CSV, CSV(UTF8), PDF, JSON, XML, XMLView, PXFile, and PXView. Its metadata identifies the exact one-based category positions used by the query: total index 1, manufacturing products 19, basic metals 56, machinery equipment 84, and water/electricity/gas 98. A bounded read-only CSV(UTF8) request using `sys=220`, `outmode=3`, `cycle=1`, and those fields returned a 3,695-byte UTF-8 CSV with monthly observations from ROC 110 January through ROC 115 July, including the required category headers and numeric values. This query endpoint is therefore the preferred DGBAS fallback over binary XLS/ODS parsing.

## CBC pagination reliability

The official CBC path `https://www.cbc.gov.tw/en/lp-700-2-1-60.html` returns 60 HTML table rows, covering 2026/08/21 through 2026/05/28 in the tested response; pages 2 and 3 continue chronologically, and page 56 reaches 2013/02/01. The 60-row path is sufficient for a 12-week weekday comparison and should be the primary endpoint. The existing 20-row page `https://www.cbc.gov.tw/en/lp-700-2.html` is a bounded secondary fallback that can still support a shorter recent window or last-known-good merge. Every accepted observation must retain the exact page endpoint used and an explicit `LIVE` or `FALLBACK` state.

## DGBAS monthly manufacturing wage query

The official wage query page `https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?sys=210&funid=A046301010` exposes monthly cycle, CSV/CSV(UTF8) output, and a `製造業` field at one-based position 4; the total gender classification is `codlst0=100`. A bounded query using `sys=220`, `outmode=3`, `cycle=1`, `compmode=0`, `ym=11001`, `ymt=11506`, `fldlst=0001000000000000000000000000000000000000000000`, and `codlst0=100` returned a UTF-8 CSV with `統計期,製造業` and monthly values from 110年1月 onward. This is the preferred secure fallback for monthly manufacturing labor evidence and also avoids the certificate-chain failure observed on the raw `ws.dgbas.gov.tw` host.
