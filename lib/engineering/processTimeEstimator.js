const { round } = require("./engineeringEstimator");
const {
  PRIVATE_CALIBRATED_MODE,
  SYNTHETIC_TEST_MODE,
  PRIVATE_SOURCE,
  SYNTHETIC_SOURCE,
  validatePrivateRateProfile,
  safeProfileMetadata,
} = require("./privateRateProfileContract");

function processValidationError(errors) {
  const error = new Error("製程時間校正輸入驗證失敗。");
  error.statusCode = 400;
  error.code = "PRIVATE_PROFILE_VALIDATION_ERROR";
  error.errors = errors;
  return error;
}

function traceEntry(field, formula, inputs, unitConversion, result, unit, profile) {
  return {
    field,
    formula,
    inputs,
    unitConversion,
    result,
    unit,
    rateProfileId: profile?.rateProfileId || null,
    rateProfileVersion: profile?.version || null,
  };
}

function unavailableProcessTime(state = "CALIBRATION_REQUIRED") {
  return {
    state,
    setupMinutes: null,
    runMinutes: null,
    pierceMinutes: null,
    totalMinutes: null,
  };
}

function disabledProcessTime() {
  return {
    state: "DISABLED",
    setupMinutes: 0,
    runMinutes: 0,
    pierceMinutes: 0,
    totalMinutes: 0,
  };
}

function unavailableEstimate() {
  return {
    state: "CALIBRATION_REQUIRED",
    source: null,
    profile: null,
    cutting: unavailableProcessTime(),
    bending: unavailableProcessTime(),
    welding: { state: "CALIBRATION_REQUIRED", setupMinutes: null, runMinutes: null, totalMinutes: null },
    surfaceTreatment: { state: "NO_MODEL", processingMinutes: null },
    overall: { totalSetupMinutes: null, totalRunMinutes: null, totalProcessMinutes: null },
    formulaTrace: [],
    warnings: [
      "未提供受核准的製程時間校正 profile；不猜測切割速度、每折秒數、焊接速度、setup time 或操作效率，因此 processTimeEstimate 保持 null。",
      "表面處理目前沒有可信的工程時間模型；treated area 可用，但 processingMinutes 保持 null。",
    ],
  };
}

function profileSource(profile) {
  return profile.mode === SYNTHETIC_TEST_MODE ? SYNTHETIC_SOURCE : PRIVATE_SOURCE;
}

