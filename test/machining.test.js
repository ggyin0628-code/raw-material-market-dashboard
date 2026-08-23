const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_WEIGHTS, buildMachiningReference, normalizeWeights } = require("../lib/machining/pressureModel");
const { DATA_LAYERS } = require("../lib/machining/machiningContract");
const { buildPayload } = require("../lib/machining/machiningService");
const { handleRequest, resolveStaticPath } = require("../server");
const {
  buildDgbasPpiQueryEndpoint,
  buildDgbasWageQueryEndpoint,
  getCbcFxObservations,
  getDgbasPpiBundle,
  getWageObservations,
  parseCbcFx,
  parseDgbasPpi,
  parseDgbasWage,
  parseDgbasWageRecords,
  recoverWithPersistence,
} = require("../lib/machining/sourceService");
const { clearWriteQueue, listPublicObservations, upsertPublicObservations } = require("../lib/machining/publicObservationStore");
const { validateMachiningReference } = require("../lib/machining/machiningContract");

const SOURCE_BASE = {
  sourceName: "Synthetic public index fixture",
  url: "https://example.test/public-index",
  geographicScope: "Taiwan",
  updateFrequency: "monthly",
  unit: "index",
  accessConstraints: "Public fixture only",
};

function history(values, start = "2026-01-01", stepDays = 14) {
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  return values.map((value, index) => ({
    date: new Date(startMs + index * stepDays * 86400000).toISOString().slice(0, 10),
    value,
  }));
}

function observation(id, values, status = "LIVE") {
  const points = history(values);
  return {
    id,
    label: id,
    history: points,
    status,
    unit: "index",
    sourceProvenance: { ...SOURCE_BASE, sourceId: id, status },
  };
}

function completeComponents(overrides = {}) {
  const base = {
    materialPressure: { label: "材料壓力", observations: [observation("material-series", [100, 101, 102, 103, 104, 105, 106, 107])], expectedEvidence: 1 },
    energyPressure: { label: "能源壓力", observations: [observation("energy-series", [100, 100, 100, 100, 101, 101, 101, 101])], expectedEvidence: 1 },
    laborPressure: { label: "勞動壓力", observations: [observation("labor-series", [100, 100, 100, 100, 100, 100, 100, 100])], expectedEvidence: 1 },
    fxPressure: { label: "匯率壓力", observations: [observation("fx-series", [100, 99, 98, 97, 96, 95, 94, 93])], expectedEvidence: 1 },
    manufacturingPricePressure: { label: "製造價格壓力", observations: [observation("ppi-series", [100, 101, 100, 101, 100, 101, 100, 101])], expectedEvidence: 1 },
    machineCapitalPressure: { label: "機械／資本成本代理", observations: [observation("machine-series", [100, 100, 100, 100, 100, 100, 100, 100])], expectedEvidence: 1 },
  };
  return { ...base, ...overrides };
}

test("source normalization parses DGBAS PPI, wage XML, and CBC FX HTML", () => {
  const ppiXml = '<DataSet><Obs><Item>三.製造業產品(指數基期：民國110年=100)</Item><TIME_PERIOD>2026M06</TIME_PERIOD><FREQ>M</FREQ><TYPE>原始值</TYPE><Item_VALUE>105.99</Item_VALUE></Obs><Obs><Item>三.製造業產品(指數基期：民國110年=100)</Item><TIME_PERIOD>2026M06</TIME_PERIOD><FREQ>M</FREQ><TYPE>年增率(%)</TYPE><Item_VALUE>15.52</Item_VALUE></Obs></DataSet>';
  const wageXml = '<DataCollection><每人每月經常性薪資><年月別_Year_and_month>2025</年月別_Year_and_month><製造業_Manufacturing_金額_新臺幣元>53000</製造業_Manufacturing_金額_新臺幣元></每人每月經常性薪資></DataCollection>';
  const fxHtml = '<table><tr><td>2026/08/21</td><td>31.848</td></tr><tr><td>2026/08/20</td><td>31.925</td></tr></table>';
  assert.deepEqual(parseDgbasPpi(ppiXml, (item) => item.startsWith("三.製造業產品")), [{ date: "2026-06-01", value: 105.99 }]);
  assert.deepEqual(parseDgbasWage(wageXml), [{ date: "2025-12-31", value: 53000 }]);
  assert.deepEqual(parseCbcFx(fxHtml), [{ date: "2026-08-20", value: 31.925 }, { date: "2026-08-21", value: 31.848 }]);
});

