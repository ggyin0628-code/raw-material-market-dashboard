const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;

const materials = [
  {
    id: "copper",
    name: "銅",
    symbol: "HG=F",
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
    category: "能源",
    unit: "USD/MMBtu",
    source: "Yahoo Finance - Natural Gas Futures",
    usage: "能源、熱處理、鍋爐、化工成本趨勢參考",
  },
  {
    id: "gold",
    name: "黃金",
    symbol: "GC=F",
    category: "貴金屬",
    unit: "USD/troy oz",
    source: "Yahoo Finance - Gold Futures",
    usage: "鍍金、電子接點、貴金屬成本趨勢參考",
  },
  {
    id: "silver",
    name: "白銀",
    symbol: "SI=F",
    category: "貴金屬",
    unit: "USD/troy oz",
    source: "Yahoo Finance - Silver Futures",
    usage: "導電材料、焊料、鍍銀件成本趨勢參考",
  },
  {
    id: "platinum",
    name: "鉑金",
    symbol: "PL=F",
    category: "貴金屬",
    unit: "USD/troy oz",
    source: "Yahoo Finance - Platinum Futures",
    usage: "觸媒、感測器、特殊電極成本趨勢參考",
  },
  {
    id: "corn",
    name: "玉米",
    symbol: "ZC=F",
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
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const response = await fetch(endpoint, {
    headers: {
      "user-agent": "Mozilla/5.0 raw-material-monitor/1.0",
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
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
    return {
      rate: null,
      status: "API_ERROR",
      error: error.message,
      source: "Yahoo Finance - USD/TWD",
    };
  }
}

async function getMarketData() {
  const fx = await getUsdTwd();
  const rows = await Promise.all(materials.map(async (material) => {
    try {
      const quote = await fetchYahooChart(material.symbol);
      return {
        ...material,
        ...quote,
        twdEstimate: typeof quote.price === "number" && typeof fx.rate === "number" ? quote.price * (material.usdFactor || 1) * fx.rate : null,
        status: "LIVE",
      };
    } catch (error) {
      return {
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
      };
    }
  }));

  return {
    generatedAt: new Date().toISOString(),
    refreshSeconds: 300,
    fx,
    rows,
    disclaimer: "公開商品期貨行情只適合採購趨勢參考，不等於台灣供應商現貨報價、含稅含運價格或合約價。",
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
      sendJson(res, 200, await getMarketData());
    } catch (error) {
      sendJson(res, 500, { status: "API_ERROR", error: error.message });
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
