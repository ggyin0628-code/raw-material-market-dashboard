const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const assert = require("node:assert/strict");
const { handleRequest } = require("../server");
const { startPrivateRuntime, DEFAULT_HOST } = require("../private-runtime");
const { PRIVATE_SCOPE } = require("../lib/engineering/privateRateProfileContract");
const { estimateEngineeringInput } = require("../lib/engineering/engineeringEstimator");
const {
  PILOT_SCOPE,
  OBSERVED_TIME,
  RATE_BASED,
  validatePrivateCalibrationPilot,
  pilotToEngineeringInput,
  safePilotMetadata,
  getCalibrationPilotSchema,
} = require("../lib/engineering/privateCalibrationPilotContract");
const { loadPrivateCalibrationPilot } = require("../lib/engineering/privateCalibrationPilotLoader");
const {
  calculateVariance,
  qualityStatus,
  buildHistoricalComparison,
  buildProcessObservations,
  buildComponentVariance,
  buildCalibrationComparison,
  safeCalibrationHistoryRecord,
} = require("../lib/engineering/privateCalibrationComparison");
const { createCalibrationHistoryLogger } = require("../lib/engineering/privateCalibrationHistory");
const { createPrivateCalibrationPilotResponse } = require("../lib/engineering/privateCalibrationService");
const { REPOSITORY_ROOT } = require("../lib/engineering/privateProfileLoader");

