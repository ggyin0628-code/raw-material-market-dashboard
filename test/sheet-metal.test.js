const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { DATA_LAYERS, MARKET_ROLES, normalizeProvenance } = require("../lib/sheetMetal/sheetMetalContract");
const { buildPayload } = require("../lib/sheetMetal/sheetMetalService");
const { DEFAULT_WEIGHTS, buildComponent, buildSheetMetalReference, normalizeWeights } = require("../lib/sheetMetal/pressureModel");
const { GLOBAL_SOURCE_CATALOG, getGlobalSheetMetalSources, getMoeaIndustrialBundle, freshnessStatus, parseFredCsv, parseMoeaIndustrialCsv, unavailableSource } = require("../lib/sheetMetal/sourceService");
const { buildMachiningReference } = require("../lib/machining/pressureModel");
const { handleRequest, resolveStaticPath } = require("../server");
const { clearWriteQueue, listPublicObservations, upsertPublicObservations } = require("../lib/machining/publicObservationStore");

const PUBLIC_SOURCE = {
  sourceName: "Synthetic public Taiwan index",
  url: "https://example.test/public-index",
  endpoint: "https://example.test/public-index",
  geographicScope: "Taiwan",
  marketScope: "Taiwan domestic public indicator",
  marketRole: "TAIWAN_DOMESTIC",
  pricingBasis: "Official/public indicator",
  currency: null,
  updateFrequency: "monthly",
  frequency: "monthly",
  unit: "index",
  accessConstraints: "Public fixture only",
};

function dailyHistory(values, start = "2026-01-01", stepDays = 7) {
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  return values.map((value, index) => ({
    date: new Date(startMs + index * stepDays * 86400000).toISOString().slice(0, 10),
    value,
  }));
}

function monthlyHistory(values, start = "2025-01-01") {
  return values.map((value, index) => {
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + index);
    return { date: date.toISOString().slice(0, 10), value };
  });
}

function observation(id, values, frequency = "daily", status = "LIVE", history = null) {
  return {
    id,
    label: id,
    history: history || (frequency === "monthly" ? monthlyHistory(values) : dailyHistory(values)),
    status,
    frequency,
    unit: "index",
    sourceProvenance: { ...PUBLIC_SOURCE, sourceId: id, status, frequency },
  };
}

function completeComponents(overrides = {}) {
  const daily = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
  const monthly = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118];
  const base = {
    materialPressure: { label: "材料壓力", observations: [observation("sheet-material-series", daily)], expectedEvidence: 1 },
    energyPressure: { label: "能源壓力", observations: [observation("sheet-energy-series", daily)], expectedEvidence: 1 },
    laborPressure: { label: "勞動壓力", observations: [observation("sheet-labor-series", monthly, "monthly")], expectedEvidence: 1 },
    fxPressure: { label: "匯率壓力", observations: [observation("sheet-fx-series", daily)], expectedEvidence: 1 },
    manufacturingPricePressure: { label: "製造價格壓力", observations: [observation("sheet-ppi-series", monthly, "monthly")], expectedEvidence: 1 },
    capacityDemandPressure: { label: "產能／需求熱度", observations: [observation("sheet-capacity-series", monthly, "monthly")], expectedEvidence: 1 },
  };
  return { ...base, ...overrides };
}

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

test("MOEA parser normalizes Taiwan ROC month and selects exact industry codes", () => {
  const csv = "\uFEFF統計項目,行業代碼,行業別,資料期(民國年),統計值(指數),計量單位\n生產指數,25,金屬製品製造業,11505,103.75,110年=100\n生產指數,24,基本金屬製造業,11505,84.29,110年=100\n生產指數,25,金屬製品製造業,11506,110.03,110年=100\n產銷存指標,25,金屬製品製造業,11506,999,未指定";
  assert.deepEqual(parseMoeaIndustrialCsv(csv, "25"), [
    { date: "2026-05-01", value: 103.75 },
    { date: "2026-06-01", value: 110.03 },
  ]);
  assert.deepEqual(parseMoeaIndustrialCsv(csv, "24"), [{ date: "2026-05-01", value: 84.29 }]);
});

