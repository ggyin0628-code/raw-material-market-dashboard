const { round } = require("./engineeringEstimator");
const {
  COMPONENT_KEYS,
  OBSERVED_TIME,
  RATE_BASED,
  DEFAULT_SYNTHETIC_QUALITY_THRESHOLDS,
  finiteNumber,
} = require("./privateCalibrationPilotContract");

const COMPONENT_COST_FIELDS = Object.freeze({
  material: "materialCost",
  cutting: "cuttingRunCost",
  piercing: "piercingCost",
  bending: "bendingRunCost",
  welding: "weldingRunCost",
  surfaceTreatment: "surfaceTreatmentCost",
  setup: "engineeringSetupCost",
});
const DIAGNOSTIC_MESSAGES = Object.freeze({
  MATERIAL_RATE_VARIANCE: "材料成本與歷史 component reference 有差異；先檢查材料基準與用量，不自動改 profile。",
  CUTTING_TIME_VARIANCE: "切割時間觀測與 profile-derived process time 有差異；先檢查切割長度、速度與設備狀態。",
  PIERCE_TIME_VARIANCE: "穿孔時間觀測與 profile-derived process time 有差異；先檢查穿孔條件與每次穿孔時間。",
  BENDING_TIME_VARIANCE: "折彎時間觀測與 profile-derived process time 有差異；先檢查折彎次數、節拍與設備狀態。",
  WELDING_TIME_VARIANCE: "焊接時間觀測與 profile-derived process time 有差異；先檢查焊長、速度與焊接條件。",
  SETUP_VARIANCE: "setup 時間觀測與 profile-derived process time 有差異；先檢查批次、換線與準備作業。",
  MISSING_CALIBRATION: "pilot 未提供足夠的觀測校正資料；不猜測，也不自動補值。",
  INSUFFICIENT_REFERENCE: "歷史資料不足以支持 component-level attribution；本結果僅供 pilot review。",
});
const DIAGNOSTIC_BY_COMPONENT = Object.freeze({
  material: "MATERIAL_RATE_VARIANCE",
  cutting: "CUTTING_TIME_VARIANCE",
  piercing: "PIERCE_TIME_VARIANCE",
  bending: "BENDING_TIME_VARIANCE",
  welding: "WELDING_TIME_VARIANCE",
  surfaceTreatment: "MATERIAL_RATE_VARIANCE",
  setup: "SETUP_VARIANCE",
});

function comparisonError(code, message, errors = []) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  error.errors = errors.length ? errors : [{ path: "calibrationComparison", code, message }];
  return error;
}

function calculateVariance(estimated, historical) {
  const estimatedValue = finiteNumber(estimated);
  const historicalValue = finiteNumber(historical);
  if (estimatedValue === null || historicalValue === null) {
    return { difference: null, variancePct: null };
  }
  const difference = round(estimatedValue - historicalValue, 6);
  return {
    difference,
    variancePct: historicalValue === 0 ? null : round((difference / historicalValue) * 100, 6),
  };
}

function qualityStatus(variancePct, thresholds = DEFAULT_SYNTHETIC_QUALITY_THRESHOLDS) {
  if (!finiteNumber(variancePct)) return "NOT_EVALUATED";
  const abs = Math.abs(variancePct);
  if (abs <= thresholds.closeMatchMaxAbsPct) return "CLOSE_MATCH";
  if (abs <= thresholds.moderateMatchMaxAbsPct) return "MODERATE_VARIANCE";
  return "LARGE_VARIANCE";
}

function validateQualityThresholds(thresholds = DEFAULT_SYNTHETIC_QUALITY_THRESHOLDS) {
  if (!thresholds || typeof thresholds !== "object" || Array.isArray(thresholds)) throw comparisonError("QUALITY_THRESHOLDS_INVALID", "quality thresholds 必須為 object。");
  const close = finiteNumber(thresholds.closeMatchMaxAbsPct);
  const moderate = finiteNumber(thresholds.moderateMatchMaxAbsPct);
  if (close === null || moderate === null || close < 0 || moderate < close) throw comparisonError("QUALITY_THRESHOLDS_INVALID", "quality thresholds 必須為非負且 moderate 不小於 close；Phase 4D 不自動採用未文件化的 business limit。");
  return { closeMatchMaxAbsPct: close, moderateMatchMaxAbsPct: moderate, source: thresholds.source || "CONFIGURED_LOCAL_ONLY" };
}

