const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { once } = require("node:events");
const test = require("node:test");
const assert = require("node:assert/strict");
const { handleRequest } = require("../server");
const {
  ENABLE_FLAG,
  DEFAULT_HOST,
  startGuard,
  resolvePrivateHost,
  resolvePrivatePort,
  isLoopbackAddress,
  startPrivateRuntime,
} = require("../private-runtime");
const {
  REPOSITORY_ROOT,
  loadPrivateRateProfile,
  isInsideRepository,
} = require("../lib/engineering/privateProfileLoader");
const { PRIVATE_SCOPE } = require("../lib/engineering/privateRateProfileContract");

const NOW = new Date("2026-08-24T00:00:00.000Z");
const SENTINEL = "SENTINEL_PRIVATE_PROFILE_4C_NEVER_PUBLIC";
const SENTINEL_RATE = 9876543.21;
const TEST_PORT = 0;

const BASE_INPUT = {
  processFamily: "SHEET_METAL",
  material: { materialFamily: "CARBON_STEEL", grade: "TEST_ONLY", thicknessMm: 2, densityKgM3: 7850 },
  blank: { lengthMm: 500, widthMm: 300, quantity: 100 },
  cutting: { enabled: true, cutLengthMmPerPart: 1450, pierceCountPerPart: 8 },
  bending: { enabled: true, bendCountPerPart: 4 },
  welding: { enabled: false, weldLengthMmPerPart: 0 },
  surfaceTreatment: { enabled: false, treatmentType: null, treatedAreaMm2PerPart: 0 },
  setup: { batchCount: 1 },
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function validPrivateProfile() {
  return {
    mode: "PRIVATE_CALIBRATED",
    rateProfileId: "local-private-synthetic-fixture",
    version: "local-test-v1",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    status: "ACTIVE",
    currency: "TEST_UNITS",
    metadata: { source: "SYNTHETIC TEST FIXTURE", owner: "local-test-owner", approvalStatus: "APPROVED", note: SENTINEL },
    material: { carbonSteelRatePerKg: 2, stainlessSteelRatePerKg: 3, aluminumRatePerKg: 4, copperRatePerKg: SENTINEL_RATE },
    cutting: { machineRatePerMinute: 10, setupRatePerMinute: 20, pierceTimeSecondsEach: 6, cuttingSpeedMmPerMin: 1000, setupMinutesPerBatch: 5 },
    bending: { machineRatePerMinute: 8, setupRatePerMinute: 15, secondsPerBend: 12, setupMinutesPerBatch: 3 },
    welding: { laborRatePerMinute: 6, machineRatePerMinute: 4, weldingSpeedMmPerMin: 100, setupMinutesPerBatch: 4 },
    surfaceTreatment: { ratePerM2: 7 },
    setup: { engineeringSetupRatePerMinute: 30, engineeringSetupMinutesPerBatch: 2 },
  };
}

function responseRecorder() {
  return { statusCode: null, headers: null, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, end(body = "") { this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body); this.done?.(this); } };
}

function capturePublic(method, url, body = null, headers = {}, runtimeEnv = process.env) {
  return new Promise((resolve, reject) => {
    const response = responseRecorder();
    response.done = resolve;
    const request = require("node:events").EventEmitter ? new (require("node:events").EventEmitter)() : null;
    request.method = method;
    request.url = url;
    request.headers = headers;
    handleRequest(request, response, runtimeEnv).catch(reject);
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

function makeTempProfile() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "raw-material-private-4c-"));
  const profilePath = path.join(directory, "private-rate-profile.json");
  const auditPath = path.join(directory, "private-audit.jsonl");
  fs.writeFileSync(profilePath, `${JSON.stringify(validPrivateProfile(), null, 2)}\n`, { mode: 0o600 });
  return { directory, profilePath, auditPath };
}

