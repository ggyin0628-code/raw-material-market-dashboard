const fs = require("node:fs");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateEngineeringInput } = require("../lib/engineering/engineeringEstimator");
const { createEngineeringEstimateResponse, createEngineeringSchemaResponse } = require("../lib/engineering/engineeringService");
const { calculateProcessTime } = require("../lib/engineering/processTimeEstimator");
const {
  PRIVATE_CALIBRATED_MODE,
  SYNTHETIC_TEST_MODE,
  PRIVATE_SCOPE,
  getPrivateRateProfileSchema,
  validatePrivateRateProfile,
  safeProfileMetadata,
} = require("../lib/engineering/privateRateProfileContract");
const {
  createSyntheticPrivateCostResponse,
  createProtectedPrivateCostResponse,
  assertPublicRateProfileAllowed,
} = require("../lib/engineering/privateCostService");
const { handleRequest } = require("../server");

// All values in this file are synthetic placeholders and are not company or supplier data.
const BASE_INPUT = {
  processFamily: "SHEET_METAL",
  material: { materialFamily: "CARBON_STEEL", grade: null, thicknessMm: 2, densityKgM3: 7850 },
  blank: { lengthMm: 500, widthMm: 300, quantity: 100 },
  cutting: { enabled: true, cutLengthMmPerPart: 1450, pierceCountPerPart: 8 },
  bending: { enabled: true, bendCountPerPart: 4 },
  welding: { enabled: false, weldLengthMmPerPart: 0 },
  surfaceTreatment: { enabled: false, treatmentType: null, treatedAreaMm2PerPart: 0 },
  setup: { batchCount: 1 },
};

const SYNTHETIC_PROFILE = {
  mode: SYNTHETIC_TEST_MODE,
  rateProfileId: "synthetic-process-time-fixture",
  version: "test-v1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  effectiveTo: null,
  status: "TEST_ONLY",
  currency: "TEST_UNITS",
  material: {
    carbonSteelRatePerKg: 2,
    stainlessSteelRatePerKg: 3,
    aluminumRatePerKg: 4,
    copperRatePerKg: 5,
  },
  cutting: {
    machineRatePerMinute: 10,
    setupRatePerMinute: 20,
    pierceTimeSecondsEach: 6,
    cuttingSpeedMmPerMin: 1000,
    setupMinutesPerBatch: 5,
  },
  bending: {
    machineRatePerMinute: 8,
    setupRatePerMinute: 15,
    secondsPerBend: 12,
    setupMinutesPerBatch: 3,
  },
  welding: {
    laborRatePerMinute: 6,
    machineRatePerMinute: 4,
    weldingSpeedMmPerMin: 100,
    setupMinutesPerBatch: 4,
  },
  surfaceTreatment: { ratePerM2: 7 },
  setup: { engineeringSetupRatePerMinute: 30, engineeringSetupMinutesPerBatch: 2 },
};

function input(overrides = {}) {
  return {
    ...BASE_INPUT,
    ...overrides,
    material: { ...BASE_INPUT.material, ...(overrides.material || {}) },
    blank: { ...BASE_INPUT.blank, ...(overrides.blank || {}) },
    cutting: { ...BASE_INPUT.cutting, ...(overrides.cutting || {}) },
    bending: { ...BASE_INPUT.bending, ...(overrides.bending || {}) },
    welding: { ...BASE_INPUT.welding, ...(overrides.welding || {}) },
    surfaceTreatment: { ...BASE_INPUT.surfaceTreatment, ...(overrides.surfaceTreatment || {}) },
    setup: { ...BASE_INPUT.setup, ...(overrides.setup || {}) },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function responseRecorder() {
  return {
    statusCode: null,
    headers: null,
    body: "",
    writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; },
    end(body = "") { this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); this.done?.(this); },
  };
}

function capture(method, url, body = null, headers = {}, runtimeEnv = process.env) {
  return new Promise((resolve, reject) => {
    const response = responseRecorder();
    response.done = resolve;
    const request = new EventEmitter();
    request.method = method;
    request.url = url;
    request.headers = headers;
    handleRequest(request, response, runtimeEnv).catch(reject);
    if (method === "POST") process.nextTick(() => { if (body !== null) request.emit("data", Buffer.from(body)); request.emit("end"); });
  });
}