function getHistoricalTotal(historicalReference, quantity) {
  if (finiteNumber(historicalReference?.actualHistoricalTotalInternalCost) !== null) return round(historicalReference.actualHistoricalTotalInternalCost, 6);
  if (finiteNumber(historicalReference?.actualHistoricalInternalCostPerPart) !== null && finiteNumber(quantity) !== null) return round(historicalReference.actualHistoricalInternalCostPerPart * quantity, 6);
  return null;
}

function getHistoricalPerPart(historicalReference, quantity, actualTotal) {
  if (finiteNumber(historicalReference?.actualHistoricalInternalCostPerPart) !== null) return round(historicalReference.actualHistoricalInternalCostPerPart, 6);
  if (finiteNumber(actualTotal) !== null && finiteNumber(quantity) !== null && quantity > 0) return round(actualTotal / quantity, 6);
  return null;
}

function buildHistoricalComparison({ costBreakdown, historicalReference, quantity, thresholds }) {
  const estimatedTotalCost = costBreakdown?.totalEstimatedCost ?? null;
  const estimatedCostPerPart = costBreakdown?.estimatedCostPerPart ?? null;
  const actualTotalCost = getHistoricalTotal(historicalReference, quantity);
  const actualCostPerPart = getHistoricalPerPart(historicalReference, quantity, actualTotalCost);
  const totalVariance = calculateVariance(estimatedTotalCost, actualTotalCost);
  const perPartVariance = calculateVariance(estimatedCostPerPart, actualCostPerPart);
  const type = actualTotalCost === null ? "NO_HISTORICAL_REFERENCE" : (historicalReference?.componentCosts && Object.values(historicalReference.componentCosts).some((value) => finiteNumber(value) !== null) ? "KNOWN_COMPONENT_REFERENCE" : "TOTAL_ONLY_REFERENCE");
  return {
    referenceType: type,
    internalEngineeringCostEstimate: { estimatedTotalCost, estimatedCostPerPart },
    historicalReference: { actualTotalCost, actualCostPerPart },
    variance: {
      totalCostDifference: totalVariance.difference,
      costPerPartDifference: perPartVariance.difference,
      variancePct: totalVariance.variancePct,
    },
    quality: {
      status: qualityStatus(totalVariance.variancePct, thresholds),
      thresholds: { closeMatchMaxAbsPct: thresholds.closeMatchMaxAbsPct, moderateMatchMaxAbsPct: thresholds.moderateMatchMaxAbsPct },
      thresholdSource: thresholds.source,
    },
  };
}

function modelProcessTimes(costEstimate) {
  const time = costEstimate?.processTimeEstimate;
  return {
    cuttingRunMinutes: time?.cutting?.runMinutes ?? null,
    cuttingPierceMinutes: time?.cutting?.pierceMinutes ?? null,
    cuttingSetupMinutes: time?.cutting?.setupMinutes !== null && time?.cutting?.setupMinutes !== undefined ? time.cutting.setupMinutes / (costEstimate.workload.batchCount || 1) : null,
    bendingRunMinutes: time?.bending?.runMinutes ?? null,
    bendingSetupMinutes: time?.bending?.setupMinutes !== null && time?.bending?.setupMinutes !== undefined ? time.bending.setupMinutes / (costEstimate.workload.batchCount || 1) : null,
    weldingRunMinutes: time?.welding?.runMinutes ?? null,
    weldingSetupMinutes: time?.welding?.setupMinutes !== null && time?.welding?.setupMinutes !== undefined ? time.welding.setupMinutes / (costEstimate.workload.batchCount || 1) : null,
  };
}