function startForTest(t) {
  const files = makeTempProfile();
  const runtime = startPrivateRuntime({
    environment: {
      ...process.env,
      [ENABLE_FLAG]: "1",
      PRIVATE_RUNTIME_HOST: DEFAULT_HOST,
      PRIVATE_RUNTIME_PORT: String(TEST_PORT),
      PRIVATE_RATE_PROFILE_PATH: files.profilePath,
      PRIVATE_AUDIT_LOG_PATH: files.auditPath,
      PRIVATE_LOCAL_IDENTITY: "authorized-local-test-identity",
    },
    now: NOW,
  });
  t.after(async () => {
    if (runtime.server.listening) await new Promise((resolve) => runtime.server.close(resolve));
    fs.rmSync(files.directory, { recursive: true, force: true });
  });
  return once(runtime.server, "listening").then(() => ({ runtime, files, port: runtime.server.address().port }));
}

test("private runtime is disabled by default and rejects non-loopback hosts", () => {
  assert.throws(() => startGuard({}), (error) => error.code === "PRIVATE_RUNTIME_DISABLED");
  assert.throws(() => resolvePrivateHost({ PRIVATE_RUNTIME_HOST: "0.0.0.0" }), (error) => error.code === "PRIVATE_RUNTIME_MUST_BIND_LOOPBACK");
  assert.equal(resolvePrivateHost({ PRIVATE_RUNTIME_HOST: "127.0.0.1" }), "127.0.0.1");
  assert.equal(resolvePrivatePort({ PRIVATE_RUNTIME_PORT: "4174" }), 4174);
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("0.0.0.0"), false);
});

test("private profiles load only from repo-external absolute paths and invalid lifecycle is rejected", () => {
  const files = makeTempProfile();
  try {
    assert.equal(isInsideRepository(files.profilePath), false);
    assert.deepEqual(loadPrivateRateProfile({ profilePath: files.profilePath, now: NOW }).profile.rateProfileId, "local-private-synthetic-fixture");
    assert.throws(() => loadPrivateRateProfile({ profilePath: path.join(REPOSITORY_ROOT, "private-rate-profile.example.json"), now: NOW }), (error) => error.code === "PRIVATE_PROFILE_MUST_BE_OUTSIDE_REPOSITORY");
    assert.throws(() => loadPrivateRateProfile({ profilePath: "relative/private-rate-profile.json", now: NOW }), (error) => error.code === "PRIVATE_PROFILE_PATH_MUST_BE_ABSOLUTE");

    for (const [name, mutate, expected] of [
      ["inactive", (profile) => { profile.status = "DRAFT"; }, "PRIVATE_PROFILE_NOT_ACTIVE"],
      ["expired", (profile) => { profile.effectiveTo = "2026-08-23T23:59:59.000Z"; }, "PRIVATE_PROFILE_EXPIRED"],
      ["future", (profile) => { profile.effectiveFrom = "2026-08-25T00:00:00.000Z"; }, "PRIVATE_PROFILE_NOT_YET_EFFECTIVE"],
      ["not approved", (profile) => { profile.metadata.approvalStatus = "REVIEW"; }, "PRIVATE_PROFILE_NOT_APPROVED"],
      ["missing calibration", (profile) => { delete profile.cutting.cuttingSpeedMmPerMin; }, "PRIVATE_PROFILE_INVALID"],
      ["unexpected field", (profile) => { profile.unexpectedPrivateField = "no"; }, "PRIVATE_PROFILE_INVALID"],
    ]) {
      const invalidPath = path.join(files.directory, `${name}.json`);
      const profile = validPrivateProfile();
      mutate(profile);
      fs.writeFileSync(invalidPath, JSON.stringify(profile), { mode: 0o600 });
      assert.throws(() => loadPrivateRateProfile({ profilePath: invalidPath, now: NOW }), (error) => error.code === expected, name);
    }
  } finally {
    fs.rmSync(files.directory, { recursive: true, force: true });
  }
});

