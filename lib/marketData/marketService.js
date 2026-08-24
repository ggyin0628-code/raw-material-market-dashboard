const { getFreshCache, getStaleCache, saveSuccessful, FRESH_TTL_MS } = require("./cacheManager");
const { fetchStooqQuote, fetchUsdTwdFallback } = require("./fetchFallback");
const { fetchYahooChart } = require("./fetchYahoo");
const { DEBUG, logMarket } = require("./logger");
const { materials } = require("./materials");
const { MARKET_STATES } = require("./status");
const { PUBLIC_MARKET_DISCLAIMER, calculateTwdReference, canonicalizeSnapshot } = require("./dataContract");
const { getSnapshotDataAsOf, iso, observationAgeDays, staleMaxAgeDays, isProduction } = require("./freshness");
const { FX_MATERIAL_ID, canonicalWeeklyStatus, listSnapshots } = require("../weekly/snapshotStore");
const { getStorageConfig } = require("../weekly/storageConfig");

let refreshPromise = null;

async function fetchFx(options = {}) {
  const now = options.now || new Date();
  const env = options.env || process.env;
  try {
    const result = await fetchYahooChart("TWD=X", "5d", "1d");
    return {
      rate: result.quote.price,
      ...classifyFetchedObservation({ status: MARKET_STATES.OK, observedAt: result.quote.lastTradeAt, now, env }),
      source: "Yahoo Finance - USD/TWD",
      lastTradeAt: result.quote.lastTradeAt,
      debug: debugFields(result),
    };
  } catch (primaryError) {
    try {
      const result = await fetchUsdTwdFallback();
      await logMarket("fallback_trigger", { target: "USD/TWD", error: primaryError.message });
      return {
        rate: result.quote.rate,
        ...classifyFetchedObservation({ status: MARKET_STATES.FALLBACK, observedAt: result.quote.lastTradeAt, now, env }),
        source: result.source,
        lastTradeAt: result.quote.lastTradeAt,
        error: primaryError.message,
        debug: debugFields(result),
      };
    } catch (fallbackError) {
      return {
        rate: null,
        status: MARKET_STATES.API_ERROR,
        sourceReliability: "NO_DATA",
        source: "Yahoo Finance - USD/TWD",
        error: `${primaryError.message}; ${fallbackError.message}`,
      };
    }
  }
}

async function fetchMaterial(material, fx, options = {}) {
  const now = options.now || new Date();
  const env = options.env || process.env;
  try {
    const result = await fetchYahooChart(material.symbol);
    return normalizeRow(material, result.quote, fx, {
      ...classifyFetchedObservation({ status: MARKET_STATES.OK, observedAt: result.quote.lastTradeAt, now, env }),
      source: material.source,
      debug: debugFields(result),
    });
  } catch (primaryError) {
    try {
      const result = await fetchStooqQuote(material);
      await logMarket("fallback_trigger", { target: material.symbol, fallback: material.stooqSymbol, error: primaryError.message });
      return normalizeRow(material, result.quote, fx, {
        ...classifyFetchedObservation({ status: MARKET_STATES.FALLBACK, observedAt: result.quote.lastTradeAt, now, env }),
        source: result.source,
        error: primaryError.message,
        debug: debugFields(result),
      });
    } catch (fallbackError) {
      await logMarket("quote_failed", { target: material.symbol, error: `${primaryError.message}; ${fallbackError.message}` });
      return {
        ...material,
        price: null,
        previousClose: null,
        change: null,
        changePercent: null,
        currency: "USD",
        twdEstimate: null,
        history: [],
        status: MARKET_STATES.API_ERROR,
        sourceReliability: "NO_DATA",
        error: `${primaryError.message}; ${fallbackError.message}`,
      };
    }
  }
}

function normalizeRow(material, quote, fx, meta) {
  return {
    ...material,
    ...quote,
    source: meta.source,
    status: meta.status,
    sourceReliability: meta.sourceReliability,
    currency: material.currency || quote.currency || "USD",
    twdEstimate: calculateTwdReference(quote.price, material, fx.rate),
    error: meta.error,
    debug: meta.debug,
  };
}

