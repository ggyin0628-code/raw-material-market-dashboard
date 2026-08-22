const { materials } = require("../marketData/materials");
const { FX_MATERIAL_ID, canonicalWeeklyStatus } = require("./snapshotStore");
const { addDays, dayDifference, parseReportingWeek } = require("./weekUtils");

const FRESH_STATUSES = new Set(["LIVE", "FALLBACK"]);
const WINDOW_DEFINITIONS = Object.freeze({
  weekly: { label: "近一週", targetDays: 7, maxGapDays: 10 },
  fourWeek: { label: "近四週", targetDays: 28, maxGapDays: 45 },
  threeMonth: { label: "近三個月", targetDays: 90, maxGapDays: 120 },
  ytd: { label: "YTD", targetDays: null, maxGapDays: 45 },
  fiftyTwoWeek: { label: "近五十二週", targetDays: 364, maxGapDays: 420 },
});

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function compareRecords(a, b) {
  return a.date.localeCompare(b.date) || String(a.collectedAt || "").localeCompare(String(b.collectedAt || ""));
}

function normalizedRecord(record) {
  return {
    ...record,
    status: canonicalWeeklyStatus(record?.status),
  };
}

function freshRecords(records) {
  return (records || []).map(normalizedRecord).filter((record) => FRESH_STATUSES.has(record.status) && finite(record.marketPrice)).sort(compareRecords);
}

function recordsForMaterial(records, materialId) {
  return (records || []).map(normalizedRecord).filter((record) => record.materialId === materialId).sort(compareRecords);
}

function latestRecord(records, predicate = () => true) {
  return [...records].filter(predicate).sort(compareRecords).at(-1) || null;
}

function latestFreshRecord(records, predicate = () => true) {
  return latestRecord(freshRecords(records), predicate);
}

function recordAtOrBefore(records, targetDate, maxGapDays) {
  const selected = latestFreshRecord(records, (record) => record.date <= targetDate);
  if (!selected) return null;
  if (maxGapDays != null && dayDifference(selected.date, targetDate) > maxGapDays) return null;
  return selected;
}

