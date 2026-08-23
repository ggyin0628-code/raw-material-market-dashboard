const { estimateEngineeringInput } = require("./engineeringEstimator");
const { unavailableEstimate } = require("./processTimeEstimator");
const { getEngineeringEstimateSchema, ENGINEERING_DISCLAIMER } = require("./engineeringContract");

const SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION = "SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION";
const SYNTHETIC_RATE_PRODUCTION_MESSAGE = "SYNTHETIC_TEST 僅供測試／示範，不可在 production API 使用。";
const PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API = "PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API";
const PRIVATE_CALIBRATED_PUBLIC_MESSAGE = "PRIVATE_CALIBRATED 不可由 anonymous public API 使用；請使用受保護且已授權的 private runtime。";

function isProductionEnvironment(environment = process.env.NODE_ENV) {
  return String(environment || "").toLowerCase() === "production";
}

function syntheticRateProductionError() {
  const error = new Error(SYNTHETIC_RATE_PRODUCTION_MESSAGE);
  error.statusCode = 400;
  error.code = SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION;
  error.errors = [{
    path: "input.rateProfile.mode",
    code: SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION,
    message: SYNTHETIC_RATE_PRODUCTION_MESSAGE,
  }];
  return error;
}

function privateCalibratedPublicError() {
  const error = new Error(PRIVATE_CALIBRATED_PUBLIC_MESSAGE);
  error.statusCode = 403;
  error.code = PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API;
  error.errors = [{
    path: "input.rateProfile.mode",
    code: PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API,
    message: PRIVATE_CALIBRATED_PUBLIC_MESSAGE,
  }];
  return error;
}

function assertRuntimeRatePolicy(input, environment = process.env.NODE_ENV) {
  if (input?.rateProfile?.mode === "PRIVATE_CALIBRATED") throw privateCalibratedPublicError();
  if (isProductionEnvironment(environment) && input?.rateProfile?.mode === "SYNTHETIC_TEST") throw syntheticRateProductionError();
}

function createEngineeringEstimateResponse(input, now = new Date(), { environment = process.env.NODE_ENV } = {}) {
  assertRuntimeRatePolicy(input, environment);
  const estimate = estimateEngineeringInput(input);
  return {
    state: "OK",
    generatedAt: new Date(now).toISOString(),
    estimate: {
      ...estimate,
      processTimeEstimate: unavailableEstimate(),
    },
  };
}

function createEngineeringSchemaResponse({ environment = process.env.NODE_ENV } = {}) {
  const schema = getEngineeringEstimateSchema();
  const production = isProductionEnvironment(environment);
  if (production) {
    schema.rateProfile = {
      ...schema.rateProfile,
      allowedModes: ["NO_RATE"],
      testOnlyModes: ["SYNTHETIC_TEST"],
      testOnlyNote: SYNTHETIC_RATE_PRODUCTION_MESSAGE,
    };
  }
  return {
    state: "OK",
    schema,
    runtime: production
      ? { environment: "production", allowedRateModes: ["NO_RATE"], testOnlyRateModes: ["SYNTHETIC_TEST"], privateCalibrated: "DENY_ANONYMOUS_PUBLIC_API" }
      : { environment: environment || "development", allowedRateModes: ["NO_RATE", "SYNTHETIC_TEST"], testOnlyRateModes: ["SYNTHETIC_TEST"], privateCalibrated: "DENY_ANONYMOUS_PUBLIC_API" },
    disclaimer: ENGINEERING_DISCLAIMER,
  };
}

module.exports = {
  SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION,
  SYNTHETIC_RATE_PRODUCTION_MESSAGE,
  PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API,
  PRIVATE_CALIBRATED_PUBLIC_MESSAGE,
  isProductionEnvironment,
  syntheticRateProductionError,
  privateCalibratedPublicError,
  assertRuntimeRatePolicy,
  createEngineeringEstimateResponse,
  createEngineeringSchemaResponse,
};
