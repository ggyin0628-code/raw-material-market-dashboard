const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");
const ESTIMATE_HTML_PATH = path.join(ROOT, "estimate.html");
const ESTIMATE_JS_PATH = path.join(ROOT, "estimate.js");
const CORE_PATH = path.join(ROOT, "local-cost-calculator.js");
const STANDALONE_HTML_PATH = path.join(ROOT, "standalone", "InternalEngineeringCostCalculator.html");
const estimateHtml = fs.readFileSync(ESTIMATE_HTML_PATH, "utf8");
const estimateJs = fs.readFileSync(ESTIMATE_JS_PATH, "utf8");
const coreSource = fs.readFileSync(CORE_PATH, "utf8");
const standaloneHtml = fs.readFileSync(STANDALONE_HTML_PATH, "utf8");
const standaloneInline = standaloneHtml.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
assert.ok(standaloneInline, "standalone calculator must retain its inline script");

const standaloneContext = { console, Intl, Number, Object, String, Array, Math, JSON, Error, TypeError, Set, Map };
vm.createContext(standaloneContext);
vm.runInContext(standaloneInline, standaloneContext, { filename: STANDALONE_HTML_PATH });
const StandaloneCalculator = standaloneContext.InternalEngineeringCostCalculator;
const LocalCalculator = require("../local-cost-calculator");

// Every fixture value is synthetic TEST_ONLY data; this suite never uses company values.
function fixture(overrides = {}) {
  return {
    materialFamily: "CARBON_STEEL",
    grade: "TEST_ONLY",
    densityKgM3: 7850,
    thicknessMm: 2,
    lengthMm: 500,
    widthMm: 300,
    quantity: 100,
    batchCount: 2,
    materialRatePerKg: 10,
    materialUtilizationPct: 80,
    scrapPct: null,
    cuttingEnabled: true,
    cutLengthMmPerPart: 1000,
    pierceCountPerPart: 2,
    cuttingSpeedMmPerMin: 1000,
    pierceSecondsEach: 3,
    cuttingMachineRatePerMin: 5,
    cuttingSetupRatePerMin: 2,
    cuttingSetupMinutesPerBatch: 4,
    bendingEnabled: true,
    bendCountPerPart: 2,
    secondsPerBend: 6,
    bendingMachineRatePerMin: 6,
    bendingSetupRatePerMin: 2,
    bendingSetupMinutesPerBatch: 3,
    weldingEnabled: true,
    weldLengthMmPerPart: 120,
    weldingSpeedMmPerMin: 600,
    weldingLaborRatePerMin: 4,
    weldingEquipmentRatePerMin: 2,
    weldingSetupMinutesPerBatch: 5,
    surfaceTreatmentEnabled: true,
    treatedAreaMm2PerPart: 100000,
    surfaceTreatmentRatePerM2: 7,
    engineeringSetupEnabled: true,
    engineeringSetupMinutesPerBatch: 8,
    engineeringRatePerMin: 3,
    otherFixedCost: 25,
    ...overrides,
  };
}

test("/estimate contains the complete planned browser-local workspace", () => {
  assert.match(estimateHtml, /<html lang="zh-Hant">/);
  for (const section of ["零件基本資料", "材料成本", "雷射切割", "折彎", "焊接", "表面處理", "工程／其他準備", "內部工程成本估算"]) assert.match(estimateHtml, new RegExp(section));
  for (const id of [
    "materialFamily", "grade", "densityKgM3", "thicknessMm", "lengthMm", "widthMm", "quantity", "batchCount", "materialRatePerKg", "materialUtilizationPct", "scrapPct",
    "cutLengthMmPerPart", "pierceCountPerPart", "cuttingSpeedMmPerMin", "pierceSecondsEach", "cuttingMachineRatePerMin", "cuttingSetupRatePerMin", "cuttingSetupMinutesPerBatch",
    "bendCountPerPart", "secondsPerBend", "bendingMachineRatePerMin", "bendingSetupRatePerMin", "bendingSetupMinutesPerBatch",
    "weldLengthMmPerPart", "weldingSpeedMmPerMin", "weldingLaborRatePerMin", "weldingEquipmentRatePerMin", "weldingSetupMinutesPerBatch",
    "treatedAreaMm2PerPart", "surfaceTreatmentRatePerM2", "engineeringSetupMinutesPerBatch", "engineeringRatePerMin", "otherFixedCost",
  ]) assert.match(estimateHtml, new RegExp(`id="${id}"`));
  assert.match(estimateHtml, /此頁輸入的內部成本資料僅在目前瀏覽器頁面中計算，不會傳送至伺服器或保存/);
  assert.match(estimateHtml, /計算內部工程成本/);
});