test("official query builders retain bounded monthly selectors", () => {
  const ppiUrl = new URL(buildDgbasPpiQueryEndpoint(new Date("2026-08-23T00:00:00Z")));
  const wageUrl = new URL(buildDgbasWageQueryEndpoint(new Date("2026-08-23T00:00:00Z")));
  assert.equal(ppiUrl.searchParams.get("outmode"), "3");
  assert.equal(ppiUrl.searchParams.get("cycle"), "1");
  assert.equal(ppiUrl.searchParams.get("ym"), "11001");
  assert.equal(ppiUrl.searchParams.get("ymt"), "11508");
  assert.equal(ppiUrl.searchParams.get("fldlst").length, 100);
  assert.equal(wageUrl.searchParams.get("outmode"), "3");
  assert.equal(wageUrl.searchParams.get("cycle"), "1");
  assert.equal(wageUrl.searchParams.get("fldlst").length, 46);
  assert.equal(wageUrl.searchParams.get("codlst0"), "100");
});

test("DGBAS PPI and wage adapters fall back to secure nstatdb CSV queries", async () => {
  const ppiCsv = "\uFEFF,\"生產者物價基本分類指數\"\n\"統計期\",\"三.製造業產品\",\"13.基本金屬\",\"18.機械設備\",\"四.水電燃氣\"\n\"115年5月\",105,106,107,108\n\"115年6月\",106,107,108,109";
  const wageCsv = "\uFEFF,\"每人每月經常性薪資\"\n\"統計期\",\"製造業\"\n\"115年5月\",47000\n\"115年6月\",47170";
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (url.includes("ws.dgbas.gov.tw")) throw new Error("unable to verify the first certificate");
    return url.includes("A030701015") ? ppiCsv : wageCsv;
  };
  const ppi = await getDgbasPpiBundle({ now: new Date("2026-06-30T00:00:00Z"), fetcher });
  const wage = await getWageObservations({ now: new Date("2026-06-30T00:00:00Z"), fetcher });
  assert.equal(calls.length, 4);
  assert.equal(calls[1].includes("A030701015"), true);
  assert.equal(ppi.manufacturingPpi.status, "FALLBACK");
  assert.equal(ppi.manufacturingPpi.history.at(-1).value, 106);
  assert.equal(ppi.machinePpi.history.at(-1).value, 108);
  assert.equal(wage.status, "FALLBACK");
  assert.equal(wage.frequency, "monthly");
  assert.deepEqual(wage.history.at(-1), { date: "2026-06-01", value: 47170 });
});

test("wage XML parser preserves monthly manufacturing observations and annual fallback semantics", () => {
  const monthlyXml = "<DataCollection><每人每月經常性薪資><年月別_Year_and_month>202605Ⓡ</年月別_Year_and_month><製造業_Manufacturing_金額_新臺幣元>47210</製造業_Manufacturing_金額_新臺幣元></每人每月經常性薪資><每人每月經常性薪資><年月別_Year_and_month>202606Ⓟ</年月別_Year_and_month><製造業_Manufacturing_金額_新臺幣元>47170</製造業_Manufacturing_金額_新臺幣元></每人每月經常性薪資></DataCollection>";
  const annualXml = "<DataCollection><每人每月經常性薪資><年月別_Year_and_month>2025</年月別_Year_and_month><製造業_Manufacturing_金額_新臺幣元>53000</製造業_Manufacturing_金額_新臺幣元></每人每月經常性薪資></DataCollection>";
  assert.deepEqual(parseDgbasWageRecords(monthlyXml), [{ date: "2026-05-01", value: 47210, frequency: "monthly" }, { date: "2026-06-01", value: 47170, frequency: "monthly" }]);
  assert.deepEqual(parseDgbasWageRecords(annualXml), [{ date: "2025-12-31", value: 53000, frequency: "annual" }]);
});

