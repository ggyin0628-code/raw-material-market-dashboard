const PRIVATE_CALIBRATED_MODE = "PRIVATE_CALIBRATED";
const SYNTHETIC_TEST_MODE = "SYNTHETIC_TEST";
const PRIVATE_RATE_PROFILE_MODES = Object.freeze([PRIVATE_CALIBRATED_MODE, SYNTHETIC_TEST_MODE]);
const PRIVATE_PROFILE_STATUSES = Object.freeze(["DRAFT", "REVIEW", "ACTIVE", "EXPIRED", "REVOKED", "TEST_ONLY"]);
const PRIVATE_SCOPE = "engineering:private-cost";
const PRIVATE_SOURCE = "PRIVATE_CALIBRATED / PROTECTED_RUNTIME_ONLY";
const SYNTHETIC_SOURCE = "SYNTHETIC / DEMO / TEST ONLY";

const PROFILE_KEYS = new Set([
  "mode",
  "rateProfileId",
  "version",
  "effectiveFrom",
  "effectiveTo",
  "status",
  "currency",
  "material",
  "cutting",
  "bending",
  "welding",
  "surfaceTreatment",
  "setup",
]);
const MATERIAL_KEYS = new Set([
  "carbonSteelRatePerKg",
  "stainlessSteelRatePerKg",
  "aluminumRatePerKg",
  "copperRatePerKg",
]);
const CUTTING_KEYS = new Set([
  "machineRatePerMinute",
  "setupRatePerMinute",
  "pierceTimeSecondsEach",
  "cuttingSpeedMmPerMin",
  "setupMinutesPerBatch",
]);
const BENDING_KEYS = new Set([
  "machineRatePerMinute",
  "setupRatePerMinute",
  "secondsPerBend",
  "setupMinutesPerBatch",
]);
const WELDING_KEYS = new Set([
  "laborRatePerMinute",
  "machineRatePerMinute",
  "weldingSpeedMmPerMin",
  "setupMinutesPerBatch",
]);
const SURFACE_KEYS = new Set(["ratePerM2"]);
const SETUP_KEYS = new Set(["engineeringSetupRatePerMinute", "engineeringSetupMinutesPerBatch"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addError(errors, path, code, message) {
  errors.push({ path, code, message });
}

function requireObject(value, path, errors) {
  if (!isPlainObject(value)) {
    addError(errors, path, "OBJECT_REQUIRED", "必須為物件。");
    return false;
  }
  return true;
}

function validateKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value || {})) {
    if (!allowed.has(key)) addError(errors, `${path}.${key}`, "UNEXPECTED_FIELD", "不支援的欄位。");
  }
}

function requireKey(value, key, path, errors) {
  if (!Object.prototype.hasOwnProperty.call(value || {}, key) || value[key] === undefined) {
    addError(errors, `${path}.${key}`, "REQUIRED_FIELD", "必填欄位缺失。");
  }
}

function validateText(value, path, errors, { allowNull = false } = {}) {
  if (allowNull && value === null) return;
  if (typeof value !== "string" || value.trim() === "") addError(errors, path, "STRING_REQUIRED", "必須為非空字串。");
}

function validateDate(value, path, errors, { allowNull = false, required = false } = {}) {
  if (value === undefined && !required) return;
  if (allowNull && value === null) return;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    addError(errors, path, "ISO_DATE_REQUIRED", "必須為有效 ISO 日期時間字串。");
  }
}

function validateNumber(value, path, errors, { min = 0, exclusiveMin = false } = {}) {
  const number = finiteNumber(value);
  if (number === null) {
    addError(errors, path, "NUMBER_REQUIRED", "必須為有限數字。");
    return;
  }
  if (exclusiveMin ? number <= min : number < min) addError(errors, path, "OUT_OF_RANGE", `必須${exclusiveMin ? "大於" : "大於或等於"}${min}。`);
}