function classifyFetchedObservation({ status, observedAt, now, env }) {
  const ageDays = observationAgeDays(observedAt, now);
  if (ageDays == null) {
    return {
      status: MARKET_STATES.NO_DATA,
      sourceReliability: "NO_DATA",
      error: "direct public quote missing observation timestamp",
    };
  }
  if (ageDays > staleMaxAgeDays(env)) {
    return {
      status: MARKET_STATES.EXPIRED,
      sourceReliability: "EXPIRED",
      error: "direct public observation exceeded freshness policy",
    };
  }
  return {
    status,
    sourceReliability: status === MARKET_STATES.OK ? "即時" : "fallback",
  };
}

function debugFields(result) {
  if (!DEBUG) return undefined;
  return {
    latencyMs: result.latencyMs,
    retryCount: result.retryCount,
    sourceType: result.sourceType,
  };
}

function rowStatusCounts(rows = []) {
  return rows.reduce((counts, row) => {
    const key = row.status === MARKET_STATES.OK ? "okRows" : row.status === MARKET_STATES.FALLBACK ? "fallbackRows" : row.status === MARKET_STATES.STALE ? "staleRows" : row.status === MARKET_STATES.EXPIRED ? "expiredRows" : row.status === MARKET_STATES.NO_DATA ? "noDataRows" : "errorRows";
    counts[key] += 1;
    return counts;
  }, { okRows: 0, fallbackRows: 0, staleRows: 0, expiredRows: 0, noDataRows: 0, errorRows: 0 });
}

function buildSnapshot(fx, rows, now = new Date()) {
  const counts = rowStatusCounts(rows);
  const state = counts.okRows > 0
    ? MARKET_STATES.OK
    : counts.fallbackRows > 0
      ? MARKET_STATES.FALLBACK
      : counts.staleRows > 0
        ? MARKET_STATES.STALE
        : counts.expiredRows > 0
          ? MARKET_STATES.EXPIRED
          : counts.noDataRows > 0
            ? MARKET_STATES.NO_DATA
            : MARKET_STATES.API_ERROR;
  const generatedAt = iso(now) || new Date().toISOString();
  const dataAsOf = getSnapshotDataAsOf({ fx, rows });
  const summary = {
    ...counts,
    totalRows: rows.length,
    latestMarketObservationAt: dataAsOf,
  };
  return {
    state,
    generatedAt,
    servedAt: generatedAt,
    dataAsOf,
    latestMarketObservationAt: dataAsOf,
    refreshSeconds: Math.round(FRESH_TTL_MS / 1000),
    acquisitionPath: "DIRECT_ACQUISITION",
    fx,
    rows,
    summary,
    marketHealth: {
      latestMarketObservationAt: dataAsOf,
      freshCount: counts.okRows,
      fallbackCount: counts.fallbackRows,
      staleCount: counts.staleRows,
      expiredCount: counts.expiredRows,
      apiErrorCount: counts.errorRows + counts.noDataRows,
    },
    cache: {
      status: state,
      servedAt: generatedAt,
      dataAsOf,
      ttlSeconds: Math.round(FRESH_TTL_MS / 1000),
    },
    disclaimer: PUBLIC_MARKET_DISCLAIMER,
  };
}