function resolveObservation(section, { lengthMm, count, speedKey, runKey, perUnitSecondsKey, runUnitSecondsKey, setupKey, profileRunMinutes, profileSetupMinutes, profilePierceMinutes, label, rateFormula, observedFormula }) {
  const hasSpeed = finiteNumber(section?.[speedKey]) !== null;
  const hasRun = finiteNumber(section?.[runKey]) !== null;
  if (hasSpeed && hasRun && ![OBSERVED_TIME, RATE_BASED].includes(section.authoritativeObservation)) {
    throw comparisonError("OBSERVATION_PRECEDENCE_REQUIRED", `${label} 同時提供 rate-based 與 observed-time，必須明確指定 authoritativeObservation。`, [{ path: `pilot.${label}.authoritativeObservation`, code: "OBSERVATION_PRECEDENCE_REQUIRED", message: "必須明確指定 OBSERVED_TIME 或 RATE_BASED。" }]);
  }
  let mode = null;
  let observedRunMinutes = null;
  if (hasSpeed && hasRun && section.authoritativeObservation === OBSERVED_TIME) {
    mode = OBSERVED_TIME;
    observedRunMinutes = section[runKey];
  } else if (hasSpeed) {
    mode = RATE_BASED;
    observedRunMinutes = runUnitSecondsKey
      ? round(count * section[speedKey] / 60, 6)
      : round(lengthMm / section[speedKey], 6);
  } else if (hasRun) {
    mode = OBSERVED_TIME;
    observedRunMinutes = section[runKey];
  }
  const observedPierceMinutes = perUnitSecondsKey && finiteNumber(section?.[perUnitSecondsKey]) !== null && finiteNumber(count) !== null
    ? round(count * section[perUnitSecondsKey] / 60, 6)
    : null;
  const observedSetupMinutes = finiteNumber(section?.[setupKey]) !== null ? section[setupKey] : null;
  const runVariance = calculateVariance(profileRunMinutes, observedRunMinutes);
  const setupVariance = calculateVariance(profileSetupMinutes, observedSetupMinutes);
  return {
    process: label,
    mode: mode || "MISSING_CALIBRATION",
    observedRunMinutes,
    observedPierceMinutes,
    observedSetupMinutes,
    profileRunMinutes,
    profileSetupMinutes,
    profilePierceMinutes,
    pierceDifferenceMinutes: calculateVariance(profilePierceMinutes, observedPierceMinutes).difference,
    runDifferenceMinutes: runVariance.difference,
    runVariancePct: runVariance.variancePct,
    setupDifferenceMinutes: setupVariance.difference,
    setupVariancePct: setupVariance.variancePct,
    authoritativeObservation: section?.authoritativeObservation || null,
    observationFormula: mode === RATE_BASED ? rateFormula : hasRun ? "authoritative observedRunMinutes" : observedFormula || null,
  };
}

