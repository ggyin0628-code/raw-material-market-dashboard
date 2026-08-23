const { estimateEngineeringInput } = require("./engineeringEstimator");
const { getEngineeringEstimateSchema, ENGINEERING_DISCLAIMER } = require("./engineeringContract");

const SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION = "SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION";
const SYNTHETIC_RATE_PRODUCTION_MESSAGE = "SYNTHETIC_TEST 僅供測試／示範，不可在 production API 使用。";

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

function assertRuntimeRatePolicy(input, environment = process.env.NODE_ENV) {
  if (isProductionEnvironment(environment) && input?.rateProfile?.mode === "SYNTHETIC_TEST") throw syntheticRateProductionError();
}

function createEngineeringEstimateResponse(input, now = new Date(), { environment = process.env.NODE_ENV } = {}) {
  assertRuntimeRatePolicy(input, environment);
  return {
    state: "OK",
    generatedAt: new Date(now).toISOString(),
    estimate: estimateEngineeringInput(input),
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
      ? { environment: "production", allowedRateModes: ["NO_RATE"], testOnlyRateModes: ["SYNTHETIC_TEST"] }
      : { environment: environment || "development", allowedRateModes: ["NO_RATE", "SYNTHETIC_TEST"], testOnlyRateModes: ["SYNTHETIC_TEST"] },
    disclaimer: ENGINEERING_DISCLAIMER,
  };
}

module.exports = {
  SYNTHETIC_RATE_NOT_ALLOWED_IN_PRODUCTION,
  SYNTHETIC_RATE_PRODUCTION_MESSAGE,
  isProductionEnvironment,
  assertRuntimeRatePolicy,
  createEngineeringEstimateResponse,
  createEngineeringSchemaResponse,
};
