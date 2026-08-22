# Weekly Report Contract

## Contract identity

`buildWeeklyReport({ records, reportingWeek, generatedAt })` returns the single source of truth consumed by the JSON route, Traditional Chinese HTML preview, XLSX export and Gmail mail adapter. Records may come from the local filesystem adapter or the Neon-compatible PostgreSQL adapter, but analytics and rendering are shared. The report is public-market reference information only.

| Field | Type | Meaning |
| --- | --- | --- |
| `version` | integer | Canonical report schema version |
| `reportingWeek` | `YYYY-Www` | Completed or explicitly requested ISO week |
| `reportingPeriod` | object | `start`, `end`, and `timezone: Asia/Taipei` |
| `generatedAt` | ISO timestamp | Report generation time |
| `sourceCoverage` | object | Latest source status counts and coverage percentage |
| `qualitySummary` | object | Valid count, warning count, high-volatility count and status counts |
| `marketSummary` | object | Biggest risers, decliners, high-volatility indicators and quality warnings |
| `indicators` | array | One row per configured public indicator |
| `fx` | object | USD/TWD analytics from the independent public FX record |
| `historyRows` | array | Provider-returned historical rows available to the report |
| `purchasingReferenceNote` | string | Explicit non-instruction boundary |
| `disclaimer` | string | Existing public-market disclaimer |

## Indicator schema

Every `indicators[]` item includes `materialId`, `materialName`, `symbol`, `category`, `exchange`, `sourceUnit`, `currency`, `latestObservation`, `latestValidObservation`, `weeklyChangePct`, `fourWeekChangePct`, `threeMonthChangePct`, `ytdChangePct`, `fiftyTwoWeekChangePct`, `weeklyHigh`, `weeklyLow`, `weeklyRangePct`, `rollingVolatilityPct`, `observationCountInWeek`, `freshObservationCount`, `comparisons`, `signal`, `reasonCodes`, `reason`, `trendPoints` and `purchasingReferenceNote`.

`latestObservation` and `latestValidObservation` expose `value`, `date`, `status`, `source`, `lastTradeTimestamp`, `collectedAt` and `provenance`. A missing or invalid value is `null`, never a fabricated zero or price. `trendPoints` contains available fresh public points, up to the compact visual limit, and is optional for rendering.

## Status contract

The weekly layer uses exactly five statuses.

| Status | Meaning | Analytics treatment |
| --- | --- | --- |
| `LIVE` | Existing primary market-service `OK` | Eligible fresh observation |
| `FALLBACK` | Configured public fallback succeeded | Eligible fresh observation, with lineage |
| `STALE` | Last successful public data reused after failure | Not fresh; warning only |
| `NO_DATA` | No finite acceptable observation | Not usable; insufficient state |
| `API_ERROR` | Provider timeout, malformed response or error | Not usable; quality warning |

A report for a historical week excludes future records. A fresh observation means a finite `marketPrice` with `LIVE` or `FALLBACK` status. A stale or error row can explain a warning but cannot become a comparison input.

## Formulas

Let `current` be the latest valid observation at or before the report end date, and `previous` be the latest valid record at or before the target date within the documented gap tolerance.

| Metric | Formula or rule |
| --- | --- |
| Weekly change | `((current - previous_7d) / previous_7d) × 100` |
| Four-week change | `((current - previous_28d) / previous_28d) × 100` |
| Three-month change | `((current - previous_90d) / previous_90d) × 100` |
| YTD change | `((current - previous_at_year_start) / previous_at_year_start) × 100` |
| 52-week change | `((current - previous_364d) / previous_364d) × 100` |
| Weekly high / low | `max` / `min` of fresh points inside reporting week |
| Weekly range | `((high - low) / abs(low)) × 100`, when low is non-zero |
| Rolling volatility | Sample standard deviation of daily percent returns across up to 20 latest fresh returns |
| FX change | The same comparison rules applied to `__fx_usd_twd__` public FX records |

If a comparison is absent, outside its tolerance, non-finite or has a zero denominator, the metric is `null`, and the reason records insufficiency. Market units are never compared across incompatible unit definitions.

## Signal thresholds and reason codes

