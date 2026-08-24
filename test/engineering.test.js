const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateEngineeringInput } = require("../lib/engineering/engineeringEstimator");
const { getEngineeringEstimateSchema } = require("../lib/engineering/engineeringContract");
const { createEngineeringEstimateResponse, createEngineeringSchemaResponse } = require("../lib/engineering/engineeringService");
const { handleRequest, resolveStaticPath } = require("../server");

const BASE_INPUT = {
  processFamily: "SHEET_METAL",
  material: { materialFamily: "CARBON_STEEL", grade: null, thicknessMm: 2, densityKgM3: 7850 },
  blank: { lengthMm: 500, widthMm: 300, quantity: 100 },
  cutting: { enabled: true, cutLengthMmPerPart: 1450, pierceCountPerPart: 8 },
  bending: { enabled: true, bendCountPerPart: 4 },
  welding: { enabled: false, weldLengthMmPerPart: 0 },
  surfaceTreatment: { enabled: false, treatmentType: null, treatedAreaMm2PerPart: 0 },
  setup: { batchCount: 1 },
};

function input(overrides = {}) {
  return {
    ...BASE_INPUT,
    ...overrides,
    material: { ...BASE_INPUT.material, ...(overrides.material || {}) },
    blank: { ...BASE_INPUT.blank, ...(overrides.blank || {}) },
    cutting: { ...BASE_INPUT.cutting, ...(overrides.cutting || {}) },
    bending: { ...BASE_INPUT.bending, ...(overrides.bending || {}) },
    welding: { ...BASE_INPUT.welding, ...(overrides.welding || {}) },
    surfaceTreatment: { ...BASE_INPUT.surfaceTreatment, ...(overrides.surfaceTreatment || {}) },
    setup: { ...BASE_INPUT.setup, ...(overrides.setup || {}) },
  };
}

function responseRecorder() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; },
    end(body = "") { this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); this.done?.(this); },
  };
}
function capture(method, url, body = null, headers = {}, runtimeEnv = process.env) {
  return new Promise((resolve, reject) => {
    const response = responseRecorder();
    response.done = resolve;
    const request = new EventEmitter();
    request.method = method;
    request.url = url;
    request.headers = headers;
    handleRequest(request, response, runtimeEnv).catch(reject);
    if (method === "POST") process.nextTick(() => { if (body !== null) request.emit("data", Buffer.from(body)); request.emit("end"); });
  });
}
function parse(response) { return JSON.parse(response.body); }

function allCostsNull(costs) {
  return ["materialCost", "cuttingCost", "piercingCost", "bendingCost", "weldingCost", "surfaceTreatmentCost", "setupCost", "totalEstimatedCost", "estimatedCostPerPart", "currency"].every((key) => costs[key] === null);
}

test("engineering formulas calculate area, volume, mass and kg/m³ conversion deterministically", () => {
  const result = estimateEngineeringInput(input());
  assert.equal(result.processFamily, "SHEET_METAL");
  assert.equal(result.physical.blankAreaMm2, 150000);
  assert.equal(result.physical.blankVolumeMm3, 300000);
  assert.equal(result.physical.blankMassKgPerPart, 2.355);
  assert.equal(result.physical.theoreticalTotalBlankMassKg, 235.5);
  assert.equal(result.physical.totalMaterialMassKg, 235.5);
  assert.equal(result.physical.densitySource, "USER_INPUT");
  assert.equal(result.workload.totalCutLengthM, 145);
  assert.equal(result.workload.totalPierceCount, 800);
  assert.equal(result.workload.totalBendCount, 400);
  assert.equal(result.workload.totalWeldLengthM, 0);
  assert.equal(result.workload.totalTreatedAreaM2, 0);
  assert.equal(result.workload.batchCount, 1);
  assert.equal(result.workload.quantityPerBatch, 100);
  assert.equal(result.costBreakdown.totalEstimatedCost, null);
});

