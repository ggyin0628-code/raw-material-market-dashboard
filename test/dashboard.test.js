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
const { snapshotToRecords } = require("../lib/weekly/dailySnapshotService");
const { readStore, upsertSnapshots, clearWriteQueue } = require("../lib/weekly/snapshotStore");
const { buildWeeklyReport, renderWeeklyHtml, createWeeklyWorkbook } = require("../lib/weekly/reportService");
const { buildSignal } = require("../lib/weekly/weeklyAnalytics");
const { backfillPublicHistory } = require("../lib/weekly/backfillService");
const { parseArgs, run: runWeeklyCommand, commandExitCode, errorExitCode } = require("../lib/weekly/cli");
const { sendWeeklyEmail, readMailConfig, validateMailConfig, writeLedger, readLedger, createMimeMessage } = require("../lib/weekly/mailService");
const { getStorageConfig, assertProductionStorage } = require("../lib/weekly/storageConfig");
const { ensureStorageDirectories, getStorageStatus, backupPublicStorage, readJobState } = require("../lib/weekly/storageService");
const { evaluateWeeklyQuality } = require("../lib/weekly/qualityGate");
const { runProductionBootstrap, runProductionWeekly, readProductionStatus, runDatabaseMigration } = require("../lib/weekly/productionService");
const postgres = require("../lib/weekly/postgresAdapter");

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
  assert.equal(records[0].date, "2026-08-17");
  assert.equal(records[1].status, "LIVE");
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

test("weekly report HTML and XLSX are complete and remain understandable without images", async () => {
  const report = buildWeeklyReport({ records: weeklyFixtureRecords(), reportingWeek: "2026-W33", generatedAt: "2026-08-17T01:00:00Z" });
  const html = renderWeeklyHtml(report);
  assert.match(html, /採購市場情報週報｜2026-W33/);
  assert.match(html, /公開市場參考資訊/);
  assert.match(html, /主要指標明細/);
  assert.match(html, /非採購指示/);
  const workbook = createWeeklyWorkbook(report);
  const buffer = await workbook.xlsx.writeBuffer();
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["本週摘要", "市場明細", "歷史資料", "資料來源與說明"]);
  assert.ok(workbook.getWorksheet("市場明細").rowCount >= 15);
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
      this.snapshots.set(`${params[0]}|${params[1]}`, JSON.parse(params[2]));
      return { rows: [] };
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
  assert.doesNotMatch(daily, /production:weekly|MAIL_PASSWORD/);
  assert.match(weekly, /workflow_dispatch/);
  assert.match(weekly, /17 1 \* \* 1/);
  assert.match(weekly, /WEEKLY_MAIL_TEST_MODE/);
  assert.match(weekly, /secrets\.DATABASE_URL/);
  assert.match(weekly, /secrets\.MAIL_PASSWORD/);
  assert.match(weekly, /npm run production:weekly/);
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
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /node-version: "20"/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.match(workflow, /npm run db:migrate/);
  assert.match(workflow, /npm run production:storage-check/);
  assert.match(workflow, /npm run production:bootstrap -- --period 3y/);
  assert.match(workflow, /npm run production:status/);
  assert.doesNotMatch(workflow, /MAIL_(USER|PASSWORD|FROM|TO|TEST_TO|ENABLED|HOST|PORT|SECURE)/);
  assert.doesNotMatch(workflow, /production:weekly|weekly:send|smtp/i);
});
