const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  REPOSITORY_ROOT,
  initializePrivateOperatorDirectory,
  createValueEmptyProfileTemplate,
  createValueEmptyPilotTemplate,
  validateLocalOperatorReadiness,
  runPrivateLeakCheck,
  formatValidationStatus,
  formatLeakCheckStatus,
} = require("../lib/engineering/privateOperatorReadiness");

const NOW = new Date("2026-08-24T00:00:00.000Z");

function tempDirectory(prefix = "raw-material-private-4e-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function syntheticProfile() {
  return {
    mode: "PRIVATE_CALIBRATED",
    rateProfileId: "synthetic-operator-profile-4e",
    version: "synthetic-v1",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    status: "ACTIVE",
    approvalStatus: null,
    currency: "TEST_UNITS",
    metadata: { source: "SYNTHETIC / DEMO / TEST ONLY", owner: "synthetic-local-owner", approvalStatus: "APPROVED", note: "TEST ONLY" },
    material: { carbonSteelRatePerKg: 2, stainlessSteelRatePerKg: 3, aluminumRatePerKg: 4, copperRatePerKg: 5 },
    cutting: { machineRatePerMinute: 10, setupRatePerMinute: 20, pierceTimeSecondsEach: 6, cuttingSpeedMmPerMin: 1000, setupMinutesPerBatch: 5 },
    bending: { machineRatePerMinute: 8, setupRatePerMinute: 15, secondsPerBend: 12, setupMinutesPerBatch: 3 },
    welding: { laborRatePerMinute: 6, machineRatePerMinute: 4, weldingSpeedMmPerMin: 100, setupMinutesPerBatch: 4 },
    surfaceTreatment: { ratePerM2: 7 },
    setup: { engineeringSetupRatePerMinute: 30, engineeringSetupMinutesPerBatch: 2 },
  };
}

function syntheticPilot() {
  return {
    pilotScope: "SINGLE_CONTROLLED_PILOT",
    part: { pilotId: "synthetic-pilot-4e", materialFamily: "CARBON_STEEL", grade: "TEST_ONLY", thicknessMm: 2, blankLengthMm: 500, blankWidthMm: 300, quantity: 100, batchCount: 1 },
    material: { densityKgM3: null },
    cutting: { cutLengthMmPerPart: 1450, pierceCountPerPart: 8, observedCuttingSpeedMmPerMin: null, observedRunMinutes: null, authoritativeObservation: null, observedPierceSecondsEach: null, observedSetupMinutesPerBatch: null },
    bending: { bendCountPerPart: 4, observedSecondsPerBend: null, observedRunMinutes: null, authoritativeObservation: null, observedSetupMinutesPerBatch: null },
    welding: { weldLengthMmPerPart: 0, observedWeldingSpeedMmPerMin: null, observedRunMinutes: null, authoritativeObservation: null, observedSetupMinutesPerBatch: null },
    surfaceTreatment: { treatedAreaMm2PerPart: 0 },
    engineeringSetup: { observedSetupMinutesPerBatch: null },
    historicalReference: { actualHistoricalTotalInternalCost: 250, actualHistoricalInternalCostPerPart: null, componentCosts: { material: null, cutting: null, piercing: null, bending: null, welding: null, surfaceTreatment: null, setup: null } },
  };
}

function externalFixture() {
  const directory = tempDirectory();
  const profilePath = path.join(directory, "private-rate-profile.json");
  const pilotPath = path.join(directory, "private-calibration-pilot.json");
  const auditPath = path.join(directory, "private-audit.jsonl");
  const historyPath = path.join(directory, "private-calibration-history.jsonl");
  writeJson(profilePath, syntheticProfile());
  writeJson(pilotPath, syntheticPilot());
  return { directory, profilePath, pilotPath, auditPath, historyPath };
}