test("company-entered cost values have no server submission, network or telemetry path", () => {
  for (const source of [estimateHtml, estimateJs, coreSource]) {
    assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\.sendBeacon|\.submit\s*\(/i);
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|cookie\s*=/i);
  }
  assert.doesNotMatch(estimateHtml, /<form[^>]*\saction\s*=/i);
  assert.match(estimateHtml, /<script src="\/local-cost-calculator\.js"><\/script>/);
  assert.match(estimateHtml, /<script src="\/estimate\.js"><\/script>/);
  assert.match(estimateJs, /event\.preventDefault\(\)/);
  assert.match(estimateJs, /calculator\.calculate\(readInput\(\)\)/);
});

test("estimate reuses Phase 4F formulas with numerically identical results", () => {
  const localResult = LocalCalculator.calculate(fixture());
  const standaloneResult = StandaloneCalculator.calculate(fixture());
  assert.deepEqual(JSON.parse(JSON.stringify(localResult)), JSON.parse(JSON.stringify(standaloneResult)));
  assert.equal(localResult.physical.blankMassKgPerPart, 2.355);
  assert.equal(localResult.physical.totalMaterialMassKg, 294.375);
  assert.equal(localResult.components.cutting.totalCost, 566);
  assert.equal(localResult.components.bending.totalCost, 132);
  assert.equal(localResult.components.welding.totalCost, 180);
  assert.equal(localResult.costs.totalCost, 3964.75);
  assert.equal(localResult.costs.costPerPart, 39.6475);
});

test("missing enabled process inputs show 資料不足 and invalid inputs fail closed", () => {
  const missing = LocalCalculator.calculate(fixture({ cuttingSpeedMmPerMin: null }));
  assert.equal(missing.components.cutting.state, "MISSING");
  assert.equal(missing.components.cutting.runMinutes, null);
  assert.equal(missing.time.totalProcessMinutes, null);
  assert.equal(missing.costs.totalCost, null);
  for (const override of [
    { thicknessMm: 0 },
    { quantity: 0 },
    { batchCount: 101 },
    { materialRatePerKg: -1 },
    { cuttingSpeedMmPerMin: 0 },
    { materialFamily: "OTHER", densityKgM3: null },
    { thicknessMm: Number.NaN },
  ]) {
    assert.throws(() => LocalCalculator.calculate(fixture(override)), (error) => error.name === "CalculatorValidationError" && error.errors.length > 0);
  }
});

test("clear/reset and refresh lifecycle remove in-memory results without persistence", () => {
  assert.match(estimateJs, /function resetEstimate\(\)/);
  assert.match(estimateJs, /form\.reset\(\)/);
  assert.match(estimateJs, /window\.addEventListener\("pageshow", resetEstimate\)/);
  assert.match(estimateJs, /clearResult\(\)/);
  assert.match(estimateHtml, /id="clearButton"/);
  assert.match(estimateHtml, /id="printButton"/);
  assert.match(estimateHtml, /@media print/);
  assert.doesNotMatch(estimateHtml + estimateJs + coreSource, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
});

test("public page keeps internal cost wording separate from market reference and public API", () => {
  assert.match(estimateHtml, /公開市場參考保持資訊性/);
  assert.match(estimateHtml, /不會把市場壓力轉成價格/);
  assert.match(estimateHtml, /不會自動帶入成本率/);
  assert.doesNotMatch(estimateHtml, /window\.fetch|fetch\s*\(/i);
  assert.match(estimateHtml, /NO_RATE-only/);
  assert.match(estimateHtml, /不會送到 `\/api\/engineering\/estimate`/);
  assert.match(estimateHtml, /不會與公開市場分數相乘/);
  assert.doesNotMatch(estimateHtml, /供應商|客戶|報價|售價/);
});
