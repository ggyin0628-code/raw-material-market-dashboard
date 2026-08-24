const fs = require("node:fs");
const path = require("node:path");
const { REPOSITORY_ROOT, normalizeAbsolutePath, isInsideRepository } = require("./privateProfileLoader");
const { PILOT_ENV, validatePrivateCalibrationPilot } = require("./privateCalibrationPilotContract");

function safePilotError(code, message, statusCode = 500, errors = []) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.errors = errors.length ? errors : [{ path: "privatePilot", code, message }];
  return error;
}

function assertPilotPathOutsideRepository(pilotPath, repositoryRoot = REPOSITORY_ROOT) {
  const resolved = normalizeAbsolutePath(pilotPath);
  if (isInsideRepository(resolved, repositoryRoot)) throw safePilotError("PRIVATE_PILOT_MUST_BE_OUTSIDE_REPOSITORY", "private pilot input 必須位於 repository 外部。", 500);
  for (const candidate of [resolved, path.dirname(resolved)]) {
    try {
      const realPath = fs.realpathSync.native(candidate);
      if (isInsideRepository(realPath, repositoryRoot)) throw safePilotError("PRIVATE_PILOT_MUST_BE_OUTSIDE_REPOSITORY", "private pilot input 必須位於 repository 外部。", 500);
    } catch (error) {
      if (error.code === "PRIVATE_PILOT_MUST_BE_OUTSIDE_REPOSITORY") throw error;
    }
  }
  return resolved;
}

function assertExistingPilotFileOutsideRepository(pilotPath, repositoryRoot = REPOSITORY_ROOT) {
  const resolved = assertPilotPathOutsideRepository(pilotPath, repositoryRoot);
  let realPath;
  try {
    realPath = fs.realpathSync.native(resolved);
  } catch {
    throw safePilotError("PRIVATE_PILOT_READ_FAILED", "private pilot input 無法讀取。", 500);
  }
  if (isInsideRepository(realPath, repositoryRoot)) throw safePilotError("PRIVATE_PILOT_MUST_BE_OUTSIDE_REPOSITORY", "private pilot input 必須位於 repository 外部。", 500);
  let stat;
  try {
    stat = fs.statSync(realPath);
  } catch {
    throw safePilotError("PRIVATE_PILOT_READ_FAILED", "private pilot input 無法讀取。", 500);
  }
  if (!stat.isFile()) throw safePilotError("PRIVATE_PILOT_NOT_FILE", "private pilot input 必須是一般檔案。", 500);
  return realPath;
}

function readPilotJson(pilotPath) {
  let raw;
  try {
    raw = fs.readFileSync(pilotPath, "utf8");
  } catch {
    throw safePilotError("PRIVATE_PILOT_READ_FAILED", "private pilot input 無法讀取。", 500);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw safePilotError("PRIVATE_PILOT_JSON_INVALID", "private pilot input 不是有效 JSON。", 500);
  }
}

function loadPrivateCalibrationPilot({ pilotPath = process.env[PILOT_ENV], repositoryRoot = REPOSITORY_ROOT } = {}) {
  const realPath = assertExistingPilotFileOutsideRepository(pilotPath, repositoryRoot);
  const pilot = readPilotJson(realPath);
  const errors = validatePrivateCalibrationPilot(pilot);
  if (errors.length) throw safePilotError("PRIVATE_PILOT_INVALID", "private pilot input validation 失敗。", 500, errors);
  return { pilot, pilotPath: realPath };
}

module.exports = {
  PILOT_ENV,
  safePilotError,
  assertPilotPathOutsideRepository,
  assertExistingPilotFileOutsideRepository,
  readPilotJson,
  loadPrivateCalibrationPilot,
};
