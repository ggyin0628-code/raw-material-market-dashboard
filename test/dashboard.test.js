const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const ExcelJS = require("exceljs");

const ROOT = path.resolve(__dirname, "..");
const cacheDir = path.join(ROOT, "cache");
const { materials } = require("../lib/marketData/materials");
const { MARKET_STATES } = require("../lib/marketData/status");
const {
  PUBLIC_MARKET_DISCLAIMER,
  calculateTwdReference,
  canonicalizeSnapshot,
  getConversionFactor,
  isValidUnit,
} = require("../lib/marketData/dataContract");
const {
  normalizeDateRows,
  normalizeStooqQuote,
  normalizeYahooChart,
  normalizeYahooHistory,
} = require("../lib/marketData/marketNormalizer");
const { boundedInteger, withRetry } = require("../lib/marketData/retryManager");
const {
  addPriceCalculations,
  analyzePeriod,
  buildDecision,
  getPeriod,
  isDataInsufficient,
  nearestFxRate,
} = require("../lib/marketData/exportService");
const {
  clearMemoryCache,
  hasEnoughFreshRows,
  hasEnoughUsableRows,
} = require("../lib/marketData/cacheManager");
const { markSnapshotStale } = require("../lib/marketData/staleManager");
const { handleRequest } = require("../server");

const originalFetch = global.fetch;

test.afterEach(async () => {
  global.fetch = originalFetch;
  clearMemoryCache();
  await fs.rm(cacheDir, { recursive: true, force: true });
});

test("material registry has explicit supported source-unit contracts", () => {
  assert.equal(materials.length, 14);
  for (const material of materials) {
    assert.ok(material.symbol);
    assert.ok(material.exchange);
    assert.ok(material.source);
    assert.equal(material.currency, "USD");
    assert.equal(isValidUnit(material.unit), true);
    assert.equal(typeof getConversionFactor(material), "number");
  }
  assert.equal(materials.find((item) => item.id === "corn").conversionFactor, 0.01);
  assert.equal(materials.find((item) => item.id === "copper").conversionFactor, 1);
});

test("TWD reference conversion respects source-unit factor and never fabricates missing FX", () => {
  const corn = materials.find((item) => item.id === "corn");
  const copper = materials.find((item) => item.id === "copper");
  assert.equal(calculateTwdReference(450, corn, 32), 144);
  assert.equal(calculateTwdReference(6.25, copper, 32), 200);
  assert.equal(calculateTwdReference(450, corn, null), null);
  assert.equal(calculateTwdReference("450", corn, 32), null);
});

test("normalizers reject malformed quotes and sort/deduplicate history", () => {
  assert.throws(() => normalizeYahooChart({ chart: { result: [] } }), /missing result/i);
  assert.throws(() => normalizeYahooChart({ chart: { result: [{ indicators: { quote: [{ close: [] }] }, timestamp: [] }] } }), /missing finite price/i);
  const rows = normalizeDateRows([
    { date: "2025-01-03", close: 3 },
    { date: "2025-01-01", close: 1 },
    { date: "2025-01-03", close: 4 },
    { date: "bad", close: 100 },
    { date: "2025-01-02", close: Number.NaN },
  ]);
  assert.deepEqual(rows, [{ date: "2025-01-01", close: 1 }, { date: "2025-01-03", close: 4 }]);
  assert.deepEqual(normalizeYahooHistory({ chart: { result: [{ timestamp: [1], indicators: { quote: [{}] } }] } }), []);
});

test("Stooq fallback preserves cents-to-USD normalization", () => {
  const copper = materials.find((item) => item.id === "copper");
  const quote = normalizeStooqQuote("Symbol,Date,Time,Open,High,Low,Close,Volume\nHG.F,2026-08-21,17:00:00,620.00,630.00,615.00,625.00,123", copper);
  assert.equal(quote.price, 6.25);
  assert.equal(quote.previousClose, 6.2);
  assert.ok(Math.abs(quote.changePercent - (0.05 / 6.2) * 100) < 1e-12);
  assert.match(quote.lastTradeAt, /^2026-08-21T17:00:00/);
});

test("retry and timeout policy is bounded", async () => {
  assert.equal(boundedInteger("-10", 2, 0, 5), 0);
  assert.equal(boundedInteger("999", 2, 0, 5), 5);
  assert.equal(boundedInteger("invalid", 2, 0, 5), 2);
  let attempts = 0;
  await assert.rejects(() => withRetry(async () => {
    attempts += 1;
    throw new Error("timeout");
  }, { retries: 2, provider: "test" }), /timeout/);
  assert.equal(attempts, 3);
});

