const fs = require("node:fs");
const path = require("node:path");
const { HISTORY_ENV } = require("./privateCalibrationPilotContract");
const { REPOSITORY_ROOT, normalizeAbsolutePath, isInsideRepository } = require("./privateProfileLoader");

const HISTORY_KEYS = Object.freeze(["pilotId", "estimateId", "profileId", "profileVersion", "runTimestamp", "variancePct", "resultStatus"]);

function safeHistoryError(code, message, statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.errors = [{ path: "calibrationHistory", code, message }];
  return error;
}

function assertHistoryPathOutsideRepository(historyPath, repositoryRoot = REPOSITORY_ROOT) {
  const resolved = normalizeAbsolutePath(historyPath);
  if (isInsideRepository(resolved, repositoryRoot)) throw safeHistoryError("PRIVATE_CALIBRATION_HISTORY_MUST_BE_OUTSIDE_REPOSITORY", "calibration history 必須位於 repository 外部。", 500);
  for (const candidate of [resolved, path.dirname(resolved)]) {
    try {
      const realPath = fs.realpathSync.native(candidate);
      if (isInsideRepository(realPath, repositoryRoot)) throw safeHistoryError("PRIVATE_CALIBRATION_HISTORY_MUST_BE_OUTSIDE_REPOSITORY", "calibration history 必須位於 repository 外部。", 500);
    } catch (error) {
      if (error.code === "PRIVATE_CALIBRATION_HISTORY_MUST_BE_OUTSIDE_REPOSITORY") throw error;
    }
  }
  return resolved;
}

function ensureHistoryFile(historyPath, repositoryRoot = REPOSITORY_ROOT) {
  const resolved = assertHistoryPathOutsideRepository(historyPath, repositoryRoot);
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  if (fs.existsSync(resolved)) {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) throw safeHistoryError("PRIVATE_CALIBRATION_HISTORY_NOT_FILE", "calibration history 必須是一般檔案。", 500);
  } else {
    fs.writeFileSync(resolved, "", { mode: 0o600 });
  }
  fs.chmodSync(resolved, 0o600);
  return resolved;
}

function assertSafeHistoryRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw safeHistoryError("PRIVATE_CALIBRATION_HISTORY_RECORD_INVALID", "calibration history record 無效。", 400);
  const keys = Object.keys(record);
  if (keys.length !== HISTORY_KEYS.length || keys.some((key) => !HISTORY_KEYS.includes(key))) throw safeHistoryError("PRIVATE_CALIBRATION_HISTORY_RECORD_SCHEMA_INVALID", "calibration history 只允許 safe identifier 與 variance 欄位。", 400);
  for (const key of ["pilotId", "estimateId", "profileId", "profileVersion", "runTimestamp", "resultStatus"]) {
    if (typeof record[key] !== "string" || record[key].trim() === "") throw safeHistoryError("PRIVATE_CALIBRATION_HISTORY_RECORD_SCHEMA_INVALID", "calibration history identifier 欄位必須為非空字串。", 400);
  }
  if (record.variancePct !== null && (typeof record.variancePct !== "number" || !Number.isFinite(record.variancePct))) throw safeHistoryError("PRIVATE_CALIBRATION_HISTORY_RECORD_SCHEMA_INVALID", "calibration history variancePct 必須為有限數字或 null。", 400);
  return record;
}

function createCalibrationHistoryLogger(historyPath, { repositoryRoot = REPOSITORY_ROOT } = {}) {
  const resolved = ensureHistoryFile(historyPath, repositoryRoot);
  return (record) => {
    const safeRecord = assertSafeHistoryRecord(record);
    fs.appendFileSync(resolved, `${JSON.stringify(safeRecord)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(resolved, 0o600);
  };
}

module.exports = {
  HISTORY_ENV,
  HISTORY_KEYS,
  safeHistoryError,
  assertHistoryPathOutsideRepository,
  ensureHistoryFile,
  assertSafeHistoryRecord,
  createCalibrationHistoryLogger,
};
