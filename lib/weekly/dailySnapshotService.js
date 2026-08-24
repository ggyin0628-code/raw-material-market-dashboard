const { getMarketSnapshot } = require("../marketData/marketService");
const { FX_MATERIAL_ID, canonicalWeeklyStatus, upsertSnapshots } = require("./snapshotStore");
const { dateKeyInTaipei } = require("./weekUtils");
const { getStorageConfig, assertProductionStorage } = require("./storageConfig");
const { ensureStorageDirectories, updateJobState, safeError } = require("./storageService");
const { classifyObservation, getSnapshotDataAsOf, weeklyMaxObservationAgeDays } = require("../marketData/freshness");

function observedDate(value, fallback = null) {
  return dateKeyInTaipei(value || fallback || new Date());
}

function snapshotDate(snapshot, collectedAt) {
  return observedDate(snapshot?.dataAsOf || snapshot?.latestMarketObservationAt || snapshot?.generatedAt, collectedAt);
}

function recordDate(row, snapshot, collectedAt) {
  return observedDate(row?.lastTradeAt || row?.lastTradeTimestamp || row?.observationDate, snapshot?.dataAsOf || snapshot?.generatedAt || collectedAt);
}

function rowToSnapshotRecord(row, snapshot, collectedAt, date = recordDate(row, snapshot, collectedAt)) {
  const status = canonicalWeeklyStatus(row.status);
  return {
    materialId: row.id,
    materialName: row.name,
    symbol: row.symbol,
    category: row.category,
    exchange: row.exchange,
    date,
    observationDate: date,
    marketPrice: row.price,
    sourceUnit: row.unit,
    currency: row.currency || "USD",
    usdTwdRate: snapshot.fx?.rate,
    twdReferenceValue: row.twdEstimate,
    source: row.source,
    status,
    lastTradeTimestamp: row.lastTradeAt,
    collectedAt,
    sourceReliability: row.sourceReliability,
    error: row.error,
    collectionPath: snapshot.acquisitionPath || "DIRECT_ACQUISITION",
    provenance: {
      provider: row.source,
      status,
      cacheState: snapshot.cache?.status || null,
      generatedAt: snapshot.generatedAt,
      servedAt: snapshot.servedAt || null,
      dataAsOf: snapshot.dataAsOf || null,
      observationDate: date,
      collectionPath: snapshot.acquisitionPath || "DIRECT_ACQUISITION",
    },
  };
}

function fxToSnapshotRecord(snapshot, collectedAt, date = observedDate(snapshot.fx?.lastTradeAt || snapshot.dataAsOf || snapshot.generatedAt, collectedAt)) {
  const fx = snapshot.fx || {};
  const status = canonicalWeeklyStatus(fx.status);
  return {
    materialId: FX_MATERIAL_ID,
    materialName: "USD/TWD",
    symbol: "TWD=X",
    category: "匯率",
    exchange: "PUBLIC FX",
    date,
    observationDate: date,
    marketPrice: fx.rate,
    sourceUnit: "TWD/USD",
    currency: "TWD",
    usdTwdRate: fx.rate,
    twdReferenceValue: fx.rate,
    source: fx.source,
    status,
    lastTradeTimestamp: fx.lastTradeAt,
    collectedAt,
    sourceReliability: fx.sourceReliability,
    error: fx.error,
    collectionPath: snapshot.acquisitionPath || "DIRECT_ACQUISITION",
    provenance: {
      provider: fx.source,
      status,
      generatedAt: snapshot.generatedAt,
      servedAt: snapshot.servedAt || null,
      dataAsOf: snapshot.dataAsOf || null,
      observationDate: date,
      collectionPath: snapshot.acquisitionPath || "DIRECT_ACQUISITION",
    },
  };
}

function snapshotToRecords(snapshot, collectedAt = new Date().toISOString()) {
  const date = snapshotDate(snapshot, collectedAt);
  const rows = (snapshot.rows || []).map((row) => rowToSnapshotRecord(row, snapshot, collectedAt, recordDate(row, snapshot, collectedAt) || date));
  return [fxToSnapshotRecord(snapshot, collectedAt), ...rows];
}