test("default density, override density and explicit utilization/scrap semantics are visible", () => {
  const defaultDensity = estimateEngineeringInput(input({ material: { densityKgM3: undefined } }));
  assert.equal(defaultDensity.physical.densityKgM3, 7850);
  assert.equal(defaultDensity.physical.densitySource, "ENGINEERING_DEFAULT");
  assert.equal(defaultDensity.physical.materialUtilizationPct, null);
  assert.equal(defaultDensity.physical.totalMaterialMassKg, defaultDensity.physical.theoreticalTotalBlankMassKg);
  assert.match(defaultDensity.warnings.join(" "), /ENGINEERING_DEFAULT/);
  assert.match(defaultDensity.warnings.join(" "), /未提供 materialUtilizationPct 或 scrapPct/);
  const overrideDensity = estimateEngineeringInput(input({ material: { densityKgM3: 8000 } }));
  assert.equal(overrideDensity.physical.blankMassKgPerPart, 2.4);
  const utilization = estimateEngineeringInput(input({ materialUtilizationPct: 80 }));
  assert.equal(utilization.physical.totalMaterialMassKg, 294.375);
  assert.equal(utilization.physical.materialUtilizationPct, 80);
  const scrap = estimateEngineeringInput(input({ scrapPct: 20 }));
  assert.equal(scrap.physical.totalMaterialMassKg, 294.375);
  assert.equal(scrap.physical.scrapPct, 20);
});

test("workload quantities honor enabled process flags and unit conversions", () => {
  const result = estimateEngineeringInput(input({
    cutting: { enabled: false, cutLengthMmPerPart: 999, pierceCountPerPart: 999 },
    bending: { enabled: false, bendCountPerPart: 999 },
    welding: { enabled: true, weldLengthMmPerPart: 250.5 },
    surfaceTreatment: { enabled: true, treatmentType: "噴塗", treatedAreaMm2PerPart: 20000 },
    blank: { quantity: 3 },
    setup: { batchCount: 2 },
  }));
  assert.equal(result.workload.totalCutLengthM, 0);
  assert.equal(result.workload.totalPierceCount, 0);
  assert.equal(result.workload.totalBendCount, 0);
  assert.equal(result.workload.weldLengthMPerPart, 0.2505);
  assert.equal(result.workload.totalWeldLengthM, 0.7515);
  assert.equal(result.workload.treatedAreaM2PerPart, 0.02);
  assert.equal(result.workload.totalTreatedAreaM2, 0.06);
  assert.equal(result.workload.quantityPerBatch, 1.5);
});

test("NO_RATE keeps every monetary output null and synthetic test costs are deterministic and visibly non-production", () => {
  const noRate = estimateEngineeringInput(input());
  assert.equal(noRate.rateProfile.mode, "NO_RATE");
  assert.equal(noRate.rateProfile.source, "NO_RATE / 未載入公司成本參數");
  assert.equal(allCostsNull(noRate.costBreakdown), true);
  assert.match(noRate.warnings.join(" "), /尚未設定成本參數/);
  const syntheticInput = input({
    welding: { enabled: true, weldLengthMmPerPart: 100 },
    surfaceTreatment: { enabled: true, treatmentType: "DEMO", treatedAreaMm2PerPart: 1000 },
    rateProfile: {
      rateProfileId: "deterministic-fixture",
      mode: "SYNTHETIC_TEST",
      materialRatePerKg: 2,
      cuttingRatePerM: 3,
      pierceRateEach: 1,
      bendRateEach: 0.5,
      weldingRatePerM: 4,
      surfaceTreatmentRatePerM2: 5,
      setupRatePerBatch: 100,
    },
  });
  const first = estimateEngineeringInput(syntheticInput);
  const second = estimateEngineeringInput(syntheticInput);
  assert.deepEqual(first.costBreakdown, second.costBreakdown);
  assert.equal(first.rateProfile.mode, "SYNTHETIC_TEST");
  assert.equal(first.costBreakdown.totalEstimatedCost, 2046.5);
  assert.equal(first.costBreakdown.estimatedCostPerPart, 20.465);
  assert.match(first.warnings.join(" "), /SYNTHETIC \/ DEMO \/ TEST ONLY/);
  assert.equal(first.marketReference, null);
  assert.equal(first.marketAdjustmentFactor, null);
});

test("formula trace covers calculations, units and explicit inputs", () => {
  const result = estimateEngineeringInput(input({ material: { grade: "A36" } }));
  const fields = result.formulaTrace.map((entry) => entry.field);
  assert.deepEqual(fields, ["blankAreaMm2", "blankVolumeMm3", "blankMassKgPerPart", "totalMaterialMassKg", "totalCutLengthM", "totalPierceCount", "totalBendCount", "totalWeldLengthM", "totalTreatedAreaM2", "quantityPerBatch"]);
  const massTrace = result.formulaTrace.find((entry) => entry.field === "blankMassKgPerPart");
  assert.match(massTrace.formula, /densityKgM3/);
  assert.equal(massTrace.unit, "kg/part");
  assert.match(massTrace.unitConversion, /10⁹/);
  assert.equal(massTrace.inputs.thicknessMm, undefined);
  assert.equal(result.disclaimer.includes("非供應商報價"), true);
});

