const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const childProcess = require("node:child_process");
const {
  REPOSITORY_ROOT,
  isInsideRepository,
  assertExistingFileOutsideRepository,
  loadPrivateRateProfile,
} = require("./privateProfileLoader");
const {
  assertExistingPilotFileOutsideRepository,
  loadPrivateCalibrationPilot,
} = require("./privateCalibrationPilotLoader");

const PRIVATE_RUNTIME_ENABLED = "PRIVATE_RUNTIME_ENABLED";
const PRIVATE_RUNTIME_HOST = "PRIVATE_RUNTIME_HOST";
const PRIVATE_RUNTIME_PORT = "PRIVATE_RUNTIME_PORT";
const PRIVATE_LOCAL_IDENTITY = "PRIVATE_LOCAL_IDENTITY";
const PRIVATE_RATE_PROFILE_PATH = "PRIVATE_RATE_PROFILE_PATH";
const PRIVATE_CALIBRATION_PILOT_PATH = "PRIVATE_CALIBRATION_PILOT_PATH";
const PRIVATE_AUDIT_LOG_PATH = "PRIVATE_AUDIT_LOG_PATH";
const PRIVATE_CALIBRATION_HISTORY_PATH = "PRIVATE_CALIBRATION_HISTORY_PATH";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;
const DEFAULT_IDENTITY = "local-private-session";
const PROFILE_FILE = "private-rate-profile.json";
const PILOT_FILE = "private-calibration-pilot.json";
const AUDIT_FILE = "private-audit.jsonl";
const HISTORY_FILE = "private-calibration-history.jsonl";
const SUBDIRECTORIES = Object.freeze(["profile", "pilot", "audit", "history", "backup"]);
const SENSITIVE_FILENAME_PATTERN = /(^|\/)(private-rate-profile(?!\.example)|private-calibration-pilot|private-calibration-history|private-audit|private-cost|calibration-worksheet)/i;
const PUBLIC_PRIVATE_ROUTE_PATTERN = /\/private-estimate|\/api\/private\/(?:estimate|calibration-pilot)|PRIVATE_RATE_PROFILE_PATH|PRIVATE_CALIBRATION_PILOT_PATH|PRIVATE_AUDIT_LOG_PATH|PRIVATE_CALIBRATION_HISTORY_PATH|PRIVATE_RUNTIME_ENABLED/;
const PUBLIC_PRIVATE_FIELD_PATTERN = /actualHistoricalTotalInternalCost|actualHistoricalInternalCostPerPart|internalMachineRatePerMinute|internalLaborRatePerMinute|carbonSteelRatePerKg|stainlessSteelRatePerKg|DEMO_PILOT_4D|SENTINEL_PRIVATE|9876543\.21/;
const DOC_PRIVATE_SENTINEL_PATTERN = /SENTINEL_PRIVATE|PRIVATE_SENTINEL|REAL_COMPANY_(?:RATE|COST)|REAL_SUPPLIER_(?:RATE|COST)|REAL_CUSTOMER_(?:PRICE|COST)|9876543\.21/;

function operatorError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requireAbsoluteExternalPath(input, label, repositoryRoot = REPOSITORY_ROOT) {
  if (typeof input !== "string" || input.trim() === "") throw operatorError(`${label}_REQUIRED`);
  if (!path.isAbsolute(input)) throw operatorError(`${label}_MUST_BE_ABSOLUTE`);
  const resolved = path.resolve(input);
  if (isInsideRepository(resolved, repositoryRoot)) throw operatorError(`${label}_MUST_BE_OUTSIDE_REPOSITORY`);
  for (const candidate of [resolved, path.dirname(resolved)]) {
    try {
      const realPath = fs.realpathSync.native(candidate);
      if (isInsideRepository(realPath, repositoryRoot)) throw operatorError(`${label}_MUST_BE_OUTSIDE_REPOSITORY`);
    } catch (error) {
      if (error.code === `${label}_MUST_BE_OUTSIDE_REPOSITORY`) throw error;
    }
  }
  return resolved;
}