test("private runtime binds localhost, issues local session, returns private cost and writes redacted audit only", async (t) => {
  const { runtime, files, port } = await startForTest(t);
  assert.equal(runtime.server.address().address, "127.0.0.1");
  assert.equal(runtime.host, "127.0.0.1");
  assert.equal(runtime.profilePath.startsWith(REPOSITORY_ROOT), false);
  assert.equal(runtime.auditPath.startsWith(REPOSITORY_ROOT), false);

  const page = await requestPrivate(port, "GET", "/private-estimate");
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /內部工程成本估算/);
  assert.match(page.body, /LOCAL PRIVATE RUNTIME \/ 127\.0\.0\.1/);
  assert.doesNotMatch(page.body, new RegExp(SENTINEL));
  assert.doesNotMatch(page.body, new RegExp(String(SENTINEL_RATE)));
  const cookie = String(page.headers["set-cookie"]?.[0] || "").split(";")[0];
  assert.match(cookie, /^private_session=/);

  const unauthenticated = await requestPrivate(port, "POST", "/api/private/estimate", JSON.stringify(BASE_INPUT));
  assert.equal(unauthenticated.statusCode, 401);
  assert.doesNotMatch(unauthenticated.body, new RegExp(SENTINEL));

  const profileInRequest = await requestPrivate(port, "POST", "/api/private/estimate", JSON.stringify({ ...BASE_INPUT, rateProfile: validPrivateProfile() }), cookie);
  assert.equal(profileInRequest.statusCode, 400);
  assert.match(profileInRequest.body, /PRIVATE_PROFILE_NOT_ACCEPTED_IN_REQUEST/);
  assert.doesNotMatch(profileInRequest.body, new RegExp(SENTINEL));
  assert.doesNotMatch(profileInRequest.body, new RegExp(String(SENTINEL_RATE)));

  const resultResponse = await requestPrivate(port, "POST", "/api/private/estimate", JSON.stringify(BASE_INPUT), cookie);
  assert.equal(resultResponse.statusCode, 200);
  const resultBody = JSON.parse(resultResponse.body);
  assert.equal(resultBody.state, "OK");
  assert.match(resultBody.estimateId, /^[0-9a-f-]{36}$/);
  assert.equal(resultBody.estimate.processFamily, "SHEET_METAL");
  assert.equal(resultBody.estimate.processTimeEstimate.cutting.runMinutes, 145);
  assert.equal(resultBody.estimate.processTimeEstimate.cutting.pierceMinutes, 80);
  assert.equal(resultBody.estimate.processTimeEstimate.overall.totalProcessMinutes, 313);
  assert.equal(resultBody.estimate.costBreakdown.totalEstimatedCost, 3566);
  assert.equal(resultBody.estimate.costBreakdown.estimatedCostPerPart, 35.66);
  assert.equal(resultBody.estimate.rateProfile.rateProfileId, "local-private-synthetic-fixture");
  assert.equal(resultBody.estimate.rateProfile.version, "local-test-v1");
  assert.equal(resultBody.estimate.rateProfile.currency, "TEST_UNITS");
  assert.ok(resultBody.estimate.formulaTrace.some((entry) => entry.inputs?.copperRatePerKg === undefined));
  assert.ok(resultBody.estimate.formulaTrace.some((entry) => Object.values(entry.inputs || {}).includes("PROFILE_VALUE_NOT_RETURNED")));
  assert.doesNotMatch(resultResponse.body, new RegExp(SENTINEL));
  assert.doesNotMatch(resultResponse.body, new RegExp(String(SENTINEL_RATE)));

  const auditLines = fs.readFileSync(files.auditPath, "utf8").trim().split("\n").filter(Boolean);
  assert.equal(auditLines.length, 1);
  const audit = JSON.parse(auditLines[0]);
  assert.deepEqual(Object.keys(audit).sort(), ["authorizedLocalIdentity", "estimateId", "processFamily", "rateProfileId", "rateProfileVersion", "resultStatus", "timestamp"].sort());
  assert.equal(audit.authorizedLocalIdentity, "authorized-local-test-identity");
  assert.equal(audit.rateProfileId, "local-private-synthetic-fixture");
  assert.equal(audit.rateProfileVersion, "local-test-v1");
  assert.equal(audit.processFamily, "SHEET_METAL");
  assert.equal(audit.estimateId, resultBody.estimateId);
  assert.equal(audit.resultStatus, "CALCULATED");
  assert.doesNotMatch(auditLines[0], new RegExp(SENTINEL));
  assert.doesNotMatch(auditLines[0], new RegExp(String(SENTINEL_RATE)));
});

