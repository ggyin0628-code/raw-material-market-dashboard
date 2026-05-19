const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const MARKET_CACHE_TTL_MS = Number(process.env.MARKET_CACHE_TTL_MS || 15 * 60 * 1000);
const MARKET_STALE_TTL_MS = Number(process.env.MARKET_STALE_TTL_MS || 24 * 60 * 60 * 1000);
const FETCH_GAP_MS = Number(process.env.FETCH_GAP_MS || 350);
const YAHOO_TIMEOUT_MS = Number(process.env.YAHOO_TIMEOUT_MS || 2500);
const FALLBACK_TIMEOUT_MS = Number(process.env.FALLBACK_TIMEOUT_MS || 5000);
let marketCache = null;
let marketRefreshPromise = null;

const materials = [
  {
    id: "copper",
    name: "銅",
    symbol: "HG=F",
    stooqSymbol: "HG.F",
    stooqPriceFactor: 0.01,
    category: "工業金屬",
    unit: "USD/lb",
    source: "Yahoo Finance - COMEX Copper Futures",
    usage: "銅排、電線、端子、散熱與機構件成本參考",
  },
  {
    id: "aluminum",
    name: "鋁",
    symbol: "ALI=F",
    category: "工業金屬",
    unit: "USD/metric ton",
    source: "Yahoo Finance - Aluminum Futures",
    usage: "鋁擠型、鋁板、壓鑄與 CNC 鋁件成本參考",
  },
  {
    id: "steel-hrc",
    name: "熱軋鋼捲",
    symbol: "HRC=F",
    category: "鋼鐵",
    unit: "USD/short ton",
    source: "Yahoo Finance - U.S. Midwest HRC Steel Futures",
    usage: "鈑金、鋼構、沖壓件與板材成本參考",
  },
  {
    id: "iron-ore",
    name: "鐵礦砂",
    symbol: "TIO=F",
    category: "鋼鐵",
    unit: "USD/metric ton",
    source: "Yahoo Finance - Iron Ore Futures",
    usage: "鋼材成本趨勢參考，不等於實際鋼板採購價",
  },
  {
    id: "wti-oil",
    name: "WTI 原油",
    symbol: "CL=F",
    stooqSymbol: "CL.F",
    category: "能源",
    unit: "USD/barrel",
    source: "Yahoo Finance - WTI Crude Oil Futures",
    usage: "塑膠、橡膠、油品、運輸成本趨勢參考",
  },
  {
    id: "brent-oil",
    name: "Brent 原油",
    symbol: "BZ=F",
    category: "能源",
    unit: "USD/barrel",
    source: "Yahoo Finance - Brent Crude Oil Futures",
    usage: "國際原油與石化成本趨勢參考",
  },
  {
    id: "natural-gas",
    name: "天然氣",
    symbol: "NG=F",
    stooqSymbol: "NG.F",
    category: "能源",
    unit: "USD/MMBtu",
    source: "Yahoo Finance - Natural Gas Futures",
    usage: "能源、熱處理、鍋爐、化工成本趨勢參考",
  },
  {
    id: "gold",
    name: "黃金",
    symbol: "GC=F",
    stooqSymbol: "GC.F",
    category: "貴金屬",
    unit: "USD/troy oz",
    source: "Yahoo Finance - Gold Futures",
    usage: "鍍金、電子接點、貴金屬成本趨勢參考",
  },
  {
    id: "silver",
    name: "白銀",
    symbol: "SI=F",
    stooqSymbol: "SI.F",
    stooqPriceFactor: 0.01,
    category: "貴金屬",
    unit: "USD/troy oz",
    source: "Yahoo Finance - Silver Futures",
    usage: "導電材料、焊料、鍍銀件成本趨勢參考",
  },
  {
    id: "platinum",
    name: "鉑金",
    symbol: "PL=F",
    stooqSymbol: "PL.F",
    category: "貴金屬",
    unit: "USD/troy oz",
    source: "Yahoo Finance - Platinum Futures",
    usage: "觸媒、感測器、特殊電極成本趨勢參考",
  },
  {
    id: "corn",
    name: "玉米",
    symbol: "ZC=F",
    stooqSymbol: "ZC.F",
    category: "農產品",
    unit: "US cents/bushel",
    usdFactor: 0.01,
    source: "Yahoo Finance - Corn Futures",
    usage: "食品、飼料、澱粉與生質材料成本趨勢參考",
  },
  {
    id: "soybean",
    name: "黃豆",
    symbol: "ZS=F",
    stooqSymbol: "ZS.F",
    category: "農產品",
    unit: "US cents/bushel",
    usdFactor: 0.01,
    source: "Yahoo Finance - Soybean Futures",
    usage: "食品、油脂、飼料與生質材料成本趨勢參考",
  },
  {
    id: "coffee",
    name: "咖啡",
    symbol: "KC=F",
    stooqSymbol: "KC.F",
    category: "農產品",
    unit: "US cents/lb",
    usdFactor: 0.01,
    source: "Yahoo Finance - Coffee Futures",
    usage: "食品原料成本趨勢參考",
  },
  {
    id: "cotton",
    name: "棉花",
    symbol: "CT=F",
    stooqSymbol: "CT.F",
    category: "纖維",
    unit: "US cents/lb",
    usdFactor: 0.01,
    source: "Yahoo Finance - Cotton Futures",
    usage: "紡織、包材、耗材成本趨勢參考",
  },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFreshCache() {
  return marketCache && Date.now() - marketCache.cachedAt < MARKET_CACHE_TTL_MS;
}

function isUsableStaleCache() {
  return marketCache && Date.now() - marketCache.cachedAt < MARKET_STALE_TTL_MS;
}

function markPayloadStale(payload, reason) {
  return {
    ...payload,
    generatedAt: new Date().toISOString(),
    cache: {
      status: "STALE",
      cachedAt: new Date(payload.cachedAt || marketCache?.cachedAt || Date.now()).toISOString(),
      reason,
    },
    fx: {
      ...payload.fx,
      status: payload.fx?.status === "LIVE" ? "STALE" : payload.fx?.status,
      error: reason,
    },
    rows: (payload.rows || []).map((row) => ({
      ...row,
      status: row.status === "LIVE" ? "STALE" : row.status,
      error: row.status === "LIVE" ? reason : row.error,
    })),
    disclaimer: `${payload.disclaimer} 目前行情來源被限流時，系統會暫時顯示最近一次成功抓取的快取資料並標示 STALE。`,
  };
}

function latestValid(values = []) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (typeof values[index] === "number" && Number.isFinite(values[index])) {
      return values[index];
    }
  }
  return null;
}

