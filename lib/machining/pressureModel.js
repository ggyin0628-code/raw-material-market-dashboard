const {
  DATA_LAYERS,
  PUBLIC_MARKET_DISCLAIMER,
  buildEmptyPressureComponent,
  finiteNumber,
  normalizeDate,
  normalizeProvenance,
  qualityFromStatuses,
  validateMachiningReference,
} = require("./machiningContract");

const COMPONENT_IDS = Object.freeze([
  "materialPressure",
  "energyPressure",
  "laborPressure",
  "fxPressure",
  "manufacturingPricePressure",
  "machineCapitalPressure",
]);

const DEFAULT_WEIGHTS = Object.freeze({
  materialPressure: 0.25,
  energyPressure: 0.15,
  laborPressure: 0.15,
  fxPressure: 0.15,
  manufacturingPricePressure: 0.2,
  machineCapitalPressure: 0.1,
});

const DEFAULT_MINIMUM_EVIDENCE = 3;
const DEFAULT_WINDOW_DAYS = Object.freeze({ fourWeek: 28, twelveWeek: 84 });
const PRESSURE_BAND = Object.freeze({ low: 25, normal: 50, elevated: 75 });

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

function normalizeInputObservation(input = {}) {
  const history = sortedHistory(input.history);
  const latest = history[history.length - 1] || {
    date: normalizeDate(input.observedAt || input.date),
    value: finiteNumber(input.value),
  };
  const status = input.status || "NO_DATA";
  const provenance = normalizeProvenance({
    ...input.sourceProvenance,
    sourceId: input.sourceProvenance?.sourceId || input.sourceId,
    sourceName: input.sourceProvenance?.sourceName || input.sourceName,
    url: input.sourceProvenance?.url || input.url,
    geographicScope: input.sourceProvenance?.geographicScope || input.geographicScope,
    updateFrequency: input.sourceProvenance?.updateFrequency || input.updateFrequency,
    unit: input.sourceProvenance?.unit || input.unit,
    accessConstraints: input.sourceProvenance?.accessConstraints || input.accessConstraints,
    status,
    lastObservationDate: latest.date,
    note: input.sourceProvenance?.note || input.note,
  });
  return {
    id: String(input.id || provenance.sourceId),
    label: String(input.label || input.id || "公開指標"),
    value: latest.value,
    date: latest.date,
    unit: String(input.unit || provenance.unit),
    status: provenance.status,
    history,
    provenance,
  };
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
    };
  }

  const changes = usable.map((observation) => {
    const latestTimestamp = toTimestamp(observation.date);
    const fourWeek = latestTimestamp === null ? null : pointAtOrBefore(observation.history, latestTimestamp - DEFAULT_WINDOW_DAYS.fourWeek * 86400000);
    const twelveWeek = latestTimestamp === null ? null : pointAtOrBefore(observation.history, latestTimestamp - DEFAULT_WINDOW_DAYS.twelveWeek * 86400000);
    return {
      observation,
      change4WeekPct: percentChange(observation.value, fourWeek?.value),
      change12WeekPct: percentChange(observation.value, twelveWeek?.value),
    };
  });

  const withProvenance = (reason) => ({
    ...buildEmptyPressureComponent(definition.id, definition.label, qualityFromStatuses(usable.map((observation) => observation.status)), reason),
    sourceProvenance: usable.map((observation) => observation.provenance),
  });
  if (!changes.some((item) => item.change4WeekPct !== null || item.change12WeekPct !== null)) {
    return withProvenance(definition.noDataReason || `${definition.label} 沒有足夠的 4／12 週對照觀測。`);
  }

  const average = (values) => {
    const usableValues = values.filter((value) => value !== null);
    return usableValues.length ? usableValues.reduce((sum, value) => sum + value, 0) / usableValues.length : null;
  };
  const change4WeekPct = average(changes.map((item) => item.change4WeekPct));
  const change12WeekPct = average(changes.map((item) => item.change12WeekPct));
  const anchorChange = change12WeekPct ?? change4WeekPct;
  const score = clamp(50 + (anchorChange === null ? 0 : anchorChange * 5));
  const statuses = usable.map((item) => item.status);
  const confidence = clamp((usable.length / Math.max(1, definition.expectedEvidence || 1)) * (statuses.includes("STALE") ? 0.7 : statuses.includes("FALLBACK") ? 0.85 : 1), 0, 1);
  const provenance = usable.map((item) => item.provenance);
  const direction4Week = directionFromChange(change4WeekPct);
  const direction12Week = directionFromChange(change12WeekPct);
  const direction = direction12Week || direction4Week;
  const explanation = [];
  if (change4WeekPct !== null) explanation.push(`${definition.label} 近 4 週 ${change4WeekPct >= 0 ? "+" : ""}${change4WeekPct.toFixed(2)}%，方向 ${direction4Week}。`);
  else explanation.push(`${definition.label} 沒有足夠的 4 週對照觀測。`);
  if (change12WeekPct !== null) explanation.push(`${definition.label} 近 12 週 ${change12WeekPct >= 0 ? "+" : ""}${change12WeekPct.toFixed(2)}%，方向 ${direction12Week}。`);
  else explanation.push(`${definition.label} 沒有足夠的 12 週對照觀測。`);
  if (statuses.includes("STALE")) explanation.push("部分證據為 STALE；結果保留但不視為即時。 ");
  if (statuses.includes("FALLBACK")) explanation.push("部分證據使用公開備援來源；請查看來源沿革。 ");

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
    sourceProvenance: provenance,
    explanation,
    observedValues: usable.map((item) => ({
      seriesId: item.id,
      label: item.label,
      value: item.value,
      observedAt: item.date,
      unit: item.unit,
      status: item.status,
      layer: DATA_LAYERS.OBSERVED_PUBLIC_DATA,
    })),
  };
}

