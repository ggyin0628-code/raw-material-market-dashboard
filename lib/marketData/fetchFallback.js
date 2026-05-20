const { normalizeStooqQuote } = require("./marketNormalizer");
const { fetchWithTimeout, withRetry } = require("./retryManager");

const headers = {
  "user-agent": "Mozilla/5.0 raw-material-monitor/1.0",
  accept: "text/csv,*/*",
};

async function fetchStooqQuote(material) {
  if (!material.stooqSymbol) throw new Error("No fallback symbol");
  const symbol = encodeURIComponent(material.stooqSymbol.toLowerCase());
  const endpoints = [
    `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`,
    `http://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`,
    `https://stooq.pl/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`,
  ];

  return withRetry(async () => {
    try {
      return await Promise.any(endpoints.map(async (url) => {
        const { response, latencyMs } = await fetchWithTimeout(url, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return {
          quote: normalizeStooqQuote(await response.text(), material),
          source: `Stooq - ${material.stooqSymbol}`,
          sourceType: "fallback",
          latencyMs,
        };
      }));
    } catch (error) {
      throw new Error(error.errors?.map((item) => item.message).join("; ") || error.message);
    }
  }, {
    provider: "stooq",
    symbol: material.stooqSymbol,
  });
}

async function fetchUsdTwdFallback() {
  return withRetry(async () => {
    const { response, latencyMs } = await fetchWithTimeout("https://open.er-api.com/v6/latest/USD", {
      headers: {
        "user-agent": "Mozilla/5.0 raw-material-monitor/1.0",
        accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rate = payload?.rates?.TWD;
    if (typeof rate !== "number" || !Number.isFinite(rate)) throw new Error("FX fallback missing TWD rate");
    return {
      quote: {
        rate,
        lastTradeAt: payload?.time_last_update_utc ? new Date(payload.time_last_update_utc).toISOString() : new Date().toISOString(),
      },
      source: "open.er-api.com - USD/TWD",
      sourceType: "fallback",
      latencyMs,
    };
  }, {
    provider: "open.er-api",
    symbol: "USD/TWD",
  });
}

module.exports = {
  fetchStooqQuote,
  fetchUsdTwdFallback,
};