async function readDurablePublicFallback(options = {}) {
  const env = options.env || process.env;
  if (!isProduction(env) || String(env.STORAGE_PROVIDER || "").toLowerCase() !== "postgres" || (!env.DATABASE_URL && !options.filePath)) return null;
  try {
    const records = await listSnapshots({
      env,
      storageConfig: options.storageConfig || getStorageConfig(env),
      filePath: options.filePath,
      pool: options.pool,
    });
    if (!records.length) return null;
    const latestByMaterial = new Map();
    for (const record of records) {
      const current = latestByMaterial.get(record.materialId);
      if (!current || `${record.date}|${record.collectedAt || ""}` > `${current.date}|${current.collectedAt || ""}`) latestByMaterial.set(record.materialId, record);
    }
    const now = options.now || new Date();
    const classify = (record) => {
      if (!record || !Number.isFinite(record.marketPrice)) return null;
      const ageDays = observationAgeDays(record.date, now);
      const status = ageDays != null && ageDays <= staleMaxAgeDays(env) ? MARKET_STATES.FALLBACK : MARKET_STATES.EXPIRED;
      return {
        ...record,
        status,
        sourceReliability: "READ_FALLBACK",
        collectionPath: "READ_FALLBACK",
        error: status === MARKET_STATES.EXPIRED ? "durable public observation exceeded freshness policy" : "direct public acquisition failed; durable public snapshot used",
      };
    };
    const fxRecord = classify(latestByMaterial.get(FX_MATERIAL_ID));
    const fx = fxRecord ? {
      rate: fxRecord.marketPrice,
      status: fxRecord.status,
      sourceReliability: "READ_FALLBACK",
      source: fxRecord.source,
      lastTradeAt: fxRecord.lastTradeTimestamp,
      error: fxRecord.error,
    } : { rate: null, status: MARKET_STATES.NO_DATA, sourceReliability: "NO_DATA", source: "durable public snapshot" };
    const rows = materials.map((material) => {
      const record = classify(latestByMaterial.get(material.id));
      if (!record) return { ...material, price: null, previousClose: null, change: null, changePercent: null, currency: material.currency, twdEstimate: null, history: [], status: MARKET_STATES.NO_DATA, sourceReliability: "NO_DATA", error: "durable public snapshot missing" };
      return {
        ...material,
        price: record.marketPrice,
        previousClose: null,
        change: null,
        changePercent: null,
        currency: record.currency || material.currency,
        twdEstimate: record.twdReferenceValue,
        history: [],
        status: record.status,
        source: record.source || material.source,
        sourceReliability: record.sourceReliability,
        lastTradeAt: record.lastTradeTimestamp,
        error: record.error,
      };
    });
    const snapshot = buildSnapshot(fx, rows, now);
    const originalGenerationDates = records.flatMap((record) => [record.provenance?.generatedAt, record.collectedAt, record.lastTradeTimestamp]).filter(Boolean).sort();
    snapshot.generatedAt = originalGenerationDates.at(-1) || snapshot.dataAsOf || snapshot.generatedAt;
    snapshot.servedAt = iso(now) || snapshot.servedAt;
    snapshot.acquisitionPath = "READ_FALLBACK";
    snapshot.cache = { ...(snapshot.cache || {}), status: "READ_FALLBACK", servedAt: snapshot.servedAt, dataAsOf: snapshot.dataAsOf };
    snapshot.disclaimer = `${snapshot.disclaimer} 直接公開來源失敗時，僅使用符合 freshness policy 的 durable public snapshot，並標示 READ_FALLBACK；不視為 LIVE。`;
    return snapshot;
  } catch (error) {
    await logMarket("durable_fallback_failed", { error: error.message });
    return null;
  }
}