test("private route requires the local session, rejects malformed input safely, and never exposes profile content in errors", async (t) => {
  const { runtime, port } = await startForTest(t);
  const badCookie = await requestPrivate(port, "POST", "/api/private/estimate", JSON.stringify(BASE_INPUT), "private_session=unknown");
  assert.equal(badCookie.statusCode, 401);
  assert.doesNotMatch(badCookie.body, new RegExp(SENTINEL));
  const page = await requestPrivate(port, "GET", "/private-estimate");
  const cookie = String(page.headers["set-cookie"]?.[0] || "").split(";")[0];
  const malformed = await requestPrivate(port, "POST", "/api/private/estimate", "not-json", cookie);
  assert.equal(malformed.statusCode, 400);
  assert.match(malformed.body, /PRIVATE_JSON_INVALID/);
  assert.doesNotMatch(malformed.body, new RegExp(SENTINEL));
  const invalidInput = await requestPrivate(port, "POST", "/api/private/estimate", JSON.stringify({ ...BASE_INPUT, blank: { ...BASE_INPUT.blank, lengthMm: -1 } }), cookie);
  assert.equal(invalidInput.statusCode, 400);
  assert.doesNotMatch(invalidInput.body, new RegExp(SENTINEL));
  const notFound = await requestPrivate(port, "GET", "/api/private/unknown");
  assert.equal(notFound.statusCode, 404);
  assert.equal(runtime.context.sessions.size, 1);
});

test("public server has no private route, public schema/assets/handoff/status have no sentinel or raw rate, and public PRIVATE_CALIBRATED remains denied", async () => {
  const publicPrivatePage = await capturePublic("GET", "/private-estimate");
  assert.equal(publicPrivatePage.statusCode, 404);
  const publicPrivateApi = await capturePublic("GET", "/api/private/estimate");
  assert.equal(publicPrivateApi.statusCode, 404);
  const publicPrivateInput = { ...clone(BASE_INPUT), rateProfile: { mode: "PRIVATE_CALIBRATED" } };
  const denied = await capturePublic("POST", "/api/engineering/estimate", JSON.stringify(publicPrivateInput), { "content-type": "application/json" }, { NODE_ENV: "production" });
  assert.equal(denied.statusCode, 403);
  assert.match(denied.body, /PRIVATE_CALIBRATED_NOT_AVAILABLE_ON_PUBLIC_API/);
  assert.doesNotMatch(denied.body, new RegExp(SENTINEL));
  assert.doesNotMatch(denied.body, new RegExp(String(SENTINEL_RATE)));
  const schema = await capturePublic("GET", "/api/engineering/estimate/schema", null, {}, { NODE_ENV: "production" });
  assert.equal(schema.statusCode, 200);
  for (const file of ["server.js", "estimate.html", "estimate.js", "nav.js", "HANDOFF.md", "PROJECT_STATUS.md"]) {
    const content = fs.readFileSync(path.join(REPOSITORY_ROOT, file), "utf8");
    assert.doesNotMatch(content, new RegExp(SENTINEL), file);
    assert.doesNotMatch(content, new RegExp(String(SENTINEL_RATE)), file);
  }
  assert.doesNotMatch(schema.body, new RegExp(SENTINEL));
  assert.doesNotMatch(schema.body, new RegExp(String(SENTINEL_RATE)));
  assert.doesNotMatch(schema.body, /carbonSteelRatePerKg|machineRatePerMinute|ratePerM2/);
});

test("private profile ignore rules protect common filenames while the placeholder template remains trackable", () => {
  const example = path.join(REPOSITORY_ROOT, "private-rate-profile.example.json");
  assert.equal(fs.existsSync(example), true);
  const ignored = ["private-rate-profile.json", "private-calibration.xlsx", "private-audit.jsonl"];
  const { execFileSync } = require("node:child_process");
  for (const name of ignored) assert.match(execFileSync("git", ["check-ignore", "-q", name], { cwd: REPOSITORY_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).toString(), /^$/);
  assert.throws(() => execFileSync("git", ["check-ignore", "-q", "private-rate-profile.example.json"], { cwd: REPOSITORY_ROOT, stdio: "ignore" }));
});
