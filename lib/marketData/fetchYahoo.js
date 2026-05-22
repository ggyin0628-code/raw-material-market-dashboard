const { normalizeYahooChart, normalizeYahooHistory } = require("./marketNormalizer");
const { fetchWithTimeout, withRetry } = require("./retryManager");

const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const headers = {
  "user-agent": "Mozilla/5.0 raw-material-monitor/1.0",
  accept: "application/json",
};
const proxyHeaders = {
  "user-agent": "Mozilla/5.0 raw-material-monitor/1.0",
  accept: "text/plain,*/*",
};

function yahooChartUrl(host, symbol, range, interval) {
  return `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
}

function extractProxyJson(text) {
  const marker = "Markdown Content:";
  const content = text.includes(marker) ? text.slice(text.indexOf(marker) + marker.length).trim() : text.trim();
  const jsonStart = content.indexOf("{");
  const jsonEnd = content.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) throw new Error("Yahoo proxy response missing JSON");
  return JSON.parse(content.slice(jsonStart, jsonEnd + 1));
}

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

async function fetchYahooHistory(symbol, range = "1y", interval = "1d") {
  try {
    return await withRetry(async () => {
      let lastError = null;
      for (const host of YAHOO_HOSTS) {
        try {
          const { response, latencyMs } = await fetchWithTimeout(yahooChartUrl(host, symbol, range, interval), { headers });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return {
            rows: normalizeYahooHistory(await response.json()),
            source: `Yahoo Finance - ${symbol}`,
            sourceType: "primary",
            latencyMs,
          };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Yahoo history unavailable");
    }, {
      provider: "yahoo-history",
      symbol,
    });
  } catch (directError) {
    return withRetry(async () => {
      let lastError = null;
      for (const host of YAHOO_HOSTS) {
        try {
          const target = yahooChartUrl(host, symbol, range, interval).replace("https://", "http://");
          const url = `https://r.jina.ai/http://r.jina.ai/http://${target}`;
          const { response, latencyMs } = await fetchWithTimeout(url, { headers: proxyHeaders }, 15000);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return {
            rows: normalizeYahooHistory(extractProxyJson(await response.text())),
            source: `Yahoo Finance - ${symbol} via Jina`,
            sourceType: "fallback",
            latencyMs,
          };
        } catch (error) {
          lastError = error;
        }
      }
      throw new Error(`${directError.message}; ${lastError?.message || "Yahoo proxy unavailable"}`);
    }, {
      provider: "yahoo-history-proxy",
      symbol,
    });
  }
}

module.exports = {
  fetchYahooChart,
  fetchYahooHistory,
};
