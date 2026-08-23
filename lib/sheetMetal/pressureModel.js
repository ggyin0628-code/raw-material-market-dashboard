const {
  COMPONENT_IDS,
  DATA_LAYERS,
  PUBLIC_MARKET_DISCLAIMER,
  buildEmptyPressureComponent,
  finiteNumber,
  normalizeDate,
  normalizeProvenance,
  qualityFromStatuses,
  validateSheetMetalReference,
} = require("./sheetMetalContract");

const DEFAULT_WEIGHTS = Object.freeze({
  materialPressure: 0.30,
  energyPressure: 0.15,
  laborPressure: 0.12,
  fxPressure: 0.10,
  manufacturingPricePressure: 0.18,
  capacityDemandPressure: 0.15,
});

const DEFAULT_MINIMUM_EVIDENCE = 3;
const PRESSURE_BAND = Object.freeze({ low: 25, normal: 50, elevated: 75 });
const COMPARISON_DEFINITIONS = Object.freeze({
  fourWeek: Object.freeze({ key: "fourWeek", label: "4 週", days: 28 }),
  twelveWeek: Object.freeze({ key: "twelveWeek", label: "12 週", days: 84 }),
  oneMonth: Object.freeze({ key: "oneMonth", label: "1 個月", months: 1 }),
  threeMonth: Object.freeze({ key: "threeMonth", label: "3 個月", months: 3 }),
  oneYear: Object.freeze({ key: "oneYear", label: "1 年", months: 12 }),
  threeYear: Object.freeze({ key: "threeYear", label: "3 年", months: 36 }),
});
const FREQUENCY_WINDOWS = Object.freeze({
  daily: Object.freeze(["fourWeek", "twelveWeek"]),
  weekly: Object.freeze(["fourWeek", "twelveWeek"]),
  monthly: Object.freeze(["oneMonth", "threeMonth", "oneYear"]),
  annual: Object.freeze(["oneYear", "threeYear"]),
  structural: Object.freeze([]),
  unknown: Object.freeze([]),
});
const COMPARISON_ORDER = Object.freeze(["twelveWeek", "fourWeek", "threeMonth", "oneMonth", "oneYear", "threeYear"]);

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function normalizeWeights(weights = DEFAULT_WEIGHTS) {
  const candidate = {};
  for (const id of COMPONENT_IDS) {
    const value = finiteNumber(weights[id]);
    if (value === null || value < 0) throw new Error(`weight must be a non-negative number: ${id}`);
    candidate[id] = value;
  }
  const total = Object.values(candidate).reduce((sum, value) => sum + value, 0);
  if (!total) throw new Error("at least one weight must be greater than zero");
  return Object.fromEntries(Object.entries(candidate).map(([id, value]) => [id, value / total]));
}

function toTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function sortedHistory(history = []) {
  return history
    .map((point) => ({ date: normalizeDate(point.date || point.observedAt), value: finiteNumber(point.value ?? point.close) }))
    .filter((point) => point.date && point.value !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function pointAtOrBefore(points, targetTimestamp) {
  let selected = null;
  for (const point of points) {
    const timestamp = toTimestamp(point.date);
    if (timestamp !== null && timestamp <= targetTimestamp) selected = point;
    if (timestamp !== null && timestamp > targetTimestamp) break;
  }
  return selected;
}

function subtractMonths(dateValue, months) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date.getTime();
}

function percentChange(current, baseline) {
  return typeof current === "number" && typeof baseline === "number" && baseline !== 0
    ? ((current - baseline) / Math.abs(baseline)) * 100
    : null;
}

function directionFromChange(change) {
  if (change === null) return null;
  if (change > 1) return "RISING";
  if (change < -1) return "FALLING";
  return "STABLE";
}

function pressureLevel(score) {
  if (score === null) return null;
  if (score < PRESSURE_BAND.low) return "LOW";
  if (score < PRESSURE_BAND.normal) return "NORMAL";
  if (score < PRESSURE_BAND.elevated) return "ELEVATED";
  return "HIGH";
}

function sourceStatusIsUsable(status) {
  return ["LIVE", "FALLBACK", "STALE"].includes(status);
}

function normalizedFrequency(input = {}) {
  const frequency = String(input.frequency || input.sourceProvenance?.frequency || "daily").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(FREQUENCY_WINDOWS, frequency) ? frequency : "unknown";
}

function normalizeInputObservation(input = {}) {
  const history = sortedHistory(input.history);
  const latest = history[history.length - 1] || {
    date: normalizeDate(input.observedAt || input.date),
    value: finiteNumber(input.value),
  };
  const status = input.status || "NO_DATA";
  const frequency = normalizedFrequency(input);
  const provenance = normalizeProvenance({
    ...input.sourceProvenance,
    sourceId: input.sourceProvenance?.sourceId || input.sourceId,
    sourceName: input.sourceProvenance?.sourceName || input.sourceName,
    url: input.sourceProvenance?.url || input.url,
    endpoint: input.sourceProvenance?.endpoint || input.endpoint,
    geographicScope: input.sourceProvenance?.geographicScope || input.geographicScope,
    updateFrequency: input.sourceProvenance?.updateFrequency || input.updateFrequency,
    unit: input.sourceProvenance?.unit || input.unit,
    accessConstraints: input.sourceProvenance?.accessConstraints || input.accessConstraints,
    status,
    lastObservationDate: latest.date,
    frequency,
    fetchedAt: input.sourceProvenance?.fetchedAt || input.fetchedAt,
    note: input.sourceProvenance?.note || input.note,
  });
  return {
    id: String(input.id || provenance.sourceId),
    label: String(input.label || input.id || "公開指標"),
    value: latest.value,
    date: latest.date,
    unit: String(input.unit || provenance.unit),
    status: provenance.status,
    frequency,
    history,
    provenance,
  };
}

function comparisonBaseline(observation, definition) {
  const latestTimestamp = toTimestamp(observation.date);
  if (latestTimestamp === null) return null;
  if (definition.days) return pointAtOrBefore(observation.history, latestTimestamp - definition.days * 86400000);
  if (definition.months) return pointAtOrBefore(observation.history, subtractMonths(observation.date, definition.months));
  return null;
}

function comparisonsForObservation(observation) {
  const definitions = FREQUENCY_WINDOWS[observation.frequency] || [];
  return definitions.map((key) => {
    const definition = COMPARISON_DEFINITIONS[key];
    const baseline = comparisonBaseline(observation, definition);
    const changePct = percentChange(observation.value, baseline?.value);
    return {
      key,
      label: definition.label,
      changePct,
      direction: directionFromChange(changePct),
      baselineDate: baseline?.date || null,
      frequency: observation.frequency,
    };
  });
}

function summarizeMarketRoles(sources = []) {
  const summary = {};
  for (const source of sources) {
    const role = source.marketRole || "TAIWAN_DOMESTIC";
    summary[role] = (summary[role] || 0) + 1;
  }
  return summary;
}

function average(values) {
  const usableValues = values.filter((value) => value !== null);
  return usableValues.length ? usableValues.reduce((sum, value) => sum + value, 0) / usableValues.length : null;
}

function aggregateComparisons(changes) {
  const byKey = new Map();
  for (const item of changes) {
    for (const comparison of item.comparisons) {
      if (comparison.changePct === null) continue;
      const values = byKey.get(comparison.key) || [];
      values.push(comparison.changePct);
      byKey.set(comparison.key, values);
    }
  }
  return COMPARISON_ORDER
    .filter((key) => byKey.has(key))
    .map((key) => ({
      key,
      label: COMPARISON_DEFINITIONS[key].label,
      changePct: average(byKey.get(key)),
      direction: directionFromChange(average(byKey.get(key))),
    }));
}

function buildComponent(definition = {}) {
  const normalized = (definition.observations || []).map(normalizeInputObservation);
  const usable = normalized.filter((observation) => sourceStatusIsUsable(observation.status) && observation.value !== null);
  if (!usable.length) {
    const sourceProvenance = normalized.map((observation) => observation.provenance);
    const dataQuality = normalized.length ? qualityFromStatuses(normalized.map((observation) => observation.status)) : (definition.status || "NO_DATA");
    return {
      ...buildEmptyPressureComponent(definition.id, definition.label, dataQuality, definition.noDataReason),
      dataQuality,
      sourceProvenance,
      comparisonWindows: [],
      selectedComparisonWindow: null,
    };
  }

  const changes = usable.map((observation) => ({ observation, comparisons: comparisonsForObservation(observation) }));
  const comparisonWindows = aggregateComparisons(changes);
  const selectedComparisonWindow = comparisonWindows[0] || null;
  const withProvenance = (reason) => ({
    ...buildEmptyPressureComponent(definition.id, definition.label, qualityFromStatuses(usable.map((observation) => observation.status)), reason),
    sourceProvenance: usable.map((observation) => observation.provenance),
    comparisonWindows,
    selectedComparisonWindow,
  });
  if (!comparisonWindows.length) return withProvenance(definition.noDataReason || `${definition.label} 沒有適合其資料頻率的對照觀測。`);

  const change4WeekPct = comparisonWindows.find((item) => item.key === "fourWeek")?.changePct ?? null;
  const change12WeekPct = comparisonWindows.find((item) => item.key === "twelveWeek")?.changePct ?? null;
  const anchorChange = selectedComparisonWindow.changePct;
  const score = clamp(50 + anchorChange * 5);
  const statuses = usable.map((item) => item.status);
  const confidence = clamp((usable.length / Math.max(1, definition.expectedEvidence || 1)) * (statuses.includes("STALE") ? 0.7 : statuses.includes("FALLBACK") ? 0.85 : 1), 0, 1);
  const direction4Week = directionFromChange(change4WeekPct);
  const direction12Week = directionFromChange(change12WeekPct);
  const direction = selectedComparisonWindow.direction;
  const explanation = [];
  for (const comparison of comparisonWindows) explanation.push(`${definition.label} 近${comparison.label} ${comparison.changePct >= 0 ? "+" : ""}${comparison.changePct.toFixed(2)}%，方向 ${comparison.direction}。`);
  if (change4WeekPct === null) explanation.push(`${definition.label} 沒有適合其資料頻率的 4 週對照觀測。`);
  if (change12WeekPct === null) explanation.push(`${definition.label} 沒有適合其資料頻率的 12 週對照觀測。`);
  if (statuses.includes("STALE")) explanation.push("部分證據為 STALE；結果保留但不視為即時。");
  if (statuses.includes("FALLBACK")) explanation.push("部分證據使用公開備援來源；請查看來源沿革。");
  const roles = [...new Set(usable.map((item) => item.provenance.marketRole))];
  if (roles.includes("GLOBAL_IMPORT_REFERENCE")) explanation.push("本構面含國際／進口市場參考；不代表台灣國內供應商價格。");
  if (roles.includes("GLOBAL_INPUT_PROXY")) explanation.push("本構面含全球上游投入代理；不等同於成品或鈑金價格，也不套用合金換算公式。");

  return {
    id: definition.id,
    label: definition.label,
    pressureScore: Number(score.toFixed(2)),
    pressureLevel: pressureLevel(score),
    trend: direction,
    direction4Week,
    direction12Week,
    change4WeekPct: change4WeekPct === null ? null : Number(change4WeekPct.toFixed(2)),
    change12WeekPct: change12WeekPct === null ? null : Number(change12WeekPct.toFixed(2)),
    evidenceCount: usable.length,
    confidence: Number(confidence.toFixed(2)),
    dataQuality: qualityFromStatuses(statuses),
    sourceProvenance: usable.map((item) => item.provenance),
    explanation,
    comparisonWindows: comparisonWindows.map((item) => ({ ...item, changePct: Number(item.changePct.toFixed(2)) })),
    selectedComparisonWindow: { ...selectedComparisonWindow, changePct: Number(selectedComparisonWindow.changePct.toFixed(2)) },
    observedValues: usable.map((item) => ({
      seriesId: item.id,
      label: item.label,
      value: item.value,
      observedAt: item.date,
      unit: item.unit,
      frequency: item.frequency,
      status: item.status,
      marketScope: item.provenance.marketScope,
      marketRole: item.provenance.marketRole,
      pricingBasis: item.provenance.pricingBasis,
      currency: item.provenance.currency,
      layer: DATA_LAYERS.OBSERVED_PUBLIC_DATA,
    })),
  };
}

function weightedComparisonWindows(components, available, weights) {
  return COMPARISON_ORDER.map((key) => {
    const candidates = available.filter((id) => components[id].comparisonWindows.some((item) => item.key === key));
    const weight = candidates.reduce((sum, id) => sum + weights[id], 0);
    if (!weight) return null;
    const changePct = candidates.reduce((sum, id) => sum + components[id].comparisonWindows.find((item) => item.key === key).changePct * weights[id], 0) / weight;
    return { key, label: COMPARISON_DEFINITIONS[key].label, changePct: Number(changePct.toFixed(2)), direction: directionFromChange(changePct) };
  }).filter(Boolean);
}

function buildSheetMetalReference(input = {}) {
  const weights = normalizeWeights(input.weights || DEFAULT_WEIGHTS);
  const minimumEvidence = Number.isInteger(input.minimumEvidence) ? input.minimumEvidence : DEFAULT_MINIMUM_EVIDENCE;
  if (minimumEvidence < 1 || minimumEvidence > COMPONENT_IDS.length) throw new Error("minimumEvidence must be between 1 and component count");

  const definitions = input.components || {};
  const components = Object.fromEntries(COMPONENT_IDS.map((id) => [id, buildComponent({
    id,
    label: definitions[id]?.label || id,
    observations: definitions[id]?.observations || [],
    expectedEvidence: definitions[id]?.expectedEvidence || 1,
    status: definitions[id]?.status,
    noDataReason: definitions[id]?.noDataReason,
  })]));
  const available = COMPONENT_IDS.filter((id) => components[id].pressureScore !== null && weights[id] > 0);
  const evidenceCount = available.length;
  const availableWeight = available.reduce((sum, id) => sum + weights[id], 0);
  const compositePressureScore = evidenceCount >= minimumEvidence && availableWeight > 0
    ? Number((available.reduce((sum, id) => sum + components[id].pressureScore * weights[id], 0) / availableWeight).toFixed(2))
    : null;
  const weightedChange = (field) => {
    const candidates = available.filter((id) => components[id][field] !== null);
    const weight = candidates.reduce((sum, id) => sum + weights[id], 0);
    return weight ? candidates.reduce((sum, id) => sum + components[id][field] * weights[id], 0) / weight : null;
  };
  const compositeChange4Week = weightedChange("change4WeekPct");
  const compositeChange12Week = weightedChange("change12WeekPct");
  const compositeComparisonWindows = weightedComparisonWindows(components, available, weights);
  const selectedCompositeComparisonWindow = compositeComparisonWindows[0] || null;
  const componentStatuses = COMPONENT_IDS.flatMap((id) => components[id].sourceProvenance.map((source) => source.status));
  const dataQuality = evidenceCount < minimumEvidence ? "DATA_INSUFFICIENT" : qualityFromStatuses(componentStatuses);
  const overallConfidence = evidenceCount >= minimumEvidence
    ? Number((available.reduce((sum, id) => sum + components[id].confidence * weights[id], 0) / availableWeight * (evidenceCount / COMPONENT_IDS.length)).toFixed(2))
    : Number((evidenceCount / COMPONENT_IDS.length).toFixed(2));
  const explanation = [];
  if (compositePressureScore === null) {
    explanation.push(`目前只有 ${evidenceCount}/${minimumEvidence} 個壓力構面具備有效公開證據；未產生綜合分數。`);
  } else {
    const ranked = [...available].sort((a, b) => components[b].pressureScore - components[a].pressureScore);
    explanation.push(`綜合分數 ${compositePressureScore.toFixed(2)}/100，依鈑金公開證據權重重新正規化；最高壓力構面為 ${components[ranked[0]].label}。`);
    if (selectedCompositeComparisonWindow) explanation.push(`綜合構面近${selectedCompositeComparisonWindow.label}變化 ${selectedCompositeComparisonWindow.changePct >= 0 ? "+" : ""}${selectedCompositeComparisonWindow.changePct.toFixed(2)}%，方向 ${selectedCompositeComparisonWindow.direction}。`);
  }
  for (const id of [...available].sort((a, b) => components[b].pressureScore - components[a].pressureScore)) {
    const component = components[id];
    explanation.push(`${component.label}：${component.pressureScore.toFixed(2)}/100（${component.pressureLevel}）；${component.explanation[0]}`);
  }
  const reference = {
    referenceDate: normalizeDate(input.referenceDate || new Date().toISOString()),
    region: input.region || "Taiwan",
    processFamily: "SHEET_METAL",
    materialFamily: input.materialFamily || "熱軋鋼、鋁與台灣金屬製品製造公開代理指標",
    materialPressure: components.materialPressure,
    energyPressure: components.energyPressure,
    laborPressure: components.laborPressure,
    fxPressure: components.fxPressure,
    manufacturingPricePressure: components.manufacturingPricePressure,
    capacityDemandPressure: components.capacityDemandPressure,
    compositePressureScore,
    pressureLevel: pressureLevel(compositePressureScore),
    trend: compositePressureScore === null ? null : (selectedCompositeComparisonWindow?.direction || directionFromChange(compositeChange12Week ?? compositeChange4Week)),
    confidence: overallConfidence,
    dataQuality,
    sourceProvenance: [...new Map(COMPONENT_IDS.flatMap((id) => components[id].sourceProvenance).map((source) => [source.sourceId, source])).values()],
    sourceRoleSummary: summarizeMarketRoles(COMPONENT_IDS.flatMap((id) => components[id].sourceProvenance)),
    explanation: [
      ...explanation,
      "這是 DERIVED_MARKET_REFERENCE，僅由外部公開觀測與公開來源狀態推導；不包含任何供應商報價或公司內部價格。",
      "國際／進口市場參考與全球上游投入代理會保留其角色；不代表台灣國內供應商價格，也不使用公司進口比例。",
    ],
    disclaimer: PUBLIC_MARKET_DISCLAIMER,
    observedPublicData: COMPONENT_IDS.flatMap((id) => components[id].observedValues || []),
    derivedMarketReference: {
      layer: DATA_LAYERS.DERIVED_MARKET_REFERENCE,
      weights,
      minimumEvidence,
      evidenceCount,
      availableComponents: available,
      normalization: "日資料使用 4／12 週；月資料使用 1／3／12 個月；年資料使用 1／3 年；結構性資料不產生動能分數。壓力分數 = clamp(50 + 5 × 適頻率比較變化百分點, 0, 100)，可用構面依鈑金專屬權重重新正規化。",
      comparisonWindows: compositeComparisonWindows,
      selectedComparisonWindow: selectedCompositeComparisonWindow,
      sourceRoleSummary: summarizeMarketRoles(COMPONENT_IDS.flatMap((id) => components[id].sourceProvenance)),
      compositeChange4WeekPct: compositeChange4Week === null ? null : Number(compositeChange4Week.toFixed(2)),
      compositeChange12WeekPct: compositeChange12Week === null ? null : Number(compositeChange12Week.toFixed(2)),
    },
    engineeringEstimate: null,
  };
  const errors = validateSheetMetalReference(reference);
  if (errors.length) throw new Error(`sheet-metal reference contract invalid: ${errors.join("; ")}`);
  return reference;
}

module.exports = {
  COMPONENT_IDS,
  COMPARISON_DEFINITIONS,
  DEFAULT_MINIMUM_EVIDENCE,
  DEFAULT_WEIGHTS,
  FREQUENCY_WINDOWS,
  PRESSURE_BAND,
  buildComponent,
  buildSheetMetalReference,
  clamp,
  comparisonsForObservation,
  normalizeWeights,
  pressureLevel,
  summarizeMarketRoles,
};
