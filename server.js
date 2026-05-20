const http = require("node:http");
const fs = require("node:fs/promises");
const dns = require("node:dns");
const os = require("node:os");
const path = require("node:path");
const { URL } = require("node:url");
const { getMarketSnapshot } = require("./lib/marketData/marketService");

dns.setDefaultResultOrder("ipv4first");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;

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

function toLegacyMaterialPayload(snapshot) {
  const rows = (snapshot.rows || []).map((row) => ({
    ...row,
    status: row.status === "OK" || row.status === "FALLBACK" ? "LIVE" : row.status,
  }));

  return {
    ...snapshot,
    fx: snapshot.fx ? {
      ...snapshot.fx,
      status: snapshot.fx.status === "OK" || snapshot.fx.status === "FALLBACK" ? "LIVE" : snapshot.fx.status,
    } : snapshot.fx,
    rows,
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

  if (requestUrl.pathname === "/api/market") {
    try {
      const debug = requestUrl.searchParams.get("debug") === "true";
      sendJson(res, 200, await getMarketSnapshot({ debug }));
    } catch (error) {
      sendJson(res, 500, {
        state: "API_ERROR",
        generatedAt: new Date().toISOString(),
        error: error.message,
      });
    }
    return;
  }

  if (requestUrl.pathname === "/api/materials") {
    try {
      const snapshot = await getMarketSnapshot();
      sendJson(res, 200, toLegacyMaterialPayload(snapshot));
    } catch (error) {
      sendJson(res, 500, {
        state: "API_ERROR",
        status: "API_ERROR",
        generatedAt: new Date().toISOString(),
        error: error.message,
      });
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
});
