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
  getStaleCache,
  hasEnoughFreshRows,
  hasEnoughUsableRows,
} = require("../lib/marketData/cacheManager");
const { markSnapshotExpired, markSnapshotStale } = require("../lib/marketData/staleManager");
const { allowSeedFallback, getSnapshotDataAsOf, observationAgeDays } = require("../lib/marketData/freshness");
const { buildSnapshot } = require("../lib/marketData/marketService");
const { handleRequest } = require("../server");
const { snapshotToRecords } = require("../lib/weekly/dailySnapshotService");
const { readStore, upsertSnapshots, clearWriteQueue } = require("../lib/weekly/snapshotStore");
const { buildWeeklyReport, renderWeeklyHtml, createWeeklyWorkbook, buildCategoryMomentum, getSignalDistribution } = require("../lib/weekly/reportService");
const { buildSignal } = require("../lib/weekly/weeklyAnalytics");
const { backfillPublicHistory, getHistoryConcurrency, runWithConcurrency } = require("../lib/weekly/backfillService");
const { parseArgs, run: runWeeklyCommand, summarizeProductionWeekly, commandExitCode, errorExitCode } = require("../lib/weekly/cli");
const { sendWeeklyEmail, readMailConfig, validateMailConfig, writeLedger, readLedger, createMimeMessage } = require("../lib/weekly/mailService");
const { GRAPH_SENDMAIL_URL, GRAPH_SCOPE, GRAPH_SCOPES, graphTokenUrl, createGraphMessage, refreshGraphAccessToken, graphSend } = require("../lib/weekly/graphMailService");
const { DEVICE_CODE_URL, TOKEN_URL, runDeviceFlow } = require("../scripts/microsoft-oauth-device");
const { getStorageConfig, assertProductionStorage } = require("../lib/weekly/storageConfig");
const { ensureStorageDirectories, getStorageStatus, backupPublicStorage, readJobState, safeError } = require("../lib/weekly/storageService");
const { evaluateWeeklyQuality } = require("../lib/weekly/qualityGate");
const { runProductionBootstrap, runProductionWeekly, readProductionStatus, runDatabaseMigration } = require("../lib/weekly/productionService");
const postgres = require("../lib/weekly/postgresAdapter");
const { DEFAULT_UPSERT_BATCH_SIZE, MAX_UPSERT_BATCH_SIZE } = postgres;

const originalFetch = global.fetch;
const originalSnapshotFile = process.env.MARKET_SNAPSHOT_FILE;
const tempPaths = [];

test.afterEach(async () => {
  global.fetch = originalFetch;
  clearMemoryCache();
  clearWriteQueue();
  if (originalSnapshotFile === undefined) delete process.env.MARKET_SNAPSHOT_FILE;
  else process.env.MARKET_SNAPSHOT_FILE = originalSnapshotFile;
  await fs.rm(cacheDir, { recursive: true, force: true });
  while (tempPaths.length) await fs.rm(tempPaths.pop(), { recursive: true, force: true });
});

async function tempDirectory() {
  const directory = await fs.mkdtemp(path.join("/tmp", "weekly-dashboard-test-"));
  tempPaths.push(directory);
  return directory;
}

function weeklyFixtureRecords() {
  return [
    { materialId: "copper", materialName: "銅", symbol: "HG=F", category: "工業金屬", exchange: "COMEX", date: "2026-07-19", marketPrice: 100, sourceUnit: "USD/lb", currency: "USD", usdTwdRate: 32, twdReferenceValue: 3200, source: "fixture", status: "LIVE", collectedAt: "2026-07-19T12:00:00Z", lastTradeTimestamp: "2026-07-19T12:00:00Z" },
    { materialId: "copper", materialName: "銅", symbol: "HG=F", category: "工業金屬", exchange: "COMEX", date: "2026-08-03", marketPrice: 100, sourceUnit: "USD/lb", currency: "USD", usdTwdRate: 32, twdReferenceValue: 3200, source: "fixture", status: "LIVE", collectedAt: "2026-08-03T12:00:00Z", lastTradeTimestamp: "2026-08-03T12:00:00Z" },
    { materialId: "copper", materialName: "銅", symbol: "HG=F", category: "工業金屬", exchange: "COMEX", date: "2026-08-10", marketPrice: 110, sourceUnit: "USD/lb", currency: "USD", usdTwdRate: 32, twdReferenceValue: 3520, source: "fixture", status: "LIVE", collectedAt: "2026-08-10T12:00:00Z", lastTradeTimestamp: "2026-08-10T12:00:00Z" },
    { materialId: "copper", materialName: "銅", symbol: "HG=F", category: "工業金屬", exchange: "COMEX", date: "2026-08-16", marketPrice: 120, sourceUnit: "USD/lb", currency: "USD", usdTwdRate: 32, twdReferenceValue: 3840, source: "fixture", status: "LIVE", collectedAt: "2026-08-16T12:00:00Z", lastTradeTimestamp: "2026-08-16T12:00:00Z" },
    { materialId: "__fx_usd_twd__", materialName: "USD/TWD", symbol: "TWD=X", category: "匯率", exchange: "PUBLIC FX", date: "2026-08-03", marketPrice: 32, sourceUnit: "TWD/USD", currency: "TWD", usdTwdRate: 32, twdReferenceValue: 32, source: "fixture", status: "LIVE", collectedAt: "2026-08-03T12:00:00Z", lastTradeTimestamp: "2026-08-03T12:00:00Z" },
    { materialId: "__fx_usd_twd__", materialName: "USD/TWD", symbol: "TWD=X", category: "匯率", exchange: "PUBLIC FX", date: "2026-08-16", marketPrice: 32.2, sourceUnit: "TWD/USD", currency: "TWD", usdTwdRate: 32.2, twdReferenceValue: 32.2, source: "fixture", status: "LIVE", collectedAt: "2026-08-16T12:00:00Z", lastTradeTimestamp: "2026-08-16T12:00:00Z" },
  ];
}

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
  const stale = markSnapshotStale({ state: "OK", generatedAt: "2026-08-22T00:00:00.000Z", dataAsOf: "2026-08-22T00:00:00.000Z", fx: { status: "OK", lastTradeAt: "2026-08-22T00:00:00.000Z" }, rows: [{ status: "OK", price: 1, lastTradeAt: "2026-08-22T00:00:00.000Z" }], disclaimer: PUBLIC_MARKET_DISCLAIMER }, "來源失敗", new Date("2026-08-24T00:00:00.000Z"), { MARKET_STALE_MAX_AGE_DAYS: "7" });
  assert.equal(stale.state, MARKET_STATES.STALE);
  assert.equal(stale.rows[0].status, MARKET_STATES.STALE);
  assert.equal(stale.generatedAt, "2026-08-22T00:00:00.000Z");
  assert.equal(stale.servedAt, "2026-08-24T00:00:00.000Z");
  assert.equal(stale.dataAsOf, "2026-08-22T00:00:00.000Z");
  assert.match(stale.disclaimer, /STALE/);
});

function yahooResponse(symbol, count = 365, startOverride) {
  const start = startOverride ?? Date.UTC(2025, 0, 1) / 1000;
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
  const recentStart = Math.floor((Date.now() - 86400000) / 1000);
  return async (url) => {
    const decoded = decodeURIComponent(url);
    const symbol = decoded.match(/chart\/([^?]+)/)?.[1] || "";
    const isHistory = decoded.includes("range=1y");
    return jsonResponse(yahooResponse(symbol, isHistory ? 365 : 2, isHistory ? undefined : recentStart));
  };
}

function mockPublicWithOldCopper() {
  const recentStart = Math.floor((Date.now() - 86400000) / 1000);
  const oldStart = Math.floor((Date.now() - 30 * 86400000) / 1000);
  return async (url) => {
    const decoded = decodeURIComponent(url);
    const symbol = decoded.match(/chart\/([^?]+)/)?.[1] || "";
    const isHistory = decoded.includes("range=1y");
    const start = isHistory ? undefined : symbol === "HG=F" ? oldStart : recentStart;
    return jsonResponse(yahooResponse(symbol, isHistory ? 365 : 2, start));
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

test("/api/market cannot present an old direct observation as OK", async () => {
  global.fetch = mockPublicWithOldCopper();
  const res = await request("/api/market");
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  const copper = payload.rows.find((row) => row.id === "copper");
  assert.equal(copper.status, MARKET_STATES.EXPIRED);
  assert.equal(copper.sourceReliability, "EXPIRED");
  assert.match(copper.error, /exceeded freshness policy/i);
  assert.equal(payload.rows.find((row) => row.id === "aluminum").status, MARKET_STATES.OK);
  assert.ok(payload.summary.expiredRows >= 1);
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
  assert.ok(payload.rows.some((row) => row.status === "EXPIRED"));
});

test("/api/market never presents the May bundled public seed as current STALE data after total source failure", async () => {
  global.fetch = async () => { throw new Error("network timeout"); };
  const res = await request("/api/market");
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.state, "EXPIRED");
  assert.ok(payload.rows.every((row) => row.status === "EXPIRED"));
  assert.equal(payload.fx.status, "EXPIRED");
  assert.match(payload.disclaimer, /EXPIRED|超出允許/);
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

test("daily snapshots persist provenance and canonical public statuses", async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, "snapshots.json");
  const snapshot = {
    generatedAt: "2026-08-17T01:00:00.000Z",
    state: "OK",
    fx: { rate: 32, status: "OK", source: "fixture FX", lastTradeAt: "2026-08-16T12:00:00Z" },
    rows: [{ id: "copper", name: "銅", symbol: "HG=F", category: "工業金屬", exchange: "COMEX", price: 6.25, unit: "USD/lb", currency: "USD", twdEstimate: 200, source: "fixture", status: "OK", lastTradeAt: "2026-08-15T12:00:00Z" }, { id: "aluminum", name: "鋁", symbol: "ALI=F", category: "工業金屬", exchange: "COMEX", price: null, unit: "USD/metric ton", currency: "USD", twdEstimate: null, source: "fixture", status: "API_ERROR", error: "timeout" }],
  };
  const records = snapshotToRecords(snapshot, "2026-08-17T01:00:00.000Z");
  assert.equal(records.length, 3);
  assert.equal(records[0].date, "2026-08-16");
  assert.equal(records[1].status, "LIVE");
  assert.equal(records[1].observationDate, "2026-08-15");
  assert.equal(records[1].collectedAt, "2026-08-17T01:00:00.000Z");
  assert.equal(records[2].status, "API_ERROR");
  await upsertSnapshots(records, { filePath });
  const stored = await readStore(filePath);
  assert.equal(stored.records.length, 3);
  assert.equal(stored.records.find((record) => record.materialId === "copper").provenance.provider, "fixture");
});

test("snapshot identity prevents same-day downgrade and preserves missing days", async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, "snapshots.json");
  const base = { materialId: "copper", materialName: "銅", symbol: "HG=F", category: "工業金屬", exchange: "COMEX", date: "2026-08-17", marketPrice: 6.25, sourceUnit: "USD/lb", currency: "USD", source: "fixture", collectedAt: "2026-08-17T01:00:00Z" };
  const first = await upsertSnapshots({ ...base, status: "LIVE" }, { filePath });
  const second = await upsertSnapshots({ ...base, status: "STALE", collectedAt: "2026-08-17T02:00:00Z" }, { filePath });
  assert.equal(first.inserted, 1);
  assert.equal(second.ignored, 1);
  const stored = await readStore(filePath);
  assert.equal(stored.records.length, 1);
  assert.equal(stored.records[0].status, "LIVE");
  assert.equal(stored.records.some((record) => record.date === "2026-08-18"), false);
});