function readinessEnvironment(files, overrides = {}) {
  return {
    ...process.env,
    PRIVATE_RUNTIME_ENABLED: "1",
    PRIVATE_RUNTIME_HOST: "127.0.0.1",
    PRIVATE_RUNTIME_PORT: "4174",
    PRIVATE_LOCAL_IDENTITY: "synthetic-local-operator",
    PRIVATE_RATE_PROFILE_PATH: files.profilePath,
    PRIVATE_CALIBRATION_PILOT_PATH: files.pilotPath,
    PRIVATE_AUDIT_LOG_PATH: files.auditPath,
    PRIVATE_CALIBRATION_HISTORY_PATH: files.historyPath,
    ...overrides,
  };
}

test("private operator init creates external 0700/0600 layout and is idempotent without overwriting", () => {
  const directory = tempDirectory();
  const first = initializePrivateOperatorDirectory(path.join(directory, "private-engineering-cost"));
  assert.equal(first.repositoryBoundary, "PASS");
  assert.match(first.profileTemplate, /^VALUE_EMPTY_CREATED$/);
  assert.match(first.pilotTemplate, /^VALUE_EMPTY_CREATED$/);
  assert.equal(first.auditFile, "READY_0600_CREATED");
  assert.equal(first.historyFile, "READY_0600_CREATED");
  const root = path.join(directory, "private-engineering-cost");
  for (const name of ["profile", "pilot", "audit", "history", "backup"]) assert.equal(fs.statSync(path.join(root, name)).mode & 0o777, 0o700);
  for (const file of ["profile/private-rate-profile.json", "pilot/private-calibration-pilot.json", "audit/private-audit.jsonl", "history/private-calibration-history.jsonl"]) assert.equal(fs.statSync(path.join(root, file)).mode & 0o777, 0o600);
  const original = fs.readFileSync(path.join(root, "profile/private-rate-profile.json"), "utf8");
  fs.appendFileSync(path.join(root, "profile/private-rate-profile.json"), "\n");
  const second = initializePrivateOperatorDirectory(root);
  assert.equal(second.profileTemplate, "VALUE_EMPTY_EXISTING_NOT_MODIFIED");
  assert.notEqual(fs.readFileSync(path.join(root, "profile/private-rate-profile.json"), "utf8"), original);
});

test("private operator init refuses repository-contained and relative destinations", () => {
  assert.throws(() => initializePrivateOperatorDirectory(path.join(REPOSITORY_ROOT, "private-engineering-cost-test")), /PRIVATE_DIRECTORY_MUST_BE_OUTSIDE_REPOSITORY/);
  assert.throws(() => initializePrivateOperatorDirectory("relative-private-engineering-cost"), /PRIVATE_DIRECTORY_MUST_BE_ABSOLUTE/);
});

test("generated profile and pilot skeletons are value-empty with no synthetic rates", () => {
  const profile = createValueEmptyProfileTemplate();
  const pilot = createValueEmptyPilotTemplate();
  assert.equal(JSON.stringify(profile).includes("TEST_UNITS"), false);
  assert.equal(JSON.stringify(pilot).includes("TEST_UNITS"), false);
  assert.equal(JSON.stringify(profile).includes("SENTINEL"), false);
  assert.equal(JSON.stringify(pilot).includes("SENTINEL"), false);
  const profileValues = Object.values(profile).flatMap((value) => typeof value === "object" && value !== null ? Object.values(value) : [value]);
  assert.equal(profileValues.every((value) => value === null), true);
  assert.equal(pilot.pilotScope, "SINGLE_CONTROLLED_PILOT");
  const pilotValueStrings = JSON.stringify(pilot);
  assert.equal(pilotValueStrings.includes("DEMO"), false);
  assert.equal(pilotValueStrings.includes("TEST_UNITS"), false);
  assert.equal(Object.values(pilot.part).every((value) => value === null), true);
});