function assertDirectoryDestination(destination, repositoryRoot = REPOSITORY_ROOT) {
  const resolved = requireAbsoluteExternalPath(destination, "PRIVATE_DIRECTORY", repositoryRoot);
  if (fs.existsSync(resolved)) {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw operatorError("PRIVATE_DIRECTORY_NOT_DIRECTORY");
  }
  return resolved;
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  fs.chmodSync(directoryPath, 0o700);
}

function ensurePrivateFile(filePath, contents) {
  if (fs.existsSync(filePath)) {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw operatorError("PRIVATE_TEMPLATE_NOT_REGULAR_FILE");
    fs.chmodSync(filePath, 0o600);
    return "EXISTING_NOT_MODIFIED";
  }
  fs.writeFileSync(filePath, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.chmodSync(filePath, 0o600);
  return "CREATED";
}

function jsonTemplate(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function createValueEmptyProfileTemplate() {
  return {
    mode: null,
    rateProfileId: null,
    version: null,
    effectiveFrom: null,
    effectiveTo: null,
    status: null,
    currency: null,
    material: {
      carbonSteelRatePerKg: null,
      stainlessSteelRatePerKg: null,
      aluminumRatePerKg: null,
      copperRatePerKg: null,
    },
    cutting: {
      machineRatePerMinute: null,
      setupRatePerMinute: null,
      pierceTimeSecondsEach: null,
      cuttingSpeedMmPerMin: null,
      setupMinutesPerBatch: null,
    },
    bending: {
      machineRatePerMinute: null,
      setupRatePerMinute: null,
      secondsPerBend: null,
      setupMinutesPerBatch: null,
    },
    welding: {
      laborRatePerMinute: null,
      machineRatePerMinute: null,
      weldingSpeedMmPerMin: null,
      setupMinutesPerBatch: null,
    },
    surfaceTreatment: {
      ratePerM2: null,
    },
    setup: {
      engineeringSetupRatePerMinute: null,
      engineeringSetupMinutesPerBatch: null,
    },
    metadata: {
      source: null,
      owner: null,
      approvalStatus: null,
      note: null,
    },
  };
}

function createValueEmptyPilotTemplate() {
  return {
    pilotScope: "SINGLE_CONTROLLED_PILOT",
    part: {
      pilotId: null,
      materialFamily: null,
      grade: null,
      thicknessMm: null,
      blankLengthMm: null,
      blankWidthMm: null,
      quantity: null,
      batchCount: null,
    },
    material: {
      densityKgM3: null,
    },
    cutting: {
      cutLengthMmPerPart: null,
      pierceCountPerPart: null,
      observedCuttingSpeedMmPerMin: null,
      observedRunMinutes: null,
      authoritativeObservation: null,
      observedPierceSecondsEach: null,
      observedSetupMinutesPerBatch: null,
    },
    bending: {
      bendCountPerPart: null,
      observedSecondsPerBend: null,
      observedRunMinutes: null,
      authoritativeObservation: null,
      observedSetupMinutesPerBatch: null,
    },
    welding: {
      weldLengthMmPerPart: null,
      observedWeldingSpeedMmPerMin: null,
      observedRunMinutes: null,
      authoritativeObservation: null,
      observedSetupMinutesPerBatch: null,
    },
    surfaceTreatment: {
      treatedAreaMm2PerPart: null,
    },
    engineeringSetup: {
      observedSetupMinutesPerBatch: null,
    },
    historicalReference: {
      actualHistoricalTotalInternalCost: null,
      actualHistoricalInternalCostPerPart: null,
      componentCosts: {
        material: null,
        cutting: null,
        piercing: null,
        bending: null,
        welding: null,
        surfaceTreatment: null,
        setup: null,
      },
    },
  };
}

function initializePrivateOperatorDirectory(destination, { repositoryRoot = REPOSITORY_ROOT } = {}) {
  const root = assertDirectoryDestination(destination, repositoryRoot);
  ensureDirectory(root);
  for (const subdirectory of SUBDIRECTORIES) ensureDirectory(path.join(root, subdirectory));
  const profileStatus = ensurePrivateFile(path.join(root, "profile", PROFILE_FILE), jsonTemplate(createValueEmptyProfileTemplate()));
  const pilotStatus = ensurePrivateFile(path.join(root, "pilot", PILOT_FILE), jsonTemplate(createValueEmptyPilotTemplate()));
  const auditStatus = ensurePrivateFile(path.join(root, "audit", AUDIT_FILE), "");
  const historyStatus = ensurePrivateFile(path.join(root, "history", HISTORY_FILE), "");
  return {
    repositoryBoundary: "PASS",
    directory: "READY_0700",
    profileTemplate: `VALUE_EMPTY_${profileStatus}`,
    pilotTemplate: `VALUE_EMPTY_${pilotStatus}`,
    auditFile: `READY_0600_${auditStatus}`,
    historyFile: `READY_0600_${historyStatus}`,
    backupDirectory: "READY_0700",
  };
}

function safeIdentity(environment = process.env) {
  const identity = environment[PRIVATE_LOCAL_IDENTITY] || DEFAULT_IDENTITY;
  if (typeof identity !== "string" || identity.trim() === "" || identity.length > 128 || /[\u0000\r\n]/.test(identity)) throw operatorError("PRIVATE_LOCAL_IDENTITY_INVALID");
  return identity;
}

function validateLoopback(environment = process.env) {
  const host = environment[PRIVATE_RUNTIME_HOST] || DEFAULT_HOST;
  if (host !== DEFAULT_HOST) throw operatorError("PRIVATE_RUNTIME_MUST_BIND_LOOPBACK");
  const rawPort = environment[PRIVATE_RUNTIME_PORT] || DEFAULT_PORT;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw operatorError("PRIVATE_RUNTIME_PORT_INVALID");
  return { host, port };
}

function validateQualityThresholds(environment = process.env) {
  if (!environment.PRIVATE_CALIBRATION_QUALITY_THRESHOLDS_JSON) return;
  let parsed;
  try {
    parsed = JSON.parse(environment.PRIVATE_CALIBRATION_QUALITY_THRESHOLDS_JSON);
  } catch {
    throw operatorError("PRIVATE_CALIBRATION_QUALITY_THRESHOLDS_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw operatorError("PRIVATE_CALIBRATION_QUALITY_THRESHOLDS_INVALID");
}

function validateLocalOperatorReadiness({ environment = process.env, repositoryRoot = REPOSITORY_ROOT, now = new Date() } = {}) {
  const status = {
    enableFlag: "FAIL",
    profilePath: "FAIL",
    profileSchema: "INVALID",
    profileStatus: "NOT_READY",
    profileApproval: "NOT_READY",
    pilotPath: "FAIL",
    pilotSchema: "INVALID",
    auditPath: "FAIL",
    historyPath: "FAIL",
    authorization: "NOT_READY",
    localhostBoundary: "FAIL",
    publicLeakage: "FAIL",
  };
  let ok = true;
  const check = (callback, onSuccess) => {
    try {
      callback();
      onSuccess();
    } catch {
      ok = false;
    }
  };

  check(() => {
    if (environment[PRIVATE_RUNTIME_ENABLED] !== "1") throw operatorError("PRIVATE_RUNTIME_DISABLED");
  }, () => { status.enableFlag = "PASS"; });

  check(() => validateLoopback(environment), () => { status.localhostBoundary = "PASS"; });
  check(() => safeIdentity(environment), () => { status.authorization = "READY"; });
  check(() => validateQualityThresholds(environment), () => {});

  let profilePath;
  check(() => {
    profilePath = assertExistingFileOutsideRepository(environment[PRIVATE_RATE_PROFILE_PATH], repositoryRoot);
  }, () => { status.profilePath = "EXTERNAL_OK"; });
  check(() => {
    if (!profilePath) throw operatorError("PRIVATE_PROFILE_PATH_NOT_READY");
    loadPrivateRateProfile({ profilePath, repositoryRoot, now });
  }, () => {
    status.profileSchema = "VALID";
    status.profileStatus = "ACTIVE";
    status.profileApproval = "APPROVED";
  });

  let pilotPath;
  check(() => {
    pilotPath = assertExistingPilotFileOutsideRepository(environment[PRIVATE_CALIBRATION_PILOT_PATH], repositoryRoot);
  }, () => { status.pilotPath = "EXTERNAL_OK"; });
  check(() => {
    if (!pilotPath) throw operatorError("PRIVATE_PILOT_PATH_NOT_READY");
    loadPrivateCalibrationPilot({ pilotPath, repositoryRoot });
  }, () => { status.pilotSchema = "VALID"; });

  check(() => requireAbsoluteExternalPath(environment[PRIVATE_AUDIT_LOG_PATH], "PRIVATE_AUDIT_LOG", repositoryRoot), () => { status.auditPath = "EXTERNAL_OK"; });
  check(() => requireAbsoluteExternalPath(environment[PRIVATE_CALIBRATION_HISTORY_PATH], "PRIVATE_CALIBRATION_HISTORY", repositoryRoot), () => { status.historyPath = "EXTERNAL_OK"; });

  const leakCheck = runPrivateLeakCheck({ repositoryRoot });
  status.publicLeakage = leakCheck.ok ? "PASS" : "FAIL";
  if (!leakCheck.ok) ok = false;
  return { ok, status };
}

function gitOutput(args, repositoryRoot) {
  try {
    return childProcess.execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw operatorError("GIT_CHECK_FAILED");
  }
}

function trackedFiles(repositoryRoot) {
  return gitOutput(["ls-files", "-z"], repositoryRoot).split("\0").filter(Boolean);
}

function runPrivateLeakCheck({ repositoryRoot = REPOSITORY_ROOT } = {}) {
  const findings = [];
  let files;
  try {
    files = trackedFiles(repositoryRoot);
  } catch {
    return { ok: false, findings: ["TRACKED_FILES_UNAVAILABLE"] };
  }
  for (const file of files) {
    if (file.startsWith("test/") || file.startsWith("docs/")) continue;
    if (SENSITIVE_FILENAME_PATTERN.test(file) && file !== "private-rate-profile.example.json") findings.push("TRACKED_PRIVATE_PAYLOAD");
  }

  const publicFiles = files.filter((file) => {
    if (file === "private-rate-profile.example.json") return false;
    if (file.startsWith("docs/") || file.startsWith("test/")) return false;
    if (file.startsWith("lib/engineering/private")) return false;
    if (file === "private-runtime.js" || file.startsWith("private-estimate")) return false;
    return /(?:\.html|\.js|\.json)$/.test(file);
  });
  for (const file of publicFiles) {
    let source;
    try {
      source = fs.readFileSync(path.join(repositoryRoot, file), "utf8");
    } catch {
      findings.push("PUBLIC_ASSET_READ_FAILED");
      continue;
    }
    if (PUBLIC_PRIVATE_FIELD_PATTERN.test(source)) findings.push("PUBLIC_PRIVATE_FIELD");
  }
  const serverPath = path.join(repositoryRoot, "server.js");
  try {
    if (PUBLIC_PRIVATE_ROUTE_PATTERN.test(fs.readFileSync(serverPath, "utf8"))) findings.push("PUBLIC_PRIVATE_ROUTE");
  } catch {
    findings.push("PUBLIC_SERVER_READ_FAILED");
  }

  for (const file of files.filter((candidate) => candidate.startsWith("docs/") && /\.md$/.test(candidate))) {
    try {
      if (DOC_PRIVATE_SENTINEL_PATTERN.test(fs.readFileSync(path.join(repositoryRoot, file), "utf8"))) findings.push("DOC_PRIVATE_SENTINEL");
    } catch {
      findings.push("DOC_READ_FAILED");
    }
  }

  let statusOutput;
  try {
    statusOutput = gitOutput(["status", "--porcelain=v1", "--untracked-files=all"], repositoryRoot);
  } catch {
    statusOutput = "GIT_STATUS_UNAVAILABLE";
  }
  for (const line of statusOutput.split("\n")) {
    if (line.startsWith("?? ") && SENSITIVE_FILENAME_PATTERN.test(line.slice(3))) findings.push("UNTRACKED_PRIVATE_PAYLOAD");
  }
  return { ok: findings.length === 0, findings: [...new Set(findings)] };
}

function formatInitStatus(result) {
  return [
    `REPOSITORY_BOUNDARY: ${result.repositoryBoundary}`,
    `DIRECTORY: ${result.directory}`,
    `PROFILE_TEMPLATE: ${result.profileTemplate}`,
    `PILOT_TEMPLATE: ${result.pilotTemplate}`,
    `AUDIT_FILE: ${result.auditFile}`,
    `HISTORY_FILE: ${result.historyFile}`,
    `BACKUP_DIRECTORY: ${result.backupDirectory}`,
  ];
}

function formatValidationStatus(result) {
  const status = result.status;
  return [
    `ENABLE_FLAG: ${status.enableFlag}`,
    `PROFILE_PATH: ${status.profilePath}`,
    `PROFILE_SCHEMA: ${status.profileSchema}`,
    `PROFILE_STATUS: ${status.profileStatus}`,
    `PROFILE_APPROVAL: ${status.profileApproval}`,
    `PILOT_PATH: ${status.pilotPath}`,
    `PILOT_SCHEMA: ${status.pilotSchema}`,
    `AUDIT_PATH: ${status.auditPath}`,
    `HISTORY_PATH: ${status.historyPath}`,
    `AUTHORIZATION: ${status.authorization}`,
    `LOCALHOST_BOUNDARY: ${status.localhostBoundary}`,
    `PUBLIC_LEAKAGE: ${status.publicLeakage}`,
    `READY_FOR_PRIVATE_PILOT: ${result.ok ? "YES" : "NO"}`,
  ];
}

function formatLeakCheckStatus(result) {
  return [
    `TRACKED_PRIVATE_PROFILE: ${result.ok ? "NONE" : "CHECK_FAILED"}`,
    `TRACKED_PRIVATE_PILOT: ${result.ok ? "NONE" : "CHECK_FAILED"}`,
    `TRACKED_PRIVATE_AUDIT_HISTORY: ${result.ok ? "NONE" : "CHECK_FAILED"}`,
    `PUBLIC_ASSETS: ${result.ok ? "PASS" : "CHECK_FAILED"}`,
    `DOCUMENTS: ${result.ok ? "PASS" : "CHECK_FAILED"}`,
    `UNTRACKED_SENSITIVE_FILES: ${result.ok ? "NONE" : "CHECK_FAILED"}`,
    `PUBLIC_API: ${result.ok ? "UNCHANGED" : "CHECK_FAILED"}`,
    `READY: ${result.ok ? "PASS" : "FAIL"}`,
  ];
}

module.exports = {
  PRIVATE_RUNTIME_ENABLED,
  PRIVATE_RUNTIME_HOST,
  PRIVATE_RUNTIME_PORT,
  PRIVATE_LOCAL_IDENTITY,
  PRIVATE_RATE_PROFILE_PATH,
  PRIVATE_CALIBRATION_PILOT_PATH,
  PRIVATE_AUDIT_LOG_PATH,
  PRIVATE_CALIBRATION_HISTORY_PATH,
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_IDENTITY,
  PROFILE_FILE,
  PILOT_FILE,
  AUDIT_FILE,
  HISTORY_FILE,
  REPOSITORY_ROOT,
  SUBDIRECTORIES,
  createValueEmptyProfileTemplate,
  createValueEmptyPilotTemplate,
  initializePrivateOperatorDirectory,
  validateLocalOperatorReadiness,
  runPrivateLeakCheck,
  formatInitStatus,
  formatValidationStatus,
  formatLeakCheckStatus,
  requireAbsoluteExternalPath,
  assertDirectoryDestination,
};