function validateNumericSection(value, keys, path, errors, positiveKeys = new Set()) {
  if (!requireObject(value, path, errors)) return;
  validateKeys(value, keys, path, errors);
  for (const key of keys) {
    requireKey(value, key, path, errors);
    if (Object.prototype.hasOwnProperty.call(value, key)) validateNumber(value[key], `${path}.${key}`, errors, { min: 0, exclusiveMin: positiveKeys.has(key) });
  }
}

function validatePrivateRateProfile(profile) {
  const errors = [];
  if (!requireObject(profile, "rateProfile", errors)) return errors;
  validateKeys(profile, PROFILE_KEYS, "rateProfile", errors);
  for (const key of ["mode", "rateProfileId", "version", "effectiveFrom", "status", "currency", "material", "cutting", "bending", "welding", "surfaceTreatment", "setup"]) requireKey(profile, key, "rateProfile", errors);
  if (profile.mode !== undefined && !PRIVATE_RATE_PROFILE_MODES.includes(profile.mode)) addError(errors, "rateProfile.mode", "UNSUPPORTED_PRIVATE_RATE_MODE", `必須為 ${PRIVATE_RATE_PROFILE_MODES.join("、")} 之一。`);
  validateText(profile.rateProfileId, "rateProfile.rateProfileId", errors);
  validateText(profile.version, "rateProfile.version", errors);
  validateDate(profile.effectiveFrom, "rateProfile.effectiveFrom", errors, { required: true });
  validateDate(profile.effectiveTo, "rateProfile.effectiveTo", errors, { allowNull: true });
  if (profile.status !== undefined && !PRIVATE_PROFILE_STATUSES.includes(profile.status)) addError(errors, "rateProfile.status", "INVALID_STATUS", `必須為 ${PRIVATE_PROFILE_STATUSES.join("、")} 之一。`);
  validateText(profile.currency, "rateProfile.currency", errors);
  validateNumericSection(profile.material, MATERIAL_KEYS, "rateProfile.material", errors);
  validateNumericSection(profile.cutting, CUTTING_KEYS, "rateProfile.cutting", errors, new Set(["cuttingSpeedMmPerMin"]));
  validateNumericSection(profile.bending, BENDING_KEYS, "rateProfile.bending", errors, new Set(["secondsPerBend"]));
  validateNumericSection(profile.welding, WELDING_KEYS, "rateProfile.welding", errors, new Set(["weldingSpeedMmPerMin"]));
  validateNumericSection(profile.surfaceTreatment, SURFACE_KEYS, "rateProfile.surfaceTreatment", errors);
  validateNumericSection(profile.setup, SETUP_KEYS, "rateProfile.setup", errors);
  if (profile.mode === PRIVATE_CALIBRATED_MODE && profile.status !== "ACTIVE") addError(errors, "rateProfile.status", "PRIVATE_PROFILE_NOT_ACTIVE", "PRIVATE_CALIBRATED 只有 ACTIVE profile 可供受保護 runtime 使用。");
  if (profile.mode === SYNTHETIC_TEST_MODE && profile.status !== "TEST_ONLY") addError(errors, "rateProfile.status", "SYNTHETIC_PROFILE_NOT_TEST_ONLY", "SYNTHETIC_TEST profile 必須明確標記 TEST_ONLY。");
  return errors;
}

