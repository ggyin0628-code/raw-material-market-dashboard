const { materials } = require("../marketData/materials");
const { calculateTwdReference } = require("../marketData/dataContract");
const { fetchYahooHistory } = require("../marketData/fetchYahoo");
const { fetchUsdTwdFallback } = require("../marketData/fetchFallback");
const { getPeriod, getFxRows, nearestFxRate } = require("../marketData/exportService");
const { FX_MATERIAL_ID, upsertSnapshots } = require("./snapshotStore");
const { dateKeyInTaipei } = require("./weekUtils");

const DEFAULT_HISTORY_CONCURRENCY = 3;
const MAX_HISTORY_CONCURRENCY = 4;

function getHistoryConcurrency(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_HISTORY_CONCURRENCY;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_HISTORY_CONCURRENCY);
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function consume() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, consume));
  return results;
}

function historyStatus(result) {
  return result?.sourceType === "fallback" ? "FALLBACK" : "LIVE";
}

function historyRecord(material, row, fxRows, source, status, collectedAt, fxByDate = new Map(fxRows.map((item) => [item.date, item.close]))) {
  const fxRate = nearestFxRate(fxByDate, row.date);
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
  const concurrency = getHistoryConcurrency(options.historyConcurrency ?? (options.env || process.env).BOOTSTRAP_HISTORY_CONCURRENCY);
  const reportProgress = typeof options.onProgress === "function" ? options.onProgress : async () => {};
  const fx = await loadFxForBackfill(period, options);
  const totals = { recordCount: 0, fetchedRows: 0, inserted: 0, replaced: 0, ignored: 0 };
  const fxRecords = fxHistoryRecords(fx.rows, fx.source, fx.status, collectedAt);
  totals.recordCount += fxRecords.length;
  totals.fetchedRows += fxRecords.length;
  await reportProgress({ phase: "fx_fetched", rows: fxRecords.length, status: fx.status, source: fx.source });
  if (fxRecords.length) {
    const fxWrite = await upsertSnapshots(fxRecords, {
      filePath: options.filePath,
      env: options.env,
      storageConfig: options.storageConfig,
      pool: options.pool,
      batchSize: options.batchSize,
      onProgress: (progress) => reportProgress({ ...progress, scope: "fx" }),
    });
    totals.inserted += fxWrite.inserted;
    totals.replaced += fxWrite.replaced;
    totals.ignored += fxWrite.ignored;
  }
  const fxByDate = new Map(fx.rows.map((item) => [item.date, item.close]));
  const results = await runWithConcurrency(selectedMaterials, concurrency, async (material, materialIndex) => {
    await reportProgress({ phase: "material_fetch_started", materialIndex: materialIndex + 1, materialCount: selectedMaterials.length, materialId: material.id, symbol: material.symbol });
    try {
      const result = options.fetchHistory ? await options.fetchHistory(material.symbol, period.yahooRange, "1d") : await fetchYahooHistory(material.symbol, period.yahooRange, "1d");
      if (!result?.rows?.length) throw new Error("沒有歷史行情資料");
      const status = historyStatus(result);
      const source = result.source || material.source;
      const materialRecords = result.rows.map((row) => historyRecord(material, row, fx.rows, source, status, collectedAt, fxByDate));
      totals.recordCount += materialRecords.length;
      totals.fetchedRows += materialRecords.length;
      await reportProgress({ phase: "records_prepared", materialIndex: materialIndex + 1, materialCount: selectedMaterials.length, materialId: material.id, symbol: material.symbol, rows: materialRecords.length });
      const writeResult = await upsertSnapshots(materialRecords, {
        filePath: options.filePath,
        env: options.env,
        storageConfig: options.storageConfig,
        pool: options.pool,
        batchSize: options.batchSize,
        onProgress: (progress) => reportProgress({ ...progress, scope: "material", materialIndex: materialIndex + 1, materialCount: selectedMaterials.length, materialId: material.id, symbol: material.symbol }),
      });
      totals.inserted += writeResult.inserted;
      totals.replaced += writeResult.replaced;
      totals.ignored += writeResult.ignored;
      const completed = { materialId: material.id, symbol: material.symbol, status, rows: materialRecords.length, source };
      await reportProgress({ phase: "material_completed", materialIndex: materialIndex + 1, materialCount: selectedMaterials.length, ...completed, inserted: writeResult.inserted, replaced: writeResult.replaced, ignored: writeResult.ignored });
      return completed;
    } catch (error) {
      const failed = { materialId: material.id, symbol: material.symbol, status: "API_ERROR", rows: 0, source: material.source, error: error.message };
      await reportProgress({ phase: "material_failed", materialIndex: materialIndex + 1, materialCount: selectedMaterials.length, ...failed });
      return failed;
    }
  });
  return {
    period: periodInput,
    collectedAt,
    recordCount: totals.recordCount,
    fetchedRows: totals.fetchedRows,
    inserted: totals.inserted,
    replaced: totals.replaced,
    ignored: totals.ignored,
    materialCount: selectedMaterials.length,
    historyConcurrency: concurrency,
    fx: { source: fx.source, status: fx.status, rows: fx.rows.length },
    results,
    failureCount: results.filter((item) => item.status === "API_ERROR").length,
  };
}

module.exports = {
  historyStatus,
  historyRecord,
  fxHistoryRecords,
  getHistoryConcurrency,
  runWithConcurrency,
  backfillPublicHistory,
};