function latestValidPoint(timestamps = [], values = []) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (typeof values[index] === "number" && Number.isFinite(values[index]) && timestamps[index]) {
      return {
        value: values[index],
        timestamp: timestamps[index],
        index,
      };
    }
  }
  return null;
}

async function fetchYahooChart(symbol, range = "5d", interval = "1d") {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastError = null;
  for (const host of hosts) {
    try {
      const endpoint = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(YAHOO_TIMEOUT_MS),
        headers: {
          "user-agent": "Mozilla/5.0 raw-material-monitor/1.0",
          accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      return normalizeYahooPayload(payload);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Yahoo chart request failed");
}

function normalizeYahooPayload(payload) {
  const result = payload?.chart?.result?.[0];
  const error = payload?.chart?.error;
  if (!result || error) {
    throw new Error(error?.description || "Yahoo chart response missing result");
  }

  const close = result.indicators?.quote?.[0]?.close || [];
  const timestamps = result.timestamp || [];
  const meta = result.meta || {};
  const latestPoint = latestValidPoint(timestamps, close);
  const metaTime = meta.regularMarketTime || null;
  const metaLooksFresh = metaTime && latestPoint?.timestamp ? metaTime >= latestPoint.timestamp - 86400 : false;
  const price = metaLooksFresh && typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : latestPoint?.value ?? latestValid(close);
  const previousPoint = latestPoint
    ? latestValidPoint(timestamps.slice(0, latestPoint.index), close.slice(0, latestPoint.index))
    : null;
  const previousClose = typeof meta.previousClose === "number" && metaLooksFresh ? meta.previousClose : previousPoint?.value ?? null;
  const change = typeof price === "number" && typeof previousClose === "number" ? price - previousClose : null;
  const changePercent = typeof change === "number" && previousClose ? (change / previousClose) * 100 : null;
  const lastTrade = metaLooksFresh ? metaTime : latestPoint?.timestamp || timestamps[timestamps.length - 1] || null;

  return {
    price,
    previousClose,
    change,
    changePercent,
    currency: meta.currency || "USD",
    exchangeName: meta.exchangeName || meta.fullExchangeName || "",
    marketState: meta.marketState || "",
    lastTradeAt: lastTrade ? new Date(lastTrade * 1000).toISOString() : null,
    history: timestamps.map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      close: close[index] ?? null,
    })).filter((point) => typeof point.close === "number"),
  };
}

function parseStooqCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length < 2) throw new Error("Stooq response missing quote");
  const headers = rows[0].split(",");
  const values = rows[1].split(",");
  const aliases = {
    Data: "Date",
    Czas: "Time",
    Otwarcie: "Open",
    Najwyzszy: "High",
    Najnizszy: "Low",
    Zamkniecie: "Close",
    Wolumen: "Volume",
  };
  return Object.fromEntries(headers.map((header, index) => [aliases[header] || header, values[index]]));
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function fetchStooqQuote(material) {
  if (!material.stooqSymbol) {
    throw new Error("No Stooq fallback symbol");
  }

  const symbol = encodeURIComponent(material.stooqSymbol.toLowerCase());
  const endpoints = [
    `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`,
    `http://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`,
    `https://stooq.pl/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`,
  ];
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
        headers: {
          "user-agent": "Mozilla/5.0 raw-material-monitor/1.0",
          accept: "text/csv,*/*",
        },
      });

      if (!response.ok) {
        throw new Error(`Stooq HTTP ${response.status}`);
      }

      return normalizeStooqQuote(await response.text(), material);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Stooq request failed");
}

function normalizeStooqQuote(text, material) {
  const row = parseStooqCsv(text);
  const rawClose = toFiniteNumber(row.Close);
  const rawOpen = toFiniteNumber(row.Open);
  if (row.Date === "N/D" || typeof rawClose !== "number") {
    throw new Error("Stooq quote unavailable");
  }

  const factor = material.stooqPriceFactor || 1;
  const price = rawClose * factor;
  const previousClose = typeof rawOpen === "number" ? rawOpen * factor : null;
  const change = typeof previousClose === "number" ? price - previousClose : null;
  const changePercent = typeof change === "number" && previousClose ? (change / previousClose) * 100 : null;
  const lastTradeAt = row.Date && row.Time && row.Date !== "N/D" && row.Time !== "N/D"
    ? new Date(`${row.Date}T${row.Time}Z`).toISOString()
    : null;

  return {
    price,
    previousClose,
    change,
    changePercent,
    currency: "USD",
    exchangeName: "Stooq",
    marketState: "",
    lastTradeAt,
    history: [
      {
        date: row.Date,
        close: price,
      },
    ],
    source: `Stooq - ${material.stooqSymbol}`,
  };
}

async function getUsdTwdFallback() {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    signal: AbortSignal.timeout(FALLBACK_TIMEOUT_MS),
    headers: {
      "user-agent": "Mozilla/5.0 raw-material-monitor/1.0",
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`FX fallback HTTP ${response.status}`);
  }

  const payload = await response.json();
  const rate = payload?.rates?.TWD;
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new Error("FX fallback missing TWD rate");
  }

  return {
    rate,
    status: "LIVE",
    lastTradeAt: payload?.time_last_update_utc ? new Date(payload.time_last_update_utc).toISOString() : new Date().toISOString(),
    source: "open.er-api.com - USD/TWD",
  };
}

async function getUsdTwd() {
  try {
    const fx = await fetchYahooChart("TWD=X", "5d", "1d");
    return {
      rate: fx.price,
      status: typeof fx.price === "number" ? "LIVE" : "API_ERROR",
      lastTradeAt: fx.lastTradeAt,
      source: "Yahoo Finance - USD/TWD",
    };
  } catch (error) {
    try {
      return await getUsdTwdFallback();
    } catch (fallbackError) {
      return {
        rate: null,
        status: "API_ERROR",
        error: `${error.message}; ${fallbackError.message}`,
        source: "Yahoo Finance - USD/TWD",
      };
    }
  }
}

async function fetchMaterialQuote(material) {
  try {
    return await fetchYahooChart(material.symbol);
  } catch (yahooError) {
    try {
      return await fetchStooqQuote(material);
    } catch (fallbackError) {
      throw new Error(`${yahooError.message}; ${fallbackError.message}`);
    }
  }
}