Signals are selected in this order. A higher-priority condition wins and the exact reason code is retained.

| Priority | Signal | Threshold / reason code |
| ---: | --- | --- |
| 1 | `DATA_QUALITY_WARNING` | Latest status `STALE` or `API_ERROR`; `CURRENT_STATUS_STALE` or `CURRENT_STATUS_API_ERROR` |
| 2 | `DATA_INSUFFICIENT` | Missing current or required comparison; `CURRENT_VALID_OBSERVATION_MISSING` or `COMPARABLE_HISTORY_MISSING` |
| 3 | `HIGH_VOLATILITY` | Rolling volatility ≥ 3 percentage points; `ROLLING_VOLATILITY_AT_OR_ABOVE_3PCT` |
| 4 | `COST_PRESSURE_RISING` | Weekly ≥ 2% or four-week ≥ 4%; corresponding `...AT_OR_ABOVE...` code |
| 5 | `MARKET_WEAKENING` | Weekly ≤ -2% or four-week ≤ -4%; corresponding `...AT_OR_BELOW...` code |
| 6 | `STABLE` | Sufficient data inside reference bounds; `CHANGE_WITHIN_REFERENCE_BOUNDS` |

A signal is an explainable observation, not a BUY, SELL, MUST PURCHASE, stop-buy, negotiation guarantee or company decision. The Traditional Chinese reason must use purchasing-friendly but non-directive language.

## Production quality gate

Before delivery, `evaluateWeeklyQuality` counts tracked indicators, usable `LIVE`／`FALLBACK` rows, `STALE`, `API_ERROR`, `NO_DATA`, insufficient-history comparisons, missing FX and artifact integrity. It returns one of:

| Result | Rule | Delivery behavior |
| --- | --- | --- |
| `SEND_OK` | Usable public observations meet the threshold, no blocking integrity failure and no material warning | Live send is eligible after SMTP and owner approval |
| `SEND_WITH_WARNINGS` | Report is materially usable but exposes fallback, stale, provider, history or FX warnings | Live send is eligible only with warnings preserved |
| `SEND_BLOCKED` | No usable rows, usable ratio below 50%, or required artifact integrity failure | No SMTP attempt; job records a blocked result |

The gate does not fabricate data, convert stale rows to fresh rows or hide provider failure. The same result is present in canonical report metadata and safe operational status.

## Output contract

The HTML report begins with biggest weekly risers, biggest decliners, high-volatility indicators and data-quality warnings. It then displays a compact table of all indicators, source units, statuses, values, weekly／four-week changes, signals and reasons. Inline SVG trend visuals are compact and optional; the text table is sufficient when images are unavailable.

The XLSX report contains exactly these minimum sheets: 「本週摘要」、「市場明細」、「歷史資料」、「資料來源與說明」。 It includes indicator identity, source, unit, current value, weekly／four-week／three-month／YTD／52-week metrics, high／low, volatility, signal, reason, status and timestamps, plus a disclaimer and source explanation.

## Storage and delivery integration

The report generator does not know whether persistence uses `STORAGE_PROVIDER=filesystem` or `STORAGE_PROVIDER=postgres`. Both providers return the canonical records described above. PostgreSQL stores public report metadata keyed by `reporting_week`; filesystem stores the equivalent atomic JSON metadata for local／test use. HTML／XLSX artifacts are generated before any delivery attempt, and the quality gate is evaluated before Gmail SMTP.

The production delivery path is GitHub Actions using owner-approved personal Gmail SMTP. The first live run must keep `MAIL_TEST_MODE=1` and use only `MAIL_TEST_TO`; production recipients remain an owner-controlled external configuration. Render Free is not the scheduler or durable storage provider.

## References

[1]: https://github.com/ggyin0628-code/raw-material-market-dashboard/tree/feat/zero-cost-runtime-v1 "Weekly report implementation branch"
[2]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/zero-cost-runtime-v1/lib/weekly/weeklyAnalytics.js "Analytics implementation"
[3]: https://github.com/ggyin0628-code/raw-material-market-dashboard/blob/feat/zero-cost-runtime-v1/lib/weekly/reportService.js "Report, HTML and XLSX implementation"