async function hydrateFailedRowsWithStale(snapshot, options = {}) {
  const errorRows = snapshot.rows.filter((row) => row.status === MARKET_STATES.API_ERROR || row.status === MARKET_STATES.NO_DATA);
  if (!errorRows.length) return snapshot;

  const stale = await readDurablePublicFallback(options) || await getStaleCache("部分即時行情來源失敗", { env: options.env || process.env, now: options.now || new Date() });
  if (!stale?.rows?.length) return snapshot;

  const staleById = new Map(stale.rows.map((row) => [row.id, row]));
  let hydratedRows = 0;
  const rows = snapshot.rows.map((row) => {
    if (row.status !== MARKET_STATES.API_ERROR && row.status !== MARKET_STATES.NO_DATA) return row;
    const staleRow = staleById.get(row.id);
    if (!staleRow || staleRow.status === MARKET_STATES.API_ERROR || staleRow.status === MARKET_STATES.NO_DATA) return row;
    hydratedRows += 1;
    return {
      ...staleRow,
      status: staleRow.status === MARKET_STATES.EXPIRED ? MARKET_STATES.EXPIRED : MARKET_STATES.STALE,
      sourceReliability: staleRow.status === MARKET_STATES.EXPIRED ? "EXPIRED" : "STALE",
      error: row.error,
    };
  });

  if (!hydratedRows) return snapshot;
  await logMarket("stale_row_hydration", { hydratedRows, failedRows: errorRows.length });

  const staleFx = snapshot.fx?.status === MARKET_STATES.API_ERROR && stale.fx?.rate
    ? {
      ...stale.fx,
      status: stale.fx.status === MARKET_STATES.EXPIRED ? MARKET_STATES.EXPIRED : MARKET_STATES.STALE,
      sourceReliability: stale.fx.status === MARKET_STATES.EXPIRED ? "EXPIRED" : "STALE",
      error: snapshot.fx.error,
    }
    : snapshot.fx;
  const hydratedSnapshot = buildSnapshot(staleFx, rows, options.now || new Date());
  hydratedSnapshot.acquisitionPath = "DIRECT_ACQUISITION_WITH_READ_FALLBACK";
  hydratedSnapshot.disclaimer = `${hydratedSnapshot.disclaimer} 部分來源失敗時，系統分開標示直接取得與 READ_FALLBACK 資料。`;
  return hydratedSnapshot;
}

async function fetchLiveSnapshot(options = {}) {
  const now = options.now || new Date();
  const env = options.env || process.env;
  const fx = await fetchFx({ now, env });
  const rows = await Promise.all(materials.map((material) => fetchMaterial(material, fx, { now, env })));
  const snapshot = await hydrateFailedRowsWithStale(buildSnapshot(fx, rows, now), options);
  await saveSuccessful(snapshot);
  return snapshot;
}

function revalidateInBackground(options = {}) {
  if (refreshPromise) return;
  refreshPromise = fetchLiveSnapshot(options)
    .catch((error) => logMarket("background_refresh_failed", { error: error.message }))
    .finally(() => {
      refreshPromise = null;
    });
}

async function getMarketSnapshot(options = {}) {
  const now = options.now || new Date();
  const cached = await getFreshCache();
  if (cached) {
    revalidateInBackground({ env: options.env || process.env, now });
    const canonicalCached = canonicalizeSnapshot(cached);
    const servedAt = iso(now) || new Date().toISOString();
    return {
      ...canonicalCached,
      servedAt,
      dataAsOf: canonicalCached.dataAsOf || getSnapshotDataAsOf(canonicalCached),
      latestMarketObservationAt: canonicalCached.latestMarketObservationAt || canonicalCached.dataAsOf || getSnapshotDataAsOf(canonicalCached),
      state: canonicalCached.state || MARKET_STATES.OK,
      cache: {
        ...(cached.cache || {}),
        status: "MEMORY_CACHE",
        servedAt,
      },
      debugMode: options.debug ? DEBUG : undefined,
    };
  }

  if (!refreshPromise) refreshPromise = fetchLiveSnapshot({ env: options.env || process.env, now }).finally(() => { refreshPromise = null; });

  const live = await refreshPromise;
  const liveRows = live.rows.filter((row) => [MARKET_STATES.OK, MARKET_STATES.FALLBACK].includes(row.status)).length;
  if (liveRows > 0) return live;

  const stale = await readDurablePublicFallback({ ...options, now }) || await getStaleCache("即時行情來源全部失敗", { env: options.env || process.env, now });
  if (stale) return stale;

  return {
    ...live,
    state: MARKET_STATES.NO_DATA,
    servedAt: iso(now) || new Date().toISOString(),
    dataAsOf: live.dataAsOf || null,
    marketHealth: {
      ...(live.marketHealth || {}),
      freshCount: 0,
      latestMarketObservationAt: live.dataAsOf || null,
    },
    cache: {
      ...(live.cache || {}),
      status: MARKET_STATES.NO_DATA,
      reason: "沒有可用即時資料或符合 freshness policy 的快取資料",
    },
  };
}

module.exports = {
  buildSnapshot,
  buildSnapshotStatusCounts: rowStatusCounts,
  getMarketSnapshot,
  readDurablePublicFallback,
};
