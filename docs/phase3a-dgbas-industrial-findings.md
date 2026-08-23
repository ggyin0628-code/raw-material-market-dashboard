# Phase 3A DGBAS industrial-production findings

Source: https://eng.stat.gov.tw/Point.aspx?sid=t.5&n=4204&sms=11713

DGBAS exposes an official Industrial Production Index Growth Rate page with the Industrial Production Index and Growth Rate, Manufacturing Production Index and Growth Rate, and Value of Export Orders. At the page snapshot, the Manufacturing Production Index was 141.56 (2021=100) and its growth rate was 23.96% for June 2026; the Value of Export Orders was 97,939 million US dollars for July 2026.

The page is a credible Taiwan-first demand/activity proxy, not a sheet-metal supplier price. A Phase 3A implementation may use a bounded official index or existing public query adapter where available, preserve the monthly frequency and observation period, and classify it as OBSERVED_PUBLIC_DATA. If only aggregate manufacturing data is available, the result must be described as a broad demand/capacity proxy and not as fabricated-metal-specific pricing.