test("FRED parser and audited global sources preserve monthly history and explicit roles", async () => {
  const csv = "observation_date,value\n2026-06-01,100\n2026-07-01,101.5\n2026-08-01,.";
  assert.deepEqual(parseFredCsv(csv), [
    { date: "2026-06-01", value: 100 },
    { date: "2026-07-01", value: 101.5 },
  ]);
  const global = await getGlobalSheetMetalSources({ now: new Date("2026-08-23T00:00:00Z"), fetcher: async (url) => {
    assert.match(url, /^https:\/\/fred\.stlouisfed\.org\/graph\/fredgraph\.csv/);
    return csv;
  }});
  assert.equal(global.coldRolledSteel.status, "LIVE");
  assert.equal(global.coldRolledSteel.frequency, "monthly");
  assert.equal(global.coldRolledSteel.source.marketRole, "GLOBAL_IMPORT_REFERENCE");
  assert.equal(global.coldRolledSteel.source.marketScope, "International import-market reference");
  assert.equal(global.stainlessSteel.source.marketRole, "GLOBAL_IMPORT_REFERENCE");
  assert.equal(global.nickel.source.marketRole, "GLOBAL_INPUT_PROXY");
  assert.equal(global.nickel.source.currency, "USD");
  assert.equal(global.coldRolledSteel.source.participatesInScoring, true);
  assert.equal(global.stainlessSteel.source.participatesInScoring, false);
  assert.match(global.stainlessSteel.source.scoringReason, /pipe\/tube/);
  assert.equal(global.nickel.source.participatesInScoring, true);
  assert.notEqual(global.nickel.source.pricingBasis, global.stainlessSteel.source.pricingBasis);
  const fallback = await getGlobalSheetMetalSources({ now: new Date("2026-08-23T00:00:00Z"), fetcher: async () => { throw new Error("network down"); } });
  assert.equal(fallback.coldRolledSteel.status, "API_ERROR");
  assert.equal(fallback.coldRolledSteel.history.length, 0);
  assert.match(fallback.coldRolledSteel.source.note, /不補入虛構值/);
  assert.deepEqual(normalizeProvenance({ sourceId: "structural", marketRole: "STRUCTURAL", marketScope: "Taiwan domestic structural information", pricingBasis: "tariff schedule", currency: "TWD", status: "LIVE" }), {
    sourceId: "structural",
    sourceName: "未命名公開來源",
    url: "",
    endpoint: "",
    geographicScope: "Taiwan",
    marketScope: "Taiwan domestic structural information",
    marketRole: "STRUCTURAL",
    pricingBasis: "tariff schedule",
    currency: "TWD",
    updateFrequency: "未確認",
    unit: "未指定",
    accessConstraints: "公開存取；可用性與發布內容可能變更",
    status: "LIVE",
    lastObservationDate: null,
    observationDate: null,
    frequency: "unknown",
    fetchedAt: null,
    layer: DATA_LAYERS.OBSERVED_PUBLIC_DATA,
    note: "",
    participatesInScoring: true,
    scoringReason: "",
  });
  assert.deepEqual(Object.values(GLOBAL_SOURCE_CATALOG).map((source) => source.marketRole), ["GLOBAL_IMPORT_REFERENCE", "GLOBAL_IMPORT_REFERENCE", "GLOBAL_INPUT_PROXY"]);
  assert.deepEqual(MARKET_ROLES, ["TAIWAN_DOMESTIC", "GLOBAL_IMPORT_REFERENCE", "GLOBAL_INPUT_PROXY", "STRUCTURAL"]);
});