function buildProcessObservations({ pilot, engineeringInput, costEstimate, profile = null }) {
  const workload = costEstimate.workload;
  const model = modelProcessTimes(costEstimate);
  const observations = [];
  if (engineeringInput.cutting.enabled) {
    observations.push(resolveObservation(pilot.cutting, {
      lengthMm: workload.totalCutLengthM * 1000,
      count: workload.totalPierceCount,
      speedKey: "observedCuttingSpeedMmPerMin",
      runKey: "observedRunMinutes",
      perUnitSecondsKey: "observedPierceSecondsEach",
      setupKey: "observedSetupMinutesPerBatch",
      profileRunMinutes: model.cuttingRunMinutes,
      profileSetupMinutes: model.cuttingSetupMinutes,
      profilePierceMinutes: model.cuttingPierceMinutes,
      rateFormula: "totalCutLengthMm ÷ observedCuttingSpeedMmPerMin",
      observedFormula: "observedRunMinutes",
      label: "cutting",
    }));
  }
  if (engineeringInput.bending.enabled) {
    observations.push(resolveObservation(pilot.bending, {
      lengthMm: workload.totalBendCount,
      count: workload.totalBendCount,
      speedKey: "observedSecondsPerBend",
      runKey: "observedRunMinutes",
      perUnitSecondsKey: null,
      runUnitSecondsKey: true,
      setupKey: "observedSetupMinutesPerBatch",
      profileRunMinutes: model.bendingRunMinutes,
      profileSetupMinutes: model.bendingSetupMinutes,
      profilePierceMinutes: null,
      rateFormula: "totalBendCount × observedSecondsPerBend ÷ 60",
      observedFormula: "observedRunMinutes",
      label: "bending",
    }));
    const secondsPerBend = finiteNumber(pilot.bending.observedSecondsPerBend);
    if (secondsPerBend !== null) observations[observations.length - 1].observedRunMinutes = round(workload.totalBendCount * secondsPerBend / 60, 6);
  }
  if (engineeringInput.welding.enabled) {
    observations.push(resolveObservation(pilot.welding, {
      lengthMm: workload.totalWeldLengthM * 1000,
      count: workload.totalWeldLengthM,
      speedKey: "observedWeldingSpeedMmPerMin",
      runKey: "observedRunMinutes",
      perUnitSecondsKey: null,
      setupKey: "observedSetupMinutesPerBatch",
      profileRunMinutes: model.weldingRunMinutes,
      profileSetupMinutes: model.weldingSetupMinutes,
      profilePierceMinutes: null,
      rateFormula: "totalWeldLengthMm ÷ observedWeldingSpeedMmPerMin",
      observedFormula: "observedRunMinutes",
      label: "welding",
    }));
  }
  if (finiteNumber(pilot.engineeringSetup?.observedSetupMinutesPerBatch) !== null) {
    const observedSetupMinutes = pilot.engineeringSetup.observedSetupMinutesPerBatch;
    const profileSetupMinutes = finiteNumber(profile?.setup?.engineeringSetupMinutesPerBatch) !== null ? profile.setup.engineeringSetupMinutesPerBatch : null;
    observations.push({
      process: "engineeringSetup",
      mode: OBSERVED_TIME,
      observedRunMinutes: null,
      observedPierceMinutes: null,
      observedSetupMinutes,
      profileRunMinutes: null,
      profileSetupMinutes,
      runDifferenceMinutes: null,
      runVariancePct: null,
      setupDifferenceMinutes: calculateVariance(profileSetupMinutes, observedSetupMinutes).difference,
      setupVariancePct: calculateVariance(profileSetupMinutes, observedSetupMinutes).variancePct,
      authoritativeObservation: OBSERVED_TIME,
      observationFormula: "observedSetupMinutesPerBatch",
    });
  }
  return observations;
}

function buildComponentVariance({ costBreakdown, componentCosts }) {
  if (!componentCosts || typeof componentCosts !== "object") return [];
  return COMPONENT_KEYS.filter((component) => finiteNumber(componentCosts[component]) !== null).map((component) => {
    const estimated = component === "cutting"
      ? round((costBreakdown.cuttingSetupCost || 0) + (costBreakdown.cuttingRunCost || 0), 6)
      : component === "bending"
        ? round((costBreakdown.bendingSetupCost || 0) + (costBreakdown.bendingRunCost || 0), 6)
        : component === "welding"
          ? round((costBreakdown.weldingSetupCost || 0) + (costBreakdown.weldingRunCost || 0), 6)
          : costBreakdown[COMPONENT_COST_FIELDS[component]] ?? null;
    const variance = calculateVariance(estimated, componentCosts[component]);
    return { component, estimatedCost: estimated, historicalCost: componentCosts[component], difference: variance.difference, variancePct: variance.variancePct };
  });
}

function addDiagnostic(result, category, evidenceCount = 1) {
  if (result.some((item) => item.category === category)) return;
  result.push({ category, reason: DIAGNOSTIC_MESSAGES[category], evidenceCount, action: "REVIEW_ONLY" });
}