function percentChange(current, previous) {
  if (!finite(current) || !finite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function standardDeviation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function rollingVolatility(records, endDate, limit = 20) {
  const fresh = freshRecords(records).filter((record) => record.date <= endDate).slice(-limit - 1);
  const returns = [];
  for (let index = 1; index < fresh.length; index += 1) {
    const change = percentChange(fresh[index].marketPrice, fresh[index - 1].marketPrice);
    if (finite(change)) returns.push(change);
  }
  return standardDeviation(returns);
}

function yearStart(dateKey) {
  return `${dateKey.slice(0, 4)}-01-01`;
}

function targetDateForWindow(windowName, period) {
  if (windowName === "ytd") return yearStart(period.end);
  return addDays(period.end, -WINDOW_DEFINITIONS[windowName].targetDays);
}

function calculateChange(current, records, windowName, period) {
  const definition = WINDOW_DEFINITIONS[windowName];
  const targetDate = targetDateForWindow(windowName, period);
  const previous = recordAtOrBefore(records, targetDate, definition.maxGapDays);
  if (!previous || !current) return { value: null, previous: null, targetDate };
  return { value: percentChange(current.marketPrice, previous.marketPrice), previous, targetDate };
}

function buildSignal(indicator) {
  const currentStatus = indicator.latestObservation?.status || "NO_DATA";
  if (currentStatus === "STALE" || currentStatus === "API_ERROR") {
    return {
      signal: "DATA_QUALITY_WARNING",
      reasonCodes: [`CURRENT_STATUS_${currentStatus}`],
      reason: currentStatus === "STALE" ? "目前只有最近一次成功的舊快取，未視為本週新鮮觀測。" : "目前公開來源回傳錯誤，未使用錯誤資料計算週變化。",
    };
  }
  if (currentStatus === "NO_DATA" || !indicator.latestValidObservation) {
    return {
      signal: "DATA_INSUFFICIENT",
      reasonCodes: ["CURRENT_VALID_OBSERVATION_MISSING"],
      reason: "本週沒有可用的有限公開行情觀測。",
    };
  }
  const reasons = [];
  if (indicator.weeklyChangePct == null || indicator.fourWeekChangePct == null) reasons.push("COMPARABLE_HISTORY_MISSING");
  if (indicator.weeklyChangePct == null) {
    return { signal: "DATA_INSUFFICIENT", reasonCodes: reasons, reason: "缺少可比的前週公開行情，無法計算週變化。" };
  }
  if (indicator.rollingVolatilityPct != null && indicator.rollingVolatilityPct >= 3) {
    reasons.push("ROLLING_VOLATILITY_AT_OR_ABOVE_3PCT");
    return { signal: "HIGH_VOLATILITY", reasonCodes: reasons, reason: `滾動波動度 ${indicator.rollingVolatilityPct.toFixed(2)}% 達到 3% 參考門檻。` };
  }
  if (indicator.weeklyChangePct >= 2) {
    reasons.push("WEEKLY_CHANGE_AT_OR_ABOVE_2PCT");
    if (indicator.fourWeekChangePct != null && indicator.fourWeekChangePct >= 4) reasons.push("FOUR_WEEK_CHANGE_AT_OR_ABOVE_4PCT");
    return { signal: "COST_PRESSURE_RISING", reasonCodes: reasons, reason: `近一週變化 ${indicator.weeklyChangePct.toFixed(2)}% 高於市場趨勢參考門檻。` };
  }
  if (indicator.fourWeekChangePct != null && indicator.fourWeekChangePct >= 4) {
    reasons.push("FOUR_WEEK_CHANGE_AT_OR_ABOVE_4PCT");
    return { signal: "COST_PRESSURE_RISING", reasonCodes: reasons, reason: `近四週變化 ${indicator.fourWeekChangePct.toFixed(2)}% 高於市場趨勢參考門檻。` };
  }
  if (indicator.weeklyChangePct <= -2) {
    reasons.push("WEEKLY_CHANGE_AT_OR_BELOW_NEGATIVE_2PCT");
    if (indicator.fourWeekChangePct != null && indicator.fourWeekChangePct <= -4) reasons.push("FOUR_WEEK_CHANGE_AT_OR_BELOW_NEGATIVE_4PCT");
    return { signal: "MARKET_WEAKENING", reasonCodes: reasons, reason: `近一週變化 ${indicator.weeklyChangePct.toFixed(2)}% 顯示公開市場轉弱。` };
  }
  if (indicator.fourWeekChangePct != null && indicator.fourWeekChangePct <= -4) {
    reasons.push("FOUR_WEEK_CHANGE_AT_OR_BELOW_NEGATIVE_4PCT");
    return { signal: "MARKET_WEAKENING", reasonCodes: reasons, reason: `近四週變化 ${indicator.fourWeekChangePct.toFixed(2)}% 顯示公開市場轉弱。` };
  }
  return { signal: "STABLE", reasonCodes: ["CHANGE_WITHIN_REFERENCE_BOUNDS"], reason: "可比公開行情未跨越週變化參考門檻。" };
}

function buildIndicatorAnalytics(material, records, period) {
  const materialRecords = recordsForMaterial(records, material.id);
  const fresh = freshRecords(materialRecords);
  const inWeek = fresh.filter((record) => record.date >= period.start && record.date <= period.end);
  const latestObservation = latestRecord(materialRecords, (record) => record.date <= period.end);
  const latestValidObservation = latestFreshRecord(materialRecords, (record) => record.date <= period.end);
  const weeklyHigh = inWeek.length ? Math.max(...inWeek.map((record) => record.marketPrice)) : null;
  const weeklyLow = inWeek.length ? Math.min(...inWeek.map((record) => record.marketPrice)) : null;
  const weeklyRangePct = weeklyHigh != null && weeklyLow != null && weeklyLow !== 0 ? ((weeklyHigh - weeklyLow) / Math.abs(weeklyLow)) * 100 : null;
  const weekly = calculateChange(latestValidObservation, fresh, "weekly", period);
  const fourWeek = calculateChange(latestValidObservation, fresh, "fourWeek", period);
  const threeMonth = calculateChange(latestValidObservation, fresh, "threeMonth", period);
  const ytd = calculateChange(latestValidObservation, fresh, "ytd", period);
  const fiftyTwoWeek = calculateChange(latestValidObservation, fresh, "fiftyTwoWeek", period);
  const indicator = {
    materialId: material.id,
    materialName: material.name,
    symbol: material.symbol,
    category: material.category,
    exchange: material.exchange,
    sourceUnit: material.unit,
    currency: material.currency,
    latestObservation,
    latestValidObservation,
    weeklyChangePct: weekly.value,
    fourWeekChangePct: fourWeek.value,
    threeMonthChangePct: threeMonth.value,
    ytdChangePct: ytd.value,
    fiftyTwoWeekChangePct: fiftyTwoWeek.value,
    weeklyHigh,
    weeklyLow,
    weeklyRangePct,
    rollingVolatilityPct: rollingVolatility(fresh, period.end),
    observationCountInWeek: inWeek.length,
    freshObservationCount: fresh.filter((record) => record.date <= period.end).length,
    comparisons: {
      weekly: { targetDate: weekly.targetDate, comparableDate: weekly.previous?.date || null },
      fourWeek: { targetDate: fourWeek.targetDate, comparableDate: fourWeek.previous?.date || null },
      threeMonth: { targetDate: threeMonth.targetDate, comparableDate: threeMonth.previous?.date || null },
      ytd: { targetDate: ytd.targetDate, comparableDate: ytd.previous?.date || null },
      fiftyTwoWeek: { targetDate: fiftyTwoWeek.targetDate, comparableDate: fiftyTwoWeek.previous?.date || null },
    },
  };
  return { ...indicator, ...buildSignal(indicator) };
}

function buildFxAnalytics(records, period) {
  const fxRecords = recordsForMaterial(records, FX_MATERIAL_ID);
  if (!fxRecords.length) return { materialId: FX_MATERIAL_ID, latestObservation: null, signal: "DATA_INSUFFICIENT", reasonCodes: ["FX_OBSERVATION_MISSING"], reason: "本週沒有有效公開 USD/TWD 觀測。" };
  const synthetic = { id: FX_MATERIAL_ID, name: "USD/TWD", symbol: "TWD=X", category: "匯率", exchange: "PUBLIC FX", unit: "TWD/USD", currency: "TWD" };
  return buildIndicatorAnalytics(synthetic, records, period);
}

function sourceCoverage(records, period) {
  const latestByMaterial = new Map();
  const materialIds = new Set(materials.map((material) => material.id));
  for (const record of records || []) {
    if (record.date > period.end || !materialIds.has(record.materialId)) continue;
    const current = latestByMaterial.get(record.materialId);
    if (!current || compareRecords(current, record) < 0) latestByMaterial.set(record.materialId, normalizedRecord(record));
  }
  const counts = { LIVE: 0, FALLBACK: 0, STALE: 0, NO_DATA: 0, API_ERROR: 0 };
  for (const record of latestByMaterial.values()) counts[record.status] = (counts[record.status] || 0) + 1;
  return { counts, observedIndicators: latestByMaterial.size, totalIndicators: materials.length, coveragePct: materials.length ? (counts.LIVE + counts.FALLBACK) / materials.length * 100 : 0 };
}

function buildWeeklyAnalytics(records, reportingWeek) {
  const period = typeof reportingWeek === "string" ? parseReportingWeek(reportingWeek) : reportingWeek;
  const indicators = materials.map((material) => buildIndicatorAnalytics(material, records, period));
  const fx = buildFxAnalytics(records, period);
  const coverage = sourceCoverage(records, period);
  const qualityWarnings = indicators.filter((indicator) => ["DATA_QUALITY_WARNING", "DATA_INSUFFICIENT"].includes(indicator.signal));
  const risers = indicators.filter((indicator) => finite(indicator.weeklyChangePct)).sort((a, b) => b.weeklyChangePct - a.weeklyChangePct).slice(0, 3);
  const decliners = indicators.filter((indicator) => finite(indicator.weeklyChangePct)).sort((a, b) => a.weeklyChangePct - b.weeklyChangePct).slice(0, 3);
  const highVolatility = indicators.filter((indicator) => indicator.signal === "HIGH_VOLATILITY").sort((a, b) => (b.rollingVolatilityPct || 0) - (a.rollingVolatilityPct || 0));
  return {
    period,
    indicators,
    fx,
    coverage,
    qualityWarnings,
    risers,
    decliners,
    highVolatility,
    summary: {
      reportingWeek: period.reportingWeek,
      latestValidCount: indicators.filter((indicator) => indicator.latestValidObservation).length,
      dataQualityWarningCount: qualityWarnings.length,
      highVolatilityCount: highVolatility.length,
    },
  };
}

module.exports = {
  FRESH_STATUSES,
  WINDOW_DEFINITIONS,
  finite,
  freshRecords,
  recordsForMaterial,
  latestRecord,
  latestFreshRecord,
  recordAtOrBefore,
  percentChange,
  standardDeviation,
  rollingVolatility,
  buildSignal,
  buildIndicatorAnalytics,
  buildFxAnalytics,
  sourceCoverage,
  buildWeeklyAnalytics,
};