function baseEstimate(overrides = {}) {
  return estimateEngineeringInput(input(overrides));
}

function activePrivateProfile() {
  const profile = clone(SYNTHETIC_PROFILE);
  profile.mode = PRIVATE_CALIBRATED_MODE;
  profile.rateProfileId = "private-placeholder-profile-never-loaded";
  profile.version = "private-placeholder-v1";
  profile.status = "ACTIVE";
  return profile;
}

test("process-time model uses only explicit calibration and separates setup, run and pierce minutes", () => {
  const estimate = baseEstimate();
  const first = calculateProcessTime({ input: input(), workload: estimate.workload, profile: SYNTHETIC_PROFILE });
  const second = calculateProcessTime({ input: input(), workload: estimate.workload, profile: SYNTHETIC_PROFILE });
  assert.deepEqual(first, second);
  assert.equal(first.state, "CALCULATED");
  assert.equal(first.source, "SYNTHETIC / DEMO / TEST ONLY");
  assert.deepEqual(first.cutting, { state: "CALCULATED", setupMinutes: 5, runMinutes: 145, pierceMinutes: 80, totalMinutes: 230 });
  assert.deepEqual(first.bending, { state: "CALCULATED", setupMinutes: 3, runMinutes: 80, pierceMinutes: 0, totalMinutes: 83 });
  assert.deepEqual(first.welding, { state: "DISABLED", setupMinutes: 0, runMinutes: 0, totalMinutes: 0 });
  assert.deepEqual(first.overall, { totalSetupMinutes: 8, totalRunMinutes: 225, totalProcessMinutes: 313 });
  assert.equal(first.surfaceTreatment.processingMinutes, null);
  assert.match(first.warnings.join(" "), /SYNTHETIC \/ DEMO \/ TEST ONLY/);
});

test("cutting, bending and welding time formulas use explicit units without hidden speed or efficiency", () => {
  const customInput = input({
    blank: { quantity: 2 },
    cutting: { enabled: true, cutLengthMmPerPart: 1200, pierceCountPerPart: 3 },
    bending: { enabled: true, bendCountPerPart: 5 },
    welding: { enabled: true, weldLengthMmPerPart: 900 },
    setup: { batchCount: 2 },
  });
  const estimate = estimateEngineeringInput(customInput);
  const profile = clone(SYNTHETIC_PROFILE);
  profile.welding.weldingSpeedMmPerMin = 300;
  const result = calculateProcessTime({ input: customInput, workload: estimate.workload, profile });
  assert.deepEqual(result.cutting, { state: "CALCULATED", setupMinutes: 10, runMinutes: 2.4, pierceMinutes: 0.6, totalMinutes: 13 });
  assert.deepEqual(result.bending, { state: "CALCULATED", setupMinutes: 6, runMinutes: 2, pierceMinutes: 0, totalMinutes: 8 });
  assert.deepEqual(result.welding, { state: "CALCULATED", setupMinutes: 8, runMinutes: 6, totalMinutes: 14 });
  assert.deepEqual(result.overall, { totalSetupMinutes: 24, totalRunMinutes: 10.4, totalProcessMinutes: 35 });
  const fields = result.formulaTrace.map((entry) => entry.field);
  assert.ok(fields.includes("totalCuttingRunMinutes"));
  assert.ok(fields.includes("totalPierceMinutes"));
  assert.ok(fields.includes("totalCuttingSetupMinutes"));
  assert.ok(fields.includes("totalBendingRunMinutes"));
  assert.ok(fields.includes("totalBendingSetupMinutes"));
  assert.ok(fields.includes("totalWeldingRunMinutes"));
  assert.ok(fields.includes("totalWeldingSetupMinutes"));
  assert.ok(fields.includes("totalProcessMinutes"));
  for (const entry of result.formulaTrace) {
    assert.ok(entry.formula);
    assert.ok(entry.unitConversion);
    assert.ok(entry.unit);
    assert.equal(entry.rateProfileId, profile.rateProfileId);
    assert.equal(entry.rateProfileVersion, profile.version);
  }
});