test("stainless pipe/tube is provenance-only while cold-rolled and nickel remain scoring-eligible", () => {
  const stainlessGap = unavailableSource("tw-sheet-metal-stainless-steel-proxy", "Taiwan stainless-sheet domestic gap", "Taiwan stainless sheet remains NO_DATA.");
  assert.equal(stainlessGap.status, "NO_DATA");
  assert.equal(stainlessGap.marketRole, "TAIWAN_DOMESTIC");
  assert.equal(stainlessGap.participatesInScoring, false);
  assert.match(stainlessGap.note, /NO_DATA|Taiwan stainless/);
  assert.equal(GLOBAL_SOURCE_CATALOG.stainlessSteel.marketRole, "GLOBAL_IMPORT_REFERENCE");
  assert.equal(GLOBAL_SOURCE_CATALOG.stainlessSteel.participatesInScoring, false);
  assert.match(GLOBAL_SOURCE_CATALOG.stainlessSteel.scoringReason, /Product scope mismatch/);
  assert.equal(GLOBAL_SOURCE_CATALOG.nickel.marketRole, "GLOBAL_INPUT_PROXY");
  assert.equal(GLOBAL_SOURCE_CATALOG.nickel.participatesInScoring, true);
  assert.equal(GLOBAL_SOURCE_CATALOG.coldRolledSteel.marketRole, "GLOBAL_IMPORT_REFERENCE");
  assert.equal(GLOBAL_SOURCE_CATALOG.coldRolledSteel.participatesInScoring, true);
  for (const source of Object.values(GLOBAL_SOURCE_CATALOG)) assert.notEqual(source.marketRole, "TAIWAN_DOMESTIC");

  const scored = (id, values, role, participatesInScoring, scoringReason = "") => ({
    ...observation(id, values, "monthly"),
    sourceProvenance: { ...PUBLIC_SOURCE, sourceId: id, marketScope: role === "GLOBAL_INPUT_PROXY" ? "Global upstream input-cost proxy" : "International import-market reference", marketRole: role, pricingBasis: "Public international indicator", currency: "USD", participatesInScoring, scoringReason },
  });
  const coldRolled = scored("cold-rolled", [100, 101, 102, 103, 104, 105], "GLOBAL_IMPORT_REFERENCE", true, "eligible cold-rolled sheet/strip reference");
  const nickel = scored("nickel", [100, 101, 102, 103, 104, 105], "GLOBAL_INPUT_PROXY", true, "upstream nickel input proxy");
  const stainlessPipe = scored("stainless-pipe-tube", [100, 300, 500, 700, 900, 1100], "GLOBAL_IMPORT_REFERENCE", false, "Product scope mismatch: stainless pipe/tube is retained only as external stainless-market context, not sheet-metal price evidence.");
  const withoutPipe = buildComponent({ id: "materialPressure", label: "材料壓力", expectedEvidence: 2, observations: [coldRolled, nickel] });
  const withPipe = buildComponent({ id: "materialPressure", label: "材料壓力", expectedEvidence: 2, observations: [coldRolled, nickel, stainlessPipe] });
  assert.equal(withPipe.evidenceCount, withoutPipe.evidenceCount);
  assert.equal(withPipe.pressureScore, withoutPipe.pressureScore);
  assert.equal(withPipe.sourceProvenance.find((source) => source.sourceId === "stainless-pipe-tube").participatesInScoring, false);
  assert.equal(withPipe.observedValues.some((item) => item.seriesId === "stainless-pipe-tube"), false);
  assert.ok(withPipe.explanation.some((line) => line.includes("排除計分") && line.includes("pipe/tube")));
  const reference = buildSheetMetalReference({ components: completeComponents({ materialPressure: { label: "材料壓力", expectedEvidence: 2, observations: [coldRolled, nickel, stainlessPipe] } }) });
  assert.equal(reference.sourceProvenance.find((source) => source.sourceId === "stainless-pipe-tube").participatesInScoring, false);
  assert.equal(reference.scoringSourceRoleSummary.GLOBAL_IMPORT_REFERENCE, 1);
  assert.equal(reference.scoringSourceRoleSummary.GLOBAL_INPUT_PROXY, 1);
  assert.equal(reference.scoringSourceRoleSummary.TAIWAN_DOMESTIC, 5);
  assert.equal(reference.derivedMarketReference.scoringSourceRoleSummary.GLOBAL_IMPORT_REFERENCE, 1);
  assert.equal(reference.derivedMarketReference.scoringSourceRoleSummary.GLOBAL_INPUT_PROXY, 1);
  assert.equal(reference.derivedMarketReference.scoringSourceRoleSummary.TAIWAN_DOMESTIC, 5);
});

