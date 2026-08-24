const STATUS_VALUES = Object.freeze(["LIVE", "FALLBACK", "STALE", "EXPIRED", "NO_DATA", "API_ERROR"]);
const MARKET_ROLES = Object.freeze(["TAIWAN_DOMESTIC", "GLOBAL_IMPORT_REFERENCE", "GLOBAL_INPUT_PROXY", "STRUCTURAL"]);
const PRESSURE_LEVELS = Object.freeze(["LOW", "NORMAL", "ELEVATED", "HIGH"]);
const TREND_VALUES = Object.freeze(["FALLING", "STABLE", "RISING"]);
const PUBLIC_MARKET_DISCLAIMER = "公開市場參考；非供應商報價；非公司目標價格。此頁僅反映可取得的外部公開指標與其透明推導，不代表台灣任何供應商的實際鈑金加工價格、每件／公斤／小時報價。";
const DATA_LAYERS = Object.freeze({
  OBSERVED_PUBLIC_DATA: "OBSERVED_PUBLIC_DATA",
  DERIVED_MARKET_REFERENCE: "DERIVED_MARKET_REFERENCE",
  ENGINEERING_ESTIMATE: "ENGINEERING_ESTIMATE",
});

const COMPONENT_IDS = Object.freeze([
  "materialPressure",
  "energyPressure",
  "laborPressure",
  "fxPressure",
  "manufacturingPricePressure",
  "capacityDemandPressure",
]);

const TOP_LEVEL_KEYS = new Set([
  "referenceDate", "region", "processFamily", "materialFamily", "materialPressure", "energyPressure",
  "laborPressure", "fxPressure", "manufacturingPricePressure", "capacityDemandPressure",
  "compositePressureScore", "pressureLevel", "trend", "confidence", "dataQuality", "sourceProvenance",
  "explanation", "disclaimer", "observedPublicData", "derivedMarketReference", "publicPriceReferences", "sourceRoleSummary", "scoringSourceRoleSummary", "engineeringEstimate",
]);

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeStatus(status) {
  return STATUS_VALUES.includes(status) ? status : "API_ERROR";
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeProvenance(source = {}) {
  return {
    sourceId: String(source.sourceId || "unknown-public-source"),
    sourceName: String(source.sourceName || "未命名公開來源"),
    url: String(source.url || ""),
    endpoint: String(source.endpoint || source.url || ""),
    geographicScope: String(source.geographicScope || "Taiwan"),
    marketScope: String(source.marketScope || source.geographicScope || "未確認"),
    marketRole: MARKET_ROLES.includes(source.marketRole) ? source.marketRole : "UNCLASSIFIED",
    pricingBasis: String(source.pricingBasis || "公開指標；非供應商報價"),
    currency: source.currency == null ? null : String(source.currency),
    participatesInScoring: source.participatesInScoring !== false,
    scoringReason: String(source.scoringReason || (source.participatesInScoring === false ? "此來源僅作公開市場脈絡，不納入本構面計分。" : "")),
    updateFrequency: String(source.updateFrequency || "未確認"),
    unit: String(source.unit || "未指定"),
    accessConstraints: String(source.accessConstraints || "公開存取；可用性與發布內容可能變更"),
    status: normalizeStatus(source.status),
    lastObservationDate: normalizeDate(source.lastObservationDate || source.observationDate),
    observationDate: normalizeDate(source.observationDate || source.lastObservationDate),
    frequency: String(source.frequency || "unknown"),
    fetchedAt: source.fetchedAt ? String(source.fetchedAt) : null,
    layer: DATA_LAYERS.OBSERVED_PUBLIC_DATA,
    note: String(source.note || source.explanation || ""),
  };
}

function qualityFromStatuses(statuses = []) {
  const normalized = statuses.map(normalizeStatus);
  if (!normalized.length) return "NO_DATA";
  if (normalized.every((status) => status === "LIVE")) return "LIVE";
  if (normalized.some((status) => status === "STALE")) return "STALE";
  if (normalized.some((status) => status === "FALLBACK")) return "FALLBACK";
  if (normalized.some((status) => status === "LIVE")) return "MIXED";
  if (normalized.some((status) => status === "NO_DATA")) return "NO_DATA";
  return "API_ERROR";
}

function validateSheetMetalReference(reference) {
  const errors = [];
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) return ["reference must be an object"];
  for (const key of Object.keys(reference)) if (!TOP_LEVEL_KEYS.has(key)) errors.push(`unexpected top-level field: ${key}`);
  for (const key of ["referenceDate", "region", "processFamily", "materialFamily", "pressureLevel", "trend", "dataQuality", "disclaimer"]) {
    if (!(key in reference)) errors.push(`missing field: ${key}`);
  }
  if (reference.processFamily !== "SHEET_METAL") errors.push("processFamily must be SHEET_METAL");
  if (reference.pressureLevel !== null && !PRESSURE_LEVELS.includes(reference.pressureLevel)) errors.push("invalid pressureLevel");
  if (reference.trend !== null && !TREND_VALUES.includes(reference.trend)) errors.push("invalid trend");
  if (!Array.isArray(reference.sourceProvenance)) errors.push("sourceProvenance must be an array");
  for (const source of reference.sourceProvenance || []) {
    if (!MARKET_ROLES.includes(source.marketRole)) errors.push(`invalid marketRole: ${source.marketRole}`);
    if (!source.marketScope) errors.push(`missing marketScope: ${source.sourceId}`);
    if (!source.pricingBasis) errors.push(`missing pricingBasis: ${source.sourceId}`);
    if (typeof source.participatesInScoring !== "boolean") errors.push(`invalid participatesInScoring: ${source.sourceId}`);
    if (source.participatesInScoring === false && !source.scoringReason) errors.push(`missing scoringReason: ${source.sourceId}`);
  }
  if (!Array.isArray(reference.explanation)) errors.push("explanation must be an array");
  if (!Array.isArray(reference.publicPriceReferences)) errors.push("publicPriceReferences must be an array");
  if (reference.engineeringEstimate !== null) errors.push("engineeringEstimate must be null in V1");
  return errors;
}

function buildEmptyPressureComponent(id, label, status = "NO_DATA", reason = "沒有足夠的公開觀測值") {
  return {
    id,
    label,
    pressureScore: null,
    pressureLevel: null,
    trend: null,
    direction4Week: null,
    direction12Week: null,
    change4WeekPct: null,
    change12WeekPct: null,
    evidenceCount: 0,
    confidence: 0,
    dataQuality: normalizeStatus(status),
    sourceProvenance: [],
    comparisonWindows: [],
    selectedComparisonWindow: null,
    explanation: [reason],
  };
}

module.exports = {
  COMPONENT_IDS,
  DATA_LAYERS,
  MARKET_ROLES,
  PRESSURE_LEVELS,
  PUBLIC_MARKET_DISCLAIMER,
  STATUS_VALUES,
  TOP_LEVEL_KEYS,
  TREND_VALUES,
  buildEmptyPressureComponent,
  finiteNumber,
  normalizeDate,
  normalizeProvenance,
  normalizeStatus,
  qualityFromStatuses,
  validateSheetMetalReference,
};