function getPrivateRateProfileSchema() {
  return {
    internalOnly: true,
    publicExposure: "NEVER",
    modes: {
      PRIVATE_CALIBRATED: { type: "enum", note: "受保護、已授權 runtime only；不註冊於 anonymous public API。" },
      SYNTHETIC_TEST: { type: "enum", note: "僅 deterministic test/demo；不可作為公司或市場價格。" },
    },
    lifecycle: {
      rateProfileId: { type: "string", output: "safe identifier only" },
      version: { type: "string", output: "safe identifier only" },
      effectiveFrom: { type: "ISO date-time" },
      effectiveTo: { type: "ISO date-time|null" },
      status: { type: "enum", allowed: PRIVATE_PROFILE_STATUSES },
    },
    currency: { type: "string", note: "metadata only; no rate values are returned in schema" },
    material: {
      carbonSteelRatePerKg: { type: "number", unit: "currency/kg", value: "NEVER_EMBEDDED" },
      stainlessSteelRatePerKg: { type: "number", unit: "currency/kg", value: "NEVER_EMBEDDED" },
      aluminumRatePerKg: { type: "number", unit: "currency/kg", value: "NEVER_EMBEDDED" },
      copperRatePerKg: { type: "number", unit: "currency/kg", value: "NEVER_EMBEDDED" },
    },
    cutting: {
      machineRatePerMinute: { type: "number", unit: "currency/min", value: "NEVER_EMBEDDED" },
      setupRatePerMinute: { type: "number", unit: "currency/min", value: "NEVER_EMBEDDED" },
      pierceTimeSecondsEach: { type: "number", unit: "seconds/each", value: "NEVER_EMBEDDED" },
      cuttingSpeedMmPerMin: { type: "number", unit: "mm/min", value: "NEVER_EMBEDDED" },
      setupMinutesPerBatch: { type: "number", unit: "min/batch", value: "NEVER_EMBEDDED" },
    },
    bending: {
      machineRatePerMinute: { type: "number", unit: "currency/min", value: "NEVER_EMBEDDED" },
      setupRatePerMinute: { type: "number", unit: "currency/min", value: "NEVER_EMBEDDED" },
      secondsPerBend: { type: "number", unit: "seconds/each", value: "NEVER_EMBEDDED" },
      setupMinutesPerBatch: { type: "number", unit: "min/batch", value: "NEVER_EMBEDDED" },
    },
    welding: {
      laborRatePerMinute: { type: "number", unit: "currency/min", value: "NEVER_EMBEDDED" },
      machineRatePerMinute: { type: "number", unit: "currency/min", value: "NEVER_EMBEDDED" },
      weldingSpeedMmPerMin: { type: "number", unit: "mm/min", value: "NEVER_EMBEDDED" },
      setupMinutesPerBatch: { type: "number", unit: "min/batch", value: "NEVER_EMBEDDED" },
    },
    surfaceTreatment: {
      ratePerM2: { type: "number", unit: "currency/m²", value: "NEVER_EMBEDDED" },
      processingMinutes: { type: "null", note: "Phase 4B intentionally has no surface-treatment time model." },
    },
    setup: {
      engineeringSetupRatePerMinute: { type: "number", unit: "currency/min", value: "NEVER_EMBEDDED" },
      engineeringSetupMinutesPerBatch: { type: "number", unit: "min/batch", value: "NEVER_EMBEDDED" },
    },
    security: {
      anonymousPublicApi: "DENY",
      frontendExposure: "DENY",
      debugExposure: "DENY",
      logRawValues: "DENY",
      requiredScope: PRIVATE_SCOPE,
    },
  };
}

function safeProfileMetadata(profile, source = profile?.mode === SYNTHETIC_TEST_MODE ? SYNTHETIC_SOURCE : PRIVATE_SOURCE) {
  return {
    mode: profile?.mode || null,
    source,
    rateProfileId: profile?.rateProfileId || null,
    version: profile?.version || null,
    effectiveFrom: profile?.effectiveFrom || null,
    effectiveTo: profile?.effectiveTo ?? null,
    status: profile?.status || null,
    currency: profile?.currency || null,
  };
}

module.exports = {
  PRIVATE_CALIBRATED_MODE,
  SYNTHETIC_TEST_MODE,
  PRIVATE_RATE_PROFILE_MODES,
  PRIVATE_PROFILE_STATUSES,
  PRIVATE_SCOPE,
  PRIVATE_SOURCE,
  SYNTHETIC_SOURCE,
  validatePrivateRateProfile,
  getPrivateRateProfileSchema,
  safeProfileMetadata,
  isPlainObject,
  finiteNumber,
};
