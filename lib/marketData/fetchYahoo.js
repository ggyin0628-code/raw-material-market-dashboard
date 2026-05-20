const { normalizeYahooChart } = require("./marketNormalizer");
const { fetchWithTimeout, withRetry } = require("./retryManager");

const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const headers = {
  "user-agent": "Mozilla/5.0 raw-material-monitor/1.0",
  accept: "application/json",
};

async function fetchYahooChart(symbol, range = "5d", interval = "1d") {
  return withRetry(async () => {
    let lastError = null;
    for (const host of YAHOO_HOSTS) {
      try {
        const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
        const { response, latencyMs } = await fetchWithTimeout(url, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return {
          quote: normalizeYahooChart(await response.json()),
          source: `Yahoo Finance - ${symbol}`,
          sourceType: "primary",
          latencyMs,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Yahoo unavailable");
  }, {
    provider: "yahoo",
    symbol,
  });
}

module.exports = {
  fetchYahooChart,
};