function trendFromChange(change) {
  return directionFromChange(change) || "STABLE";
}

function buildMachiningReference(input = {}) {
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
    explanation.push(`綜合分數 ${compositePressureScore.toFixed(2)}/100，依可用構面權重重新正規化；最高壓力構面為 ${components[ranked[0]].label}。`);
    if (compositeChange4Week !== null) explanation.push(`綜合構面近 4 週變化 ${compositeChange4Week >= 0 ? "+" : ""}${compositeChange4Week.toFixed(2)}%，方向 ${trendFromChange(compositeChange4Week)}。`);
    if (compositeChange12Week !== null) explanation.push(`綜合構面近 12 週變化 ${compositeChange12Week >= 0 ? "+" : ""}${compositeChange12Week.toFixed(2)}%，方向 ${trendFromChange(compositeChange12Week)}。`);
  }
  for (const id of [...available].sort((a, b) => components[b].pressureScore - components[a].pressureScore)) {
    const component = components[id];
    explanation.push(`${component.label}：${component.pressureScore.toFixed(2)}/100（${component.pressureLevel}）；${component.explanation[0]}`);
  }
  const reference = {
    referenceDate: normalizeDate(input.referenceDate || new Date().toISOString()),
    region: input.region || "Taiwan",
    machiningType: input.machiningType || "CNC／一般加工",
    materialFamily: input.materialFamily || "鋼、鋁、銅與相關製造投入",
    materialPressure: components.materialPressure,
    energyPressure: components.energyPressure,
    laborPressure: components.laborPressure,
    fxPressure: components.fxPressure,
    manufacturingPricePressure: components.manufacturingPricePressure,
    machineCapitalPressure: components.machineCapitalPressure,
    compositePressureScore,
    pressureLevel: pressureLevel(compositePressureScore),
    trend: compositePressureScore === null ? null : trendFromChange(compositeChange12Week ?? compositeChange4Week),
    confidence: overallConfidence,
    dataQuality,
    sourceProvenance: [...new Map(COMPONENT_IDS.flatMap((id) => components[id].sourceProvenance).map((source) => [source.sourceId, source])).values()],
    explanation: [
      ...explanation,
      "這是 DERIVED_MARKET_REFERENCE，僅由外部公開觀測與公開來源狀態推導；不包含任何供應商報價或公司內部價格。",
    ],
    disclaimer: PUBLIC_MARKET_DISCLAIMER,
    observedPublicData: COMPONENT_IDS.flatMap((id) => components[id].observedValues || []),
    derivedMarketReference: {
      layer: DATA_LAYERS.DERIVED_MARKET_REFERENCE,
      weights,
      minimumEvidence,
      evidenceCount,
      availableComponents: available,
      normalization: "各來源以自身最近可得觀測作為基準；壓力分數 = clamp(50 + 5 × 4/12 週變化百分點, 0, 100)，可用構面依實際權重重新正規化。",
      compositeChange4WeekPct: compositeChange4Week === null ? null : Number(compositeChange4Week.toFixed(2)),
      compositeChange12WeekPct: compositeChange12Week === null ? null : Number(compositeChange12Week.toFixed(2)),
    },
    engineeringEstimate: null,
  };
  const errors = validateMachiningReference(reference);
  if (errors.length) throw new Error(`machining reference contract invalid: ${errors.join("; ")}`);
  return reference;
}

module.exports = {
  COMPONENT_IDS,
  DEFAULT_MINIMUM_EVIDENCE,
  DEFAULT_WEIGHTS,
  PRESSURE_BAND,
  buildComponent,
  buildMachiningReference,
  clamp,
  normalizeWeights,
  pressureLevel,
};
