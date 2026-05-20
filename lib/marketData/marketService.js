const { getFreshCache, getStaleCache, saveSuccessful, FRESH_TTL_MS } = require("./cacheManager");
const { fetchStooqQuote, fetchUsdTwdFallback } = require("./fetchFallback");
const { fetchYahooChart } = require("./fetchYahoo");
const { DEBUG, logMarket } = require("./logger");
const { materials } = require("./materials");
const { MARKET_STATES } = require("./status");

let refreshPromise = null;

async function fetchFx() {
  try {
    const result = await fetchYahooChart("TWD=X", "5d", "1d");
    return {
      rate: result.quote.price,
      status: MARKET_STATES.OK,
      sourceReliability: "即時",
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
        status: MARKET_STATES.FALLBACK,
        sourceReliability: "fallback",
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

async function fetchMaterial(material, fx) {
  try {
    const result = await fetchYahooChart(material.symbol);
    return normalizeRow(material, result.quote, fx, {
      status: MARKET_STATES.OK,
      source: material.source,
      sourceReliability: "即時",
      debug: debugFields(result),
    });
  } catch (primaryError) {
    try {
      const result = await fetchStooqQuote(material);
      await logMarket("fallback_trigger", { target: material.symbol, fallback: material.stooqSymbol, error: primaryError.message });
      return normalizeRow(material, result.quote, fx, {
        status: MARKET_STATES.FALLBACK,
        source: result.source,
        sourceReliability: "fallback",
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
    twdEstimate: typeof quote.price === "number" && typeof fx.rate === "number"
      ? quote.price * (material.usdFactor || 1) * fx.rate
      : null,
    error: meta.error,
    debug: meta.debug,
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

function buildSnapshot(fx, rows) {
  const okRows = rows.filter((row) => row.status === MARKET_STATES.OK).length;
  const fallbackRows = rows.filter((row) => row.status === MARKET_STATES.FALLBACK).length;
  const errorRows = rows.filter((row) => row.status === MARKET_STATES.API_ERROR).length;
  const state = okRows > 0 ? MARKET_STATES.OK : fallbackRows > 0 ? MARKET_STATES.FALLBACK : MARKET_STATES.API_ERROR;

  return {
    state,
    generatedAt: new Date().toISOString(),
    refreshSeconds: Math.round(FRESH_TTL_MS / 1000),
    fx,
    rows,
    summary: {
      okRows,
      fallbackRows,
      staleRows: 0,
      errorRows,
      totalRows: rows.length,
    },
    cache: {
      status: state,
      cachedAt: new Date().toISOString(),
      ttlSeconds: Math.round(FRESH_TTL_MS / 1000),
    },
    disclaimer: "公開商品期貨行情只適合採購趨勢參考，不等於台灣供應商現貨報價、含稅含運價格或合約價。",
  };
}

async function fetchLiveSnapshot() {
  const fx = await fetchFx();
  const rows = await Promise.all(materials.map((material) => fetchMaterial(material, fx)));
  const snapshot = buildSnapshot(fx, rows);
  await saveSuccessful(snapshot);
  return snapshot;
}

function revalidateInBackground() {
  if (refreshPromise) return;
  refreshPromise = fetchLiveSnapshot()
    .catch((error) => logMarket("background_refresh_failed", { error: error.message }))
    .finally(() => {
      refreshPromise = null;
    });
}

async function getMarketSnapshot(options = {}) {
  const cached = await getFreshCache();
  if (cached) {
    revalidateInBackground();
    return {
      ...cached,
      state: cached.state || MARKET_STATES.OK,
      cache: {
        ...(cached.cache || {}),
        status: "MEMORY_CACHE",
      },
      debugMode: options.debug ? DEBUG : undefined,
    };
  }

  if (!refreshPromise) refreshPromise = fetchLiveSnapshot().finally(() => {
    refreshPromise = null;
  });

  const live = await refreshPromise;
  const liveRows = live.rows.filter((row) => row.status !== MARKET_STATES.API_ERROR && row.status !== MARKET_STATES.NO_DATA).length;
  if (liveRows > 0) return live;

  const stale = await getStaleCache("即時行情來源全部失敗");
  if (stale) return stale;

  return {
    ...live,
    state: MARKET_STATES.NO_DATA,
    cache: {
      status: MARKET_STATES.NO_DATA,
      reason: "沒有可用即時資料或快取資料",
    },
  };
}

module.exports = {
  getMarketSnapshot,
};