test("strict validation rejects missing, invalid, ambiguous and unexpected inputs with structured errors", () => {
  const bad = input({
    material: { thicknessMm: 0, densityKgM3: -1 },
    blank: { lengthMm: -1, quantity: 0, unexpected: true },
    cutting: { enabled: true, cutLengthMmPerPart: -1, pierceCountPerPart: -1 },
    bending: { enabled: true, bendCountPerPart: -1 },
    welding: { enabled: true, weldLengthMmPerPart: -1 },
    surfaceTreatment: { enabled: true, treatedAreaMm2PerPart: -1 },
    setup: { batchCount: 2 },
    unexpectedTop: true,
  });
  assert.throws(() => estimateEngineeringInput(bad), (error) => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.ok(error.errors.some((item) => item.code === "UNEXPECTED_FIELD"));
    assert.ok(error.errors.some((item) => item.code === "OUT_OF_RANGE"));
    return true;
  });
  assert.throws(() => estimateEngineeringInput(input({ processFamily: "MACHINING" })), /輸入驗證失敗/);
  assert.throws(() => estimateEngineeringInput(input({ material: { materialFamily: "OTHER", densityKgM3: undefined } })), /輸入驗證失敗/);
  const missingEnabledWorkload = input();
  delete missingEnabledWorkload.cutting.cutLengthMmPerPart;
  assert.throws(() => estimateEngineeringInput(missingEnabledWorkload), /輸入驗證失敗/);
  assert.throws(() => estimateEngineeringInput(input({ rateProfile: { mode: "PRIVATE_CALIBRATED" } })), /輸入驗證失敗/);
  assert.throws(() => estimateEngineeringInput(input({ materialUtilizationPct: 80, scrapPct: 20 })), /輸入驗證失敗/);
});

test("schema and canonical estimate routes are independent and contract-safe", async () => {
  assert.equal(resolveStaticPath("/estimate"), "/estimate.html");
  assert.equal(resolveStaticPath("/estimate/"), "/estimate.html");
  const page = await capture("GET", "/estimate");
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /工程估算/);
  assert.match(page.body, /瀏覽器內計算/);
  assert.match(page.body, /內部成本資料僅在目前瀏覽器頁面中計算/);
  const alias = await capture("GET", "/estimate/");
  assert.equal(alias.statusCode, 200);
  const legacy = await capture("GET", "/estimate.html");
  assert.equal(legacy.statusCode, 308);
  assert.equal(legacy.headers.location, "/estimate");
  const schema = await capture("GET", "/api/engineering/estimate/schema");
  assert.equal(schema.statusCode, 200);
  const schemaPayload = parse(schema);
  assert.equal(schemaPayload.state, "OK");
  assert.deepEqual(schemaPayload.schema.processFamily.allowed, ["SHEET_METAL"]);
  assert.equal(schemaPayload.schema.output.marketAdjustmentFactor, null);
});