test("missing calibration is explicit null time, and public Phase 4A response remains no-rate", () => {
  const estimate = baseEstimate();
  const time = calculateProcessTime({ input: input(), workload: estimate.workload });
  assert.equal(time.state, "CALIBRATION_REQUIRED");
  assert.equal(time.cutting.totalMinutes, null);
  assert.equal(time.bending.totalMinutes, null);
  assert.equal(time.welding.totalMinutes, null);
  assert.equal(time.overall.totalProcessMinutes, null);
  assert.match(time.warnings.join(" "), /不猜測/);
  const response = createEngineeringEstimateResponse(input(), new Date("2026-08-24T00:00:00Z"), { environment: "production" });
  assert.equal(response.estimate.rateProfile.mode, "NO_RATE");
  assert.equal(response.estimate.processTimeEstimate.state, "CALIBRATION_REQUIRED");
  assert.equal(response.estimate.processTimeEstimate.overall.totalProcessMinutes, null);
  assert.equal(response.estimate.costBreakdown.totalEstimatedCost, null);
});

test("batch-based setup changes process burden without changing per-part workload", () => {
  const oneBatchInput = input({ setup: { batchCount: 1 } });
  const fiveBatchInput = input({ setup: { batchCount: 5 } });
  const one = calculateProcessTime({ input: oneBatchInput, workload: baseEstimate({ setup: { batchCount: 1 } }).workload, profile: SYNTHETIC_PROFILE });
  const five = calculateProcessTime({ input: fiveBatchInput, workload: baseEstimate({ setup: { batchCount: 5 } }).workload, profile: SYNTHETIC_PROFILE });
  assert.equal(one.overall.totalRunMinutes, five.overall.totalRunMinutes);
  assert.equal(one.overall.totalSetupMinutes, 8);
  assert.equal(five.overall.totalSetupMinutes, 40);
  assert.equal(one.overall.totalProcessMinutes, 313);
  assert.equal(five.overall.totalProcessMinutes, 345);
});

test("disabled processes are zero, surface treatment stays no-model, and no hidden efficiency is applied", () => {
  const disabledInput = input({
    cutting: { enabled: false, cutLengthMmPerPart: 9999, pierceCountPerPart: 99 },
    bending: { enabled: false, bendCountPerPart: 99 },
    welding: { enabled: false, weldLengthMmPerPart: 9999 },
    surfaceTreatment: { enabled: true, treatmentType: "SYNTHETIC_TEST_ONLY", treatedAreaMm2PerPart: 10000 },
  });
  const estimate = estimateEngineeringInput(disabledInput);
  const time = calculateProcessTime({ input: disabledInput, workload: estimate.workload, profile: SYNTHETIC_PROFILE });
  assert.deepEqual(time.cutting, { state: "DISABLED", setupMinutes: 0, runMinutes: 0, pierceMinutes: 0, totalMinutes: 0 });
  assert.deepEqual(time.bending, { state: "DISABLED", setupMinutes: 0, runMinutes: 0, pierceMinutes: 0, totalMinutes: 0 });
  assert.deepEqual(time.welding, { state: "DISABLED", setupMinutes: 0, runMinutes: 0, totalMinutes: 0 });
  assert.deepEqual(time.surfaceTreatment, { state: "NO_MODEL", processingMinutes: null });
  assert.equal(time.overall.totalProcessMinutes, 0);
});

test("private profile validation is strict about fields, lifecycle and non-negative calibration", () => {
  const valid = validatePrivateRateProfile(SYNTHETIC_PROFILE);
  assert.deepEqual(valid, []);
  const unknown = clone(SYNTHETIC_PROFILE);
  unknown.unexpectedSecret = "never-a-secret";
  assert.ok(validatePrivateRateProfile(unknown).some((error) => error.code === "UNEXPECTED_FIELD"));
  const missing = clone(SYNTHETIC_PROFILE);
  delete missing.cutting.cuttingSpeedMmPerMin;
  assert.ok(validatePrivateRateProfile(missing).some((error) => error.path === "rateProfile.cutting.cuttingSpeedMmPerMin"));
  const negative = clone(SYNTHETIC_PROFILE);
  negative.bending.secondsPerBend = -1;
  assert.ok(validatePrivateRateProfile(negative).some((error) => error.path === "rateProfile.bending.secondsPerBend"));
  const notTestOnly = clone(SYNTHETIC_PROFILE);
  notTestOnly.status = "ACTIVE";
  assert.ok(validatePrivateRateProfile(notTestOnly).some((error) => error.code === "SYNTHETIC_PROFILE_NOT_TEST_ONLY"));
  const privateDraft = activePrivateProfile();
  privateDraft.status = "DRAFT";
  assert.ok(validatePrivateRateProfile(privateDraft).some((error) => error.code === "PRIVATE_PROFILE_NOT_ACTIVE"));
});