test("MOEA source failure is explicit and persisted public history recovers as FALLBACK", async () => {
  const bundle = await getMoeaIndustrialBundle({ now: new Date("2026-08-23T00:00:00Z"), fetcher: async () => "invalid" });
  assert.equal(bundle.fabricatedMetal.status, "API_ERROR");
  assert.equal(bundle.fabricatedMetal.history.length, 0);
  const filePath = path.join(__dirname, "fixtures", "sheet-metal-observations-test.json");
  await fsp.rm(filePath, { force: true });
  const source = { ...PUBLIC_SOURCE, sourceId: "tw-moea-ipi-fabricated-metal", status: "LIVE", lastObservationDate: "2026-06-01", fetchedAt: "2026-06-01T00:00:00.000Z" };
  await upsertPublicObservations({ sourceId: source.sourceId, seriesId: "sheet-metal:moea:fabricatedMetal", date: "2026-06-01", value: 110.03, status: "LIVE", frequency: "monthly", sourceUrl: source.endpoint, fetchedAt: source.fetchedAt, provenance: source }, { filePath, env: { NODE_ENV: "test" } });
  const { recoverWithPersistence } = require("../lib/machining/sourceService");
  const recovered = await recoverWithPersistence(bundle.fabricatedMetal, "sheet-metal:moea:fabricatedMetal", { now: new Date("2026-06-15T00:00:00Z"), storage: { filePath, env: { NODE_ENV: "test" }, list: listPublicObservations, upsert: upsertPublicObservations } });
  assert.deepEqual(recovered.history, [{ date: "2026-06-01", value: 110.03 }]);
  assert.equal(recovered.status, "FALLBACK");
  assert.match(recovered.source.note, /已保存的公開觀測/);
  await fsp.rm(filePath, { force: true });
  clearWriteQueue();
});

test("MOEA freshness is date-based and explicit", () => {
  assert.equal(freshnessStatus("2026-08-01", new Date("2026-08-23T00:00:00Z"), 95), "LIVE");
  assert.equal(freshnessStatus("2026-04-01", new Date("2026-08-23T00:00:00Z"), 95), "STALE");
});

test("sheet-metal model uses daily/monthly windows and never gives structural data momentum", () => {
  const daily = buildComponent({ id: "materialPressure", label: "材料", observations: [observation("daily", [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128])] });
  const monthly = buildComponent({ id: "capacityDemandPressure", label: "產能", observations: [observation("monthly", [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118], "monthly")] });
  const structural = buildComponent({ id: "energyPressure", label: "結構電價", observations: [{ ...observation("tariff", [100], "structural"), history: [], value: null, status: "LIVE", frequency: "structural" }] });
  assert.ok(daily.comparisonWindows.some((item) => item.key === "twelveWeek"));
  assert.equal(daily.comparisonWindows.some((item) => item.key === "threeMonth"), false);
  assert.ok(monthly.comparisonWindows.some((item) => item.key === "threeMonth"));
  assert.equal(monthly.comparisonWindows.some((item) => item.key === "twelveWeek"), false);
  assert.equal(structural.pressureScore, null);
  assert.equal(structural.comparisonWindows.length, 0);
});

test("sheet-metal score is configurable, explainable, and guarded at minimum three evidence components", () => {
  const reference = buildSheetMetalReference({ referenceDate: "2026-08-23", components: completeComponents(), minimumEvidence: 3 });
  assert.equal(reference.processFamily, "SHEET_METAL");
  assert.notEqual(reference.compositePressureScore, null);
  assert.equal(reference.derivedMarketReference.minimumEvidence, 3);
  assert.ok(reference.derivedMarketReference.evidenceCount >= 3);
  assert.equal(reference.engineeringEstimate, null);
  assert.equal(reference.sourceRoleSummary.TAIWAN_DOMESTIC, 6);
  assert.equal(reference.derivedMarketReference.sourceRoleSummary.TAIWAN_DOMESTIC, 6);
  assert.equal(reference.derivedMarketReference.layer, DATA_LAYERS.DERIVED_MARKET_REFERENCE);
  assert.deepEqual(reference.derivedMarketReference.weights, normalizeWeights(DEFAULT_WEIGHTS));
  assert.ok(reference.explanation.some((line) => line.includes("綜合分數")));
  const materialHeavy = buildSheetMetalReference({ components: completeComponents(), weights: { materialPressure: 0.9, energyPressure: 0.02, laborPressure: 0.02, fxPressure: 0.02, manufacturingPricePressure: 0.02, capacityDemandPressure: 0.02 } });
  const capacityHeavy = buildSheetMetalReference({ components: completeComponents(), weights: { materialPressure: 0.02, energyPressure: 0.02, laborPressure: 0.02, fxPressure: 0.02, manufacturingPricePressure: 0.02, capacityDemandPressure: 0.9 } });
  assert.notEqual(materialHeavy.compositePressureScore, capacityHeavy.compositePressureScore);
  const insufficient = buildSheetMetalReference({ components: completeComponents({ laborPressure: { label: "勞動", observations: [] }, fxPressure: { label: "匯率", observations: [] }, manufacturingPricePressure: { label: "製造價格", observations: [] }, capacityDemandPressure: { label: "產能", observations: [] } }), minimumEvidence: 3 });
  assert.equal(insufficient.compositePressureScore, null);
  assert.equal(insufficient.pressureLevel, null);
  assert.equal(insufficient.trend, null);
  assert.equal(insufficient.dataQuality, "DATA_INSUFFICIENT");
});