function buildDiagnostics({ historicalComparison, componentVariance, processObservations, pilot, engineeringInput, profile }) {
  const diagnostics = [];
  if (historicalComparison.referenceType === "NO_HISTORICAL_REFERENCE" || historicalComparison.referenceType === "TOTAL_ONLY_REFERENCE") addDiagnostic(diagnostics, "INSUFFICIENT_REFERENCE");
  if (historicalComparison.quality.status === "LARGE_VARIANCE" || historicalComparison.quality.status === "MODERATE_VARIANCE") {
    if (componentVariance.length === 0) addDiagnostic(diagnostics, "INSUFFICIENT_REFERENCE");
  }
  for (const item of componentVariance) {
    if (finiteNumber(item.difference) !== null && Math.abs(item.difference) > 0.000001) addDiagnostic(diagnostics, DIAGNOSTIC_BY_COMPONENT[item.component]);
  }
  for (const item of processObservations) {
    if (item.mode === "MISSING_CALIBRATION") addDiagnostic(diagnostics, "MISSING_CALIBRATION");
    if (finiteNumber(item.runDifferenceMinutes) !== null && Math.abs(item.runDifferenceMinutes) > 0.000001) addDiagnostic(diagnostics, item.process === "cutting" ? "CUTTING_TIME_VARIANCE" : item.process === "bending" ? "BENDING_TIME_VARIANCE" : "WELDING_TIME_VARIANCE");
    if (finiteNumber(item.pierceDifferenceMinutes) !== null && Math.abs(item.pierceDifferenceMinutes) > 0.000001) addDiagnostic(diagnostics, "PIERCE_TIME_VARIANCE");
    if (finiteNumber(item.setupDifferenceMinutes) !== null && Math.abs(item.setupDifferenceMinutes) > 0.000001) addDiagnostic(diagnostics, "SETUP_VARIANCE");
  }
  const materialField = { CARBON_STEEL: "carbonSteelRatePerKg", STAINLESS_STEEL: "stainlessSteelRatePerKg", ALUMINUM: "aluminumRatePerKg", COPPER: "copperRatePerKg" }[engineeringInput.material.materialFamily];
  if (materialField && finiteNumber(pilot.material?.actualInternalMaterialRatePerKg) !== null && finiteNumber(profile.material?.[materialField]) !== null && Math.abs(pilot.material.actualInternalMaterialRatePerKg - profile.material[materialField]) > 0.000001) addDiagnostic(diagnostics, "MATERIAL_RATE_VARIANCE");
  return diagnostics;
}

function proposedAdjustment(field, reason, profile) {
  return {
    status: "PROPOSED_ONLY",
    currentProfileVersion: profile.version,
    proposedField: field,
    proposedValue: "PROFILE_VALUE_NOT_RETURNED",
    reason,
    evidenceCount: 1,
  };
}

function buildProposedAdjustments({ pilot, engineeringInput, processObservations, profile }) {
  const adjustments = [];
  const materialField = { CARBON_STEEL: "carbonSteelRatePerKg", STAINLESS_STEEL: "stainlessSteelRatePerKg", ALUMINUM: "aluminumRatePerKg", COPPER: "copperRatePerKg" }[engineeringInput.material.materialFamily];
  if (materialField && finiteNumber(pilot.material?.actualInternalMaterialRatePerKg) !== null) adjustments.push(proposedAdjustment(`material.${materialField}`, "pilot 提供 actual internal material rate；需 operator review，不自動寫回。", profile));
  for (const item of processObservations) {
    if (item.process === "cutting") {
      if (finiteNumber(pilot.cutting.observedCuttingSpeedMmPerMin) !== null || finiteNumber(pilot.cutting.observedRunMinutes) !== null) adjustments.push(proposedAdjustment("cutting.cuttingSpeedMmPerMin", "pilot 提供切割 speed 或 observed run time；僅提出 review candidate。", profile));
      if (finiteNumber(pilot.cutting.observedPierceSecondsEach) !== null) adjustments.push(proposedAdjustment("cutting.pierceTimeSecondsEach", "pilot 提供穿孔 observation；僅提出 review candidate。", profile));
      if (finiteNumber(pilot.cutting.observedSetupMinutesPerBatch) !== null) adjustments.push(proposedAdjustment("cutting.setupMinutesPerBatch", "pilot 提供切割 setup observation；僅提出 review candidate。", profile));
    }
    if (item.process === "bending") {
      if (finiteNumber(pilot.bending.observedSecondsPerBend) !== null || finiteNumber(pilot.bending.observedRunMinutes) !== null) adjustments.push(proposedAdjustment("bending.secondsPerBend", "pilot 提供折彎 observation；僅提出 review candidate。", profile));
      if (finiteNumber(pilot.bending.observedSetupMinutesPerBatch) !== null) adjustments.push(proposedAdjustment("bending.setupMinutesPerBatch", "pilot 提供折彎 setup observation；僅提出 review candidate。", profile));
    }
    if (item.process === "welding") {
      if (finiteNumber(pilot.welding.observedWeldingSpeedMmPerMin) !== null || finiteNumber(pilot.welding.observedRunMinutes) !== null) adjustments.push(proposedAdjustment("welding.weldingSpeedMmPerMin", "pilot 提供焊接 speed 或 observed run time；僅提出 review candidate。", profile));
      if (finiteNumber(pilot.welding.observedSetupMinutesPerBatch) !== null) adjustments.push(proposedAdjustment("welding.setupMinutesPerBatch", "pilot 提供焊接 setup observation；僅提出 review candidate。", profile));
    }
  }
  if (finiteNumber(pilot.engineeringSetup?.observedSetupMinutesPerBatch) !== null) adjustments.push(proposedAdjustment("setup.engineeringSetupMinutesPerBatch", "pilot 提供 engineering setup observation；僅提出 review candidate。", profile));
  return adjustments;
}

