const fs = require("node:fs");
const path = require("node:path");
const { validatePrivateRateProfile } = require("./privateRateProfileContract");
const { privateCostValidationError } = require("./privateCostEstimator");
const { PRIVATE_CALIBRATED_MODE } = require("./privateRateProfileContract");

const PROFILE_ENV = "PRIVATE_RATE_PROFILE_PATH";
const REPOSITORY_ROOT = path.resolve(__dirname, "../..");

function safeProfileError(code, message, statusCode = 500, errors = []) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.errors = errors.length ? errors : [{ path: "privateProfile", code, message }];
  return error;
}

function normalizeAbsolutePath(profilePath) {
  if (typeof profilePath !== "string" || profilePath.trim() === "") {
    throw safeProfileError("PRIVATE_PROFILE_PATH_REQUIRED", `${PROFILE_ENV} 必須提供 repo 外部的 profile path。`, 500);
  }
  if (!path.isAbsolute(profilePath)) {
    throw safeProfileError("PRIVATE_PROFILE_PATH_MUST_BE_ABSOLUTE", "private profile path 必須為 absolute path。", 500);
  }
  return path.resolve(profilePath);
}

function isInsideRepository(candidatePath, repositoryRoot = REPOSITORY_ROOT) {
  const candidate = path.resolve(candidatePath);
  const root = path.resolve(repositoryRoot);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function assertOutsideRepository(profilePath, repositoryRoot = REPOSITORY_ROOT) {
  if (isInsideRepository(profilePath, repositoryRoot)) {
    throw safeProfileError("PRIVATE_PROFILE_MUST_BE_OUTSIDE_REPOSITORY", "private profile 必須位於 repository 外部。", 500);
  }
  return profilePath;
}

function assertExistingFileOutsideRepository(profilePath, repositoryRoot = REPOSITORY_ROOT) {
  const resolved = assertOutsideRepository(normalizeAbsolutePath(profilePath), repositoryRoot);
  let realPath;
  try {
    realPath = fs.realpathSync.native(resolved);
  } catch {
    throw safeProfileError("PRIVATE_PROFILE_READ_FAILED", "private profile 無法讀取。", 500);
  }
  assertOutsideRepository(realPath, repositoryRoot);
  let stat;
  try {
    stat = fs.statSync(realPath);
  } catch {
    throw safeProfileError("PRIVATE_PROFILE_READ_FAILED", "private profile 無法讀取。", 500);
  }
  if (!stat.isFile()) throw safeProfileError("PRIVATE_PROFILE_NOT_FILE", "private profile 必須是一般檔案。", 500);
  return realPath;
}

function assertDateWindow(profile, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const effectiveFromMs = Date.parse(profile.effectiveFrom);
  const hasEffectiveTo = profile.effectiveTo !== undefined && profile.effectiveTo !== null;
  const effectiveToMs = hasEffectiveTo ? Date.parse(profile.effectiveTo) : null;
  if (!Number.isFinite(nowMs) || !Number.isFinite(effectiveFromMs)) {
    throw safeProfileError("PRIVATE_PROFILE_DATE_INVALID", "private profile effective date 無效。", 500);
  }
  if (effectiveFromMs > nowMs) throw safeProfileError("PRIVATE_PROFILE_NOT_YET_EFFECTIVE", "private profile 尚未到生效時間。", 500);
  if (effectiveToMs !== null && (!Number.isFinite(effectiveToMs) || effectiveToMs <= nowMs)) {
    throw safeProfileError("PRIVATE_PROFILE_EXPIRED", "private profile 已過期。", 500);
  }
  if (effectiveToMs !== null && effectiveToMs <= effectiveFromMs) {
    throw safeProfileError("PRIVATE_PROFILE_DATE_WINDOW_INVALID", "private profile effective date window 無效。", 500);
  }
}

function assertPrivateProfileUsable(profile, now = new Date()) {
  if (profile && profile.mode === PRIVATE_CALIBRATED_MODE && profile.status !== "ACTIVE") {
    throw safeProfileError("PRIVATE_PROFILE_NOT_ACTIVE", "private profile 必須為 ACTIVE。", 500);
  }
  const errors = validatePrivateRateProfile(profile);
  if (errors.length) throw privateCostValidationError(errors, "PRIVATE_PROFILE_INVALID", "private profile validation 失敗。");
  if (profile.mode !== PRIVATE_CALIBRATED_MODE) {
    throw safeProfileError("PRIVATE_PROFILE_MODE_REQUIRED", "local private runtime 只接受 PRIVATE_CALIBRATED profile。", 500);
  }
  const metadata = profile.metadata;
  if (!metadata || typeof metadata.source !== "string" || typeof metadata.owner !== "string" || typeof metadata.approvalStatus !== "string") {
    throw safeProfileError("PRIVATE_PROFILE_METADATA_REQUIRED", "private profile 必須有 source、owner 與 approvalStatus metadata。", 500);
  }
  if (metadata.approvalStatus !== "APPROVED") {
    throw safeProfileError("PRIVATE_PROFILE_NOT_APPROVED", "private profile approvalStatus 必須為 APPROVED。", 500);
  }
  assertDateWindow(profile, now);
  return profile;
}

function readProfileJson(profilePath) {
  let raw;
  try {
    raw = fs.readFileSync(profilePath, "utf8");
  } catch {
    throw safeProfileError("PRIVATE_PROFILE_READ_FAILED", "private profile 無法讀取。", 500);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw safeProfileError("PRIVATE_PROFILE_JSON_INVALID", "private profile 不是有效 JSON。", 500);
  }
}

function loadPrivateRateProfile({ profilePath = process.env[PROFILE_ENV], repositoryRoot = REPOSITORY_ROOT, now = new Date() } = {}) {
  const realPath = assertExistingFileOutsideRepository(profilePath, repositoryRoot);
  const profile = readProfileJson(realPath);
  assertPrivateProfileUsable(profile, now);
  return { profile, profilePath: realPath };
}

module.exports = {
  PROFILE_ENV,
  REPOSITORY_ROOT,
  normalizeAbsolutePath,
  isInsideRepository,
  assertOutsideRepository,
  assertExistingFileOutsideRepository,
  assertDateWindow,
  assertPrivateProfileUsable,
  loadPrivateRateProfile,
};