test("CBC primary 60-row page is preferred and secondary page is explicit fallback", async () => {
  const html = "<table><tr><td data-th=\"Date\"><span>2026/08/21</span></td><td data-th=\"NTD/USD\"><span>31.848</span></td></tr><tr><td data-th=\"Date\"><span>2026/05/28</span></td><td data-th=\"NTD/USD\"><span>31.500</span></td></tr></table>";
  const primary = await getCbcFxObservations({ now: new Date("2026-08-23T00:00:00Z"), fetcher: async (url) => { assert.match(url, /-1-60\.html$/); return html; } });
  assert.equal(primary.status, "LIVE");
  const fallback = await getCbcFxObservations({ now: new Date("2026-08-23T00:00:00Z"), fetcher: async (url) => { if (url.includes("-1-60.html")) throw new Error("primary unavailable"); return html; } });
  assert.equal(fallback.status, "FALLBACK");
  assert.match(fallback.source.note, /60 筆官方分頁失敗/);
});

test("public machining observations persist and recover last-known-good values without private fields", async () => {
  const filePath = path.join(__dirname, "fixtures", "machining-observations-test.json");
  await fs.promises.rm(filePath, { force: true });
  const record = { sourceId: "test-public-source", seriesId: "test-series", date: "2026-06-01", value: 101.2, status: "LIVE", frequency: "monthly", sourceUrl: "https://example.test/public.csv", fetchedAt: "2026-08-23T00:00:00.000Z", provenance: { sourceId: "test-public-source", sourceName: "Public fixture", url: "https://example.test/public.csv", endpoint: "https://example.test/public.csv", geographicScope: "Taiwan", updateFrequency: "monthly", frequency: "monthly", unit: "index", accessConstraints: "public", status: "LIVE", lastObservationDate: "2026-06-01", fetchedAt: "2026-08-23T00:00:00.000Z" } };
  const result = await upsertPublicObservations(record, { filePath, env: { NODE_ENV: "test" } });
  const listed = await listPublicObservations({ filePath, env: { NODE_ENV: "test" }, sourceId: record.sourceId, seriesId: record.seriesId });
  assert.equal(result.inserted, 1);
  assert.deepEqual(listed.map(({ date, value }) => ({ date, value })), [{ date: "2026-06-01", value: 101.2 }]);
  assert.equal(JSON.stringify(listed).includes("company"), false);
  await fs.promises.rm(filePath, { force: true });
  clearWriteQueue();
});

test("last-known-good public observations recover with explicit fallback status", async () => {
  const filePath = path.join(__dirname, "fixtures", "machining-observations-recovery-test.json");
  await fs.promises.rm(filePath, { force: true });
  const source = { sourceId: "recovery-source", sourceName: "Public recovery fixture", url: "https://example.test/recovery.csv", endpoint: "https://example.test/recovery.csv", geographicScope: "Taiwan", updateFrequency: "monthly", frequency: "monthly", unit: "index", accessConstraints: "public", status: "LIVE", lastObservationDate: "2026-06-01", fetchedAt: "2026-06-01T00:00:00.000Z" };
  await upsertPublicObservations({ sourceId: source.sourceId, seriesId: "recovery-series", date: "2026-06-01", value: 99.5, status: "LIVE", frequency: "monthly", sourceUrl: source.endpoint, fetchedAt: source.fetchedAt, provenance: source }, { filePath, env: { NODE_ENV: "test" } });
  const recovered = await recoverWithPersistence({ history: [], status: "API_ERROR", frequency: "monthly", source: { ...source, status: "API_ERROR", lastObservationDate: null } }, "recovery-series", { now: new Date("2026-06-15T00:00:00Z"), storage: { filePath, env: { NODE_ENV: "test" }, list: listPublicObservations, upsert: upsertPublicObservations } });
  assert.deepEqual(recovered.history, [{ date: "2026-06-01", value: 99.5 }]);
  assert.equal(recovered.status, "FALLBACK");
  assert.match(recovered.source.note, /已保存的公開觀測/);
  await fs.promises.rm(filePath, { force: true });
  clearWriteQueue();
});

