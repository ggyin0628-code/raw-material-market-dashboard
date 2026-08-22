const QUALITY_GATE_STATES = Object.freeze({
  SEND_OK: "SEND_OK",
  SEND_WITH_WARNINGS: "SEND_WITH_WARNINGS",
  SEND_BLOCKED: "SEND_BLOCKED",
});

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function evaluateWeeklyQuality(reportLike = {}, options = {}) {
  const indicators = Array.isArray(reportLike.indicators) ? reportLike.indicators : [];
  const trackedIndicatorCount = indicators.length;
  const statuses = { LIVE: 0, FALLBACK: 0, STALE: 0, NO_DATA: 0, API_ERROR: 0, ...(reportLike.qualitySummary?.statuses || {}) };
  const usableIndicatorCount = indicators.filter((item) => item.latestValidObservation?.date && finite(item.latestValidObservation?.value)).length;
  const apiErrorCount = Number(statuses.API_ERROR || 0);
  const noDataCount = Number(statuses.NO_DATA || 0);
  const staleCount = Number(statuses.STALE || 0);
  const fallbackCount = Number(statuses.FALLBACK || 0);
  const insufficientHistoryCount = indicators.filter((item) => item.signal === "DATA_INSUFFICIENT" || (item.reasonCodes || []).some((code) => String(code).includes("HISTORY"))).length;
  const missingFx = !reportLike.fx?.latestObservation || !finite(reportLike.fx.latestObservation.value ?? reportLike.fx.latestObservation.marketPrice);
  const artifactIntegrity = options.artifactIntegrity !== false;
  const integrityReasons = [];
  if (!reportLike.reportingWeek || !reportLike.reportingPeriod?.start || !reportLike.reportingPeriod?.end) integrityReasons.push("REPORT_PERIOD_MISSING");
  if (!trackedIndicatorCount) integrityReasons.push("NO_TRACKED_INDICATORS");
  if (!artifactIntegrity) integrityReasons.push("ARTIFACT_INTEGRITY_FAILED");
  const materiallyUnusable = !trackedIndicatorCount || !usableIndicatorCount || usableIndicatorCount / trackedIndicatorCount < 0.5;
  const warningReasons = [];
  if (apiErrorCount) warningReasons.push("API_ERROR_PRESENT");
  if (noDataCount) warningReasons.push("NO_DATA_PRESENT");
  if (staleCount) warningReasons.push("STALE_PRESENT");
  if (fallbackCount) warningReasons.push("FALLBACK_PRESENT");
  if (insufficientHistoryCount) warningReasons.push("INSUFFICIENT_HISTORY_PRESENT");
  if (missingFx) warningReasons.push("FX_MISSING");
  let state = QUALITY_GATE_STATES.SEND_OK;
  if (integrityReasons.length || materiallyUnusable) state = QUALITY_GATE_STATES.SEND_BLOCKED;
  else if (warningReasons.length) state = QUALITY_GATE_STATES.SEND_WITH_WARNINGS;
  return {
    state,
    readyForDelivery: state !== QUALITY_GATE_STATES.SEND_BLOCKED,
    trackedIndicatorCount,
    usableIndicatorCount,
    apiErrorCount,
    noDataCount,
    staleCount,
    fallbackCount,
    insufficientHistoryCount,
    missingFx,
    warningReasons,
    integrityReasons,
    materialUsabilityPct: trackedIndicatorCount ? usableIndicatorCount / trackedIndicatorCount * 100 : 0,
  };
}

function assertReportDeliverable(report) {
  const gate = report?.qualityGate || evaluateWeeklyQuality(report);
  if (gate.state === QUALITY_GATE_STATES.SEND_BLOCKED) {
    const error = new Error(`週報品質閘門阻擋交付：${[...gate.integrityReasons, ...gate.warningReasons].join(",") || "資料不足"}`);
    error.code = "REPORT_QUALITY_BLOCKED";
    error.statusCode = 422;
    error.qualityGate = gate;
    throw error;
  }
  return gate;
}

module.exports = {
  QUALITY_GATE_STATES,
  evaluateWeeklyQuality,
  assertReportDeliverable,
};
