const { round } = require("./engineeringEstimator");
const {
  PRIVATE_CALIBRATED_MODE,
  SYNTHETIC_TEST_MODE,
  PRIVATE_SOURCE,
  SYNTHETIC_SOURCE,
  validatePrivateRateProfile,
  safeProfileMetadata,
  PRIVATE_SCOPE,
} = require("./privateRateProfileContract");
const { calculateProcessTime } = require("./processTimeEstimator");

function privateCostValidationError(errors, code = "PRIVATE_COST_VALIDATION_ERROR", message = "私有成本校正輸入驗證失敗。") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  error.errors = errors;
  return error;
}

function protectedAuthorizationError(code, message) {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = code;
  error.errors = [{ path: "authorization", code, message }];
  return error;
}

function emptyPrivateCostBreakdown() {
  return {
    materialCost: null,
    cuttingSetupCost: null,
    cuttingRunCost: null,
    piercingCost: null,
    bendingSetupCost: null,
    bendingRunCost: null,
    weldingSetupCost: null,
    weldingRunCost: null,
    surfaceTreatmentCost: null,
    engineeringSetupCost: null,
    totalEstimatedCost: null,
    estimatedCostPerPart: null,
    currency: null,
  };
}

function materialRate(profile, materialFamily) {
  const field = {
    CARBON_STEEL: "carbonSteelRatePerKg",
    STAINLESS_STEEL: "stainlessSteelRatePerKg",
    ALUMINUM: "aluminumRatePerKg",
    COPPER: "copperRatePerKg",
  }[materialFamily];
  return field ? profile.material[field] : null;
}

function calculatePrivateCosts({ baseEstimate, input, processTimeEstimate, profile }) {
  const costs = emptyPrivateCostBreakdown();
  if (!baseEstimate || !input || !processTimeEstimate || !profile) return costs;
  if (processTimeEstimate.state !== "CALCULATED") return costs;
  const materialUnitRate = materialRate(profile, input.material.materialFamily);
  if (materialUnitRate === null) throw privateCostValidationError([{ path: "rateProfile.material", code: "MATERIAL_RATE_REQUIRED", message: "材料家族必須有對應的明確 rate。" }]);
  costs.materialCost = round(baseEstimate.physical.totalMaterialMassKg * materialUnitRate, 6);
  costs.cuttingSetupCost = round(processTimeEstimate.cutting.setupMinutes * profile.cutting.setupRatePerMinute, 6);
  costs.cuttingRunCost = round(processTimeEstimate.cutting.runMinutes * profile.cutting.machineRatePerMinute, 6);
  costs.piercingCost = round(processTimeEstimate.cutting.pierceMinutes * profile.cutting.machineRatePerMinute, 6);
  costs.bendingSetupCost = round(processTimeEstimate.bending.setupMinutes * profile.bending.setupRatePerMinute, 6);
  costs.bendingRunCost = round(processTimeEstimate.bending.runMinutes * profile.bending.machineRatePerMinute, 6);
  costs.weldingSetupCost = round(processTimeEstimate.welding.setupMinutes * (profile.welding.laborRatePerMinute + profile.welding.machineRatePerMinute), 6);
  costs.weldingRunCost = round(processTimeEstimate.welding.runMinutes * (profile.welding.laborRatePerMinute + profile.welding.machineRatePerMinute), 6);
  costs.surfaceTreatmentCost = round(baseEstimate.workload.totalTreatedAreaM2 * profile.surfaceTreatment.ratePerM2, 6);
  costs.engineeringSetupCost = round(profile.setup.engineeringSetupMinutesPerBatch * baseEstimate.workload.batchCount * profile.setup.engineeringSetupRatePerMinute, 6);
  costs.totalEstimatedCost = round([
    costs.materialCost,
    costs.cuttingSetupCost,
    costs.cuttingRunCost,
    costs.piercingCost,
    costs.bendingSetupCost,
    costs.bendingRunCost,
    costs.weldingSetupCost,
    costs.weldingRunCost,
    costs.surfaceTreatmentCost,
    costs.engineeringSetupCost,
  ].reduce((sum, value) => sum + value, 0), 6);
  costs.estimatedCostPerPart = round(costs.totalEstimatedCost / baseEstimate.physical.quantity, 6);
  costs.currency = profile.currency;
  return costs;
}

function costTraceEntry(field, formula, inputs, unitConversion, result, unit, profile) {
  return {
    field,
    formula,
    inputs,
    unitConversion,
    result,
    unit,
    rateProfileId: profile.rateProfileId,
    rateProfileVersion: profile.version,
  };
}

