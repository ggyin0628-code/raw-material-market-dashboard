const { materials } = require("../marketData/materials");
const { calculateTwdReference } = require("../marketData/dataContract");
const { fetchYahooHistory } = require("../marketData/fetchYahoo");
const { fetchUsdTwdFallback } = require("../marketData/fetchFallback");
const { getPeriod, getFxRows, nearestFxRate } = require("../marketData/exportService");
const { FX_MATERIAL_ID, upsertSnapshots } = require("./snapshotStore");
const { dateKeyInTaipei } = require("./weekUtils");

function historyStatus(result) {
  return result?.sourceType === "fallback" ? "FALLBACK" : "LIVE";
}

function historyRecord(material, row, fxRows, source, status, collectedAt) {
  const fxRate = nearestFxRate(new Map(fxRows.map((item) => [item.date, item.close])), row.date);
  return {
    materialId: material.id,
    materialName: material.name,
    symbol: material.symbol,
    category: material.category,
    exchange: material.exchange,
    date: row.date,
    marketPrice: row.close,
    sourceUnit: material.unit,
    currency: material.currency,
    usdTwdRate: fxRate,
    twdReferenceValue: calculateTwdReference(row.close, material, fxRate),
    source,
    status,
    lastTradeTimestamp: row.date,
    collectedAt,
    sourceReliability: status === "LIVE" ? "primary" : "fallback",
    provenance: { provider: source, history: true, status },
  };
}

function fxHistoryRecords(fxRows, source, status, collectedAt) {
  return fxRows.filter((row) => typeof row.close === "number" && Number.isFinite(row.close)).map((row) => ({
    materialId: FX_MATERIAL_ID,
    materialName: "USD/TWD",
    symbol: "TWD=X",
    category: "匯率",
    exchange: "PUBLIC FX",
    date: row.date,
    marketPrice: row.close,
    sourceUnit: "TWD/USD",
    currency: "TWD",
    usdTwdRate: row.close,
    twdReferenceValue: row.close,
    source,
    status,
    lastTradeTimestamp: row.date,
    collectedAt,
    sourceReliability: status === "LIVE" ? "primary" : "fallback",
    provenance: { provider: source, history: true, status },
  }));
}

async function loadFxForBackfill(period, options) {
  if (options.fxRows) return { rows: options.fxRows, source: options.fxSource || "mock FX", status: options.fxStatus || "LIVE" };
  try {
    return await getFxRows(period);
  } catch (error) {
    return { rows: [], source: "USD/TWD unavailable", status: "API_ERROR", error: error.message };
  }
}

async function backfillPublicHistory(options = {}) {
  const periodInput = options.period || "3y";
  const period = getPeriod(periodInput);
  const selectedMaterials = options.materials || materials;
  const collectedAt = options.collectedAt || new Date().toISOString();
  const fx = await loadFxForBackfill(period, options);
  const records = [...fxHistoryRecords(fx.rows, fx.source, fx.status, collectedAt)];
  const results = [];
  for (const material of selectedMaterials) {
    try {
      const result = options.fetchHistory ? await options.fetchHistory(material.symbol, period.yahooRange, "1d") : await fetchYahooHistory(material.symbol, period.yahooRange, "1d");
      if (!result?.rows?.length) throw new Error("沒有歷史行情資料");
      const status = historyStatus(result);
      const source = result.source || material.source;
      records.push(...result.rows.map((row) => historyRecord(material, row, fx.rows, source, status, collectedAt)));
      results.push({ materialId: material.id, symbol: material.symbol, status, rows: result.rows.length, source });
    } catch (error) {
      results.push({ materialId: material.id, symbol: material.symbol, status: "API_ERROR", rows: 0, source: material.source, error: error.message });
    }
  }
  const writeResult = records.length ? await upsertSnapshots(records, { filePath: options.filePath, env: options.env, storageConfig: options.storageConfig, pool: options.pool }) : { inserted: 0, replaced: 0, ignored: 0 };
  return {
    period: periodInput,
    collectedAt,
    recordCount: records.length,
    inserted: writeResult.inserted,
    replaced: writeResult.replaced,
    ignored: writeResult.ignored,
    fx: { source: fx.source, status: fx.status, rows: fx.rows.length },
    results,
    failureCount: results.filter((item) => item.status === "API_ERROR").length,
  };
}

module.exports = {
  historyStatus,
  historyRecord,
  fxHistoryRecords,
  backfillPublicHistory,
};