test("profile metadata and internal schema expose identifiers and policy, never raw rate values", () => {
  const metadata = safeProfileMetadata(SYNTHETIC_PROFILE);
  assert.deepEqual(metadata, {
    mode: "SYNTHETIC_TEST",
    source: "SYNTHETIC / DEMO / TEST ONLY",
    rateProfileId: "synthetic-process-time-fixture",
    version: "test-v1",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    status: "TEST_ONLY",
    currency: "TEST_UNITS",
  });
  const schemaText = JSON.stringify(getPrivateRateProfileSchema());
  assert.match(schemaText, /internalOnly/);
  assert.match(schemaText, /NEVER_EMBEDDED/);
  assert.match(schemaText, /DENY/);
  assert.equal(schemaText.includes('"carbonSteelRatePerKg":2'), false);
  assert.equal(schemaText.includes('"machineRatePerMinute":10'), false);
});

test("synthetic private cost is deterministic, explicit and fully traceable without returning raw rates", () => {
  const estimate = baseEstimate({ welding: { enabled: true, weldLengthMmPerPart: 100 }, surfaceTreatment: { enabled: true, treatmentType: "TEST_ONLY", treatedAreaMm2PerPart: 1000 } });
  const first = createSyntheticPrivateCostResponse({ baseEstimate: estimate, input: input({ welding: { enabled: true, weldLengthMmPerPart: 100 }, surfaceTreatment: { enabled: true, treatmentType: "TEST_ONLY", treatedAreaMm2PerPart: 1000 } }), profile: SYNTHETIC_PROFILE });
  const second = createSyntheticPrivateCostResponse({ baseEstimate: estimate, input: input({ welding: { enabled: true, weldLengthMmPerPart: 100 }, surfaceTreatment: { enabled: true, treatmentType: "TEST_ONLY", treatedAreaMm2PerPart: 1000 } }), profile: SYNTHETIC_PROFILE });
  assert.deepEqual(first, second);
  assert.equal(first.state, "CALCULATED");
  assert.equal(first.estimateMode, "COST_ESTIMATE");
  assert.equal(first.costBreakdown.materialCost, 471);
  assert.equal(first.costBreakdown.cuttingSetupCost, 100);
  assert.equal(first.costBreakdown.cuttingRunCost, 1450);
  assert.equal(first.costBreakdown.piercingCost, 800);
  assert.equal(first.costBreakdown.bendingSetupCost, 45);
  assert.equal(first.costBreakdown.bendingRunCost, 640);
  assert.equal(first.costBreakdown.weldingSetupCost, 40);
  assert.equal(first.costBreakdown.weldingRunCost, 1000);
  assert.equal(first.costBreakdown.surfaceTreatmentCost, 0.7);
  assert.equal(first.costBreakdown.engineeringSetupCost, 60);
  assert.equal(first.costBreakdown.totalEstimatedCost, 4606.7);
  assert.equal(first.costBreakdown.estimatedCostPerPart, 46.067);
  assert.equal(first.costBreakdown.currency, "TEST_UNITS");
  assert.equal(first.marketReference, null);
  assert.equal(first.marketAdjustmentFactor, null);
  assert.equal(first.rateProfile.rateProfileId, "synthetic-process-time-fixture");
  assert.equal(first.rateProfile.version, "test-v1");
  assert.match(first.disclaimer, /SYNTHETIC \/ DEMO \/ TEST ONLY/);
  assert.ok(first.formulaTrace.length >= 20);
  for (const entry of first.formulaTrace) {
    assert.ok(entry.formula);
    assert.ok(entry.unitConversion);
    assert.ok(entry.unit);
    assert.equal(entry.rateProfileId, "synthetic-process-time-fixture");
    assert.equal(entry.rateProfileVersion, "test-v1");
  }
  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes('"machineRatePerMinute":10'), false);
  assert.equal(serialized.includes('"carbonSteelRatePerKg":2'), false);
  assert.match(serialized, /PROFILE_VALUE_NOT_RETURNED/);
});