test("pressure calculation is deterministic, weighted, and explainable", () => {
  const reference = buildMachiningReference({
    referenceDate: "2026-03-28",
    components: completeComponents(),
    minimumEvidence: 3,
  });
  assert.equal(reference.compositePressureScore !== null, true);
  assert.equal(reference.pressureLevel, "ELEVATED");
  assert.equal(reference.trend, "STABLE");
  assert.equal(reference.dataQuality, "LIVE");
  assert.equal(reference.derivedMarketReference.layer, DATA_LAYERS.DERIVED_MARKET_REFERENCE);
  assert.deepEqual(reference.derivedMarketReference.weights, normalizeWeights(DEFAULT_WEIGHTS));
  assert.ok(reference.explanation.some((line) => line.includes("綜合分數")));
  assert.equal(validateMachiningReference(reference).length, 0);
});

test("weight configuration changes the deterministic composite result", () => {
  const rising = buildMachiningReference({ components: completeComponents(), minimumEvidence: 3, weights: { materialPressure: 0.9, energyPressure: 0.02, laborPressure: 0.02, fxPressure: 0.02, manufacturingPricePressure: 0.02, machineCapitalPressure: 0.02 } });
  const falling = buildMachiningReference({ components: completeComponents(), minimumEvidence: 3, weights: { materialPressure: 0.02, energyPressure: 0.02, laborPressure: 0.02, fxPressure: 0.9, manufacturingPricePressure: 0.02, machineCapitalPressure: 0.02 } });
  assert.notEqual(rising.compositePressureScore, falling.compositePressureScore);
  assert.equal(normalizeWeights({ ...DEFAULT_WEIGHTS, materialPressure: 0 }).materialPressure, 0);
  assert.throws(() => normalizeWeights({ materialPressure: -1, energyPressure: 1, laborPressure: 1, fxPressure: 1, manufacturingPricePressure: 1, machineCapitalPressure: 1 }), /non-negative/);
});

test("missing and stale inputs remain explicit and do not become fabricated prices", () => {
  const reference = buildMachiningReference({
    components: completeComponents({
      laborPressure: { label: "勞動壓力", observations: [observation("stale-labor", [100, 101, 102, 103, 104, 105, 106, 107], "STALE")], expectedEvidence: 1 },
      machineCapitalPressure: { label: "機械／資本成本代理", observations: [], expectedEvidence: 1, noDataReason: "沒有機械設備公開歷史" },
    }),
    minimumEvidence: 3,
  });
  assert.equal(reference.laborPressure.dataQuality, "STALE");
  assert.equal(reference.machineCapitalPressure.pressureScore, null);
  assert.equal(reference.machineCapitalPressure.dataQuality, "NO_DATA");
  assert.equal(reference.derivedMarketReference.availableComponents.includes("machineCapitalPressure"), false);
  assert.equal(reference.engineeringEstimate, null);
  assert.equal(reference.disclaimer.includes("非供應商報價"), true);
});

test("minimum-evidence guard returns no composite result", () => {
  const components = completeComponents({
    laborPressure: { label: "勞動壓力", observations: [], expectedEvidence: 1 },
    fxPressure: { label: "匯率壓力", observations: [], expectedEvidence: 1 },
    manufacturingPricePressure: { label: "製造價格壓力", observations: [], expectedEvidence: 1 },
    machineCapitalPressure: { label: "機械／資本成本代理", observations: [], expectedEvidence: 1 },
  });
  const reference = buildMachiningReference({ components, minimumEvidence: 3 });
  assert.equal(reference.compositePressureScore, null);
  assert.equal(reference.pressureLevel, null);
  assert.equal(reference.trend, null);
  assert.equal(reference.dataQuality, "DATA_INSUFFICIENT");
  assert.match(reference.explanation[0], /未產生綜合分數/);
});