function dailyFreshnessSummary(snapshot, records, now = new Date(), env = process.env) {
  const maxAgeDays = weeklyMaxObservationAgeDays(env);
  const classified = records.map((record) => classifyObservation({
    status: record.status,
    observedAt: record.lastTradeTimestamp || record.observationDate || record.date,
    now,
    maxAgeDays,
  }));
  const counts = classified.reduce((result, item) => {
    if (item.status === "OK") result.freshCount += 1;
    else if (item.status === "FALLBACK") result.fallbackCount += 1;
    else if (item.status === "STALE") result.staleCount += 1;
    else if (item.status === "EXPIRED") result.expiredCount += 1;
    else if (item.status === "NO_DATA") result.noDataCount += 1;
    else if (item.status === "API_ERROR") result.apiErrorCount += 1;
    if (item.eligible) result.freshnessEligibleCount += 1;
    return result;
  }, { freshCount: 0, fallbackCount: 0, staleCount: 0, expiredCount: 0, noDataCount: 0, apiErrorCount: 0, freshnessEligibleCount: 0 });
  const minimumFreshnessEligibleCount = Math.max(1, Math.ceil(records.length * 0.7));
  const dataReady = records.length > 0
    && counts.freshnessEligibleCount >= minimumFreshnessEligibleCount
    && counts.expiredCount === 0;
  const dataReadinessState = dataReady
    ? "DAILY_DATA_READY"
    : counts.staleCount > 0 || counts.expiredCount > 0
      ? "DAILY_DATA_STALE"
      : "DAILY_DATA_NOT_READY";
  return {
    ...counts,
    totalCount: records.length,
    minimumFreshnessEligibleCount,
    freshnessEligible: dataReady,
    dataReady,
    dataReadinessState,
    dataAsOf: getSnapshotDataAsOf(snapshot),
    maxObservationAgeDays: maxAgeDays,
  };
}

function dailyReadinessState(job = {}) {
  const freshness = job.freshness || job.latestSnapshotFreshness;
  if (freshness?.dataReady === true && freshness?.freshnessEligible === true) return "DAILY_DATA_READY";
  if (Number(freshness?.staleCount) > 0 || Number(freshness?.expiredCount) > 0) return "DAILY_DATA_STALE";
  return "DAILY_DATA_NOT_READY";
}

async function collectAndPersistDailySnapshot(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || getStorageConfig(env);
  if (config.productionRequired) assertProductionStorage(config);
  await ensureStorageDirectories(env, { config });
  const collectedAt = options.collectedAt || new Date().toISOString();
  await updateJobState("dailySnapshot", { state: "RUNNING", lastAttemptedAt: collectedAt }, { config });
  try {
    const snapshot = options.snapshot || await getMarketSnapshot({ debug: Boolean(options.debug), env, now: options.now || new Date() });
    const records = snapshotToRecords(snapshot, collectedAt);
    const freshness = dailyFreshnessSummary(snapshot, records, options.now || new Date(), env);
    const result = await upsertSnapshots(records, { filePath: options.filePath, env, storageConfig: config, pool: options.pool });
    const output = {
      collectedAt,
      servedAt: snapshot.servedAt || null,
      dataAsOf: freshness.dataAsOf,
      date: records[0]?.date || null,
      snapshotState: snapshot.state,
      executionState: "SUCCEEDED",
      dataReadinessState: freshness.dataReadinessState,
      acquisitionPath: snapshot.acquisitionPath || "DIRECT_ACQUISITION",
      recordCount: records.length,
      inserted: result.inserted,
      replaced: result.replaced,
      ignored: result.ignored,
      sourceCoverage: snapshot.summary,
      freshness,
      records,
      filePath: options.filePath || config.snapshotFile,
    };
    await updateJobState("dailySnapshot", {
      state: "SUCCEEDED",
      lastSuccessfulAt: collectedAt,
      lastSuccessfulDate: output.date,
      lastStatus: output.snapshotState,
      executionState: output.executionState,
      dataReadinessState: output.dataReadinessState,
      acquisitionPath: output.acquisitionPath,
      dataAsOf: output.dataAsOf,
      latestSnapshotCoverage: output.sourceCoverage || null,
      freshness: output.freshness,
      lastErrorCount: records.filter((record) => ["API_ERROR", "NO_DATA", "EXPIRED"].includes(record.status)).length,
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
  dailyFreshnessSummary,
  dailyReadinessState,
  collectAndPersistDailySnapshot,
};
