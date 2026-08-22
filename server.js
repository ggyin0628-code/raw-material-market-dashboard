const http = require("node:http");
const fs = require("node:fs/promises");
const dns = require("node:dns");
const os = require("node:os");
const path = require("node:path");
const { URL } = require("node:url");
const { createHistoricalWorkbook, createHistoryPayload } = require("./lib/marketData/exportService");
const { getMarketSnapshot } = require("./lib/marketData/marketService");
const { DEBUG } = require("./lib/marketData/logger");
const { canonicalizeSnapshot } = require("./lib/marketData/dataContract");
const { getWeeklyPreview, getWeeklyWorkbook, generateWeeklyReport } = require("./lib/weekly/weeklyEngine");

dns.setDefaultResultOrder("ipv4first");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const MAX_QUERY_VALUE_LENGTH = 128;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    ...securityHeaders(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res, status, body) {
  res.writeHead(status, {
    ...securityHeaders(),
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function safeDownloadFilename(filename) {
  const safe = String(filename || "download.xlsx").replace(/[^A-Za-z0-9._-]/g, "_");
  return safe || "download.xlsx";
}

function sendExcel(res, filename, buffer) {
  const safeFilename = safeDownloadFilename(filename);
  const encodedName = encodeURIComponent(safeFilename);
  res.writeHead(200, {
    ...securityHeaders(),
    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedName}`,
    "cache-control": "no-store",
    "content-length": buffer.length,
  });
  res.end(buffer);
}

function sendApiError(res, error) {
  const statusCode = Number(error?.statusCode) || 500;
  const publicError = statusCode < 500 ? error.message : "公開資料來源暫時無法取得，請稍後再試。";
  const payload = {
    state: "API_ERROR",
    generatedAt: new Date().toISOString(),
    error: publicError,
  };
  if (DEBUG && statusCode >= 500) payload.debug = error?.message;
  sendJson(res, statusCode, payload);
}

function toLegacyMaterialPayload(snapshot) {
  return canonicalizeSnapshot(snapshot);
}

function getQueryParam(requestUrl, key, defaultValue = "") {
  const value = requestUrl.searchParams.get(key);
  if (value === null || value === "") return defaultValue;
  if (value.length > MAX_QUERY_VALUE_LENGTH) {
    const error = new Error(`查詢參數 ${key} 過長`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function getWeeklyOptions(requestUrl) {
  const week = getQueryParam(requestUrl, "week", "");
  return week ? { reportingWeek: week } : {};
}

async function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  } catch {
    sendJson(res, 400, { state: "API_ERROR", error: "網址格式錯誤" });
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  const target = path.normalize(path.join(ROOT, pathname));
  const relative = path.relative(ROOT, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403, { ...securityHeaders(), "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const fileStat = await fs.stat(target);
    if (!fileStat.isFile()) throw new Error("Not a file");
    const content = await fs.readFile(target);
    const ext = path.extname(target);
    res.writeHead(200, {
      ...securityHeaders(),
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-store",
      "content-length": content.length,
    });
    res.end(content);
  } catch {
    res.writeHead(404, { ...securityHeaders(), "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function handleRequest(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, { ...securityHeaders(), allow: "GET" });
    res.end("Method Not Allowed");
    return;
  }

  let requestUrl;
  try {
    requestUrl = new URL(req.url || "/", "http://localhost");
  } catch {
    sendJson(res, 400, { state: "API_ERROR", error: "網址格式錯誤" });
    return;
  }

  if (requestUrl.pathname === "/health") {
    sendJson(res, 200, {
      status: "OK",
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  if (requestUrl.pathname === "/api/market") {
    try {
      const debug = getQueryParam(requestUrl, "debug", "") === "true";
      sendJson(res, 200, await getMarketSnapshot({ debug }));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (requestUrl.pathname === "/api/materials") {
    try {
      sendJson(res, 200, toLegacyMaterialPayload(await getMarketSnapshot()));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (requestUrl.pathname === "/api/export/excel") {
    try {
      const symbol = getQueryParam(requestUrl, "symbol");
      const period = getQueryParam(requestUrl, "period", "1y");
      const result = await createHistoricalWorkbook({ symbol, period });
      sendExcel(res, result.filename, result.buffer);
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (requestUrl.pathname === "/api/history") {
    try {
      const symbol = getQueryParam(requestUrl, "symbol");
      const period = getQueryParam(requestUrl, "period", "1y");
      sendJson(res, 200, await createHistoryPayload({ symbol, period }));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (requestUrl.pathname === "/api/export/all") {
    try {
      const period = getQueryParam(requestUrl, "period", "3y");
      const result = await createHistoricalWorkbook({ period, all: true });
      sendExcel(res, result.filename, result.buffer);
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (requestUrl.pathname === "/api/weekly/report") {
    try {
      sendJson(res, 200, (await generateWeeklyReport({ ...getWeeklyOptions(requestUrl), writeFiles: false })).report);
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (requestUrl.pathname === "/weekly/preview") {
    try {
      sendHtml(res, 200, (await getWeeklyPreview(getWeeklyOptions(requestUrl))).html);
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (requestUrl.pathname === "/weekly/export.xlsx") {
    try {
      const result = await getWeeklyWorkbook(getWeeklyOptions(requestUrl));
      sendExcel(res, result.filename, result.buffer);
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  await serveStatic(req, res);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => sendApiError(res, error));
});

function getLanUrls() {
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const network of Object.values(interfaces)) {
    for (const address of network || []) {
      if (address.family === "IPv4" && !address.internal) urls.push(`http://${address.address}:${PORT}`);
    }
  }
  return urls;
}

function startServer() {
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
  });
  return server;
}

if (require.main === module) startServer();

module.exports = {
  handleRequest,
  safeDownloadFilename,
  server,
  startServer,
};
