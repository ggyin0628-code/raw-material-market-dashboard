const {
  ENGINEERING_DEFAULT_DENSITIES_KG_M3,
  ENGINEERING_DISCLAIMER,
  NO_RATE_SOURCE,
  SYNTHETIC_TEST_SOURCE,
  RATE_FIELDS,
  validateEngineeringInput,
  finiteNumber,
} = require("./engineeringContract");

function round(value, decimals = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Number((value * factor).toFixed(0)) / factor;
}

function validationError(errors) {
  const error = new Error("工程估算輸入驗證失敗。");
  error.statusCode = 400;
  error.code = "VALIDATION_ERROR";
  error.errors = errors;
  return error;
}

function normalizeRateProfile(rateProfile) {
  if (!rateProfile) return { mode: "NO_RATE", source: NO_RATE_SOURCE, rateProfileId: null };
  if (rateProfile.mode === "NO_RATE") return { mode: "NO_RATE", source: NO_RATE_SOURCE, rateProfileId: rateProfile.rateProfileId || null };
  return { mode: "SYNTHETIC_TEST", source: SYNTHETIC_TEST_SOURCE, rateProfileId: rateProfile.rateProfileId || "synthetic-test" };
}

function costBreakdown() {
  return {
    materialCost: null,
    cuttingCost: null,
    piercingCost: null,
    bendingCost: null,
    weldingCost: null,
    surfaceTreatmentCost: null,
    setupCost: null,
    totalEstimatedCost: null,
    estimatedCostPerPart: null,
    currency: null,
  };
}

function traceEntry(field, formula, inputs, unitConversion, result, unit) {
  return { field, formula, inputs, unitConversion, result, unit };
}

function calculateCosts(input, physical, workload, rateProfile) {
  const costs = costBreakdown();
  if (rateProfile.mode !== "SYNTHETIC_TEST") return costs;
  const rates = input.rateProfile;
  costs.materialCost = round(physical.totalMaterialMassKg * rates.materialRatePerKg, 6);
  costs.cuttingCost = round(workload.totalCutLengthM * rates.cuttingRatePerM, 6);
  costs.piercingCost = round(workload.totalPierceCount * rates.pierceRateEach, 6);
  costs.bendingCost = round(workload.totalBendCount * rates.bendRateEach, 6);
  costs.weldingCost = round(workload.totalWeldLengthM * rates.weldingRatePerM, 6);
  costs.surfaceTreatmentCost = round(workload.totalTreatedAreaM2 * rates.surfaceTreatmentRatePerM2, 6);
  costs.setupCost = round(workload.batchCount * rates.setupRatePerBatch, 6);
  costs.totalEstimatedCost = round([
    costs.materialCost,
    costs.cuttingCost,
    costs.piercingCost,
    costs.bendingCost,
    costs.weldingCost,
    costs.surfaceTreatmentCost,
    costs.setupCost,
  ].reduce((sum, value) => sum + value, 0), 6);
  costs.estimatedCostPerPart = round(costs.totalEstimatedCost / physical.quantity, 6);
  costs.currency = "SYNTHETIC_TEST_UNSPECIFIED_CURRENCY";
  return costs;
}

