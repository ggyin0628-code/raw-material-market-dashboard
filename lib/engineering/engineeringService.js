const { estimateEngineeringInput } = require("./engineeringEstimator");
const { getEngineeringEstimateSchema, ENGINEERING_DISCLAIMER } = require("./engineeringContract");

function createEngineeringEstimateResponse(input, now = new Date()) {
  return {
    state: "OK",
    generatedAt: new Date(now).toISOString(),
    estimate: estimateEngineeringInput(input),
  };
}

function createEngineeringSchemaResponse() {
  return {
    state: "OK",
    schema: getEngineeringEstimateSchema(),
    disclaimer: ENGINEERING_DISCLAIMER,
  };
}

module.exports = {
  createEngineeringEstimateResponse,
  createEngineeringSchemaResponse,
};