test("safe validation accepts only an external approved synthetic fixture and never prints private values or paths", () => {
  const files = externalFixture();
  const result = validateLocalOperatorReadiness({ environment: readinessEnvironment(files), repositoryRoot: REPOSITORY_ROOT, now: NOW });
  assert.equal(result.ok, true);
  const output = formatValidationStatus(result).join("\n");
  assert.match(output, /PROFILE_PATH: EXTERNAL_OK/);
  assert.match(output, /PROFILE_SCHEMA: VALID/);
  assert.match(output, /PROFILE_STATUS: ACTIVE/);
  assert.match(output, /PROFILE_APPROVAL: APPROVED/);
  assert.match(output, /PILOT_SCHEMA: VALID/);
  assert.match(output, /LOCALHOST_BOUNDARY: PASS/);
  assert.match(output, /PUBLIC_LEAKAGE: PASS/);
  assert.match(output, /READY_FOR_PRIVATE_PILOT: YES/);
  assert.equal(output.includes(files.profilePath), false);
  assert.equal(output.includes(files.pilotPath), false);
  assert.equal(output.includes("TEST_UNITS"), false);
  assert.equal(output.includes("250"), false);
  assert.equal(output.includes("carbonSteelRatePerKg"), false);
});

test("safe validation fails closed with safe status when flag, host or files are not ready", () => {
  const files = externalFixture();
  const result = validateLocalOperatorReadiness({ environment: readinessEnvironment(files, { PRIVATE_RUNTIME_ENABLED: "0", PRIVATE_RUNTIME_HOST: "0.0.0.0", PRIVATE_RATE_PROFILE_PATH: path.join(REPOSITORY_ROOT, "private-rate-profile.example.json") }), repositoryRoot: REPOSITORY_ROOT, now: NOW });
  const output = formatValidationStatus(result).join("\n");
  assert.equal(result.ok, false);
  assert.match(output, /ENABLE_FLAG: FAIL/);
  assert.match(output, /LOCALHOST_BOUNDARY: FAIL/);
  assert.match(output, /PROFILE_PATH: FAIL/);
  assert.match(output, /READY_FOR_PRIVATE_PILOT: NO/);
  assert.equal(output.includes(files.profilePath), false);
  assert.equal(output.includes("TEST_UNITS"), false);
});

test("post-run leak check returns only safe status and excludes private operator files", () => {
  const result = runPrivateLeakCheck({ repositoryRoot: REPOSITORY_ROOT });
  assert.equal(result.ok, true);
  const output = formatLeakCheckStatus(result).join("\n");
  assert.match(output, /TRACKED_PRIVATE_PROFILE: NONE/);
  assert.match(output, /TRACKED_PRIVATE_PILOT: NONE/);
  assert.match(output, /TRACKED_PRIVATE_AUDIT_HISTORY: NONE/);
  assert.match(output, /PUBLIC_ASSETS: PASS/);
  assert.match(output, /PUBLIC_API: UNCHANGED/);
  assert.match(output, /READY: PASS/);
  assert.equal(output.includes(REPOSITORY_ROOT), false);
  assert.equal(output.includes("private-rate-profile.json"), false);
});

test("operator CLI exposes only safe validation statuses", () => {
  const files = externalFixture();
  const output = execFileSync(process.execPath, ["scripts/private-operator.js", "validate"], { cwd: REPOSITORY_ROOT, env: readinessEnvironment(files), encoding: "utf8" });
  assert.match(output, /READY_FOR_PRIVATE_PILOT: YES/);
  assert.equal(output.includes(files.profilePath), false);
  assert.equal(output.includes("TEST_UNITS"), false);
  assert.equal(output.includes("250"), false);
});

test("post-run leak check detects an untracked sensitive filename without printing its path", () => {
  const fakeRepository = tempDirectory("raw-material-private-4e-git-");
  execFileSync("git", ["init", "-q"], { cwd: fakeRepository });
  fs.writeFileSync(path.join(fakeRepository, "public.html"), "public-only\n");
  fs.writeFileSync(path.join(fakeRepository, "server.js"), "public server only\n");
  execFileSync("git", ["add", "public.html", "server.js"], { cwd: fakeRepository });
  fs.writeFileSync(path.join(fakeRepository, "private-calibration-pilot.json"), "");
  const result = runPrivateLeakCheck({ repositoryRoot: fakeRepository });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, ["UNTRACKED_PRIVATE_PAYLOAD"]);
  const output = formatLeakCheckStatus(result).join("\n");
  assert.equal(output.includes("private-calibration-pilot.json"), false);
  assert.equal(output.includes(fakeRepository), false);
});