test("standalone calculator remains a local file artifact and public /standalone namespace is fail-closed", async () => {
  const artifactPath = path.join(__dirname, "..", "standalone", "InternalEngineeringCostCalculator.html");
  assert.equal(fs.statSync(artifactPath).isFile(), true);
  const artifact = fs.readFileSync(artifactPath, "utf8");
  assert.match(artifact, /<html lang="zh-Hant">/);
  assert.match(artifact, /內部工程成本估算/);
  assert.match(new URL(`file://${artifactPath}`).protocol, /^file:$/);
  assert.doesNotMatch(artifact, /<script\s+[^>]*src=/i);
  assert.doesNotMatch(artifact, /https?:\/\//i);

  for (const pathname of ["/standalone", "/standalone/", "/standalone/InternalEngineeringCostCalculator.html", "/standalone/test.html", "//standalone/InternalEngineeringCostCalculator.html", "/%2Fstandalone%2FInternalEngineeringCostCalculator.html"]) {
    const response = await capture("GET", pathname);
    assert.equal(response.statusCode, 404, pathname);
    assert.equal(response.body, "Not found");
    assert.doesNotMatch(response.body, /內部工程成本估算|TEST_ONLY|materialRatePerKg/);
  }

  for (const pathname of ["/", "/machining", "/sheet-metal", "/estimate"]) {
    const response = await capture("GET", pathname);
    assert.equal(response.statusCode, 200, pathname);
  }
  for (const pathname of ["/styles.css", "/app.js", "/nav.js", "/machining.js", "/sheet-metal.js", "/estimate.js"]) {
    const response = await capture("GET", pathname);
    assert.equal(response.statusCode, 200, pathname);
  }
  const nav = fs.readFileSync(path.join(__dirname, "..", "nav.js"), "utf8");
  assert.doesNotMatch(nav, /InternalEngineeringCostCalculator|standalone\//i);
});

test("POST estimate API returns physical/workload result and structured validation without market coupling", async () => {
  const good = await capture("POST", "/api/engineering/estimate", JSON.stringify(input()), { "content-type": "application/json" });
  assert.equal(good.statusCode, 200);
  const payload = parse(good);
  assert.equal(payload.state, "OK");
  assert.equal(payload.estimate.processFamily, "SHEET_METAL");
  assert.equal(payload.estimate.physical.totalMaterialMassKg, 235.5);
  assert.equal(payload.estimate.workload.totalCutLengthM, 145);
  assert.equal(payload.estimate.rateProfile.mode, "NO_RATE");
  assert.equal(payload.estimate.marketReference, null);
  assert.equal(payload.estimate.marketAdjustmentFactor, null);
  const bad = await capture("POST", "/api/engineering/estimate", JSON.stringify({ ...input(), blank: { ...input().blank, lengthMm: 0 } }), { "content-type": "application/json" });
  assert.equal(bad.statusCode, 400);
  assert.equal(parse(bad).state, "VALIDATION_ERROR");
  assert.ok(parse(bad).errors.some((item) => item.path === "input.blank.lengthMm"));
  const mediaType = await capture("POST", "/api/engineering/estimate", "{}", { "content-type": "text/plain" });
  assert.equal(mediaType.statusCode, 415);
});

test("production HTTP rejects synthetic rates while retaining NO_RATE, omitted profile and non-production synthetic support", async () => {
  const production = { NODE_ENV: "production" };
  const synthetic = input({
    rateProfile: {
      rateProfileId: "production-guard-fixture",
      mode: "SYNTHETIC_TEST",
      materialRatePerKg: 2,
      cuttingRatePerM: 3,
      pierceRateEach: 1,
      bendRateEach: 0.5,
      weldingRatePerM: 4,
      surfaceTreatmentRatePerM2: 5,
      setupRatePerBatch: 100,
    },
  });
  const rejected = await capture("POST", "/api/engineering/estimate", JSON.stringify(synthetic), { "content-type": "application/json" }, production);
  assert.equal(rejected.statusCode, 400);
  const rejectedPayload = parse(rejected);
  assert.equal(rejectedPayload.state, "VALIDATION_ERROR");
  assert.equal(rejectedPayload.code, "SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION");
  assert.match(rejectedPayload.message, /SYNTHETIC_TEST/);
  assert.ok(rejectedPayload.errors.some((error) => error.code === "SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION"));
  assert.match(rejectedPayload.errors[0].message, /SYNTHETIC_TEST/);

  const noRate = await capture("POST", "/api/engineering/estimate", JSON.stringify(input()), { "content-type": "application/json" }, production);
  assert.equal(noRate.statusCode, 200);
  assert.equal(parse(noRate).estimate.rateProfile.mode, "NO_RATE");
  assert.equal(allCostsNull(parse(noRate).estimate.costBreakdown), true);

  const omittedInput = input();
  delete omittedInput.rateProfile;
  const omitted = await capture("POST", "/api/engineering/estimate", JSON.stringify(omittedInput), { "content-type": "application/json" }, production);
  assert.equal(omitted.statusCode, 200);
  assert.equal(parse(omitted).estimate.rateProfile.mode, "NO_RATE");
  assert.equal(allCostsNull(parse(omitted).estimate.costBreakdown), true);

  const schema = parse(await capture("GET", "/api/engineering/estimate/schema", null, {}, production));
  assert.deepEqual(schema.schema.rateProfile.allowedModes, ["NO_RATE"]);
  assert.deepEqual(schema.schema.rateProfile.testOnlyModes, ["SYNTHETIC_TEST"]);
  assert.equal(schema.runtime.environment, "production");
  assert.deepEqual(schema.runtime.allowedRateModes, ["NO_RATE"]);
  assert.match(schema.schema.rateProfile.testOnlyNote, /不可在 production API 使用/);

  const nonProduction = createEngineeringEstimateResponse(synthetic, new Date("2026-08-23T00:00:00Z"), { environment: "test" });
  assert.equal(nonProduction.state, "OK");
  assert.equal(nonProduction.estimate.rateProfile.mode, "SYNTHETIC_TEST");
  assert.equal(nonProduction.estimate.costBreakdown.totalEstimatedCost, 2006);

  const privateRejected = await capture("POST", "/api/engineering/estimate", JSON.stringify(input({ rateProfile: { mode: "PRIVATE_CALIBRATED" } })), { "content-type": "application/json" }, production);
  assert.equal(privateRejected.statusCode, 403);
  assert.equal(parse(privateRejected).code, "PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API");
  assert.ok(parse(privateRejected).errors.some((error) => error.code === "PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API"));
});

test("engineering API method gates preserve GET-only legacy routes and POST-only estimate route", async () => {
  const legacyMachiningPost = await capture("POST", "/api/machining/reference", "{}", { "content-type": "application/json" });
  const legacySheetMetalPost = await capture("POST", "/api/sheet-metal/reference", "{}", { "content-type": "application/json" });
  const staticPost = await capture("POST", "/estimate", "{}", { "content-type": "application/json" });
  const estimateGet = await capture("GET", "/api/engineering/estimate");
  const schemaPost = await capture("POST", "/api/engineering/estimate/schema", "{}", { "content-type": "application/json" });
  for (const response of [legacyMachiningPost, legacySheetMetalPost, staticPost]) assert.equal(response.statusCode, 405);
  assert.equal(estimateGet.statusCode, 405);
  assert.equal(estimateGet.headers.allow, "POST");
  assert.equal(schemaPost.statusCode, 405);
  assert.equal(schemaPost.headers.allow, "GET");
});

test("engineering page keeps browser-local internal costs separate from public market/API layers", () => {
  const html = fs.readFileSync("estimate.html", "utf8");
  const js = fs.readFileSync("estimate.js", "utf8");
  const marketHtml = fs.readFileSync("sheet-metal.html", "utf8");
  assert.match(html, /工程估算/);
  assert.match(html, /內部工程成本輸入/);
  assert.match(html, /此頁輸入的內部成本資料僅在目前瀏覽器頁面中計算，不會傳送至伺服器或保存/);
  assert.match(html, /公式與計算依據/);
  assert.match(html, /@media\(max-width:620px\)/); // responsive layout is defined for a narrow mobile viewport
  assert.match(html, /materialRatePerKg/);
  assert.match(html, /公開市場參考保持資訊性/);
  assert.match(html, /不會把市場壓力轉成價格/);
  assert.match(html, /不會與公開市場分數相乘/);
  assert.doesNotMatch(js, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|indexedDB|document\.cookie/i);
  assert.match(marketHtml, /本頁的金額僅來自可追溯公開價目/);
  assert.match(marketHtml, /非供應商報價/);
  assert.equal(/api\/engineering\/estimate/.test(marketHtml), false);
  const nav = fs.readFileSync("nav.js", "utf8");
  assert.match(nav, /工程估算/);
  assert.match(nav, /\/estimate/);
});

test("schema contract documents units, defaults, no-rate and future reservations", () => {
  const schema = getEngineeringEstimateSchema();
  assert.deepEqual(schema.output.physicalUnits, ["mm", "mm²", "mm³", "m", "m²", "kg"]);
  assert.deepEqual(schema.rateProfile.allowedModes, ["NO_RATE", "SYNTHETIC_TEST"]);
  assert.equal(schema.material.fields.densityKgM3.note.includes("ENGINEERING_DEFAULT"), true);
  assert.equal(createEngineeringSchemaResponse({ environment: "test" }).state, "OK");
  assert.deepEqual(createEngineeringSchemaResponse({ environment: "test" }).schema.rateProfile.allowedModes, ["NO_RATE", "SYNTHETIC_TEST"]);
  assert.deepEqual(createEngineeringSchemaResponse({ environment: "production" }).schema.rateProfile.allowedModes, ["NO_RATE"]);
  assert.equal(createEngineeringEstimateResponse(input(), new Date("2026-08-23T00:00:00Z"), { environment: "test" }).generatedAt, "2026-08-23T00:00:00.000Z");
});
