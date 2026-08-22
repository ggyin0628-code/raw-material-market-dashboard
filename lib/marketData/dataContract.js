const { MARKET_STATES } = require("./status");

const PUBLIC_MARKET_DISCLAIMER = "公開商品期貨行情僅作市場趨勢與採購參考，不等於台灣供應商現貨報價、含稅含運價格、合約價或確認採購指示。";
const SUPPORTED_UNITS = new Set([
  "USD/lb",
  "USD/metric ton",
  "USD/short ton",
  "USD/barrel",
  "USD/MMBtu",
  "USD/troy oz",
  "US cents/bushel",
  "US cents/lb",
]);
const LIVE_STATUSES = new Set([MARKET_STATES.OK, MARKET_STATES.FALLBACK, "LIVE"]);
const USABLE_STATUSES = new Set([
  MARKET_STATES.OK,
  MARKET_STATES.FALLBACK,
  MARKET_STATES.STALE,
  "LIVE",
]);

function getConversionFactor(material) {
  const factor = material?.conversionFactor ?? material?.usdFactor ?? 1;
  if (typeof factor !== "number" || !Number.isFinite(factor) || factor <= 0) {
    throw new Error(`Invalid conversion factor for ${material?.symbol || "material"}`);
  }
  return factor;
}

function calculateTwdReference(price, material, fxRate) {
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  if (material?.currency !== "USD") return null;
  if (typeof fxRate !== "number" || !Number.isFinite(fxRate) || fxRate <= 0) return null;
  return price * getConversionFactor(material) * fxRate;
}

function isValidUnit(unit) {
  return SUPPORTED_UNITS.has(unit);
}

function isLiveStatus(status) {
  return LIVE_STATUSES.has(status);
}

function isUsableStatus(status) {
  return USABLE_STATUSES.has(status);
}

function canonicalStatus(status) {
  return status === "LIVE" ? MARKET_STATES.OK : status;
}

function canonicalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  return {
    ...snapshot,
    state: canonicalStatus(snapshot.state),
    fx: snapshot.fx ? { ...snapshot.fx, status: canonicalStatus(snapshot.fx.status) } : snapshot.fx,
    rows: (snapshot.rows || []).map((row) => ({ ...row, status: canonicalStatus(row.status) })),
  };
}

module.exports = {
  PUBLIC_MARKET_DISCLAIMER,
  SUPPORTED_UNITS,
  calculateTwdReference,
  canonicalStatus,
  canonicalizeSnapshot,
  getConversionFactor,
  isLiveStatus,
  isUsableStatus,
  isValidUnit,
};