function buildPrivateCostTrace({ baseEstimate, processTimeEstimate, costs, profile }) {
  return [
    costTraceEntry("materialCost", "totalMaterialMassKg × materialRatePerKg", { totalMaterialMassKg: baseEstimate.physical.totalMaterialMassKg, materialRatePerKg: "PROFILE_VALUE_NOT_RETURNED" }, "kg × currency/kg = currency", costs.materialCost, "currency", profile),
    costTraceEntry("cuttingSetupCost", "cutting.setupMinutes × cutting.setupRatePerMinute", { setupMinutes: processTimeEstimate.cutting.setupMinutes, setupRatePerMinute: "PROFILE_VALUE_NOT_RETURNED" }, "min × currency/min = currency", costs.cuttingSetupCost, "currency", profile),
    costTraceEntry("cuttingRunCost", "(cutting.runMinutes + cutting.pierceMinutes) × cutting.machineRatePerMinute", { runMinutes: processTimeEstimate.cutting.runMinutes, pierceMinutes: processTimeEstimate.cutting.pierceMinutes, machineRatePerMinute: "PROFILE_VALUE_NOT_RETURNED" }, "min × currency/min = currency", costs.cuttingRunCost, "currency", profile),
    costTraceEntry("piercingCost", "cutting.pierceMinutes × cutting.machineRatePerMinute", { pierceMinutes: processTimeEstimate.cutting.pierceMinutes, machineRatePerMinute: "PROFILE_VALUE_NOT_RETURNED" }, "min × currency/min = currency", costs.piercingCost, "currency", profile),
    costTraceEntry("bendingSetupCost", "bending.setupMinutes × bending.setupRatePerMinute", { setupMinutes: processTimeEstimate.bending.setupMinutes, setupRatePerMinute: "PROFILE_VALUE_NOT_RETURNED" }, "min × currency/min = currency", costs.bendingSetupCost, "currency", profile),
    costTraceEntry("bendingRunCost", "bending.runMinutes × bending.machineRatePerMinute", { runMinutes: processTimeEstimate.bending.runMinutes, machineRatePerMinute: "PROFILE_VALUE_NOT_RETURNED" }, "min × currency/min = currency", costs.bendingRunCost, "currency", profile),
    costTraceEntry("weldingSetupCost", "welding.setupMinutes × (laborRatePerMinute + machineRatePerMinute)", { setupMinutes: processTimeEstimate.welding.setupMinutes, laborRatePerMinute: "PROFILE_VALUE_NOT_RETURNED", machineRatePerMinute: "PROFILE_VALUE_NOT_RETURNED" }, "min × currency/min = currency", costs.weldingSetupCost, "currency", profile),
    costTraceEntry("weldingRunCost", "welding.runMinutes × (laborRatePerMinute + machineRatePerMinute)", { runMinutes: processTimeEstimate.welding.runMinutes, laborRatePerMinute: "PROFILE_VALUE_NOT_RETURNED", machineRatePerMinute: "PROFILE_VALUE_NOT_RETURNED" }, "min × currency/min = currency", costs.weldingRunCost, "currency", profile),
    costTraceEntry("surfaceTreatmentCost", "totalTreatedAreaM2 × surfaceTreatment.ratePerM2", { totalTreatedAreaM2: baseEstimate.workload.totalTreatedAreaM2, ratePerM2: "PROFILE_VALUE_NOT_RETURNED" }, "m² × currency/m² = currency", costs.surfaceTreatmentCost, "currency", profile),
    costTraceEntry("engineeringSetupCost", "engineeringSetupMinutesPerBatch × batchCount × engineeringSetupRatePerMinute", { engineeringSetupMinutesPerBatch: "PROFILE_VALUE_NOT_RETURNED", batchCount: baseEstimate.workload.batchCount, engineeringSetupRatePerMinute: "PROFILE_VALUE_NOT_RETURNED" }, "min/batch × batch × currency/min = currency", costs.engineeringSetupCost, "currency", profile),
    costTraceEntry("totalEstimatedCost", "sum(all explicit cost components)", { componentCount: 10 }, "currency = currency", costs.totalEstimatedCost, "currency", profile),
    costTraceEntry("estimatedCostPerPart", "totalEstimatedCost ÷ quantity", { totalEstimatedCost: costs.totalEstimatedCost, quantity: baseEstimate.physical.quantity }, "currency ÷ part = currency/part", costs.estimatedCostPerPart, "currency/part", profile),
  ];
}

