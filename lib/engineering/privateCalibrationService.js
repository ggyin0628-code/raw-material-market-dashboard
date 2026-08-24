const { estimateEngineeringInput } = require("./engineeringEstimator");
const { PRIVATE_SCOPE, validatePrivateRateProfile } = require("./privateRateProfileContract");
const { validatePrivateCalibrationPilot, pilotToEngineeringInput, safePilotMetadata } = require("./privateCalibrationPilotContract");
const { createProtectedPrivateCostEstimate, privateCostValidationError } = require("./privateCostEstimator");
const { buildCalibrationComparison, safeCalibrationHistoryRecord } = require("./privateCalibrationComparison");

function calibrationPilotValidationError(errors) {
  const error = new Error("內部工程成本 calibration pilot 輸入驗證失敗。");
  error.statusCode = 400;
  error.code = "PRIVATE_CALIBRATION_PILOT_INVALID";
  error.errors = errors;
  return error;
}

function assertCalibrationPilotAuthorization(authorization) {
  if (!authorization || authorization.authenticated !== true) {
    const error = new Error("需要已驗證的 private runtime identity。");
    error.statusCode = 403;
    error.code = "PRIVATE_CALIBRATION_AUTHENTICATION_REQUIRED";
    throw error;
  }
  if (!Array.isArray(authorization.scopes) || !authorization.scopes.includes(PRIVATE_SCOPE)) {
    const error = new Error(`需要 scope ${PRIVATE_SCOPE}。`);
    error.statusCode = 403;
    error.code = "PRIVATE_CALIBRATION_SCOPE_REQUIRED";
    throw error;
  }
}

function createPrivateCalibrationPilotResponse({ pilot, profile, authorization, auditLogger, historyLogger, estimateId, qualityThresholds, generatedAt = new Date().toISOString() }) {
  assertCalibrationPilotAuthorization(authorization);
  const pilotErrors = validatePrivateCalibrationPilot(pilot);
  if (pilotErrors.length) throw calibrationPilotValidationError(pilotErrors);
  const profileErrors = validatePrivateRateProfile(profile);
  if (profileErrors.length) throw privateCostValidationError(profileErrors);
  const engineeringInput = pilotToEngineeringInput(pilot);
  const baseEstimate = estimateEngineeringInput(engineeringInput);
  const estimate = createProtectedPrivateCostEstimate({
    baseEstimate,
    input: engineeringInput,
    profile,
    authorization,
    auditLogger,
    estimateId,
  });
  const comparison = buildCalibrationComparison({
    pilot,
    engineeringInput,
    estimate,
    profile,
    qualityThresholds,
    generatedAt,
  });
  if (typeof historyLogger === "function") historyLogger(safeCalibrationHistoryRecord({ pilot, estimateId, profile, comparison, runTimestamp: generatedAt }));
  return {
    state: "OK",
    estimateId,
    pilot: safePilotMetadata(pilot),
    estimate,
    calibrationComparison: comparison,
  };
}

module.exports = {
  calibrationPilotValidationError,
  assertCalibrationPilotAuthorization,
  createPrivateCalibrationPilotResponse,
};