function buildCalibrationComparison({ pilot, engineeringInput, estimate, profile, qualityThresholds = DEFAULT_SYNTHETIC_QUALITY_THRESHOLDS, generatedAt = new Date().toISOString() }) {
  const thresholds = validateQualityThresholds(qualityThresholds);
  const historicalComparison = buildHistoricalComparison({ costBreakdown: estimate.costBreakdown, historicalReference: pilot.historicalReference, quantity: estimate.physical.quantity, thresholds });
  const processObservations = buildProcessObservations({ pilot, engineeringInput, costEstimate: estimate, profile });
  const componentVariance = buildComponentVariance({ costBreakdown: estimate.costBreakdown, componentCosts: pilot.historicalReference?.componentCosts });
  const diagnostics = buildDiagnostics({ historicalComparison, componentVariance, processObservations, pilot, engineeringInput, profile });
  const proposedAdjustments = buildProposedAdjustments({ pilot, engineeringInput, processObservations, profile });
  return {
    state: "CALIBRATION_COMPARISON_READY",
    generatedAt,
    pilotId: pilot.part.pilotId,
    pilotScope: pilot.pilotScope || "SINGLE_CONTROLLED_PILOT",
    historicalComparison,
    componentVariance,
    processObservations,
    diagnostics,
    profileUpdate: {
      status: "PROPOSED_ONLY",
      automaticWriteBack: "DENY",
      currentProfileVersion: profile.version,
      proposedAdjustments,
      evidenceCount: proposedAdjustments.length ? 1 : 0,
    },
    warnings: [
      "單一 pilot 不足以證明模型正確；Phase 4D 不自動調整或寫回 private profile。",
      "quality thresholds 為可設定的 synthetic/default review thresholds，不是未文件化的 business acceptance limits。",
    ],
  };
}

function safeCalibrationHistoryRecord({ pilot, estimateId, profile, comparison, runTimestamp = new Date().toISOString() }) {
  return {
    pilotId: pilot.part.pilotId,
    estimateId,
    profileId: profile.rateProfileId,
    profileVersion: profile.version,
    runTimestamp,
    variancePct: comparison.historicalComparison.variance.variancePct,
    resultStatus: comparison.state,
  };
}

module.exports = {
  COMPONENT_COST_FIELDS,
  comparisonError,
  calculateVariance,
  qualityStatus,
  validateQualityThresholds,
  getHistoricalTotal,
  getHistoricalPerPart,
  buildHistoricalComparison,
  buildProcessObservations,
  buildComponentVariance,
  buildDiagnostics,
  buildProposedAdjustments,
  buildCalibrationComparison,
  safeCalibrationHistoryRecord,
};