function buildPrivateCostEstimate({ baseEstimate, input, profile, processTimeEstimate }) {
  const costBreakdown = calculatePrivateCosts({ baseEstimate, input, processTimeEstimate, profile });
  return {
    state: "CALCULATED",
    estimateMode: "COST_ESTIMATE",
    processFamily: baseEstimate.processFamily,
    physical: baseEstimate.physical,
    workload: baseEstimate.workload,
    processTimeEstimate,
    rateProfile: safeProfileMetadata(profile, profile.mode === SYNTHETIC_TEST_MODE ? SYNTHETIC_SOURCE : PRIVATE_SOURCE),
    costBreakdown,
    formulaTrace: [
      ...processTimeEstimate.formulaTrace,
      ...buildPrivateCostTrace({ baseEstimate, processTimeEstimate, costs: costBreakdown, profile }),
    ],
    marketReference: null,
    marketAdjustmentFactor: null,
    disclaimer: profile.mode === SYNTHETIC_TEST_MODE
      ? "SYNTHETIC / DEMO / TEST ONLY；成本不可作為台灣公司價格、供應商報價或市場交易價格。"
      : "PRIVATE_CALIBRATED 只能在受保護且已授權 runtime 使用；不代表供應商報價或市場交易價格。",
    warnings: profile.mode === SYNTHETIC_TEST_MODE
      ? ["目前為 SYNTHETIC / DEMO / TEST ONLY；所有 monetary results 僅用於 deterministic formula verification。"]
      : ["此結果使用已授權的 PRIVATE_CALIBRATED profile；回應僅保留 profile identifier/version，不回傳 raw rate values。"],
  };
}

function assertPrivateAuthorization(authorization) {
  if (!authorization || authorization.authenticated !== true) throw protectedAuthorizationError("PRIVATE_AUTHENTICATION_REQUIRED", "PRIVATE_CALIBRATED 需要已驗證的 private runtime identity。 ");
  if (!Array.isArray(authorization.scopes) || !authorization.scopes.includes(PRIVATE_SCOPE)) throw protectedAuthorizationError("PRIVATE_SCOPE_REQUIRED", `需要 scope ${PRIVATE_SCOPE}。`);
}

function createSyntheticPrivateCostEstimate({ baseEstimate, input, profile }) {
  const errors = validatePrivateRateProfile(profile);
  if (errors.length) throw privateCostValidationError(errors);
  if (profile.mode !== SYNTHETIC_TEST_MODE) throw privateCostValidationError([{ path: "rateProfile.mode", code: "SYNTHETIC_PROFILE_REQUIRED", message: "synthetic demo 必須使用 SYNTHETIC_TEST。" }]);
  const processTimeEstimate = calculateProcessTime({ input, workload: baseEstimate.workload, profile });
  return buildPrivateCostEstimate({ baseEstimate, input, profile, processTimeEstimate });
}

function createProtectedPrivateCostEstimate({ baseEstimate, input, profile, authorization, auditLogger, estimateId = "private-estimate-unassigned" }) {
  assertPrivateAuthorization(authorization);
  const errors = validatePrivateRateProfile(profile);
  if (errors.length) throw privateCostValidationError(errors);
  if (profile.mode !== PRIVATE_CALIBRATED_MODE) throw privateCostValidationError([{ path: "rateProfile.mode", code: "PRIVATE_PROFILE_REQUIRED", message: "protected private cost runtime 必須使用 PRIVATE_CALIBRATED。" }]);
  if (typeof auditLogger !== "function") {
    const error = new Error("private cost access audit logger is required.");
    error.statusCode = 503;
    error.code = "PRIVATE_AUDIT_REQUIRED";
    throw error;
  }
  const processTimeEstimate = calculateProcessTime({ input, workload: baseEstimate.workload, profile });
  const result = buildPrivateCostEstimate({ baseEstimate, input, profile, processTimeEstimate });
  auditLogger({
    timestamp: new Date().toISOString(),
    authorizedLocalIdentity: authorization.subject || "authenticated-private-runtime",
    rateProfileId: profile.rateProfileId,
    rateProfileVersion: profile.version,
    processFamily: baseEstimate.processFamily,
    estimateId,
    resultStatus: result.state,
  });
  return result;
}

module.exports = {
  emptyPrivateCostBreakdown,
  calculatePrivateCosts,
  buildPrivateCostTrace,
  createSyntheticPrivateCostEstimate,
  createProtectedPrivateCostEstimate,
  assertPrivateAuthorization,
  privateCostValidationError,
};
