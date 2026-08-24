const ELIGIBLE_STATUSES = new Set(["OK", "FALLBACK"]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function summarizeRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const counts = {
    freshCount: list.filter((row) => row.status === "OK").length,
    fallbackCount: list.filter((row) => row.status === "FALLBACK").length,
    staleCount: list.filter((row) => row.status === "STALE").length,
    expiredCount: list.filter((row) => row.status === "EXPIRED").length,
    apiErrorCount: list.filter((row) => row.status === "API_ERROR").length,
    noDataCount: list.filter((row) => row.status === "NO_DATA").length,
  };
  const eligibleRows = list.filter((row) => ELIGIBLE_STATUSES.has(row.status) && finite(row.changePercent));
  const topGainer = [...eligibleRows].sort((a, b) => b.changePercent - a.changePercent)[0] || null;
  const topLoser = [...eligibleRows].sort((a, b) => a.changePercent - b.changePercent)[0] || null;
  return {
    ...counts,
    usableCount: counts.freshCount + counts.fallbackCount,
    errorCount: counts.apiErrorCount + counts.noDataCount,
    eligibleCount: eligibleRows.length,
    topGainer,
    topLoser,
    headlineWarning: eligibleRows.length === 0 ? "目前沒有 freshness-eligible 行情；最大漲幅與最大跌幅不顯示。" : null,
  };
}

const exported = { ELIGIBLE_STATUSES, summarizeRows };
if (typeof module !== "undefined" && module.exports) module.exports = exported;
if (typeof window !== "undefined") window.dashboardSummary = exported;