test("sheet-metal contract preserves public provenance and excludes private/company fields", () => {
  const reference = buildSheetMetalReference({ components: completeComponents() });
  assert.ok(reference.sourceProvenance.every((source) => source.layer === DATA_LAYERS.OBSERVED_PUBLIC_DATA));
  assert.ok(reference.sourceProvenance.some((source) => source.frequency === "monthly"));
  const keys = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) { keys.push(key); visit(nested); }
  };
  visit(reference);
  assert.equal(keys.some((key) => /sap|supplier|company|inventory|targetprice|privatethreshold|laborrate|cyclerate|machinehours|hourlyprice/i.test(key)), false);
  assert.equal(JSON.stringify(reference).includes("供應商報價"), true);
  assert.equal(JSON.stringify(reference).includes("company target price"), false);
  const mixed = buildSheetMetalReference({ components: completeComponents({ materialPressure: { label: "材料壓力", expectedEvidence: 2, observations: [
    observation("taiwan-domestic", [100, 101, 102, 103, 104, 105, 106, 107]),
    { ...observation("import-reference", [100, 102, 104, 106, 108, 110, 112, 114], "weekly"), sourceProvenance: { ...PUBLIC_SOURCE, sourceId: "import-reference", marketScope: "International import-market reference", marketRole: "GLOBAL_IMPORT_REFERENCE", pricingBasis: "Public import-market index", currency: "USD" } },
    { ...observation("nickel-proxy", [100, 101, 102, 103, 104, 105, 106, 107], "weekly"), sourceProvenance: { ...PUBLIC_SOURCE, sourceId: "nickel-proxy", marketScope: "Global upstream input-cost proxy", marketRole: "GLOBAL_INPUT_PROXY", pricingBasis: "Global benchmark input", currency: "USD" } },
  ] } }) });
  assert.equal(mixed.sourceRoleSummary.TAIWAN_DOMESTIC, 6);
  assert.equal(mixed.sourceRoleSummary.GLOBAL_IMPORT_REFERENCE, 1);
  assert.equal(mixed.sourceRoleSummary.GLOBAL_INPUT_PROXY, 1);
  assert.ok(mixed.explanation.some((line) => line.includes("國際／進口市場參考")));
  assert.ok(mixed.explanation.some((line) => line.includes("全球上游投入代理")));
  assert.ok(mixed.observedPublicData.some((item) => item.marketRole === "GLOBAL_IMPORT_REFERENCE"));
});

test("sheet-metal routes are canonical and independent from machining", async () => {
  assert.equal(resolveStaticPath("/sheet-metal"), "/sheet-metal.html");
  assert.equal(resolveStaticPath("/sheet-metal/"), "/sheet-metal.html");
  const canonical = await captureResponse("/sheet-metal");
  const slash = await captureResponse("/sheet-metal/");
  const internal = await captureResponse("/sheet-metal.html");
  assert.equal(canonical.statusCode, 200);
  assert.match(canonical.body, /<title>鈑金市場參考/);
  assert.match(canonical.body, /data-site-nav/);
  assert.equal(slash.statusCode, 200);
  assert.equal(internal.statusCode, 308);
  assert.equal(internal.headers.location, "/sheet-metal");
  assert.equal(resolveStaticPath("/machining"), "/machining.html");
  const machining = await captureResponse("/machining");
  assert.equal(machining.statusCode, 200);
  assert.match(machining.body, /<title>加工市場參考/);
  assert.doesNotMatch(machining.body, /鈑金市場參考/);
});

test("shared navigation exposes only the three real V1 pages", () => {
  const nav = fs.readFileSync(path.join(__dirname, "..", "nav.js"), "utf8");
  const homepage = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const machining = fs.readFileSync(path.join(__dirname, "..", "machining.html"), "utf8");
  const sheetMetal = fs.readFileSync(path.join(__dirname, "..", "sheet-metal.html"), "utf8");
  assert.match(nav, /label: "原物料市場", href: "\/"/);
  assert.match(nav, /label: "加工市場參考", href: "\/machining"/);
  assert.match(nav, /label: "鈑金市場參考", href: "\/sheet-metal"/);
  assert.match(nav, /label: "工程估算", href: "\/estimate"/);
  assert.doesNotMatch(nav, /Sheet Metal|Weekly|Sources|鈑金（未完成）/);
  assert.match(homepage, /data-site-nav/);
  assert.match(machining, /data-site-nav/);
  assert.match(sheetMetal, /data-site-nav/);
});

