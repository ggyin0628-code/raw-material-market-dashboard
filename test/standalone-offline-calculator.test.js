const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const HTML_PATH = path.join(REPOSITORY_ROOT, "standalone", "InternalEngineeringCostCalculator.html");
const html = fs.readFileSync(HTML_PATH, "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
assert.ok(script, "standalone HTML must contain an inline script");

const context = { console, Intl, Number, Object, String, Array, Math, JSON, Error, TypeError, Set, Map };
vm.createContext(context);
vm.runInContext(script, context, { filename: HTML_PATH });
const Calculator = context.InternalEngineeringCostCalculator;

// Every fixture value in this test is synthetic and is not company, supplier or market data.
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

test("standalone HTML is self-contained and has no network, external-resource or persistence dependency", () => {
  assert.doesNotMatch(html, /<script\s+[^>]*src=/i);
  assert.doesNotMatch(html, /<link\s+[^>]*href=/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /fetch\s*\(/i);
  assert.doesNotMatch(html, /XMLHttpRequest/i);
  assert.doesNotMatch(html, /WebSocket/i);
  assert.doesNotMatch(html, /sendBeacon/i);
  assert.doesNotMatch(html, /localStorage/i);
  assert.doesNotMatch(html, /indexedDB/i);
  assert.doesNotMatch(html, /document\.cookie/i);
  assert.doesNotMatch(html, /<form[^>]*\saction\s*=/i);
  assert.match(html, /<style>[\s\S]*<\/style>/i);
  assert.match(html, /window\.print\(\)/);
  assert.match(html, /所有輸入僅在本機瀏覽器計算，不會上傳/);
  assert.match(html, /@media\s*\(max-width:\s*680px\)/);
});

test("calculator exposes the required Traditional Chinese offline title and grouped sections", () => {
  assert.match(html, /<html lang="zh-Hant">/);
  assert.match(html, /<title>內部工程成本估算/);
  for (const label of ["零件基本資料", "材料成本", "雷射切割", "折彎", "焊接", "表面處理", "工程 \/ 其他準備", "內部工程成本估算"]) assert.match(html, new RegExp(label));
  assert.match(html, /本工具僅提供內部工程成本估算，不是供應商報價、客戶售價或正式對外報價/);
  assert.match(html, /計算內部工程成本/);
  assert.match(html, /清除全部/);
});

test("weight, density default, workload and batch calculations are deterministic", () => {
  const result = Calculator.calculate(fixture());
  assert.equal(result.physical.blankMassKgPerPart, 2.355);
  assert.equal(result.physical.theoreticalTotalBlankMassKg, 235.5);
  assert.equal(result.physical.totalMaterialMassKg, 294.375);
  assert.equal(result.physical.densitySource, "USER_INPUT");
  assert.equal(result.workload.totalCutLengthM, 100);
  assert.equal(result.workload.totalPierceCount, 200);
  assert.equal(result.workload.totalBendCount, 200);
  assert.equal(result.workload.totalWeldLengthM, 12);
  assert.equal(result.workload.totalTreatedAreaM2, 10);
  assert.equal(result.physical.quantityPerBatch, 50);
  const defaultDensity = Calculator.calculate(fixture({ densityKgM3: null }));
  assert.equal(defaultDensity.physical.densityKgM3, 7850);
  assert.equal(defaultDensity.physical.densitySource, "ENGINEERING_DEFAULT");
});

test("utilization and scrap are mutually exclusive and produce explicit material weight", () => {
  const utilization = Calculator.calculate(fixture({ materialUtilizationPct: 80, scrapPct: null }));
  const scrap = Calculator.calculate(fixture({ materialUtilizationPct: null, scrapPct: 20 }));
  const omitted = Calculator.calculate(fixture({ materialUtilizationPct: null, scrapPct: null }));
  assert.equal(utilization.physical.totalMaterialMassKg, 294.375);
  assert.equal(scrap.physical.totalMaterialMassKg, 294.375);
  assert.equal(omitted.physical.totalMaterialMassKg, 235.5);
  assert.throws(() => Calculator.calculate(fixture({ materialUtilizationPct: 80, scrapPct: 20 })), (error) => error.name === "CalculatorValidationError" && error.errors.some((item) => item.message.includes("不可同時提供")));
});

test("cutting, piercing, bending, welding and surface-treatment formulas are explicit", () => {
  const result = Calculator.calculate(fixture());
  assert.equal(result.components.cutting.runMinutes, 100);
  assert.equal(result.components.cutting.pierceMinutes, 10);
  assert.equal(result.components.cutting.setupMinutes, 8);
  assert.equal(result.components.cutting.totalCost, 566);
  assert.equal(result.components.bending.runMinutes, 20);
  assert.equal(result.components.bending.setupMinutes, 6);
  assert.equal(result.components.bending.totalCost, 132);
  assert.equal(result.components.welding.runMinutes, 20);
  assert.equal(result.components.welding.setupMinutes, 10);
  assert.equal(result.components.welding.laborCost, 80);
  assert.equal(result.components.welding.equipmentCost, 40);
  assert.equal(result.components.welding.setupCost, 60);
  assert.equal(result.components.welding.totalCost, 180);
  assert.equal(result.components.surfaceTreatment.totalTreatedAreaM2, 10);
  assert.equal(result.components.surfaceTreatment.totalCost, 70);
  const trace = result.formulaTrace.map((item) => item.join(" ")).join("\n");
  assert.match(trace, /總切割長度 ÷ 切割速度/);
  assert.match(trace, /總穿孔數 × 每次穿孔秒數 ÷ 60/);
  assert.match(trace, /總折彎次數 × 每折秒數 ÷ 60/);
  assert.match(trace, /單件面積 × 數量 ÷ 1,000,000/);
});

test("setup, other fixed cost, total cost and per-part cost remain separate and deterministic", () => {
  const result = Calculator.calculate(fixture());
  assert.equal(result.components.engineeringSetup.setupMinutes, 16);
  assert.equal(result.components.engineeringSetup.totalCost, 48);
  assert.equal(result.time.totalSetupMinutes, 40);
  assert.equal(result.time.totalProcessMinutes, 190);
  assert.equal(result.costs.materialCost, 2943.75);
  assert.equal(result.costs.otherFixedCost, 25);
  assert.equal(result.costs.totalCost, 3964.75);
  assert.equal(result.costs.costPerPart, 39.6475);
  assert.equal(result.costs.costStatus, "READY");
});

test("disabled components contribute zero and do not require hidden time or rates", () => {
  const result = Calculator.calculate(fixture({
    cuttingEnabled: false,
    bendingEnabled: false,
    weldingEnabled: false,
    surfaceTreatmentEnabled: false,
    engineeringSetupEnabled: false,
  }));
  assert.equal(result.components.cutting.state, "DISABLED");
  assert.equal(result.components.bending.state, "DISABLED");
  assert.equal(result.components.welding.state, "DISABLED");
  assert.equal(result.components.surfaceTreatment.state, "DISABLED");
  assert.equal(result.components.engineeringSetup.state, "DISABLED");
  assert.equal(result.time.totalProcessMinutes, 0);
  assert.equal(result.costs.totalCost, result.costs.materialCost + 25);
});

test("missing enabled component inputs produce 資料不足 instead of guessed time or cost", () => {
  const result = Calculator.calculate(fixture({ cuttingSpeedMmPerMin: null }));
  assert.equal(result.components.cutting.state, "MISSING");
  assert.equal(result.components.cutting.runMinutes, null);
  assert.equal(result.time.totalProcessMinutes, null);
  assert.equal(result.costs.totalCost, null);
  assert.equal(result.costs.costStatus, "MISSING");
});

test("invalid, non-finite, zero and OTHER-density inputs fail with Traditional Chinese field errors", () => {
  for (const overrides of [
    { thicknessMm: 0 },
    { quantity: 0 },
    { batchCount: 101 },
    { materialRatePerKg: -1 },
    { cuttingSpeedMmPerMin: 0 },
    { materialFamily: "OTHER", densityKgM3: null },
    { thicknessMm: Number.NaN },
  ]) {
    assert.throws(() => Calculator.calculate(fixture(overrides)), (error) => error.name === "CalculatorValidationError" && Array.isArray(error.errors) && error.errors.length > 0);
  }
  const error = (() => { try { Calculator.calculate(fixture({ quantity: 0 })); } catch (caught) { return caught; } return null; })();
  assert.match(error.errors.map((item) => item.label).join(" "), /數量/);
});

test("clear/reset contract is present without persistent browser storage", () => {
  assert.match(html, /function resetForm\(\)/);
  assert.match(html, /form\.reset\(\)/);
  assert.match(html, /clearResult\(\)/);
  assert.match(html, /window\.addEventListener\("pageshow", resetForm\)/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});