test("weekly analytics expose deterministic comparisons, volatility, and explainable signals", () => {
  const report = buildWeeklyReport({ records: weeklyFixtureRecords(), reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  assert.equal(report.reportingPeriod.start, "2026-08-10");
  assert.equal(report.reportingPeriod.end, "2026-08-16");
  const copper = report.indicators.find((item) => item.materialId === "copper");
  assert.equal(copper.weeklyChangePct, 20);
  assert.equal(copper.fourWeekChangePct, 20);
  assert.equal(copper.signal, "HIGH_VOLATILITY");
  assert.ok(copper.reasonCodes.includes("ROLLING_VOLATILITY_AT_OR_ABOVE_3PCT"));
  assert.equal(copper.latestObservation.status, "LIVE");
  assert.equal(report.historyRows.some((row) => row.date === "2026-08-04"), false);
  assert.equal(report.fx.latestObservation.status, "LIVE");
});

test("weekly quality states stay distinct and threshold boundaries are deterministic", () => {
  const records = weeklyFixtureRecords().concat([
    { materialId: "aluminum", materialName: "鋁", symbol: "ALI=F", category: "工業金屬", exchange: "COMEX", date: "2026-08-16", marketPrice: 200, sourceUnit: "USD/metric ton", currency: "USD", source: "fixture", status: "STALE", collectedAt: "2026-08-16T12:00:00Z" },
    { materialId: "steel-hrc", materialName: "熱軋鋼捲", symbol: "HRC=F", category: "鋼鐵", exchange: "CME", date: "2026-08-16", marketPrice: null, sourceUnit: "USD/short ton", currency: "USD", source: "fixture", status: "NO_DATA", collectedAt: "2026-08-16T12:00:00Z" },
    { materialId: "iron-ore", materialName: "鐵礦砂", symbol: "TIO=F", category: "鋼鐵", exchange: "SGX", date: "2026-08-16", marketPrice: null, sourceUnit: "USD/metric ton", currency: "USD", source: "fixture", status: "API_ERROR", collectedAt: "2026-08-16T12:00:00Z", error: "timeout" },
  ]);
  const report = buildWeeklyReport({ records, reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  assert.equal(report.indicators.find((item) => item.materialId === "aluminum").signal, "DATA_QUALITY_WARNING");
  assert.equal(report.indicators.find((item) => item.materialId === "steel-hrc").signal, "DATA_INSUFFICIENT");
  assert.equal(report.indicators.find((item) => item.materialId === "iron-ore").signal, "DATA_QUALITY_WARNING");
  const current = { latestObservation: { status: "LIVE" }, latestValidObservation: { marketPrice: 100 }, weeklyChangePct: 2, fourWeekChangePct: 0, rollingVolatilityPct: 1 };
  assert.equal(buildSignal(current).signal, "COST_PRESSURE_RISING");
  assert.equal(buildSignal({ ...current, weeklyChangePct: -2 }).signal, "MARKET_WEAKENING");
  assert.equal(buildSignal({ ...current, weeklyChangePct: 1.99 }).signal, "STABLE");
  assert.equal(buildSignal({ ...current, weeklyChangePct: 0, rollingVolatilityPct: 3 }).signal, "HIGH_VOLATILITY");
});

test("weekly report HTML and XLSX use the approved procurement-management presentation layer", async () => {
  const report = buildWeeklyReport({ records: weeklyFixtureRecords(), reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  const html = renderWeeklyHtml(report);
  assert.match(html, /採購市場情報週報｜2026-W33/);
  assert.match(html, /WEEKLY MARKET INTELLIGENCE/);
  assert.match(html, /Weekly change overview/);
  assert.match(html, /Procurement review priorities/);
  assert.match(html, /Category momentum/);
  assert.match(html, /Market signal distribution/);
  assert.match(html, /Market detail/);
  assert.match(html, /Energy｜能源/);
  assert.match(html, /Metals｜金屬/);
  assert.match(html, /Agriculture｜農產品/);
  assert.match(html, /Precious metals｜貴金屬/);
  assert.match(html, /公開市場參考資訊/);
  assert.match(html, /非採購指示/);
  assert.ok(html.indexOf("class=\"disclaimer\"") > html.indexOf("class=\"table-wrap\""));
  assert.equal(report.indicators.find((item) => item.materialId === "copper").weeklyChangePct, 20);
  assert.equal(report.qualityGate.state, "SEND_BLOCKED");
  assert.equal(buildCategoryMomentum(report).find((item) => item.key === "Metals").indicatorCount, 1);
  assert.equal(getSignalDistribution(report).reduce((sum, item) => sum + item.count, 0), report.indicators.length);

  const workbook = createWeeklyWorkbook(report);
  const buffer = await workbook.xlsx.writeBuffer();
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["本週摘要", "市場明細", "歷史資料", "資料來源與說明"]);
  const summary = workbook.getWorksheet("本週摘要");
  assert.equal(summary.getCell("A1").value, "採購市場情報週報｜2026-W33");
  assert.equal(summary.views[0].state, "frozen");
  assert.equal(summary.views[0].ySplit, 11);
  assert.equal(summary.autoFilter.from, "A11");
  assert.ok(summary.conditionalFormattings?.length >= 1);
  const detail = workbook.getWorksheet("市場明細");
  assert.ok(detail.rowCount >= 15);
  assert.equal(detail.views[0].xSplit, 2);
  assert.equal(detail.views[0].ySplit, 4);
  assert.equal(detail.autoFilter.from, "A4");
  assert.equal(detail.getColumn(11).hidden, true);
  assert.equal(detail.getCell(5, 5).numFmt, "0.00%;[Red]-0.00%");
  assert.ok(detail.conditionalFormattings?.length >= 2);
});

test("weekly backfill is public-only, idempotent, and leaves missing dates absent", async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, "snapshots.json");
  const material = materials.find((item) => item.id === "copper");
  const fetchHistory = async () => ({ sourceType: "primary", source: "fixture history", rows: [{ date: "2026-08-03", close: 100 }, { date: "2026-08-05", close: 105 }] });
  const options = { period: "1y", filePath, materials: [material], fxRows: [{ date: "2026-08-03", close: 32 }, { date: "2026-08-05", close: 32.1 }], fetchHistory, collectedAt: "2026-08-17T01:00:00Z" };
  const first = await backfillPublicHistory(options);
  const second = await backfillPublicHistory(options);
  assert.equal(first.failureCount, 0);
  assert.equal(first.results[0].rows, 2);
  assert.equal(second.inserted, 0);
  const stored = await readStore(filePath);
  assert.equal(stored.records.filter((record) => record.materialId === "copper").length, 2);
  assert.equal(stored.records.some((record) => record.date === "2026-08-04"), false);
});

test("mail dry-run validates configuration without connecting and fails closed when missing", async () => {
  const report = buildWeeklyReport({ records: weeklyFixtureRecords(), reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  const validEnv = { MAIL_ENABLED: "1", MAIL_HOST: "smtp.example.com", MAIL_PORT: "587", MAIL_SECURE: "0", MAIL_USER: "fixture-user", MAIL_PASSWORD: "fixture-password", MAIL_FROM: "sender@example.com", MAIL_TO: "buyer@example.com" };
  const dry = await sendWeeklyEmail({ report, html: "<p>fixture</p>", xlsxBuffer: Buffer.from("xlsx"), dryRun: true, env: validEnv, ledgerPath: path.join(await tempDirectory(), "ledger.json") });
  assert.equal(dry.state, "DRY_RUN");
  assert.equal(dry.configValid, true);
  assert.equal(dry.sent, false);
  const failed = await sendWeeklyEmail({ report, html: "<p>fixture</p>", xlsxBuffer: Buffer.from("xlsx"), dryRun: false, env: { MAIL_ENABLED: "1" }, ledgerPath: path.join(await tempDirectory(), "ledger.json") });
  assert.equal(failed.state, "FAILED");
  assert.equal(failed.configValid, false);
});

test("mail delivery ledger prevents duplicate weekly sends and CLI arguments stay scheduler-safe", async () => {
  const directory = await tempDirectory();
  const ledgerPath = path.join(directory, "ledger.json");
  await writeLedger({ weeks: { "2026-W33": { state: "SENT", sentAt: "2026-08-17T01:00:00Z" } } }, ledgerPath);
  const report = buildWeeklyReport({ records: weeklyFixtureRecords(), reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  const duplicate = await sendWeeklyEmail({ report, html: "<p>fixture</p>", xlsxBuffer: Buffer.from("xlsx"), env: { MAIL_ENABLED: "1", MAIL_HOST: "smtp.example.com", MAIL_PORT: "587", MAIL_USER: "u", MAIL_PASSWORD: "p", MAIL_FROM: "sender@example.com", MAIL_TO: "buyer@example.com" }, ledgerPath });
  assert.equal(duplicate.state, "DUPLICATE_PREVENTED");
  assert.deepEqual(parseArgs(["--period", "3y", "--dry-run", "--out-dir", "/tmp/reports"]), { period: "3y", dryRun: true, out_dir: "/tmp/reports" });
  assert.equal(readMailConfig({ MAIL_PORT: "bad" }).port, null);
  assert.equal(validateMailConfig(readMailConfig({})).valid, false);
});

test("weekly API routes validate the reporting week and return report preview and workbook without sending mail", async () => {
  let res = await request("/api/weekly/report?week=bad");
  assert.equal(res.statusCode, 400);
  res = await request("/weekly/export.xlsx?week=2026-W00");
  assert.equal(res.statusCode, 400);
  const directory = await tempDirectory();
  const filePath = path.join(directory, "snapshots.json");
  process.env.MARKET_SNAPSHOT_FILE = filePath;
  await upsertSnapshots(weeklyFixtureRecords(), { filePath });
  res = await request("/api/weekly/report?week=2026-W33");
  assert.equal(res.statusCode, 200);
  const report = JSON.parse(res.body);
  assert.equal(report.reportingWeek, "2026-W33");
  assert.equal(report.indicators.find((item) => item.materialId === "copper").signal, "HIGH_VOLATILITY");
  res = await request("/weekly/preview?week=2026-W33");
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /text\/html/);
  assert.match(res.body.toString(), /公開市場參考資訊/);
  res = await request("/weekly/export.xlsx?week=2026-W33");
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.subarray(0, 2).toString(), "PK");
});

test("weekly command generates preview and report artifacts without email", async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, "snapshots.json");
  const outputDir = path.join(directory, "reports");
  await upsertSnapshots(weeklyFixtureRecords(), { filePath });
  const previewPath = path.join(directory, "preview.html");
  const preview = await runWeeklyCommand("weekly:preview", ["--week", "2026-W33", "--file", filePath, "--out", previewPath]);
  assert.equal(preview.reportingWeek, "2026-W33");
  assert.match(await fs.readFile(previewPath, "utf8"), /採購市場情報週報/);
  const generated = await runWeeklyCommand("weekly:report", ["--week", "2026-W33", "--file", filePath, "--out-dir", outputDir]);
  assert.equal(generated.reportingWeek, "2026-W33");
  assert.equal((await fs.stat(generated.artifacts.xlsxPath)).isFile(), true);
});

function fullProductionFixtureRecords() {
  const materialRecords = materials.flatMap((material, index) => [
    { materialId: material.id, materialName: material.name, symbol: material.symbol, category: material.category, exchange: material.exchange, date: "2026-08-10", marketPrice: 100 + index, sourceUnit: material.unit, currency: material.currency, usdTwdRate: 32, twdReferenceValue: (100 + index) * 32, source: "fixture public history", status: "LIVE", collectedAt: "2026-08-17T01:00:00Z", lastTradeTimestamp: "2026-08-10T12:00:00Z" },
    { materialId: material.id, materialName: material.name, symbol: material.symbol, category: material.category, exchange: material.exchange, date: "2026-08-16", marketPrice: 101 + index, sourceUnit: material.unit, currency: material.currency, usdTwdRate: 32, twdReferenceValue: (101 + index) * 32, source: "fixture public history", status: "LIVE", collectedAt: "2026-08-17T01:00:00Z", lastTradeTimestamp: "2026-08-16T12:00:00Z" },
  ]);
  return materialRecords.concat([
    { materialId: "__fx_usd_twd__", materialName: "USD/TWD", symbol: "TWD=X", category: "匯率", exchange: "PUBLIC FX", date: "2026-08-10", marketPrice: 32, sourceUnit: "TWD/USD", currency: "TWD", usdTwdRate: 32, twdReferenceValue: 32, source: "fixture FX", status: "LIVE", collectedAt: "2026-08-17T01:00:00Z", lastTradeTimestamp: "2026-08-10T12:00:00Z" },
    { materialId: "__fx_usd_twd__", materialName: "USD/TWD", symbol: "TWD=X", category: "匯率", exchange: "PUBLIC FX", date: "2026-08-16", marketPrice: 32.1, sourceUnit: "TWD/USD", currency: "TWD", usdTwdRate: 32.1, twdReferenceValue: 32.1, source: "fixture FX", status: "LIVE", collectedAt: "2026-08-17T01:00:00Z", lastTradeTimestamp: "2026-08-16T12:00:00Z" },
  ]);
}

test("production storage requires durable configuration and supports atomic public backup", async () => {
  const missing = await getStorageStatus({ NODE_ENV: "production" }, { forceProduction: true });
  assert.equal(missing.state, "STORAGE_CONFIGURATION_REQUIRED");
  assert.equal(commandExitCode({ storage: missing }), 2);
  assert.equal(errorExitCode({ code: "STORAGE_CONFIGURATION_REQUIRED", statusCode: 503 }), 2);
  await assert.rejects(() => ensureStorageDirectories({ NODE_ENV: "production" }, { forceProduction: true }), (error) => error.code === "STORAGE_CONFIGURATION_REQUIRED");
  const directory = await tempDirectory();
  const env = { NODE_ENV: "production", PRODUCTION_STORAGE_ROOT: directory };
  const config = getStorageConfig(env, { forceProduction: true });
  await ensureStorageDirectories(env, { config });
  await upsertSnapshots(weeklyFixtureRecords(), { filePath: config.snapshotFile, env });
  await writeLedger({ weeks: { "2026-W33": { state: "DRY_RUN" } } }, config.deliveryLedgerFile);
  await fs.writeFile(config.reportMetadataFile, JSON.stringify({ version: 1, reports: [] }));
  const ready = await getStorageStatus(env, { config });
  assert.equal(ready.state, "DURABLE_CONFIGURED");
  assert.equal(ready.ready, true);
  const backup = await backupPublicStorage({ env, config, backupId: "fixture" });
  assert.equal(backup.files.snapshots.endsWith("snapshots.json"), true);
  assert.equal((await fs.stat(backup.manifest)).isFile(), true);
});

test("production quality gate blocks materially unusable reports and production weekly records state", async () => {
  const emptyReport = buildWeeklyReport({ records: [], reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  const gate = evaluateWeeklyQuality(emptyReport);
  assert.equal(gate.state, "SEND_BLOCKED");
  assert.equal(gate.readyForDelivery, false);
  const directory = await tempDirectory();
  const env = { NODE_ENV: "production", PRODUCTION_STORAGE_ROOT: directory };
  const config = getStorageConfig(env, { forceProduction: true });
  const result = await runProductionWeekly({ env, storageConfig: config, reportingWeek: "2026-W33", records: [], send: true, dryRun: true });
  assert.equal(result.state, "SEND_BLOCKED");
  assert.equal(result.mail.state, "SEND_BLOCKED");
  const jobs = await readJobState(config.jobStateFile);
  assert.equal(jobs.jobs.weeklyReport.state, "SEND_BLOCKED");
});

test("production bootstrap is idempotent-safe and generates a first public report without sending mail", async () => {
  const directory = await tempDirectory();
  const env = { NODE_ENV: "production", PRODUCTION_STORAGE_ROOT: directory };
  const config = getStorageConfig(env, { forceProduction: true });
  let calls = 0;
  const backfill = async ({ filePath }) => {
    calls += 1;
    const writeResult = await upsertSnapshots(fullProductionFixtureRecords(), { filePath, env });
    return { period: "1y", recordCount: fullProductionFixtureRecords().length, inserted: writeResult.inserted, replaced: writeResult.replaced, ignored: writeResult.ignored, failureCount: 0, results: [] };
  };
  const result = await runProductionBootstrap({ env, storageConfig: config, period: "1y", backfill });
  assert.equal(calls, 1);
  assert.equal(result.state, "BOOTSTRAP_COMPLETE");
  assert.equal(result.weekly.mail.state, "NOT_REQUESTED");
  assert.equal(result.persistedRecordCount, 30);
});

test("mail test mode overrides production recipients and dry-run remains non-sending", async () => {
  const config = readMailConfig({ MAIL_TEST_MODE: "1", MAIL_TEST_TO: " qa@example.com;QA@example.com ", MAIL_TO: "production@example.com", MAIL_CC: "cc@example.com cc@example.com", MAIL_REPLY_TO: "reply@example.com" });
  assert.deepEqual(config.to, ["qa@example.com"]);
  assert.deepEqual(config.envelopeRecipients, ["qa@example.com"]);
  assert.equal(config.configuredTo[0], "production@example.com");
  assert.equal(config.cc.length, 0);
  assert.equal(config.replyTo, "");
  const report = buildWeeklyReport({ records: fullProductionFixtureRecords(), reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  const directory = await tempDirectory();
  const dry = await sendWeeklyEmail({ report, html: "<p>fixture</p>", xlsxBuffer: Buffer.from("xlsx"), dryRun: true, env: { MAIL_ENABLED: "1", MAIL_HOST: "smtp.example.com", MAIL_PORT: "587", MAIL_USER: "fixture-user", MAIL_PASSWORD: "fixture-password", MAIL_FROM: "sender@example.com", MAIL_TO: "production@example.com", MAIL_TEST_MODE: "1", MAIL_TEST_TO: "qa@example.com" }, ledgerPath: path.join(directory, "ledger.json") });
  assert.equal(dry.state, "DRY_RUN");
  assert.equal(dry.testMode, true);
  assert.equal(dry.sent, false);
  const mime = createMimeMessage({ from: "sender@example.com", to: config.to, cc: config.cc, replyTo: config.replyTo, subject: "fixture", html: "<p>fixture</p>", attachments: [] });
  assert.match(mime, /qa@example.com/);
  assert.doesNotMatch(mime, /production@example.com/);
  assert.doesNotMatch(mime, /cc@example.com/);
});

test("SMTP failure modes are bounded, redacted, and do not retry uncertain acceptance", async () => {
  const report = buildWeeklyReport({ records: fullProductionFixtureRecords(), reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  const env = { MAIL_ENABLED: "1", MAIL_HOST: "smtp.fixture", MAIL_PORT: "587", MAIL_USER: "fixture-user", MAIL_PASSWORD: "fixture-password", MAIL_FROM: "sender@example.com", MAIL_TO: "qa@example.com" };
  const base = { report, html: "<p>fixture</p>", xlsxBuffer: Buffer.from("xlsx"), env };
  let calls = 0;
  const authLedger = path.join(await tempDirectory(), "auth-ledger.json");
  const auth = Object.assign(new Error("SMTP authentication failed password=fixture-password"), { smtpCode: 535 });
  const authResult = await sendWeeklyEmail({ ...base, ledgerPath: authLedger, smtpSender: async () => { calls += 1; throw auth; } });
  assert.equal(authResult.state, "FAILED");
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(await readLedger(authLedger)), /fixture-password/);

  calls = 0;
  const timeoutLedger = path.join(await tempDirectory(), "timeout-ledger.json");
  const timeout = Object.assign(new Error("SMTP pre-DATA timeout"), { code: "ETIMEDOUT" });
  const timeoutResult = await sendWeeklyEmail({ ...base, ledgerPath: timeoutLedger, smtpSender: async () => { calls += 1; throw timeout; } });
  assert.equal(timeoutResult.state, "FAILED");
  assert.equal(calls, 3);

  calls = 0;
  const uncertainLedger = path.join(await tempDirectory(), "uncertain-ledger.json");
  const uncertain = Object.assign(new Error("SMTP connection reset after DATA"), { code: "ECONNRESET", maybeAccepted: true });
  const uncertainResult = await sendWeeklyEmail({ ...base, ledgerPath: uncertainLedger, smtpSender: async () => { calls += 1; throw uncertain; } });
  assert.equal(uncertainResult.state, "FAILED");
  assert.equal(calls, 1);

  const attachmentLedger = path.join(await tempDirectory(), "attachment-ledger.json");
  const attachmentResult = await sendWeeklyEmail({ ...base, xlsxBuffer: Buffer.alloc(0), ledgerPath: attachmentLedger, smtpSender: async () => { throw new Error("must not connect"); } });
  assert.equal(attachmentResult.state, "FAILED");
  assert.equal((await readLedger(attachmentLedger)).weeks["2026-W33"].state, "FAILED");
});

test("weekly health exposes storage state without filesystem paths or secrets", async () => {
  const res = await request("/health/weekly");
  assert.equal(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.equal(body.status, "STORAGE_CONFIGURATION_REQUIRED");
  assert.match(body.warnings.join(" "), /STORAGE_CONFIGURATION_REQUIRED/);
  assert.equal(body.readiness.web, "WEB_READY");
  assert.equal(body.readiness.database, "DATABASE_NOT_USED");
  assert.equal(body.readiness.mailConfiguration, "MAIL_CONFIGURATION_REQUIRED");
  assert.equal(JSON.stringify(body).includes("/home/ubuntu"), false);
  assert.equal(JSON.stringify(body).includes("MAIL_PASSWORD"), false);
});

class FakePostgresPool {
  constructor() {
    this.snapshots = new Map();
    this.delivery = new Map();
    this.metadata = new Map();
    this.jobs = new Map();
    this.queries = [];
    this.failOn = null;
    this.transactionBackup = null;
    this.schemaReady = false;
    this.insertQueryCount = 0;
    this.failOnInsertNumber = null;
  }

  async connect() {
    return { query: (sql, params) => this.query(sql, params), release: () => {} };
  }

  async end() {}

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    this.queries.push(normalized);
    if (this.failOn && this.failOn.test(normalized)) throw new Error("synthetic database failure password=never-log");
    if (normalized === "BEGIN") {
      this.transactionBackup = {
        snapshots: new Map(this.snapshots),
        delivery: new Map(this.delivery),
        metadata: new Map(this.metadata),
        jobs: new Map(this.jobs),
      };
      return { rows: [] };
    }
    if (normalized === "COMMIT") { this.transactionBackup = null; return { rows: [] }; }
    if (normalized === "ROLLBACK") {
      if (this.transactionBackup) {
        this.snapshots = this.transactionBackup.snapshots;
        this.delivery = this.transactionBackup.delivery;
        this.metadata = this.transactionBackup.metadata;
        this.jobs = this.transactionBackup.jobs;
      }
      this.transactionBackup = null;
      return { rows: [] };
    }
    if (normalized.startsWith("CREATE TABLE")) { this.schemaReady = true; return { rows: [] }; }
    if (normalized.startsWith("CREATE INDEX")) return { rows: [] };
    if (normalized.startsWith("SELECT to_regclass")) {
      const value = this.schemaReady ? "present" : null;
      return { rows: [{ market_snapshots: value, weekly_delivery_ledger: value, weekly_report_metadata: value, weekly_job_state: value }] };
    }
    if (normalized === "SELECT 1 AS ok") return { rows: [{ ok: 1 }] };
    if (normalized.startsWith("SELECT payload FROM market_snapshots WHERE material_id")) {
      const item = this.snapshots.get(`${params[0]}|${params[1]}`);
      return { rows: item ? [{ payload: item }] : [] };
    }
    if (normalized.startsWith("SELECT payload FROM market_snapshots")) return { rows: [...this.snapshots.values()].map((payload) => ({ payload })) };
    if (normalized.startsWith("SELECT reporting_week, payload FROM weekly_delivery_ledger")) return { rows: [...this.delivery.entries()].sort().map(([reporting_week, payload]) => ({ reporting_week, payload })) };
    if (normalized.startsWith("SELECT reporting_week, payload FROM weekly_report_metadata")) return { rows: [...this.metadata.entries()].sort().map(([reporting_week, payload]) => ({ reporting_week, payload })) };
    if (normalized.startsWith("SELECT job_name, payload FROM weekly_job_state")) return { rows: [...this.jobs.entries()].sort().map(([job_name, payload]) => ({ job_name, payload })) };
    if (normalized.startsWith("INSERT INTO market_snapshots")) {
      this.insertQueryCount += 1;
      if (this.failOnInsertNumber && this.insertQueryCount === this.failOnInsertNumber) throw new Error("synthetic batch failure");
      const rows = [];
      for (let offset = 0; offset < params.length; offset += 5) {
        const key = `${params[offset]}|${params[offset + 1]}`;
        const incoming = JSON.parse(params[offset + 2]);
        const existing = this.snapshots.get(key);
        const rank = { LIVE: 4, FALLBACK: 3, STALE: 2, API_ERROR: 1, NO_DATA: 0 };
        const shouldWrite = !existing
          || (rank[incoming.status] ?? -1) > (rank[existing.status] ?? -1)
          || ((rank[incoming.status] ?? -1) === (rank[existing.status] ?? -1) && String(incoming.collectedAt || "") >= String(existing.collectedAt || ""));
        if (!shouldWrite) continue;
        this.snapshots.set(key, incoming);
        rows.push({ inserted: !existing });
      }
      return { rows };
    }
    if (normalized.startsWith("INSERT INTO weekly_delivery_ledger")) { this.delivery.set(params[0], JSON.parse(params[1])); return { rows: [] }; }
    if (normalized.startsWith("INSERT INTO weekly_report_metadata")) { this.metadata.set(params[0], JSON.parse(params[1])); return { rows: [] }; }
    if (normalized.startsWith("INSERT INTO weekly_job_state")) { this.jobs.set(params[0], JSON.parse(params[1])); return { rows: [] }; }
    throw new Error(`unsupported synthetic query: ${normalized}`);
  }
}

test("Postgres adapter is migration-idempotent and parity-compatible with filesystem analytics", async () => {
  const env = { STORAGE_PROVIDER: "postgres", DATABASE_URL: "postgres://fixture.invalid/market", DATABASE_SSL: "true" };
  const pool = new FakePostgresPool();
  const first = await postgres.migratePostgres({ env, pool });
  const second = await postgres.migratePostgres({ env, pool });
  assert.equal(first.state, "DATABASE_MIGRATED");
  assert.equal(second.statementCount, first.statementCount);
  const fixture = weeklyFixtureRecords();
  const pgWrite = await upsertSnapshots(fixture, { env, storageConfig: getStorageConfig(env), pool });
  assert.equal(pgWrite.inserted, fixture.length);
  const stale = { ...fixture.find((record) => record.materialId === "copper" && record.date === "2026-08-10"), status: "STALE", collectedAt: "2026-08-12T12:00:00Z" };
  const ignored = await upsertSnapshots([stale], { env, storageConfig: getStorageConfig(env), pool });
  assert.equal(ignored.ignored, 1);
  const pgRecords = await postgres.listSnapshots({ env, pool });
  assert.equal(pgRecords.find((record) => record.materialId === "copper" && record.date === "2026-08-10").status, "LIVE");

  const directory = await tempDirectory();
  const filePath = path.join(directory, "snapshots.json");
  await upsertSnapshots(fixture, { filePath, env: { STORAGE_PROVIDER: "filesystem" } });
  const pgReport = buildWeeklyReport({ records: pgRecords, reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  const fsReport = buildWeeklyReport({ records: (await readStore(filePath)).records, reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  assert.deepEqual(pgReport.indicators, fsReport.indicators);
  assert.deepEqual(pgReport.qualitySummary, fsReport.qualitySummary);
});

test("Postgres adapter persists public ledger, metadata, job state and rolls back partial failure", async () => {
  const env = { STORAGE_PROVIDER: "postgres", DATABASE_URL: "postgres://fixture.invalid/market" };
  const pool = new FakePostgresPool();
  await postgres.writeDeliveryLedger({ weeks: { "2026-W33": { state: "DRY_RUN", sent: false } } }, { env, pool });
  assert.equal((await postgres.readDeliveryLedger({ env, pool })).weeks["2026-W33"].state, "DRY_RUN");
  await postgres.writeReportMetadata({ reportingWeek: "2026-W33", qualitySummary: { usable: 1 } }, { env, pool });
  assert.equal((await postgres.readReportMetadata({ env, pool })).reports[0].reportingWeek, "2026-W33");
  await postgres.writeJobState("weeklyReport", { state: "SEND_WITH_WARNINGS" }, { env, pool });
  assert.equal((await postgres.readJobState({ env, pool })).jobs.weeklyReport.state, "SEND_WITH_WARNINGS");

  const failing = new FakePostgresPool();
  failing.failOn = /INSERT INTO weekly_delivery_ledger/;
  await assert.rejects(() => postgres.writeDeliveryLedger({ weeks: { "2026-W33": { state: "SENT" } } }, { env, pool: failing }), (error) => error.code === "DATABASE_WRITE_FAILED");
  assert.equal(failing.delivery.size, 0);
  assert.ok(failing.queries.includes("ROLLBACK"));
});

test("Postgres health reports database readiness without exposing credentials", async () => {
  const env = { STORAGE_PROVIDER: "postgres", DATABASE_URL: "postgres://fixture.invalid/market", MAIL_ENABLED: "0" };
  const pool = new FakePostgresPool();
  await postgres.migratePostgres({ env, pool });
  await postgres.writeJobState("dailySnapshot", { state: "SUCCEEDED" }, { env, pool });
  const status = await readProductionStatus({ env, forceProduction: true, pool });
  assert.equal(status.storage.ready, true);
  assert.equal(status.storage.database.state, "DATABASE_READY");
  assert.equal(status.readiness.web, "WEB_READY");
  assert.equal(status.readiness.database, "DATABASE_READY");
  assert.equal(status.readiness.dailyData, "DAILY_DATA_READY");
  assert.equal(status.readiness.mailConfiguration, "MAIL_CONFIGURATION_REQUIRED");
  assert.equal(JSON.stringify(status).includes("fixture.invalid"), false);
  assert.equal(JSON.stringify(status).includes("DATABASE_URL"), false);
});

test("Postgres production configuration fails closed without DATABASE_URL", async () => {
  const config = getStorageConfig({ STORAGE_PROVIDER: "postgres", NODE_ENV: "production" }, { forceProduction: true });
  assert.equal(config.state, "DATABASE_URL_REQUIRED");
  assert.equal(config.durableConfigured, false);
  await assert.rejects(() => runDatabaseMigration({ env: { STORAGE_PROVIDER: "postgres", NODE_ENV: "production" } }), (error) => error.code === "DATABASE_URL_REQUIRED");
  assert.equal(errorExitCode({ code: "DATABASE_URL_REQUIRED", statusCode: 503 }), 2);
});

test("GitHub Actions workflows expose safe daily and weekly runtime contracts", async () => {
  const daily = await fs.readFile(path.join(ROOT, ".github/workflows/market-daily.yml"), "utf8");
  const weekly = await fs.readFile(path.join(ROOT, ".github/workflows/market-weekly.yml"), "utf8");
  assert.match(daily, /workflow_dispatch/);
  assert.match(daily, /17 23 \* \* 1-5/);
  assert.match(daily, /npm ci/);
  assert.match(daily, /npm run db:migrate/);
  assert.match(daily, /npm run production:daily/);
  assert.match(daily, /if: github\.event_name != 'schedule' \|\| vars\.PRODUCTION_SCHEDULES_ENABLED == '1'/);
  assert.doesNotMatch(daily, /production:weekly|MAIL_PASSWORD/);
  assert.match(weekly, /workflow_dispatch/);
  assert.match(weekly, /17 1 \* \* 1/);
  assert.match(weekly, /WEEKLY_MAIL_TEST_MODE/);
  assert.match(weekly, /secrets\.DATABASE_URL/);
  assert.match(weekly, /MAIL_PROVIDER: smtp/);
  assert.match(weekly, /MAIL_HOST: smtp\.gmail\.com/);
  assert.match(weekly, /MAIL_PORT: "465"/);
  assert.match(weekly, /MAIL_SECURE: "true"/);
  assert.match(weekly, /secrets\.MAIL_USER/);
  assert.match(weekly, /secrets\.MAIL_PASSWORD/);
  assert.doesNotMatch(weekly, /MICROSOFT_CLIENT_ID|MICROSOFT_REFRESH_TOKEN|MICROSOFT_TENANT|outlook_graph/);
  assert.match(weekly, /npm run production:weekly/);
  assert.match(weekly, /if: github\.event_name != 'schedule' \|\| vars\.PRODUCTION_SCHEDULES_ENABLED == '1'/);
  assert.doesNotMatch(`${daily}\n${weekly}`, /postgres:\/\/[^$\s]+|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY/);
  assert.equal(commandExitCode({ state: "SEND_WITH_WARNINGS", mail: { state: "FAILED" } }), 2);
});

test("Postgres CLI status and storage-check stay machine-readable when unconfigured", async () => {
  const env = { NODE_ENV: "production", STORAGE_PROVIDER: "postgres" };
  const status = await runWeeklyCommand("production:status", [], env);
  const check = await runWeeklyCommand("production:storage-check", [], env);
  assert.equal(status.storage.state, "DATABASE_URL_REQUIRED");
  assert.equal(status.storage.ready, false);
  assert.equal(status.readiness.database, "DATABASE_URL_REQUIRED");
  assert.match(status.warnings.join(" "), /DATABASE_URL_REQUIRED/);
  assert.equal(check.state, "DATABASE_URL_REQUIRED");
  assert.equal(check.ready, false);
  assert.equal(commandExitCode(status), 2);
  assert.equal(commandExitCode(check), 2);
});

test("manual production bootstrap workflow is dispatch-only and never sends mail", async () => {
  const workflow = await fs.readFile(path.join(ROOT, ".github/workflows/market-bootstrap.yml"), "utf8");
  assert.match(workflow, /name: Market Production Bootstrap/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+schedule:/m);
  assert.doesNotMatch(workflow, /PRODUCTION_SCHEDULES_ENABLED/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /node-version: "20"/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.match(workflow, /npm run db:migrate/);
  assert.match(workflow, /npm run production:storage-check/);
  assert.match(workflow, /npm run production:bootstrap -- --period 3y/);
  assert.match(workflow, /POSTGRES_UPSERT_BATCH_SIZE: "250"/);
  assert.match(workflow, /BOOTSTRAP_HISTORY_CONCURRENCY: "3"/);
  assert.match(workflow, /timeout-minutes: 30/);
  assert.match(workflow, /npm run production:status/);
  assert.doesNotMatch(workflow, /MAIL_(USER|PASSWORD|FROM|TO|TEST_TO|ENABLED|HOST|PORT|SECURE)/);
  assert.doesNotMatch(workflow, /production:weekly|weekly:send|smtp/i);
});

test("manual database migration workflow is dispatch-only and cannot run operational jobs", async () => {
  const workflow = await fs.readFile(path.join(ROOT, ".github/workflows/market-db-migrate.yml"), "utf8");
  assert.match(workflow, /name: Market Database Migration Only/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+schedule:/m);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request):/m);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /node-version: "20"/);

  const jobScope = workflow.match(/^jobs:\n\s+migrate:\n([\s\S]*?)^\s+steps:/m)?.[1] || "";
  assert.doesNotMatch(jobScope, /\b(?:DATABASE_URL|NODE_ENV|STORAGE_PROVIDER|DATABASE_SSL|REQUIRE_DURABLE_STORAGE)\b/);

  const testStep = workflow.match(/^\s+- name: Run deterministic test suite([\s\S]*?)^\s+- name: Migrate PostgreSQL schema only/m)?.[1] || "";
  assert.match(testStep, /run: npm test/);
  assert.doesNotMatch(testStep, /\b(?:DATABASE_URL|NODE_ENV|STORAGE_PROVIDER|DATABASE_SSL|REQUIRE_DURABLE_STORAGE)\b/);

  const migrationStep = workflow.match(/^\s+- name: Migrate PostgreSQL schema only([\s\S]*?)^\s+- name: Verify migration completed successfully/m)?.[1] || "";
  assert.match(migrationStep, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.match(migrationStep, /NODE_ENV: production/);
  assert.match(migrationStep, /STORAGE_PROVIDER: postgres/);
  assert.match(migrationStep, /DATABASE_SSL: "true"/);
  assert.match(migrationStep, /REQUIRE_DURABLE_STORAGE: "1"/);
  assert.match(migrationStep, /run: npm run db:migrate/);

  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /Verify migration completed successfully/);
  assert.match(workflow, /grep -Eq.*DATABASE_MIGRATED/);
  assert.doesNotMatch(workflow, /production:bootstrap|production:daily|production:weekly|weekly:send|backfill|MAIL|Gmail|smtp/i);
});

function batchFixtureRecords(count, status = "LIVE", collectedAt = "2026-08-17T01:00:00Z") {
  return Array.from({ length: count }, (_, index) => ({
    materialId: `fixture-${index % 25}`,
    materialName: `公開材料 ${index % 25}`,
    symbol: `FIX-${index % 25}`,
    category: "公開測試資料",
    exchange: "PUBLIC FIXTURE",
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    marketPrice: 100 + index,
    sourceUnit: "USD/unit",
    currency: "USD",
    usdTwdRate: 32,
    twdReferenceValue: (100 + index) * 32,
    source: "synthetic public fixture",
    status,
    collectedAt,
    lastTradeTimestamp: `2026-01-01T12:00:00Z`,
    provenance: { provider: "synthetic public fixture", status },
  }));
}

test("Postgres batch upsert is query-bounded for 1,000 records and preserves status quality", async () => {
  assert.equal(DEFAULT_UPSERT_BATCH_SIZE, 250);
  assert.equal(MAX_UPSERT_BATCH_SIZE, 500);
  assert.equal(postgres.getUpsertBatchSize(undefined), 250);
  assert.equal(postgres.getUpsertBatchSize(0), 1);
  assert.equal(postgres.getUpsertBatchSize(1000), 500);
  const env = { STORAGE_PROVIDER: "postgres", DATABASE_URL: "postgres://fixture.invalid/market", POSTGRES_UPSERT_BATCH_SIZE: "250" };
  const pool = new FakePostgresPool();
  await postgres.migratePostgres({ env, pool });
  const records = batchFixtureRecords(1000);
  const result = await postgres.upsertSnapshots({ records, env, pool });
  assert.equal(result.batchCount, 4);
  assert.equal(result.queryCount, 4);
  assert.equal(pool.insertQueryCount, 4);
  assert.equal(result.inserted, records.length);
  assert.equal(pool.snapshots.size, records.length);
  const snapshotInsertQueries = pool.queries.filter((query) => query.startsWith("INSERT INTO market_snapshots"));
  assert.ok(snapshotInsertQueries.every((query) => query.includes("ON CONFLICT") && query.includes("RETURNING")));
  assert.equal(pool.queries.some((query) => query.includes("SELECT payload FROM market_snapshots WHERE") && query.includes("FOR UPDATE")), false);
  for (const count of [1, 250, 251, 3000]) {
    const boundaryPool = new FakePostgresPool();
    await postgres.migratePostgres({ env, pool: boundaryPool });
    const boundary = await postgres.upsertSnapshots({ records: batchFixtureRecords(count), env, pool: boundaryPool });
    assert.equal(boundary.batchCount, Math.ceil(count / 250));
    assert.equal(boundary.queryCount, Math.ceil(count / 250));
    assert.equal(boundaryPool.insertQueryCount, Math.ceil(count / 250));
    assert.equal(boundaryPool.snapshots.size, count);
  }
  const statuses = ["LIVE", "FALLBACK", "STALE", "API_ERROR", "NO_DATA"];
  for (let index = 0; index < statuses.length; index += 1) {
    const identity = `quality-${index}|2026-08-01`;
    pool.snapshots.set(identity, batchFixtureRecords(1, statuses[index])[0]);
    pool.snapshots.get(identity).materialId = `quality-${index}`;
    pool.snapshots.get(identity).date = "2026-08-01";
  }
  const mixed = statuses.flatMap((existingStatus, index) => statuses.map((incomingStatus) => ({
    ...batchFixtureRecords(1, incomingStatus, "2026-08-18T01:00:00Z")[0],
    materialId: `quality-${index}`,
    date: "2026-08-01",
    status: incomingStatus,
  })));
  const mixedResult = await postgres.upsertSnapshots({ records: mixed, env, pool, batchSize: 25 });
  assert.equal(mixedResult.batchCount, 1);
  for (let index = 0; index < statuses.length; index += 1) assert.equal(pool.snapshots.get(`quality-${index}|2026-08-01`).status, "LIVE");
});

test("Postgres batch boundaries, rollback and resumable rerun retain prior committed batches", async () => {
  const env = { STORAGE_PROVIDER: "postgres", DATABASE_URL: "postgres://fixture.invalid/market" };
  const pool = new FakePostgresPool();
  await postgres.migratePostgres({ env, pool });
  const records = batchFixtureRecords(501);
  pool.failOnInsertNumber = 2;
  await assert.rejects(() => postgres.upsertSnapshots({ records, env, pool }), (error) => error.code === "DATABASE_WRITE_FAILED");
  assert.equal(pool.insertQueryCount, 2);
  assert.equal(pool.snapshots.size, 250);
  assert.ok(pool.queries.includes("ROLLBACK"));
  pool.failOnInsertNumber = null;
  pool.insertQueryCount = 0;
  const rerun = await postgres.upsertSnapshots({ records, env, pool });
  assert.equal(rerun.batchCount, 3);
  assert.equal(pool.snapshots.size, 501);
  assert.equal(rerun.inserted, 251);
  const idempotent = await postgres.upsertSnapshots({ records, env, pool });
  assert.equal(idempotent.inserted, 0);
  assert.equal(idempotent.replaced, 501);
  assert.equal(idempotent.ignored, 0);
  assert.equal(pool.snapshots.size, 501);
});

test("history backfill uses bounded concurrency and keeps per-material failures isolated", async () => {
  assert.equal(getHistoryConcurrency(undefined), 3);
  assert.equal(getHistoryConcurrency(99), 4);
  assert.equal(getHistoryConcurrency(0), 1);
  let active = 0;
  let maximum = 0;
  const ordered = await runWithConcurrency(Array.from({ length: 9 }, (_, index) => index), 3, async (value) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  });
  assert.equal(maximum, 3);
  assert.deepEqual(ordered, [0, 2, 4, 6, 8, 10, 12, 14, 16]);
  const directory = await tempDirectory();
  const filePath = path.join(directory, "snapshots.json");
  const selected = materials.slice(0, 4);
  const progress = [];
  const backfill = await backfillPublicHistory({
    period: "1y",
    filePath,
    materials: selected,
    fxRows: [{ date: "2026-08-03", close: 32 }],
    historyConcurrency: 3,
    onProgress: (event) => { progress.push(event); },
    fetchHistory: async (symbol) => {
      if (symbol === selected[2].symbol) throw new Error("synthetic public provider timeout");
      return { sourceType: "primary", source: "synthetic public history", rows: [{ date: "2026-08-03", close: 100 }] };
    },
    collectedAt: "2026-08-17T01:00:00Z",
  });
  assert.equal(backfill.materialCount, 4);
  assert.equal(backfill.failureCount, 1);
  assert.equal(backfill.fetchedRows, 4);
  assert.ok(progress.some((event) => event.phase === "material_failed"));
  assert.ok(progress.some((event) => event.phase === "material_completed"));
  assert.equal((await readStore(filePath)).records.length, 4);
});

test("Postgres conflict quality semantics cover every status pair and collected_at boundary", async () => {
  const env = { STORAGE_PROVIDER: "postgres", DATABASE_URL: "postgres://fixture.invalid/market" };
  const statuses = ["LIVE", "FALLBACK", "STALE", "API_ERROR", "NO_DATA"];
  const rank = { LIVE: 4, FALLBACK: 3, STALE: 2, API_ERROR: 1, NO_DATA: 0 };
  for (const existingStatus of statuses) {
    for (const incomingStatus of statuses) {
      const pool = new FakePostgresPool();
      await postgres.migratePostgres({ env, pool });
      const existing = { ...batchFixtureRecords(1, existingStatus, "2026-08-17T01:00:00Z")[0], materialId: "pair", date: "2026-08-01" };
      await postgres.upsertSnapshots({ records: [existing], env, pool });
      const incoming = { ...existing, status: incomingStatus, marketPrice: 999, collectedAt: "2026-08-18T01:00:00Z" };
      await postgres.upsertSnapshots({ records: [incoming], env, pool });
      const stored = pool.snapshots.get("pair|2026-08-01");
      const expected = rank[incomingStatus] >= rank[existingStatus] ? incomingStatus : existingStatus;
      assert.equal(stored.status, expected, `${existingStatus} -> ${incomingStatus}`);

      const olderPool = new FakePostgresPool();
      await postgres.migratePostgres({ env, pool: olderPool });
      await postgres.upsertSnapshots({ records: [existing], env, pool: olderPool });
      await postgres.upsertSnapshots({ records: [{ ...incoming, collectedAt: "2026-08-16T01:00:00Z" }], env, pool: olderPool });
      const olderStored = olderPool.snapshots.get("pair|2026-08-01");
      const olderExpected = rank[incomingStatus] > rank[existingStatus] ? incomingStatus : existingStatus;
      assert.equal(olderStored.status, olderExpected, `${existingStatus} -> ${incomingStatus} older`);
    }
  }
});

test("production bootstrap records safe progress and completion summary", async () => {
  const directory = await tempDirectory();
  const env = { NODE_ENV: "production", PRODUCTION_STORAGE_ROOT: directory };
  const config = getStorageConfig(env, { forceProduction: true });
  const records = fullProductionFixtureRecords();
  const result = await runProductionBootstrap({
    env,
    storageConfig: config,
    period: "3y",
    logProgress: false,
    backfill: async ({ filePath, onProgress }) => {
      await upsertSnapshots(records, { filePath, env });
      await onProgress({ phase: "batch_committed", materialIndex: 1, materialCount: materials.length, batchNumber: 1, batchCount: 1, materialId: "copper", symbol: "HG=F", rows: records.length, inserted: records.length, replaced: 0, ignored: 0 });
      return { period: "3y", materialCount: materials.length, recordCount: records.length, fetchedRows: records.length, inserted: records.length, replaced: 0, ignored: 0, failureCount: 0, results: [] };
    },
  });
  assert.equal(result.state, "BOOTSTRAP_COMPLETE");
  assert.equal(result.period, "3y");
  assert.equal(result.materialCount, materials.length);
  assert.equal(result.fetchedRows, records.length);
  assert.equal(result.apiErrorMaterials, 0);
  assert.equal(result.progressEventCount, 1);
  assert.ok(Number.isFinite(result.elapsedMs));
  const jobs = await readJobState(config.jobStateFile);
  assert.equal(jobs.jobs.productionBootstrap.state, "BOOTSTRAP_COMPLETE");
  assert.equal(jobs.jobs.productionBootstrap.fetchedRows, records.length);
  assert.equal(jobs.jobs.productionBootstrap.apiErrorMaterials, 0);
});

function mockGraphResponse(status, payload = {}, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    async json() { return payload; },
  };
}

function graphFixtureEnv(overrides = {}) {
  return {
    MAIL_ENABLED: "1",
    MAIL_PROVIDER: "outlook_graph",
    MICROSOFT_CLIENT_ID: "client-id-fixture",
    MICROSOFT_REFRESH_TOKEN: "refresh-token-fixture",
    MICROSOFT_TENANT: "consumers",
    MAIL_FROM: "ggyin0628@hotmail.com",
    MAIL_TO: "production@example.com",
    MAIL_TEST_TO: "ggyin0628@hotmail.com",
    MAIL_TEST_MODE: "1",
    ...overrides,
  };
}

test("Outlook Graph configuration validates personal delegated Mail.Send and required secrets", () => {
  const config = readMailConfig(graphFixtureEnv());
  assert.equal(config.provider, "outlook_graph");
  assert.equal(config.tenant, "consumers");
  assert.deepEqual(config.to, ["ggyin0628@hotmail.com"]);
  assert.deepEqual(config.envelopeRecipients, ["ggyin0628@hotmail.com"]);
  assert.equal(validateMailConfig(config).valid, true);
  const missingClient = validateMailConfig(readMailConfig(graphFixtureEnv({ MICROSOFT_CLIENT_ID: "" })));
  assert.equal(missingClient.valid, false);
  assert.ok(missingClient.errors.includes("MICROSOFT_CLIENT_ID 缺少"));
  const missingRefresh = validateMailConfig(readMailConfig(graphFixtureEnv({ MICROSOFT_REFRESH_TOKEN: "" })));
  assert.equal(missingRefresh.valid, false);
  assert.ok(missingRefresh.errors.includes("MICROSOFT_REFRESH_TOKEN 缺少"));
  assert.equal(validateMailConfig(readMailConfig(graphFixtureEnv({ MICROSOFT_TENANT: "organizations" }))).valid, false);
});

test("Microsoft OAuth refresh token exchange uses consumers and required scopes without exposing token", async () => {
  const config = readMailConfig(graphFixtureEnv());
  let request;
  const token = await refreshGraphAccessToken(config, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return mockGraphResponse(200, { access_token: "access-token-fixture", expires_in: 3600, scope: GRAPH_SCOPE });
    },
  });
  assert.equal(request.url, graphTokenUrl("consumers"));
  assert.match(request.options.body, /grant_type=refresh_token/);
  assert.match(request.options.body, /scope=offline_access/);
  assert.match(request.options.body, /Mail.Send/);
  assert.equal(token.accessToken, "access-token-fixture");
  assert.deepEqual(GRAPH_SCOPES, ["offline_access", "https://graph.microsoft.com/Mail.Send"]);
  assert.match(request.options.body, /refresh_token=refresh-token-fixture/);
});

test("Microsoft OAuth refresh failure is explicit and sanitized", async () => {
  const config = readMailConfig(graphFixtureEnv());
  await assert.rejects(() => refreshGraphAccessToken(config, { fetchImpl: async () => mockGraphResponse(400, { error: "invalid_grant", error_description: "refresh token revoked" }) }), (error) => {
    assert.equal(error.code, "GRAPH_TOKEN_REFRESH_FAILED");
    assert.doesNotMatch(error.message, /refresh token revoked|refresh-token-fixture|access-token/);
    return true;
  });
});

test("Graph sendMail serializes HTML and XLSX as a fileAttachment", async () => {
  const config = readMailConfig(graphFixtureEnv());
  const payload = createGraphMessage({
    config,
    subject: "採購市場情報週報｜2026-W33",
    html: "<p>public fixture</p>",
    attachments: [{ filename: "weekly.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: Buffer.from("xlsx-fixture") }],
  });
  assert.equal(payload.message.body.contentType, "HTML");
  assert.deepEqual(payload.message.toRecipients, [{ emailAddress: { address: "ggyin0628@hotmail.com" } }]);
  assert.equal(payload.message.attachments[0]["@odata.type"], "#microsoft.graph.fileAttachment");
  assert.equal(Buffer.from(payload.message.attachments[0].contentBytes, "base64").toString(), "xlsx-fixture");
  let calls = 0;
  const result = await graphSend(config, { subject: "fixture", html: "<p>fixture</p>", attachments: [{ filename: "weekly.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: Buffer.from("xlsx-fixture") }] }, {
    fetchImpl: async (url, options) => {
      calls += 1;
      if (calls === 1) return mockGraphResponse(200, { access_token: "access-token-fixture", expires_in: 3600 });
      assert.equal(url, GRAPH_SENDMAIL_URL);
      assert.match(options.headers.authorization, /^Bearer access-token-fixture$/);
      const body = JSON.parse(options.body);
      assert.equal(body.message.attachments[0]["@odata.type"], "#microsoft.graph.fileAttachment");
      return mockGraphResponse(202);
    },
  });
  assert.deepEqual(result, { ok: true, status: 202 });
  assert.equal(calls, 2);
});

test("Graph HTTP 401, 403, 429 and 5xx remain explicit sanitized failures", async () => {
  const config = readMailConfig(graphFixtureEnv());
  for (const status of [401, 403, 429, 500, 503]) {
    let calls = 0;
    await assert.rejects(() => graphSend(config, { subject: "fixture", html: "<p>fixture</p>", attachments: [] }, {
      fetchImpl: async () => {
        calls += 1;
        return calls === 1 ? mockGraphResponse(200, { access_token: "access-token-fixture" }) : mockGraphResponse(status, { error: { code: "sensitive_graph_detail" } }, { "retry-after": "1" });
      },
    }), (error) => {
      assert.equal(error.statusCode, status);
      assert.match(error.code, /^GRAPH_/);
      assert.doesNotMatch(error.message, /access-token-fixture|sensitive_graph_detail/);
      return true;
    });
    assert.equal(calls, 2);
  }
});

test("Outlook Graph weekly send is TEST mode isolated, duplicate-safe and never falls back to Gmail SMTP", async () => {
  const report = buildWeeklyReport({ records: fullProductionFixtureRecords(), reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  const directory = await tempDirectory();
  const env = graphFixtureEnv();
  let graphCalls = 0;
  let smtpCalls = 0;
  const result = await sendWeeklyEmail({
    report,
    html: "<p>fixture public report</p>",
    xlsxBuffer: Buffer.from("xlsx-fixture"),
    env,
    ledgerPath: path.join(directory, "graph-ledger.json"),
    smtpSender: async () => { smtpCalls += 1; throw new Error("Gmail fallback must not be called"); },
    graphSender: async (config, message) => {
      graphCalls += 1;
      assert.equal(config.provider, "outlook_graph");
      assert.deepEqual(config.to, ["ggyin0628@hotmail.com"]);
      assert.deepEqual(config.configuredTo, ["production@example.com"]);
      assert.equal(message.attachments.length, 1);
    },
  });
  assert.equal(result.state, "TEST_SENT");
  assert.equal(result.provider, "outlook_graph");
  assert.equal(result.testMode, true);
  assert.equal(result.recipientCount, 1);
  assert.equal(result.attachmentCount, 1);
  assert.equal(result.sent, true);
  assert.equal(graphCalls, 1);
  assert.equal(smtpCalls, 0);

  await writeLedger({ weeks: { "2026-W33": { state: "TEST_SENT" } } }, path.join(directory, "duplicate.json"));
  let duplicateGraphCalls = 0;
  const duplicate = await sendWeeklyEmail({
    report,
    html: "<p>fixture</p>",
    xlsxBuffer: Buffer.from("xlsx-fixture"),
    env,
    ledgerPath: path.join(directory, "duplicate.json"),
    graphSender: async () => { duplicateGraphCalls += 1; },
  });
  assert.equal(duplicate.state, "DUPLICATE_PREVENTED");
  assert.equal(duplicate.provider, "outlook_graph");
  assert.equal(duplicateGraphCalls, 0);
});

test("Graph failure ledger and safeError redact OAuth secrets", async () => {
  const report = buildWeeklyReport({ records: fullProductionFixtureRecords(), reportingWeek: "2026-W34", generatedAt: "2026-08-17T01:00:00Z" });
  const directory = await tempDirectory();
  const secretError = new Error("Graph failure refresh_token=refresh-token-fixture access_token=access-token-fixture authorization=Bearer access-token-fixture");
  const result = await sendWeeklyEmail({
    report,
    html: "<p>fixture</p>",
    xlsxBuffer: Buffer.from("xlsx-fixture"),
    env: graphFixtureEnv(),
    ledgerPath: path.join(directory, "failure.json"),
    graphSender: async () => { throw secretError; },
  });
  assert.equal(result.state, "FAILED");
  assert.equal(result.provider, "outlook_graph");
  assert.equal(result.errorCode, "MAIL_SEND_FAILED");
  assert.doesNotMatch(JSON.stringify(result), /refresh-token-fixture|access-token-fixture|Bearer access-token-fixture/);
  assert.doesNotMatch(JSON.stringify(await readLedger(path.join(directory, "failure.json"))), /refresh-token-fixture|access-token-fixture/);
  const safe = safeError(secretError);
  assert.doesNotMatch(safe, /refresh-token-fixture|access-token-fixture/);
});

test("concise production weekly summary excludes full report/history payload", () => {
  const summary = summarizeProductionWeekly({
    reportingWeek: "2026-W33",
    qualityGate: { state: "SEND_OK", trackedIndicatorCount: 14, usableIndicatorCount: 14, materialUsabilityPct: 100 },
    mail: { provider: "outlook_graph", testMode: true, state: "TEST_SENT", recipientCount: 1, attachmentCount: 1, errorCode: null, error: null },
    artifacts: { jsonPath: "/tmp/reports/report.json", htmlPath: "/tmp/reports/report.html", xlsxPath: "/tmp/reports/report.xlsx", metadata: { internal: true } },
    report: { indicators: Array.from({ length: 1000 }, () => ({ history: ["must-not-print"] })) },
  }, graphFixtureEnv(), 1234);
  assert.deepEqual(summary, {
    reportingWeek: "2026-W33",
    qualityGate: { state: "SEND_OK", trackedIndicatorCount: 14, usableIndicatorCount: 14, materialUsabilityPct: 100 },
    mail: { provider: "outlook_graph", testMode: true, state: "TEST_SENT", recipientCount: 1, attachmentCount: 1, errorCode: null, error: null },
    artifacts: { jsonPath: "report.json", htmlPath: "report.html", xlsxPath: "report.xlsx" },
    durationMs: 1234,
  });
  assert.doesNotMatch(JSON.stringify(summary), /must-not-print|indicators|history/);
});

test("device-code OAuth helper uses consumers scopes and never prints or stores token in repository", async () => {
  const output = path.join(await tempDirectory(), "microsoft-refresh-token.json");
  let calls = 0;
  let stdout = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => { stdout += String(chunk); return true; };
  try {
    const result = await runDeviceFlow({
      clientId: "client-id-fixture",
      output,
      maxPolls: 2,
      sleepImpl: async () => {},
      fetchImpl: async (url, options) => {
        calls += 1;
        if (calls === 1) {
          assert.equal(url, DEVICE_CODE_URL);
          assert.match(options.body, /offline_access/);
          assert.match(options.body, /Mail.Send/);
          return mockGraphResponse(200, { device_code: "device-code-fixture", user_code: "ABCD-EFGH", verification_uri: "https://microsoft.com/devicelogin", expires_in: 900, interval: 1 });
        }
        if (calls === 2) return mockGraphResponse(400, { error: "authorization_pending" });
        assert.equal(url, TOKEN_URL);
        return mockGraphResponse(200, { refresh_token: "refresh-token-fixture" });
      },
    });
    assert.equal(result.state, "MICROSOFT_OAUTH_BOOTSTRAP_COMPLETE");
    assert.equal(result.tenant, "consumers");
    assert.match(stdout, /verification_uri=https:\/\/microsoft\.com\/devicelogin/);
    assert.doesNotMatch(stdout, /device-code-fixture|refresh-token-fixture/);
    const stored = JSON.parse(await fs.readFile(output, "utf8"));
    assert.equal(stored.refreshToken, "refresh-token-fixture");
    assert.equal(stored.tenant, "consumers");
  } finally {
    process.stdout.write = originalWrite;
    await fs.rm(output, { force: true });
  }
});

test("device-code OAuth helper rejects output inside repository", async () => {
  await assert.rejects(() => runDeviceFlow({ clientId: "client-id-fixture", output: path.join(ROOT, "microsoft-refresh-token.json"), fetchImpl: async () => { throw new Error("must not call network"); } }), (error) => error.code === "OAUTH_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY");
});

test("production seed policy disables bundled seed fallback and marks May data expired outside the test path", async () => {
  assert.equal(allowSeedFallback({ NODE_ENV: "production" }), false);
  assert.equal(allowSeedFallback({ NODE_ENV: "test" }), true);
  const expired = markSnapshotExpired({
    state: "OK",
    generatedAt: "2026-05-19T08:29:58.805Z",
    dataAsOf: "2026-05-19T08:29:58.805Z",
    fx: { status: "OK", rate: 31.66, lastTradeAt: "2026-05-19T08:29:56.000Z" },
    rows: [{ id: "copper", status: "OK", price: 6.26, lastTradeAt: "2026-05-19T08:19:48.000Z" }],
  }, "seed older than documented freshness window", new Date("2026-08-24T00:00:00.000Z"));
  assert.equal(expired.state, "EXPIRED");
  assert.equal(expired.rows[0].status, "EXPIRED");
  assert.equal(expired.generatedAt, "2026-05-19T08:29:58.805Z");
  assert.equal(expired.dataAsOf, "2026-05-19T08:29:58.805Z");
  assert.equal(observationAgeDays(expired.dataAsOf, new Date("2026-08-24T00:00:00.000Z")) > 90, true);
});

test("stale snapshot collected in August retains the original May observation identity", () => {
  const snapshot = {
    state: "STALE",
    generatedAt: "2026-05-19T08:29:58.805Z",
    servedAt: "2026-08-24T01:00:00.000Z",
    dataAsOf: "2026-05-19T08:29:58.805Z",
    acquisitionPath: "READ_FALLBACK",
    fx: { status: "STALE", rate: 31.66, lastTradeAt: "2026-05-19T08:29:56.000Z" },
    rows: [{ id: "copper", name: "銅", status: "STALE", price: 6.26, lastTradeAt: "2026-05-19T08:19:48.000Z", source: "fixture" }],
  };
  const records = snapshotToRecords(snapshot, "2026-08-24T01:00:00.000Z");
  assert.equal(records[0].date, "2026-05-19");
  assert.equal(records[1].date, "2026-05-19");
  assert.equal(records[1].observationDate, "2026-05-19");
  assert.equal(records[1].collectedAt, "2026-08-24T01:00:00.000Z");
  assert.equal(records[1].collectionPath, "READ_FALLBACK");
  assert.equal(records[1].provenance.dataAsOf, "2026-05-19T08:29:58.805Z");
});

test("direct acquisition and read fallback remain distinct in snapshot metadata", () => {
  const direct = buildSnapshot({ status: "OK", rate: 32, lastTradeAt: "2026-08-24T00:00:00.000Z" }, [{ id: "copper", name: "銅", status: "OK", price: 6.2, lastTradeAt: "2026-08-24T00:00:00.000Z" }], new Date("2026-08-24T00:00:00.000Z"));
  assert.equal(direct.acquisitionPath, "DIRECT_ACQUISITION");
  assert.equal(direct.dataAsOf, "2026-08-24T00:00:00.000Z");
  assert.equal(getSnapshotDataAsOf(direct), "2026-08-24T00:00:00.000Z");
});

test("weekly report blocks materially expired May observations during an August reporting week", () => {
  const records = materials.map((material) => ({
    materialId: material.id,
    materialName: material.name,
    symbol: material.symbol,
    category: material.category,
    exchange: material.exchange,
    date: "2026-05-19",
    marketPrice: 100,
    sourceUnit: material.unit,
    currency: material.currency,
    source: "fixture-seed",
    status: "STALE",
    collectedAt: "2026-08-24T01:00:00Z",
    lastTradeTimestamp: "2026-05-19T08:00:00Z",
  })).concat([{
    materialId: "__fx_usd_twd__",
    materialName: "USD/TWD",
    symbol: "TWD=X",
    category: "匯率",
    exchange: "PUBLIC FX",
    date: "2026-05-19",
    marketPrice: 32,
    sourceUnit: "TWD/USD",
    currency: "TWD",
    source: "fixture-seed",
    status: "STALE",
    collectedAt: "2026-08-24T01:00:00Z",
    lastTradeTimestamp: "2026-05-19T08:00:00Z",
  }]);
  const report = buildWeeklyReport({ records, reportingWeek: "2026-W34", generatedAt: "2026-08-24T01:00:00Z" });
  assert.equal(report.qualityGate.state, "SEND_BLOCKED");
  assert.ok(report.qualityGate.integrityReasons.includes("OBSERVATION_FRESHNESS_INSUFFICIENT"));
  assert.equal(report.marketSummary.biggestRisers.length, 0);
  assert.equal(report.marketSummary.biggestDecliners.length, 0);
});

test("production durable public fallback is classified READ_FALLBACK and expires by observation date", async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, "snapshots.json");
  const recentRecords = [
    { materialId: "__fx_usd_twd__", materialName: "USD/TWD", symbol: "TWD=X", date: "2026-08-22", marketPrice: 32, sourceUnit: "TWD/USD", currency: "TWD", source: "public-fixture", status: "LIVE", lastTradeTimestamp: "2026-08-22T08:00:00Z", collectedAt: "2026-08-22T08:05:00Z" },
    { materialId: "copper", materialName: "銅", symbol: "HG=F", date: "2026-08-22", marketPrice: 6.2, sourceUnit: "USD/lb", currency: "USD", source: "public-fixture", status: "LIVE", twdReferenceValue: 198.4, lastTradeTimestamp: "2026-08-22T08:00:00Z", collectedAt: "2026-08-22T08:05:00Z" },
  ];
  await upsertSnapshots(recentRecords, { filePath });
  const env = { NODE_ENV: "production", STORAGE_PROVIDER: "postgres", DATABASE_SSL: "true", DATABASE_URL: "postgres://test-only" };
  const recent = await require("../lib/marketData/marketService").readDurablePublicFallback({ env, filePath, storageConfig: { provider: "postgres", snapshotFile: filePath }, now: new Date("2026-08-24T00:00:00Z") });
  assert.equal(recent.acquisitionPath, "READ_FALLBACK");
  assert.equal(recent.rows.find((row) => row.id === "copper").status, "FALLBACK");
  assert.equal(recent.rows.find((row) => row.id === "copper").sourceReliability, "READ_FALLBACK");
  assert.equal(recent.generatedAt, "2026-08-22T08:05:00Z");
  assert.equal(recent.servedAt, "2026-08-24T00:00:00.000Z");

  const oldFilePath = path.join(directory, "old-snapshots.json");
  await upsertSnapshots(recentRecords.map((record) => ({ ...record, date: "2026-05-19", lastTradeTimestamp: "2026-05-19T08:00:00Z", collectedAt: "2026-08-24T00:00:00Z" })), { filePath: oldFilePath });
  const old = await require("../lib/marketData/marketService").readDurablePublicFallback({ env, filePath: oldFilePath, storageConfig: { provider: "postgres", snapshotFile: oldFilePath }, now: new Date("2026-08-24T00:00:00Z") });
  assert.equal(old.rows.find((row) => row.id === "copper").status, "EXPIRED");
  assert.equal(old.rows.find((row) => row.id === "copper").sourceReliability, "READ_FALLBACK");
});

test("/api/market exposes safe market-health metadata without credentials", async () => {
  global.fetch = mockPublicSuccess();
  const res = await request("/api/market");
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(typeof payload.latestMarketObservationAt, "string");
  assert.equal(typeof payload.servedAt, "string");
  assert.equal(payload.marketHealth.freshCount, 14);
  assert.equal(payload.marketHealth.fallbackCount, 0);
  assert.equal(payload.marketHealth.staleCount, 0);
  assert.equal(payload.marketHealth.expiredCount, 0);
  assert.equal(payload.marketHealth.apiErrorCount, 0);
  assert.equal(JSON.stringify(payload).includes("DATABASE_URL"), false);
  assert.equal(JSON.stringify(payload).includes("postgres://"), false);
});

test("weekly gate distinguishes defensible within-window STALE from materially expired observations", () => {
  const records = materials.map((material) => ({
    materialId: material.id,
    materialName: material.name,
    symbol: material.symbol,
    category: material.category,
    exchange: material.exchange,
    date: "2026-08-10",
    marketPrice: 100,
    sourceUnit: material.unit,
    currency: material.currency,
    source: "public-fallback-fixture",
    status: "STALE",
    collectedAt: "2026-08-16T01:00:00Z",
    lastTradeTimestamp: "2026-08-10T08:00:00Z",
  })).concat([{
    materialId: "__fx_usd_twd__",
    materialName: "USD/TWD",
    symbol: "TWD=X",
    category: "匯率",
    exchange: "PUBLIC FX",
    date: "2026-08-10",
    marketPrice: 32,
    sourceUnit: "TWD/USD",
    currency: "TWD",
    source: "public-fallback-fixture",
    status: "STALE",
    collectedAt: "2026-08-16T01:00:00Z",
    lastTradeTimestamp: "2026-08-10T08:00:00Z",
  }]);
  const report = buildWeeklyReport({ records, reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  assert.equal(report.qualityGate.state, "SEND_WITH_WARNINGS");
  assert.ok(report.qualityGate.warningReasons.includes("STALE_PRESENT"));
  assert.equal(report.qualityGate.freshnessInsufficient, false);
});