async function getMarketData() {
  const fx = await getUsdTwd();
  const rows = [];
  for (const material of materials) {
    try {
      const quote = await fetchMaterialQuote(material);
      rows.push({
        ...material,
        ...quote,
        source: quote.source || material.source,
        twdEstimate: typeof quote.price === "number" && typeof fx.rate === "number" ? quote.price * (material.usdFactor || 1) * fx.rate : null,
        status: "LIVE",
      });
    } catch (error) {
      rows.push({
        ...material,
        price: null,
        previousClose: null,
        change: null,
        changePercent: null,
        currency: "USD",
        twdEstimate: null,
        history: [],
        status: "API_ERROR",
        error: error.message,
      });
    }
    await sleep(FETCH_GAP_MS);
  }

  return {
    generatedAt: new Date().toISOString(),
    refreshSeconds: Math.round(MARKET_CACHE_TTL_MS / 1000),
    fx,
    rows,
    cache: {
      status: "LIVE",
      cachedAt: new Date().toISOString(),
      ttlSeconds: Math.round(MARKET_CACHE_TTL_MS / 1000),
    },
    disclaimer: "公開商品期貨行情只適合採購趨勢參考，不等於台灣供應商現貨報價、含稅含運價格或合約價。",
  };
}

async function getCachedMarketData() {
  if (isFreshCache()) {
    return {
      ...marketCache.payload,
      generatedAt: new Date().toISOString(),
      cache: {
        ...marketCache.payload.cache,
        status: "LIVE_CACHE",
        cachedAt: new Date(marketCache.cachedAt).toISOString(),
      },
    };
  }

  if (!marketRefreshPromise) {
    marketRefreshPromise = getMarketData()
      .then((payload) => {
        const liveRows = payload.rows.filter((row) => row.status === "LIVE").length;
        if (payload.fx.status === "LIVE" || liveRows > 0) {
          marketCache = {
            cachedAt: Date.now(),
            payload: {
              ...payload,
              cachedAt: Date.now(),
            },
          };
        }
        return payload;
      })
      .finally(() => {
        marketRefreshPromise = null;
      });
  }

  const payload = await marketRefreshPromise;
  const liveRows = payload.rows.filter((row) => row.status === "LIVE").length;
  if (payload.fx.status === "LIVE" || liveRows > 0) {
    return payload;
  }

  if (isUsableStaleCache()) {
    const firstError = payload.rows.find((row) => row.error)?.error || payload.fx.error || "行情來源暫時無法連線";
    return markPayloadStale(marketCache.payload, firstError);
  }

  return {
    ...payload,
    cache: {
      status: "API_ERROR",
      reason: "沒有可用快取資料",
    },
  };
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/") pathname = "/index.html";
  const target = path.normalize(path.join(ROOT, pathname));

  if (!target.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(target);
    const ext = path.extname(target);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  if (requestUrl.pathname === "/health") {
    sendJson(res, 200, {
      status: "OK",
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  if (requestUrl.pathname === "/api/materials") {
    try {
      sendJson(res, 200, await getCachedMarketData());
    } catch (error) {
      if (isUsableStaleCache()) {
        sendJson(res, 200, markPayloadStale(marketCache.payload, error.message));
      } else {
        sendJson(res, 500, { status: "API_ERROR", error: error.message });
      }
    }
    return;
  }

  await serveStatic(req, res);
});

function getLanUrls() {
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const network of Object.values(interfaces)) {
    for (const address of network || []) {
      if (address.family === "IPv4" && !address.internal) {
        urls.push(`http://${address.address}:${PORT}`);
      }
    }
  }
  return urls;
}

server.listen(PORT, HOST, () => {
  const lanUrls = getLanUrls();
  console.log("原物料查詢系統已啟動");
  console.log(`本機開啟：http://localhost:${PORT}`);
  if (lanUrls.length) {
    console.log("公司同網路電腦可嘗試開啟：");
    for (const url of lanUrls) console.log(`- ${url}`);
  } else {
    console.log("目前沒有偵測到公司內網 IP。");
  }
  console.log("若公司電腦仍無法開啟，通常是防火牆或不同網段擋住 4173 port。");
});