const NOW = new Date("2026-08-24T00:00:00.000Z");
const SENTINEL = "SENTINEL_PRIVATE_PILOT_4D_NEVER_PUBLIC";
const SENTINEL_RATE = 9876543.21;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function profileFixture() {
  return {
    mode: "PRIVATE_CALIBRATED",
    rateProfileId: "local-private-pilot-synthetic-profile",
    version: "pilot-test-v1",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    status: "ACTIVE",
    currency: "TEST_UNITS",
    metadata: { source: "SYNTHETIC / DEMO / TEST ONLY", owner: "local-pilot-test", approvalStatus: "APPROVED", note: SENTINEL },
    material: { carbonSteelRatePerKg: 2, stainlessSteelRatePerKg: 3, aluminumRatePerKg: 4, copperRatePerKg: SENTINEL_RATE },
    cutting: { machineRatePerMinute: 10, setupRatePerMinute: 20, pierceTimeSecondsEach: 6, cuttingSpeedMmPerMin: 1000, setupMinutesPerBatch: 5 },
    bending: { machineRatePerMinute: 8, setupRatePerMinute: 15, secondsPerBend: 12, setupMinutesPerBatch: 3 },
    welding: { laborRatePerMinute: 6, machineRatePerMinute: 4, weldingSpeedMmPerMin: 100, setupMinutesPerBatch: 4 },
    surfaceTreatment: { ratePerM2: 7 },
    setup: { engineeringSetupRatePerMinute: 30, engineeringSetupMinutesPerBatch: 2 },
  };
}
function pilotFixture() {
  return {
    pilotScope: PILOT_SCOPE,
    part: { pilotId: "DEMO_PILOT_4D_001", materialFamily: "CARBON_STEEL", grade: "TEST_ONLY", thicknessMm: 2, blankLengthMm: 500, blankWidthMm: 300, quantity: 100, batchCount: 1 },
    material: { densityKgM3: 7850, actualInternalMaterialRatePerKg: 2.1 },
    cutting: { cutLengthMmPerPart: 1450, pierceCountPerPart: 8, observedCuttingSpeedMmPerMin: 900, observedRunMinutes: null, observedPierceSecondsEach: 7, observedSetupMinutesPerBatch: 6, internalMachineRatePerMinute: 10, internalSetupRatePerMinute: 20 },
    bending: { bendCountPerPart: 4, observedSecondsPerBend: 15, observedRunMinutes: null, observedSetupMinutesPerBatch: 4, internalMachineRatePerMinute: 8, internalSetupRatePerMinute: 15 },
    welding: { weldLengthMmPerPart: 0, observedWeldingSpeedMmPerMin: null, observedRunMinutes: null, observedSetupMinutesPerBatch: null, internalLaborRatePerMinute: null, internalMachineRatePerMinute: null },
    surfaceTreatment: { treatedAreaMm2PerPart: 0, internalRatePerM2: null },
    engineeringSetup: { observedSetupMinutesPerBatch: 3, internalRatePerMinute: 30 },
    historicalReference: { actualHistoricalTotalInternalCost: 250, componentCosts: { material: 74, cutting: 25, piercing: 10, bending: 75, setup: 60 } },
  };
}
function estimateFixture() {
  const input = pilotToEngineeringInput(pilotFixture());
  const base = estimateEngineeringInput(input);
  const processTimeEstimate = require("../lib/engineering/processTimeEstimator").calculateProcessTime({ input, workload: base.workload, profile: profileFixture() });
  const cost = require("../lib/engineering/privateCostEstimator").createSyntheticPrivateCostEstimate({ baseEstimate: base, input, profile: { ...profileFixture(), mode: "SYNTHETIC_TEST", status: "TEST_ONLY", metadata: undefined } });
  return { input, base, estimate: cost };
}
function responseRecorder() {
  return { statusCode: null, headers: null, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, end(body = "") { this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); this.done?.(this); } };
}
function capturePublic(method, url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const response = responseRecorder();
    response.done = resolve;
    const request = new (require("node:events").EventEmitter)();
    request.method = method;
    request.url = url;
    request.headers = headers;
    request.socket = { remoteAddress: "127.0.0.1" };
    handleRequest(request, response, { ...process.env, NODE_ENV: "production" }).catch(reject);
    if (method === "POST") process.nextTick(() => { if (body !== null) request.emit("data", Buffer.from(body)); request.emit("end"); });
  });
}
function requestPrivate(port, method, pathname, body = null, cookie = "") {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== null) {
      headers["content-type"] = "application/json";
      headers["content-length"] = Buffer.byteLength(body);
    }
    const request = http.request({ hostname: "127.0.0.1", port, method, path: pathname, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ statusCode: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    if (body !== null) request.write(body);
    request.end();
  });
}
function tempPilotFiles() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "raw-material-private-4d-"));
  const profilePath = path.join(directory, "private-rate-profile.json");
  const pilotPath = path.join(directory, "private-calibration-pilot.json");
  const auditPath = path.join(directory, "private-audit.jsonl");
  const historyPath = path.join(directory, "private-calibration-history.jsonl");
  fs.writeFileSync(profilePath, `${JSON.stringify(profileFixture(), null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(pilotPath, `${JSON.stringify(pilotFixture(), null, 2)}\n`, { mode: 0o600 });
  return { directory, profilePath, pilotPath, auditPath, historyPath };
}

const authorized = { authenticated: true, subject: "authorized-local-pilot-test", scopes: [PRIVATE_SCOPE] };

test("Phase 4D pilot contract is strict, external, scoped to one pilot, and exposes safe schema only", () => {
  const pilot = pilotFixture();
  assert.deepEqual(validatePrivateCalibrationPilot(pilot), []);
  assert.deepEqual(safePilotMetadata(pilot), { pilotId: "DEMO_PILOT_4D_001", pilotScope: PILOT_SCOPE, historicalReferenceType: "KNOWN_COMPONENT_REFERENCE", privateSource: "REPOSITORY_EXTERNAL_LOCAL_ONLY" });
  assert.equal(getCalibrationPilotSchema().publicExposure, "NEVER");
  assert.deepEqual(validatePrivateCalibrationPilot({ ...pilot, unexpected: "reject" }).some((error) => error.code === "UNEXPECTED_FIELD"), true);
  assert.equal(loadPrivateCalibrationPilot, loadPrivateCalibrationPilot);
});

test("historical total and per-part comparison, variance formula, quality thresholds, zero denominator and missing reference are deterministic", () => {
  assert.deepEqual(calculateVariance(120, 100), { difference: 20, variancePct: 20 });
  assert.deepEqual(calculateVariance(120, 0), { difference: 120, variancePct: null });
  const fixture = estimateFixture();
  const total = buildHistoricalComparison({ costBreakdown: { totalEstimatedCost: 120, estimatedCostPerPart: 12 }, historicalReference: { actualHistoricalTotalInternalCost: 100 }, quantity: 10, thresholds: { closeMatchMaxAbsPct: 5, moderateMatchMaxAbsPct: 20, source: "SYNTHETIC_DEFAULT_ONLY" } });
  assert.equal(total.referenceType, "TOTAL_ONLY_REFERENCE");
  assert.equal(total.historicalReference.actualCostPerPart, 10);
  assert.equal(total.variance.variancePct, 20);
  assert.equal(total.quality.status, "MODERATE_VARIANCE");
  const perPart = buildHistoricalComparison({ costBreakdown: { totalEstimatedCost: 120, estimatedCostPerPart: 12 }, historicalReference: { actualHistoricalInternalCostPerPart: 10 }, quantity: 10, thresholds: { closeMatchMaxAbsPct: 5, moderateMatchMaxAbsPct: 20, source: "SYNTHETIC_DEFAULT_ONLY" } });
  assert.equal(perPart.historicalReference.actualTotalCost, 100);
  assert.equal(perPart.variance.totalCostDifference, 20);
  const zero = buildHistoricalComparison({ costBreakdown: { totalEstimatedCost: 120, estimatedCostPerPart: 12 }, historicalReference: { actualHistoricalTotalInternalCost: 0 }, quantity: 10, thresholds: { closeMatchMaxAbsPct: 5, moderateMatchMaxAbsPct: 20, source: "SYNTHETIC_DEFAULT_ONLY" } });
  assert.equal(zero.referenceType, "TOTAL_ONLY_REFERENCE");
  assert.equal(zero.variance.variancePct, null);
  const missing = buildHistoricalComparison({ costBreakdown: { totalEstimatedCost: 120, estimatedCostPerPart: 12 }, historicalReference: {}, quantity: 10, thresholds: { closeMatchMaxAbsPct: 5, moderateMatchMaxAbsPct: 20, source: "SYNTHETIC_DEFAULT_ONLY" } });
  assert.equal(missing.referenceType, "NO_HISTORICAL_REFERENCE");
  assert.equal(missing.quality.status, "NOT_EVALUATED");
  assert.equal(fixture.estimate.state, "CALCULATED");
  assert.equal(qualityStatus(3), "CLOSE_MATCH");
  assert.equal(qualityStatus(21), "LARGE_VARIANCE");
});

test("component variance distinguishes known component reference from total-only reference", () => {
  const costBreakdown = { materialCost: 10, cuttingSetupCost: 2, cuttingRunCost: 3, piercingCost: 4, bendingSetupCost: 5, bendingRunCost: 6, weldingSetupCost: 0, weldingRunCost: 0, surfaceTreatmentCost: 0, engineeringSetupCost: 7 };
  const rows = buildComponentVariance({ costBreakdown, componentCosts: { material: 9, cutting: 4, piercing: 4, bending: 12, setup: 7 } });
  assert.equal(rows.length, 5);
  assert.equal(rows.find((row) => row.component === "cutting").estimatedCost, 5);
  assert.equal(rows.find((row) => row.component === "material").difference, 1);
  assert.deepEqual(buildComponentVariance({ costBreakdown, componentCosts: null }), []);
});

test("observed-time, rate-based and conflicting observation modes are explicit", () => {
  const pilot = pilotFixture();
  const input = pilotToEngineeringInput(pilot);
  const estimate = estimateFixture().estimate;
  const observations = buildProcessObservations({ pilot, engineeringInput: input, costEstimate: estimate });
  assert.equal(observations.find((item) => item.process === "cutting").mode, RATE_BASED);
  assert.equal(observations.find((item) => item.process === "bending").mode, RATE_BASED);
  const observedPilot = clone(pilot);
  observedPilot.cutting.observedCuttingSpeedMmPerMin = null;
  observedPilot.cutting.observedRunMinutes = 2;
  const observed = buildProcessObservations({ pilot: observedPilot, engineeringInput: input, costEstimate: estimate });
  assert.equal(observed.find((item) => item.process === "cutting").mode, OBSERVED_TIME);
  const conflict = clone(pilot);
  conflict.cutting.observedRunMinutes = 2;
  assert.throws(() => buildProcessObservations({ pilot: conflict, engineeringInput: input, costEstimate: estimate }), (error) => error.code === "OBSERVATION_PRECEDENCE_REQUIRED");
});

test("calibration comparison creates diagnostics and PROPOSED_ONLY adjustments without profile overwrite", () => {
  const pilot = pilotFixture();
  const fixture = estimateFixture();
  const comparison = buildCalibrationComparison({ pilot, engineeringInput: fixture.input, estimate: fixture.estimate, profile: profileFixture() });
  assert.equal(comparison.state, "CALIBRATION_COMPARISON_READY");
  assert.equal(comparison.historicalComparison.referenceType, "KNOWN_COMPONENT_REFERENCE");
  assert.ok(comparison.diagnostics.some((item) => item.category === "MATERIAL_RATE_VARIANCE"));
  assert.ok(comparison.diagnostics.some((item) => item.category === "CUTTING_TIME_VARIANCE"));
  assert.ok(comparison.profileUpdate.proposedAdjustments.length > 0);
  assert.ok(comparison.profileUpdate.proposedAdjustments.every((item) => item.status === "PROPOSED_ONLY" && item.proposedValue === "PROFILE_VALUE_NOT_RETURNED"));
  assert.equal(comparison.profileUpdate.automaticWriteBack, "DENY");
  assert.doesNotMatch(JSON.stringify(comparison), new RegExp(String(SENTINEL_RATE)));
});

test("safe calibration history has exactly seven non-rate fields and append logger is external/0600", () => {
  const files = tempPilotFiles();
  try {
    const fixture = estimateFixture();
    const comparison = buildCalibrationComparison({ pilot: pilotFixture(), engineeringInput: fixture.input, estimate: fixture.estimate, profile: profileFixture() });
    const record = safeCalibrationHistoryRecord({ pilot: pilotFixture(), estimateId: "estimate-demo-001", profile: profileFixture(), comparison, runTimestamp: NOW.toISOString() });
    assert.deepEqual(Object.keys(record), ["pilotId", "estimateId", "profileId", "profileVersion", "runTimestamp", "variancePct", "resultStatus"]);
    const logger = createCalibrationHistoryLogger(files.historyPath);
    logger(record);
    assert.equal(fs.statSync(files.historyPath).mode & 0o777, 0o600);
    const saved = JSON.parse(fs.readFileSync(files.historyPath, "utf8"));
    assert.deepEqual(saved, record);
    assert.doesNotMatch(fs.readFileSync(files.historyPath, "utf8"), new RegExp(String(SENTINEL_RATE)));
    assert.throws(() => createCalibrationHistoryLogger(path.join(REPOSITORY_ROOT, "private-calibration-history.jsonl")), (error) => error.code === "PRIVATE_CALIBRATION_HISTORY_MUST_BE_OUTSIDE_REPOSITORY");
  } finally {
    fs.rmSync(files.directory, { recursive: true, force: true });
  }
});

test("local pilot runtime loads external pilot, returns private comparison, rejects request pilot data, and preserves public isolation", async (t) => {
  const files = tempPilotFiles();
  const runtime = startPrivateRuntime({
    environment: { ...process.env, PRIVATE_RUNTIME_ENABLED: "1", PRIVATE_RUNTIME_HOST: DEFAULT_HOST, PRIVATE_RUNTIME_PORT: "0", PRIVATE_RATE_PROFILE_PATH: files.profilePath, PRIVATE_CALIBRATION_PILOT_PATH: files.pilotPath, PRIVATE_AUDIT_LOG_PATH: files.auditPath, PRIVATE_CALIBRATION_HISTORY_PATH: files.historyPath, PRIVATE_LOCAL_IDENTITY: "authorized-local-pilot-test" },
    now: NOW,
  });
  t.after(async () => {
    if (runtime.server.listening) await new Promise((resolve) => runtime.server.close(resolve));
    fs.rmSync(files.directory, { recursive: true, force: true });
  });
  await once(runtime.server, "listening");
  const port = runtime.server.address().port;
  const page = await requestPrivate(port, "GET", "/private-estimate");
  assert.equal(page.statusCode, 200);
  const cookie = String(page.headers["set-cookie"]?.[0] || "").split(";")[0];
  const pilotResponse = await requestPrivate(port, "POST", "/api/private/calibration-pilot", "{}", cookie);
  assert.equal(pilotResponse.statusCode, 200);
  const payload = JSON.parse(pilotResponse.body);
  assert.equal(payload.state, "OK");
  assert.equal(payload.pilot.pilotId, "DEMO_PILOT_4D_001");
  assert.equal(payload.calibrationComparison.historicalComparison.referenceType, "KNOWN_COMPONENT_REFERENCE");
  assert.equal(payload.calibrationComparison.profileUpdate.automaticWriteBack, "DENY");
  assert.match(pilotResponse.body, /內部工程成本估算|CALIBRATION_COMPARISON_READY/);
  assert.doesNotMatch(pilotResponse.body, new RegExp(SENTINEL));
  assert.doesNotMatch(pilotResponse.body, new RegExp(String(SENTINEL_RATE)));
  assert.doesNotMatch(pilotResponse.body, /actualInternalMaterialRatePerKg|internalMachineRatePerMinute|internalSetupRatePerMinute|internalLaborRatePerMinute/);
  assert.match(pilotResponse.body, /PROFILE_VALUE_NOT_RETURNED/);
  const requestPilot = await requestPrivate(port, "POST", "/api/private/calibration-pilot", JSON.stringify({ pilot: pilotFixture() }), cookie);
  assert.equal(requestPilot.statusCode, 400);
  assert.match(requestPilot.body, /PRIVATE_PILOT_NOT_ACCEPTED_IN_REQUEST/);
  assert.doesNotMatch(requestPilot.body, new RegExp(SENTINEL));
  const schema = await requestPrivate(port, "GET", "/api/private/calibration-pilot/schema", null, cookie);
  assert.equal(schema.statusCode, 200);
  assert.doesNotMatch(schema.body, new RegExp(SENTINEL));
  const history = fs.readFileSync(files.historyPath, "utf8");
  assert.doesNotMatch(history, new RegExp(SENTINEL));
  assert.doesNotMatch(history, new RegExp(String(SENTINEL_RATE)));
  const audit = fs.readFileSync(files.auditPath, "utf8");
  assert.doesNotMatch(audit, new RegExp(SENTINEL));
  assert.equal(Object.keys(JSON.parse(audit)).sort().join(","), ["authorizedLocalIdentity", "estimateId", "processFamily", "rateProfileId", "rateProfileVersion", "resultStatus", "timestamp"].sort().join(","));
  const publicRoute = await capturePublic("GET", "/api/private/calibration-pilot");
  assert.equal(publicRoute.statusCode, 404);
  const publicSchema = await capturePublic("GET", "/api/engineering/estimate/schema");
  assert.equal(publicSchema.statusCode, 200);
  assert.doesNotMatch(publicSchema.body, new RegExp(SENTINEL));
  for (const file of ["server.js", "estimate.html", "estimate.js", "nav.js", "HANDOFF.md", "PROJECT_STATUS.md"]) {
    const content = fs.readFileSync(path.join(REPOSITORY_ROOT, file), "utf8");
    assert.doesNotMatch(content, new RegExp(SENTINEL), file);
    assert.doesNotMatch(content, new RegExp(String(SENTINEL_RATE)), file);
  }
});