function calculateProcessTime({ input, workload, profile = null }) {
  if (!profile) return unavailableEstimate();
  const errors = validatePrivateRateProfile(profile);
  if (errors.length) throw processValidationError(errors);
  if (![PRIVATE_CALIBRATED_MODE, SYNTHETIC_TEST_MODE].includes(profile.mode)) {
    throw processValidationError([{ path: "rateProfile.mode", code: "UNSUPPORTED_PRIVATE_RATE_MODE", message: "不支援的 private rate mode。" }]);
  }

  const batchCount = workload.batchCount;
  const cutLengthMm = workload.totalCutLengthM * 1000;
  const pierceCount = workload.totalPierceCount;
  const bendCount = workload.totalBendCount;
  const weldLengthMm = workload.totalWeldLengthM * 1000;
  const cutting = input.cutting.enabled
    ? {
        state: "CALCULATED",
        setupMinutes: round(profile.cutting.setupMinutesPerBatch * batchCount),
        runMinutes: round(cutLengthMm / profile.cutting.cuttingSpeedMmPerMin),
        pierceMinutes: round(pierceCount * profile.cutting.pierceTimeSecondsEach / 60),
      }
    : disabledProcessTime();
  if (cutting.state === "CALCULATED") cutting.totalMinutes = round(cutting.setupMinutes + cutting.runMinutes + cutting.pierceMinutes);

  const bending = input.bending.enabled
    ? {
        state: "CALCULATED",
        setupMinutes: round(profile.bending.setupMinutesPerBatch * batchCount),
        runMinutes: round(bendCount * profile.bending.secondsPerBend / 60),
        pierceMinutes: 0,
      }
    : disabledProcessTime();
  if (bending.state === "CALCULATED") bending.totalMinutes = round(bending.setupMinutes + bending.runMinutes);

  const welding = input.welding.enabled
    ? {
        state: "CALCULATED",
        setupMinutes: round(profile.welding.setupMinutesPerBatch * batchCount),
        runMinutes: round(weldLengthMm / profile.welding.weldingSpeedMmPerMin),
        totalMinutes: null,
      }
    : { state: "DISABLED", setupMinutes: 0, runMinutes: 0, totalMinutes: 0 };
  if (welding.state === "CALCULATED") welding.totalMinutes = round(welding.setupMinutes + welding.runMinutes);

  const totalSetupMinutes = round([cutting.setupMinutes, bending.setupMinutes, welding.setupMinutes].reduce((sum, value) => sum + value, 0));
  const totalRunMinutes = round([cutting.runMinutes, bending.runMinutes, welding.runMinutes].reduce((sum, value) => sum + value, 0));
  const totalProcessMinutes = round([cutting.totalMinutes, bending.totalMinutes, welding.totalMinutes].reduce((sum, value) => sum + value, 0));
  const formulaTrace = [];
  if (input.cutting.enabled) {
    formulaTrace.push(traceEntry("totalCuttingRunMinutes", "totalCutLengthMm ÷ cuttingSpeedMmPerMin", { totalCutLengthMm: round(cutLengthMm), cuttingSpeedMmPerMin: "PROFILE_VALUE_NOT_RETURNED" }, "mm ÷ (mm/min) = min", cutting.runMinutes, "min", profile));
    formulaTrace.push(traceEntry("totalPierceMinutes", "totalPierceCount × pierceTimeSecondsEach ÷ 60", { totalPierceCount: pierceCount, pierceTimeSecondsEach: "PROFILE_VALUE_NOT_RETURNED" }, "each × s/each ÷ 60 = min", cutting.pierceMinutes, "min", profile));
    formulaTrace.push(traceEntry("totalCuttingSetupMinutes", "setupMinutesPerBatch × batchCount", { setupMinutesPerBatch: "PROFILE_VALUE_NOT_RETURNED", batchCount }, "min/batch × batch = min", cutting.setupMinutes, "min", profile));
    formulaTrace.push(traceEntry("totalCuttingMinutes", "setupMinutes + runMinutes + pierceMinutes", { setupMinutes: cutting.setupMinutes, runMinutes: cutting.runMinutes, pierceMinutes: cutting.pierceMinutes }, "min + min + min = min", cutting.totalMinutes, "min", profile));
  }
  if (input.bending.enabled) {
    formulaTrace.push(traceEntry("totalBendingRunMinutes", "totalBendCount × secondsPerBend ÷ 60", { totalBendCount: bendCount, secondsPerBend: "PROFILE_VALUE_NOT_RETURNED" }, "each × s/each ÷ 60 = min", bending.runMinutes, "min", profile));
    formulaTrace.push(traceEntry("totalBendingSetupMinutes", "setupMinutesPerBatch × batchCount", { setupMinutesPerBatch: "PROFILE_VALUE_NOT_RETURNED", batchCount }, "min/batch × batch = min", bending.setupMinutes, "min", profile));
    formulaTrace.push(traceEntry("totalBendingMinutes", "setupMinutes + runMinutes", { setupMinutes: bending.setupMinutes, runMinutes: bending.runMinutes }, "min + min = min", bending.totalMinutes, "min", profile));
  }
  if (input.welding.enabled) {
    formulaTrace.push(traceEntry("totalWeldingRunMinutes", "totalWeldLengthMm ÷ weldingSpeedMmPerMin", { totalWeldLengthMm: round(weldLengthMm), weldingSpeedMmPerMin: "PROFILE_VALUE_NOT_RETURNED" }, "mm ÷ (mm/min) = min", welding.runMinutes, "min", profile));
    formulaTrace.push(traceEntry("totalWeldingSetupMinutes", "setupMinutesPerBatch × batchCount", { setupMinutesPerBatch: "PROFILE_VALUE_NOT_RETURNED", batchCount }, "min/batch × batch = min", welding.setupMinutes, "min", profile));
    formulaTrace.push(traceEntry("totalWeldingMinutes", "setupMinutes + runMinutes", { setupMinutes: welding.setupMinutes, runMinutes: welding.runMinutes }, "min + min = min", welding.totalMinutes, "min", profile));
  }
  formulaTrace.push(traceEntry("totalSetupMinutes", "cutting.setupMinutes + bending.setupMinutes + welding.setupMinutes", { cutting: cutting.setupMinutes, bending: bending.setupMinutes, welding: welding.setupMinutes }, "min + min + min = min", totalSetupMinutes, "min", profile));
  formulaTrace.push(traceEntry("totalRunMinutes", "cutting.runMinutes + bending.runMinutes + welding.runMinutes", { cutting: cutting.runMinutes, bending: bending.runMinutes, welding: welding.runMinutes }, "min + min + min = min", totalRunMinutes, "min", profile));
  formulaTrace.push(traceEntry("totalProcessMinutes", "cutting.totalMinutes + bending.totalMinutes + welding.totalMinutes", { cutting: cutting.totalMinutes, bending: bending.totalMinutes, welding: welding.totalMinutes }, "min + min + min = min", totalProcessMinutes, "min", profile));

  return {
    state: "CALCULATED",
    source: profileSource(profile),
    profile: safeProfileMetadata(profile, profileSource(profile)),
    cutting,
    bending,
    welding,
    surfaceTreatment: { state: "NO_MODEL", processingMinutes: null },
    overall: { totalSetupMinutes, totalRunMinutes, totalProcessMinutes },
    formulaTrace,
    warnings: profile.mode === SYNTHETIC_TEST_MODE
      ? ["目前為 SYNTHETIC / DEMO / TEST ONLY；時間與成本數字不可作為公司標準、供應商報價或市場價格。", "表面處理目前沒有可信的工程時間模型；processingMinutes 保持 null。"]
      : ["PRIVATE_CALIBRATED 只能在受保護且已授權 runtime 使用；本 public API 不會接受此 mode。", "表面處理目前沒有可信的工程時間模型；processingMinutes 保持 null。"],
  };
}

module.exports = {
  calculateProcessTime,
  unavailableEstimate,
  processValidationError,
};
