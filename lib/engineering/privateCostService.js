const { validatePrivateRateProfile } = require("./privateRateProfileContract");
const {
  createSyntheticPrivateCostEstimate,
  createProtectedPrivateCostEstimate,
  privateCostValidationError,
} = require("./privateCostEstimator");
const { calculateProcessTime } = require("./processTimeEstimator");

const PRIVATE_PUBLIC_API_DISABLED = "PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API";
const PRIVATE_PUBLIC_API_MESSAGE = "PRIVATE_CALIBRATED 不可由 anonymous public API 使用；請使用受保護且已授權的 private runtime。";

function publicPrivateModeError() {
  const error = new Error(PRIVATE_PUBLIC_API_MESSAGE);
  error.statusCode = 403;
  error.code = PRIVATE_PUBLIC_API_DISABLED;
  error.errors = [{ path: "input.rateProfile.mode", code: PRIVATE_PUBLIC_API_DISABLED, message: PRIVATE_PUBLIC_API_MESSAGE }];
  return error;
}

function assertPublicRateProfileAllowed(input, environment = process.env.NODE_ENV) {
  if (String(environment || "").toLowerCase() === "production" && input?.rateProfile?.mode === "PRIVATE_CALIBRATED") throw publicPrivateModeError();
  if (input?.rateProfile?.mode === "PRIVATE_CALIBRATED") throw publicPrivateModeError();
}

function createPublicProcessTimeResponse({ baseEstimate, input, processTimeProfile = null, environment = process.env.NODE_ENV }) {
  assertPublicRateProfileAllowed(input, environment);
  const processTimeEstimate = calculateProcessTime({ input, workload: baseEstimate.workload, profile: processTimeProfile });
  return {
    state: "OK",
    estimateMode: "PROCESS_TIME_ESTIMATE",
    processFamily: baseEstimate.processFamily,
    processTimeEstimate,
    costBreakdown: {
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
    },
    marketReference: null,
    marketAdjustmentFactor: null,
    disclaimer: "製程時間估算基礎；未載入公司成本參數，不是供應商報價或公司成本。",
  };
}

function createSyntheticPrivateCostResponse({ baseEstimate, input, profile }) {
  return createSyntheticPrivateCostEstimate({ baseEstimate, input, profile });
}

function createProtectedPrivateCostResponse({ baseEstimate, input, profile, authorization, auditLogger }) {
  return createProtectedPrivateCostEstimate({ baseEstimate, input, profile, authorization, auditLogger });
}

function validatePrivateProfileOrThrow(profile) {
  const errors = validatePrivateRateProfile(profile);
  if (errors.length) throw privateCostValidationError(errors);
  return profile;
}

module.exports = {
  PRIVATE_PUBLIC_API_DISABLED,
  PRIVATE_PUBLIC_API_MESSAGE,
  publicPrivateModeError,
  assertPublicRateProfileAllowed,
  createPublicProcessTimeResponse,
  createSyntheticPrivateCostResponse,
  createProtectedPrivateCostResponse,
  validatePrivateProfileOrThrow,
};