test("provenance is retained and private/company fields are absent from the contract", () => {
  const reference = buildMachiningReference({ components: completeComponents(), minimumEvidence: 3 });
  const sourceIds = reference.sourceProvenance.map((source) => source.sourceId);
  assert.ok(sourceIds.includes("material-series"));
  assert.equal(reference.observedPublicData.every((item) => item.layer === DATA_LAYERS.OBSERVED_PUBLIC_DATA), true);
  const forbidden = /sap|supplier|company|inventory|targetprice|privatethreshold|laborrate|cyclerate|machinehours/i;
  const keys = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      visit(nested);
    }
  };
  visit(reference);
  assert.equal(keys.some((key) => forbidden.test(key)), false);
});

function captureResponse(url) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: null,
      headers: null,
      body: "",
      writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; },
      end(body = "") { this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); resolve(this); },
    };
    handleRequest({ method: "GET", url }, response).catch(reject);
  });
}

test("canonical machining aliases resolve safely and internal html path redirects", async () => {
  assert.equal(resolveStaticPath("/machining"), "/machining.html");
  assert.equal(resolveStaticPath("/machining/"), "/machining.html");
  const canonical = await captureResponse("/machining");
  const slash = await captureResponse("/machining/");
  const internal = await captureResponse("/machining.html");
  assert.equal(canonical.statusCode, 200);
  assert.match(canonical.headers["content-type"], /text\/html/);
  assert.match(canonical.body, /<title>加工市場參考/);
  assert.equal(slash.statusCode, 200);
  assert.match(slash.body, /data-site-nav/);
  assert.equal(internal.statusCode, 308);
  assert.equal(internal.headers.location, "/machining");
});

test("shared navigation exposes only active V1 pages and uses canonical machining href", () => {
  const nav = fs.readFileSync(path.join(__dirname, "..", "nav.js"), "utf8");
  const homepage = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const machining = fs.readFileSync(path.join(__dirname, "..", "machining.html"), "utf8");
  assert.match(nav, /label: "原物料市場", href: "\/"/);
  assert.match(nav, /label: "加工市場參考", href: "\/machining"/);
  assert.match(nav, /label: "鈑金市場參考", href: "\/sheet-metal"/);
  assert.match(nav, /label: "工程估算", href: "\/estimate"/);
  assert.doesNotMatch(nav, /Sheet Metal|Weekly|Sources|週報|來源/);
  assert.match(homepage, /data-site-nav/);
  assert.match(machining, /data-site-nav/);
  assert.doesNotMatch(homepage, /href="\/machining\.html"/);
  assert.doesNotMatch(machining, /href="\/machining\.html"/);
});

test("machining dashboard HTML contract contains public-only labels and API entrypoint", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "machining.html"), "utf8");
  assert.match(html, /加工市場參考/);
  assert.match(html, /公開市場參考/);
  assert.match(html, /非供應商報價/);
  assert.match(html, /非公司目標價格/);
  assert.match(html, /machining\.js/);
  assert.match(html, /machiningRefreshButton/);
});

test("machining API response contract wraps the reference without exposing private fields", () => {
  const reference = buildMachiningReference({ components: completeComponents(), minimumEvidence: 3 });
  const payload = buildPayload(reference, reference.sourceProvenance, "2026-03-28T00:00:00.000Z");
  assert.deepEqual(Object.keys(payload).sort(), ["disclaimer", "generatedAt", "reference", "sourceCoverage", "state"].sort());
  assert.equal(payload.reference, reference);
  assert.equal(payload.state, "LIVE");
  assert.equal(payload.generatedAt, "2026-03-28T00:00:00.000Z");
});