test("protected private cost requires explicit identity, scope and audit logger, and returns safe metadata only", () => {
  const estimate = baseEstimate();
  const profile = activePrivateProfile();
  assert.throws(() => createProtectedPrivateCostResponse({ baseEstimate: estimate, input: input(), profile }), (error) => error.code === "PRIVATE_AUTHENTICATION_REQUIRED");
  assert.throws(() => createProtectedPrivateCostResponse({ baseEstimate: estimate, input: input(), profile, authorization: { authenticated: true, scopes: [] }, auditLogger: () => {} }), (error) => error.code === "PRIVATE_SCOPE_REQUIRED");
  const auditEvents = [];
  const result = createProtectedPrivateCostResponse({
    baseEstimate: estimate,
    input: input(),
    profile,
    authorization: { authenticated: true, subject: "synthetic-private-test-identity", scopes: [PRIVATE_SCOPE] },
    auditLogger: (event) => auditEvents.push(event),
  });
  assert.equal(result.state, "CALCULATED");
  assert.equal(result.rateProfile.mode, "PRIVATE_CALIBRATED");
  assert.equal(result.rateProfile.rateProfileId, "private-placeholder-profile-never-loaded");
  assert.equal(result.rateProfile.version, "private-placeholder-v1");
  assert.equal(result.costBreakdown.totalEstimatedCost, 3566);
  assert.equal(result.marketAdjustmentFactor, null);
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].authorizedLocalIdentity, "synthetic-private-test-identity");
  assert.equal(auditEvents[0].rateProfileId, "private-placeholder-profile-never-loaded");
  assert.equal(auditEvents[0].rateProfileVersion, "private-placeholder-v1");
  assert.equal(auditEvents[0].processFamily, "SHEET_METAL");
  assert.equal(auditEvents[0].resultStatus, "CALCULATED");
  assert.deepEqual(Object.keys(auditEvents[0]).sort(), ["authorizedLocalIdentity", "estimateId", "processFamily", "rateProfileId", "rateProfileVersion", "resultStatus", "timestamp"].sort());
  assert.equal(Object.keys(auditEvents[0]).some((key) => /RatePer|RatePerMinute|SecondsPer|SpeedMm/.test(key)), false);
  assert.equal(JSON.stringify(result).includes('"machineRatePerMinute":10'), false);
});

test("anonymous public API rejects PRIVATE_CALIBRATED and has no private route or private rate schema", async () => {
  assert.throws(() => assertPublicRateProfileAllowed({ rateProfile: { mode: "PRIVATE_CALIBRATED" } }, "production"), (error) => error.code === "PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API");
  const rejected = await capture("POST", "/api/engineering/estimate", JSON.stringify(input({ rateProfile: { mode: "PRIVATE_CALIBRATED" } })), { "content-type": "application/json" }, { NODE_ENV: "production" });
  assert.equal(rejected.statusCode, 403);
  const rejectedBody = JSON.parse(rejected.body);
  assert.equal(rejectedBody.code, "PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API");
  assert.equal(rejectedBody.errors.some((error) => error.code === "PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API"), true);
  const schema = JSON.stringify(createEngineeringSchemaResponse({ environment: "production" }));
  assert.equal(schema.includes("carbonSteelRatePerKg"), false);
  assert.equal(schema.includes("machineRatePerMinute"), false);
  assert.match(schema, /DENY_ANONYMOUS_PUBLIC_API/);
  const privateRoute = await capture("GET", "/api/engineering/private-cost");
  assert.equal(privateRoute.statusCode, 404);
});

test("public UI and market APIs contain no private-rate entry or cost coupling", () => {
  const estimateHtml = fs.readFileSync("estimate.html", "utf8");
  const estimateJs = fs.readFileSync("estimate.js", "utf8");
  const marketHtml = fs.readFileSync("sheet-metal.html", "utf8");
  assert.doesNotMatch(estimateHtml, /carbonSteelRatePerKg|machineRatePerMinute|private-rate-input/);
  assert.doesNotMatch(estimateJs, /carbonSteelRatePerKg|machineRatePerMinute|PRIVATE_CALIBRATED/);
  assert.match(estimateHtml, /尚未載入製程時間校正參數/);
  assert.match(estimateHtml, /NO_RATE/);
  assert.doesNotMatch(marketHtml, /PRIVATE_CALIBRATED|machineRatePerMinute|private-cost/);
});