test("purchasing signal thresholds are deterministic reference heuristics", () => {
  const material = materials[0];
  const period = getPeriod("1y");
  const rows = (closes) => closes.map((close, index) => ({ date: `2025-01-${String(index + 1).padStart(2, "0")}`, close, changePercent: index ? (close - closes[index - 1]) / closes[index - 1] : null }));
  assert.equal(buildDecision(material, rows([10, 20, 30, 40]), period, false).signal, "高風險");
  assert.equal(buildDecision(material, rows([100, 300, 250, 255]), period, false).signal, "成本上升");
  assert.equal(buildDecision(material, rows([10, 30, 20, 19.2]), period, false).signal, "成本下降");
  assert.equal(buildDecision(material, rows([10, 20, 15, 14.6]), period, false).signal, "可議價");
  assert.equal(buildDecision(material, rows([70, 100, 80, 80]), period, false).signal, "建議分批採購");
  assert.equal(buildDecision(material, rows([90, 100, 95, 95]), period, false).signal, "穩定");
  assert.match(buildDecision(material, rows([90, 100]), period, true).risk, /資料不足/);
});

test("historical calculations are reproducible and FX alignment is nearest-prior", () => {
  const fx = [{ date: "2025-01-01", close: 32 }, { date: "2025-01-03", close: 33 }];
  assert.equal(nearestFxRate(new Map(fx.map((row) => [row.date, row.close])), "2025-01-02"), 32);
  assert.equal(nearestFxRate(new Map(fx.map((row) => [row.date, row.close])), "2024-12-31"), 32);
  const material = materials.find((item) => item.id === "corn");
  const rows = addPriceCalculations(material, [{ date: "2025-01-01", close: 400 }, { date: "2025-01-02", close: 450 }], fx, "Yahoo", "Yahoo");
  assert.equal(rows[0].twdEstimate, 128);
  assert.equal(rows[1].twdEstimate, 144);
  assert.equal(rows[1].changePercent, 0.125);
  assert.deepEqual(analyzePeriod(rows, (row) => row.date.slice(0, 7))[0], {
    key: "2025-01",
    average: 425,
    high: 450,
    low: 400,
    changePercent: 0.125,
    twdAverage: 136,
  });
});

test("historical period sufficiency follows the documented row/span rule", () => {
  const makeRows = (count) => Array.from({ length: count }, (_, index) => ({ date: new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10), close: 1 }));
  assert.equal(isDataInsufficient(makeRows(29), getPeriod("1y")), true);
  assert.equal(isDataInsufficient(makeRows(365), getPeriod("1y")), false);
  assert.equal(isDataInsufficient(makeRows(365), getPeriod("3y")), true);
});

test("cache policy distinguishes fresh data from stale data and canonicalizes legacy LIVE", () => {
  const good = { rows: Array.from({ length: 10 }, (_, index) => ({ status: "OK", price: index + 1 })) };
  const staleMix = { rows: [{ status: "OK", price: 1 }, { status: "STALE", price: 2 }] };
  assert.equal(hasEnoughFreshRows(good), true);
  assert.equal(hasEnoughFreshRows(staleMix), false);
  assert.equal(hasEnoughUsableRows(staleMix), true);
  const canonical = canonicalizeSnapshot({ state: "LIVE", fx: { status: "LIVE" }, rows: [{ status: "LIVE" }] });
  assert.equal(canonical.state, "OK");
  assert.equal(canonical.fx.status, "OK");
  assert.equal(canonical.rows[0].status, "OK");
  const stale = markSnapshotStale({ state: "OK", fx: { status: "OK" }, rows: [{ status: "OK", price: 1 }], disclaimer: PUBLIC_MARKET_DISCLAIMER }, "來源失敗");
  assert.equal(stale.state, MARKET_STATES.STALE);
  assert.equal(stale.rows[0].status, MARKET_STATES.STALE);
  assert.match(stale.disclaimer, /STALE/);
});

function yahooResponse(symbol, count = 365) {
  const start = Date.UTC(2025, 0, 1) / 1000;
  const timestamps = Array.from({ length: count }, (_, index) => start + index * 86400);
  const base = symbol === "TWD=X" ? 32 : symbol === "HG=F" ? 100 : 20;
  const close = timestamps.map((_, index) => base + index * 0.01);
  return {
    chart: {
      result: [{
        timestamp: timestamps,
        indicators: { quote: [{ close }] },
        meta: { currency: "USD", regularMarketPrice: close.at(-1), regularMarketTime: timestamps.at(-1), previousClose: close.at(-2), exchangeName: "TEST" },
      }],
      error: null,
    },
  };
}

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; }, async text() { return JSON.stringify(payload); } };
}

function textResponse(text, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return JSON.parse(text); }, async text() { return text; } };
}