test("sheet-metal page and API contract contain required public-only labels and dimensions", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "sheet-metal.html"), "utf8");
  const client = fs.readFileSync(path.join(__dirname, "..", "sheet-metal.js"), "utf8");
  assert.match(html, /公開市場參考/);
  assert.match(html, /非供應商報價/);
  assert.match(html, /非公司目標價格/);
  assert.match(html, /材料/);
  assert.match(html, /鈑金/);
  assert.match(html, /sheet-metal\.js/);
  assert.match(html, /viewport/);
  assert.match(html, /@media\(max-width:620px\)/);
  assert.match(html, /產能／需求熱度/);
  assert.match(html, /國際進口市場參考/);
  assert.match(html, /上游投入代理/);
  assert.match(html, /market role/);
  assert.match(client, /GLOBAL_IMPORT_REFERENCE/);
  assert.match(client, /GLOBAL_INPUT_PROXY/);
  assert.match(client, /pricingBasis/);
  assert.match(client, /participatesInScoring/);
  assert.match(client, /僅供來源沿革／不計分/);
  assert.match(client, /scoringReason/);
  assert.match(html, /公開鈑金加工金額參考/);
  assert.match(html, /成本趨勢輔助/);
  assert.match(html, /前往工程估算/);
  assert.ok(html.indexOf('class="sheet-metal-panel public-price-panel"') < html.indexOf('class="sheet-metal-summary"'));
  assert.ok(html.indexOf('class="sheet-metal-summary"') < html.indexOf('aria-label="成本趨勢輔助"'));
  assert.match(client, /NO_PUBLIC_PRICE_DATA/);
  assert.match(client, /smallHoleFee/);
  const reference = buildSheetMetalReference({ components: completeComponents() });
  const payload = buildPayload(reference, reference.sourceProvenance, "2026-08-23T00:00:00.000Z");
  assert.deepEqual(Object.keys(payload).sort(), ["disclaimer", "generatedAt", "publicPriceReferences", "reference", "sourceCoverage", "state"].sort());
  assert.ok(payload.publicPriceReferences.some((item) => item.machineType === "LASER_CUTTING" && item.material === "BLACK_STEEL" && item.unit === "TWD/m"));
  assert.ok(payload.publicPriceReferences.some((item) => item.machineType === "BENDING" && item.sourceRole === "NO_PUBLIC_PRICE_DATA"));
  assert.ok(payload.publicPriceReferences.some((item) => item.machineType === "WELDING_TIG" && item.sourceRole === "NO_PUBLIC_PRICE_DATA"));
  assert.equal(payload.reference.processFamily, "SHEET_METAL");
  assert.equal(payload.reference.engineeringEstimate, null);
  assert.equal(payload.reference.sourceRoleSummary.TAIWAN_DOMESTIC, 6);
  assert.equal(payload.generatedAt, "2026-08-23T00:00:00.000Z");
});

test("existing machining model remains independently constructible", () => {
  const reference = buildMachiningReference({
    components: {
      materialPressure: { observations: [observation("machining-material", [100, 101, 102, 103, 104, 105, 106, 107])] },
      energyPressure: { observations: [observation("machining-energy", [100, 100, 100, 100, 101, 101, 101, 101])] },
      laborPressure: { observations: [observation("machining-labor", [100, 100, 100, 100, 100, 100, 100, 100])] },
      fxPressure: { observations: [observation("machining-fx", [100, 99, 98, 97, 96, 95, 94, 93])] },
      manufacturingPricePressure: { observations: [observation("machining-ppi", [100, 101, 100, 101, 100, 101, 100, 101])] },
      machineCapitalPressure: { observations: [observation("machining-machine", [100, 100, 100, 100, 100, 100, 100, 100])] },
    },
    minimumEvidence: 3,
  });
  assert.notEqual(reference.compositePressureScore, null);
  assert.equal(reference.engineeringEstimate, null);
});
