const { getMarketSnapshot } = require("../marketData/marketService");
const { FX_MATERIAL_ID, canonicalWeeklyStatus, upsertSnapshots } = require("./snapshotStore");
const { dateKeyInTaipei } = require("./weekUtils");
const { getStorageConfig, assertProductionStorage } = require("./storageConfig");
const { ensureStorageDirectories, updateJobState, safeError } = require("./storageService");

function snapshotDate(snapshot, collectedAt) {
  return dateKeyInTaipei(collectedAt || snapshot?.generatedAt || new Date());
}

function rowToSnapshotRecord(row, snapshot, collectedAt, date) {
  return {
    materialId: row.id,
    materialName: row.name,
    symbol: row.symbol,
    category: row.category,
    exchange: row.exchange,
    date,
    marketPrice: row.price,
    sourceUnit: row.unit,
    currency: row.currency || "USD",
    usdTwdRate: snapshot.fx?.rate,
    twdReferenceValue: row.twdEstimate,
    source: row.source,
    status: canonicalWeeklyStatus(row.status),
    lastTradeTimestamp: row.lastTradeAt,
    collectedAt,
    sourceReliability: row.sourceReliability,
    error: row.error,
    provenance: {
      provider: row.source,
      status: canonicalWeeklyStatus(row.status),
      cacheState: snapshot.cache?.status || null,
      generatedAt: snapshot.generatedAt,
    },
  };
}

function fxToSnapshotRecord(snapshot, collectedAt, date) {
  const fx = snapshot.fx || {};
  return {
    materialId: FX_MATERIAL_ID,
    materialName: "USD/TWD",
    symbol: "TWD=X",
    category: "匯率",
    exchange: "PUBLIC FX",
    date,
    marketPrice: fx.rate,
    sourceUnit: "TWD/USD",
    currency: "TWD",
    usdTwdRate: fx.rate,
    twdReferenceValue: fx.rate,
    source: fx.source,
    status: canonicalWeeklyStatus(fx.status),
    lastTradeTimestamp: fx.lastTradeAt,
    collectedAt,
    sourceReliability: fx.sourceReliability,
    error: fx.error,
    provenance: {
      provider: fx.source,
      status: canonicalWeeklyStatus(fx.status),
      generatedAt: snapshot.generatedAt,
    },
  };
}

function snapshotToRecords(snapshot, collectedAt = new Date().toISOString()) {
  const date = snapshotDate(snapshot, collectedAt);
  const rows = (snapshot.rows || []).map((row) => rowToSnapshotRecord(row, snapshot, collectedAt, date));
  return [fxToSnapshotRecord(snapshot, collectedAt, date), ...rows];
}

async function collectAndPersistDailySnapshot(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || getStorageConfig(env);
  if (config.productionRequired) assertProductionStorage(config);
  await ensureStorageDirectories(env, { config });
  const collectedAt = options.collectedAt || new Date().toISOString();
  await updateJobState("dailySnapshot", { state: "RUNNING", lastAttemptedAt: collectedAt }, { config });
  try {
    const snapshot = options.snapshot || await getMarketSnapshot({ debug: Boolean(options.debug) });
    const records = snapshotToRecords(snapshot, collectedAt);
    const result = await upsertSnapshots(records, { filePath: options.filePath, env, storageConfig: config, pool: options.pool });
    const output = {
      collectedAt,
      date: records[0]?.date || null,
      snapshotState: snapshot.state,
      recordCount: records.length,
      inserted: result.inserted,
      replaced: result.replaced,
      ignored: result.ignored,
      sourceCoverage: snapshot.summary,
      records,
      filePath: options.filePath || config.snapshotFile,
    };
    await updateJobState("dailySnapshot", {
      state: "SUCCEEDED",
      lastSuccessfulAt: collectedAt,
      lastSuccessfulDate: output.date,
      lastRecordCount: output.recordCount,
      lastStatus: output.snapshotState,
      latestSnapshotCoverage: output.sourceCoverage || null,
      lastErrorCount: records.filter((record) => ["API_ERROR", "NO_DATA"].includes(record.status)).length,
    }, { config });
    return output;
  } catch (error) {
    await updateJobState("dailySnapshot", { state: "FAILED", lastError: safeError(error), lastFailedAt: new Date().toISOString() }, { config }).catch(() => {});
    throw error;
  }
}

module.exports = {
  snapshotDate,
  rowToSnapshotRecord,
  fxToSnapshotRecord,
  snapshotToRecords,
  collectAndPersistDailySnapshot,
};