function mockPublicSuccess() {
  return async (url) => {
    const decoded = decodeURIComponent(url);
    const symbol = decoded.match(/chart\/([^?]+)/)?.[1] || "";
    return jsonResponse(yahooResponse(symbol, decoded.includes("range=1y") ? 365 : 2));
  };
}

function responseRecorder() {
  const chunks = [];
  return {
    statusCode: null,
    headers: null,
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(body) { if (body) chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body))); this.body = Buffer.concat(chunks); },
    body: Buffer.alloc(0),
  };
}

async function request(url) {
  const res = responseRecorder();
  await handleRequest({ method: "GET", url }, res);
  return res;
}

test("/health and validation routes are deterministic and safe", async () => {
  let res = await request("/health");
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).status, "OK");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  res = await request("/api/history?symbol=bad&period=1y");
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /代碼錯誤/);
  res = await request("/api/history?symbol=HG%3DF&period=10y");
  assert.equal(res.statusCode, 400);
  res = await request("/api/export/excel?symbol=%2e%2e%2fsecret&period=1y");
  assert.equal(res.statusCode, 400);
});

test("/api/market returns primary public data with canonical statuses", async () => {
  global.fetch = mockPublicSuccess();
  const res = await request("/api/market");
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.state, "OK");
  assert.equal(payload.rows.length, 14);
  assert.ok(payload.rows.every((row) => row.status === "OK"));
  assert.equal(payload.fx.status, "OK");
  const cornRow = payload.rows.find((row) => row.id === "corn");
  assert.ok(Math.abs(cornRow.twdEstimate - cornRow.price * 0.01 * payload.fx.rate) < 1e-12);
  assert.match(payload.disclaimer, /不等於/);
});

test("/api/market exposes FALLBACK when Yahoo fails but configured public fallbacks work", async () => {
  const csv = "Symbol,Date,Time,Open,High,Low,Close,Volume\nHG.F,2026-08-21,17:00:00,620.00,630.00,615.00,625.00,123";
  global.fetch = async (url) => {
    const decoded = decodeURIComponent(url);
    if (decoded.includes("open.er-api.com")) return jsonResponse({ rates: { TWD: 32 }, time_last_update_utc: "2026-08-21T00:00:00Z" });
    if (decoded.includes("stooq")) return textResponse(csv);
    throw new Error("Yahoo unavailable");
  };
  const res = await request("/api/materials");
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.state, "FALLBACK");
  assert.equal(payload.fx.status, "FALLBACK");
  assert.ok(payload.rows.some((row) => row.status === "FALLBACK"));
  assert.ok(payload.rows.some((row) => row.status === "STALE"));
});

test("/api/market returns truthful STALE from the bundled public seed after total source failure", async () => {
  global.fetch = async () => { throw new Error("network timeout"); };
  const res = await request("/api/market");
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.state, "STALE");
  assert.ok(payload.rows.every((row) => row.status === "STALE"));
  assert.equal(payload.fx.status, "STALE");
  assert.match(payload.disclaimer, /STALE/);
});

test("/api/history and /api/export/excel return reproducible public-data contracts", async () => {
  global.fetch = mockPublicSuccess();
  let res = await request("/api/history?symbol=HG%3DF&period=1y");
  assert.equal(res.statusCode, 200);
  const history = JSON.parse(res.body);
  assert.equal(history.state, "OK");
  assert.equal(history.material.symbol, "HG=F");
  assert.equal(history.rows.length, 365);
  assert.equal(history.rows[0].status, "OK");
  assert.ok(history.monthly.length > 10);
  assert.equal(history.disclaimer, PUBLIC_MARKET_DISCLAIMER);

  res = await request("/api/export/excel?symbol=HG%3DF&period=1y");
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(res.body.subarray(0, 2).toString(), "PK");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.body);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["使用說明", "歷史行情明細", "月均價分析", "年度比較", "市場趨勢參考", "資料狀態"]);
  const guideText = workbook.getWorksheet("使用說明").getColumn("B").values.join(" ");
  assert.match(guideText, /不等於台灣供應商/);

  res = await request("/api/export/all?period=1y");
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.subarray(0, 2).toString(), "PK");
  const allWorkbook = new ExcelJS.Workbook();
  await allWorkbook.xlsx.load(res.body);
  assert.equal(allWorkbook.getWorksheet("歷史行情明細").rowCount > 14, true);
});

test("malformed and timeout history providers become explicit API_ERROR responses", async () => {
  global.fetch = async () => jsonResponse({ chart: { result: [] } });
  let res = await request("/api/history?symbol=HG%3DF&period=1y");
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).state, "API_ERROR");

  global.fetch = async () => { throw new DOMException("The operation timed out", "TimeoutError"); };
  res = await request("/api/history?symbol=HG%3DF&period=1y");
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).state, "API_ERROR");
});