function estimateEngineeringInput(input) {
  const errors = validateEngineeringInput(input);
  if (errors.length) throw validationError(errors);

  const material = input.material;
  const quantity = input.blank.quantity;
  const densityKgM3 = finiteNumber(material.densityKgM3) ?? ENGINEERING_DEFAULT_DENSITIES_KG_M3[material.materialFamily];
  const densitySource = finiteNumber(material.densityKgM3) === null ? "ENGINEERING_DEFAULT" : "USER_INPUT";
  const blankAreaMm2 = materialThicknessArea(input);
  const blankVolumeMm3 = blankAreaMm2 * material.thicknessMm;
  const blankMassKgPerPart = blankVolumeMm3 * densityKgM3 / 1_000_000_000;
  const theoreticalTotalBlankMassKg = blankMassKgPerPart * quantity;
  const utilization = input.materialUtilizationPct !== undefined
    ? input.materialUtilizationPct / 100
    : input.scrapPct !== undefined
      ? 1 - input.scrapPct / 100
      : 1;
  const totalMaterialMassKg = theoreticalTotalBlankMassKg / utilization;
  const batchCount = input.setup.batchCount;
  const quantityPerBatch = quantity / batchCount;

  const cuttingEnabled = input.cutting.enabled;
  const bendingEnabled = input.bending.enabled;
  const weldingEnabled = input.welding.enabled;
  const surfaceEnabled = input.surfaceTreatment.enabled;
  const cutLengthMPerPart = cuttingEnabled ? input.cutting.cutLengthMmPerPart / 1000 : 0;
  const totalCutLengthM = cutLengthMPerPart * quantity;
  const pierceCountPerPart = cuttingEnabled ? input.cutting.pierceCountPerPart : 0;
  const totalPierceCount = pierceCountPerPart * quantity;
  const bendCountPerPart = bendingEnabled ? input.bending.bendCountPerPart : 0;
  const totalBendCount = bendCountPerPart * quantity;
  const weldLengthMPerPart = weldingEnabled ? input.welding.weldLengthMmPerPart / 1000 : 0;
  const totalWeldLengthM = weldLengthMPerPart * quantity;
  const treatedAreaM2PerPart = surfaceEnabled ? input.surfaceTreatment.treatedAreaMm2PerPart / 1_000_000 : 0;
  const totalTreatedAreaM2 = treatedAreaM2PerPart * quantity;
  const rateProfile = normalizeRateProfile(input.rateProfile);
  const physical = {
    blankAreaMm2: round(blankAreaMm2),
    blankVolumeMm3: round(blankVolumeMm3),
    blankMassKgPerPart: round(blankMassKgPerPart),
    theoreticalTotalBlankMassKg: round(theoreticalTotalBlankMassKg),
    totalMaterialMassKg: round(totalMaterialMassKg),
    densityKgM3: round(densityKgM3),
    densitySource,
    quantity,
    materialUtilizationPct: input.materialUtilizationPct === undefined ? null : round(input.materialUtilizationPct, 4),
    scrapPct: input.scrapPct === undefined ? null : round(input.scrapPct, 4),
  };
  const workload = {
    cutLengthMPerPart: round(cutLengthMPerPart),
    totalCutLengthM: round(totalCutLengthM),
    pierceCountPerPart: round(pierceCountPerPart, 3),
    totalPierceCount: round(totalPierceCount, 3),
    bendCountPerPart: round(bendCountPerPart, 3),
    totalBendCount: round(totalBendCount, 3),
    weldLengthMPerPart: round(weldLengthMPerPart),
    totalWeldLengthM: round(totalWeldLengthM),
    treatedAreaM2PerPart: round(treatedAreaM2PerPart),
    totalTreatedAreaM2: round(totalTreatedAreaM2),
    batchCount,
    quantityPerBatch: round(quantityPerBatch, 6),
  };
  const formulaTrace = [
    traceEntry("blankAreaMm2", "lengthMm × widthMm", { lengthMm: input.blank.lengthMm, widthMm: input.blank.widthMm }, "mm × mm = mm²", physical.blankAreaMm2, "mm²"),
    traceEntry("blankVolumeMm3", "blankAreaMm2 × thicknessMm", { blankAreaMm2: physical.blankAreaMm2, thicknessMm: material.thicknessMm }, "mm² × mm = mm³", physical.blankVolumeMm3, "mm³"),
    traceEntry("blankMassKgPerPart", "blankVolumeMm3 × densityKgM3 ÷ 1,000,000,000", { blankVolumeMm3: physical.blankVolumeMm3, densityKgM3: physical.densityKgM3 }, "mm³ × kg/m³ ÷ 10⁹ = kg", physical.blankMassKgPerPart, "kg/part"),
    traceEntry("totalMaterialMassKg", "theoreticalTotalBlankMassKg ÷ utilization", { theoreticalTotalBlankMassKg: physical.theoreticalTotalBlankMassKg, utilization }, "kg ÷ ratio = kg; no hidden utilization when omitted", physical.totalMaterialMassKg, "kg"),
    traceEntry("totalCutLengthM", "cutLengthMmPerPart × quantity ÷ 1000", { cutLengthMmPerPart: input.cutting.cutLengthMmPerPart || 0, quantity }, "mm ÷ 1000 = m", workload.totalCutLengthM, "m"),
    traceEntry("totalPierceCount", "pierceCountPerPart × quantity", { pierceCountPerPart, quantity }, "each/part × part = each", workload.totalPierceCount, "each"),
    traceEntry("totalBendCount", "bendCountPerPart × quantity", { bendCountPerPart, quantity }, "each/part × part = each", workload.totalBendCount, "each"),
    traceEntry("totalWeldLengthM", "weldLengthMmPerPart × quantity ÷ 1000", { weldLengthMmPerPart: input.welding.weldLengthMmPerPart || 0, quantity }, "mm ÷ 1000 = m", workload.totalWeldLengthM, "m"),
    traceEntry("totalTreatedAreaM2", "treatedAreaMm2PerPart × quantity ÷ 1,000,000", { treatedAreaMm2PerPart: input.surfaceTreatment.treatedAreaMm2PerPart || 0, quantity }, "mm² ÷ 10⁶ = m²", workload.totalTreatedAreaM2, "m²"),
    traceEntry("quantityPerBatch", "quantity ÷ batchCount", { quantity, batchCount }, "part ÷ batch = part/batch", workload.quantityPerBatch, "part/batch"),
  ];
  const warnings = [];
  if (densitySource === "ENGINEERING_DEFAULT") warnings.push("密度使用 ENGINEERING_DEFAULT 廣義工程預設值；不是供應商規格或認證材料性質，且可由使用者覆寫。");
  if (!material.grade) warnings.push("未提供 material.grade；系統不推導或猜測牌號。");
  if (input.materialUtilizationPct === undefined && input.scrapPct === undefined) warnings.push("未提供 materialUtilizationPct 或 scrapPct；未假設隱藏排版效率或損耗，totalMaterialMassKg 等同理論毛坯總重。");
  if (rateProfile.mode === "NO_RATE") warnings.push("尚未設定成本參數；所有貨幣欄位保持 null。");
  if (rateProfile.mode === "SYNTHETIC_TEST") warnings.push("目前為 SYNTHETIC / DEMO / TEST ONLY；成本數字不可作為市場價格、公司成本或供應商報價。");
  return {
    estimateMode: "ENGINEERING_ESTIMATE",
    processFamily: input.processFamily,
    physical,
    workload,
    rateProfile,
    costBreakdown: calculateCosts(input, physical, workload, rateProfile),
    formulaTrace,
    warnings,
    marketReference: null,
    marketAdjustmentFactor: null,
    disclaimer: ENGINEERING_DISCLAIMER,
  };
}

function materialThicknessArea(input) {
  return input.blank.lengthMm * input.blank.widthMm;
}

module.exports = {
  estimateEngineeringInput,
  calculateCosts,
  normalizeRateProfile,
  round,
};
