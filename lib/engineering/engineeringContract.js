const PROCESS_FAMILIES = Object.freeze(["SHEET_METAL"]);
const RESERVED_PROCESS_FAMILIES = Object.freeze(["MACHINING", "TURNING", "MILLING", "GRINDING", "WELDING", "SURFACE_TREATMENT"]);
const MATERIAL_FAMILIES = Object.freeze(["CARBON_STEEL", "STAINLESS_STEEL", "ALUMINUM", "COPPER", "OTHER"]);
const RATE_MODES = Object.freeze(["NO_RATE", "SYNTHETIC_TEST"]);
const RESERVED_RATE_MODES = Object.freeze(["PRIVATE_CALIBRATED"]);
const RATE_FIELDS = Object.freeze([
  "materialRatePerKg",
  "cuttingRatePerM",
  "pierceRateEach",
  "bendRateEach",
  "weldingRatePerM",
  "surfaceTreatmentRatePerM2",
  "setupRatePerBatch",
]);
const ENGINEERING_DEFAULT_DENSITIES_KG_M3 = Object.freeze({
  CARBON_STEEL: 7850,
  STAINLESS_STEEL: 8000,
  ALUMINUM: 2700,
  COPPER: 8960,
});
const ENGINEERING_DISCLAIMER = "工程估算基礎；非供應商報價、非公司目標價格、非實際公司成本，也不代表任何市場交易價格。";
const NO_RATE_SOURCE = "NO_RATE / 未載入公司成本參數";
const SYNTHETIC_TEST_SOURCE = "SYNTHETIC / DEMO / TEST ONLY";

const TOP_LEVEL_INPUT_KEYS = new Set([
  "processFamily",
  "material",
  "blank",
  "cutting",
  "bending",
  "welding",
  "surfaceTreatment",
  "setup",
  "materialUtilizationPct",
  "scrapPct",
  "rateProfile",
]);
const MATERIAL_KEYS = new Set(["materialFamily", "grade", "thicknessMm", "densityKgM3"]);
const BLANK_KEYS = new Set(["lengthMm", "widthMm", "quantity"]);
const CUTTING_KEYS = new Set(["enabled", "cutLengthMmPerPart", "pierceCountPerPart"]);
const BENDING_KEYS = new Set(["enabled", "bendCountPerPart"]);
const WELDING_KEYS = new Set(["enabled", "weldLengthMmPerPart"]);
const SURFACE_KEYS = new Set(["enabled", "treatmentType", "treatedAreaMm2PerPart"]);
const SETUP_KEYS = new Set(["batchCount"]);
const RATE_PROFILE_KEYS = new Set(["rateProfileId", "mode", ...RATE_FIELDS]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addError(errors, path, code, message) {
  errors.push({ path, code, message });
}

function requireObject(input, path, errors) {
  if (!isPlainObject(input)) {
    addError(errors, path, "OBJECT_REQUIRED", "必須為物件。");
    return false;
  }
  return true;
}

function validateKeys(input, allowed, path, errors) {
  for (const key of Object.keys(input || {})) {
    if (!allowed.has(key)) addError(errors, `${path}.${key}`, "UNEXPECTED_FIELD", "不支援的欄位。");
  }
}

function requireKey(input, key, path, errors) {
  if (!Object.prototype.hasOwnProperty.call(input || {}, key)) addError(errors, `${path}.${key}`, "REQUIRED_FIELD", "必填欄位缺失。");
}

function validateFinite(input, key, path, errors, { min = null, exclusiveMin = false, integer = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(input || {}, key) || input[key] === undefined) return;
  const value = finiteNumber(input[key]);
  if (value === null) {
    addError(errors, `${path}.${key}`, "NUMBER_REQUIRED", "必須為有限數字。");
    return;
  }
  if (integer && !Number.isInteger(value)) addError(errors, `${path}.${key}`, "INTEGER_REQUIRED", "必須為整數。");
  if (min !== null && (exclusiveMin ? value <= min : value < min)) addError(errors, `${path}.${key}`, "OUT_OF_RANGE", `必須${exclusiveMin ? "大於" : "大於或等於"}${min}。`);
}

function validateEngineeringInput(input) {
  const errors = [];
  if (!requireObject(input, "input", errors)) return errors;
  validateKeys(input, TOP_LEVEL_INPUT_KEYS, "input", errors);
  for (const key of ["processFamily", "material", "blank", "cutting", "bending", "welding", "surfaceTreatment", "setup"]) requireKey(input, key, "input", errors);

  if (input.processFamily !== undefined && !PROCESS_FAMILIES.includes(input.processFamily)) {
    addError(errors, "input.processFamily", "UNSUPPORTED_PROCESS_FAMILY", `目前只支援 ${PROCESS_FAMILIES.join(", ")}；未實作的保留製程：${RESERVED_PROCESS_FAMILIES.join(", ")}。`);
  }

  if (requireObject(input.material, "input.material", errors)) {
    validateKeys(input.material, MATERIAL_KEYS, "input.material", errors);
    requireKey(input.material, "materialFamily", "input.material", errors);
    requireKey(input.material, "thicknessMm", "input.material", errors);
    if (input.material.materialFamily !== undefined && !MATERIAL_FAMILIES.includes(input.material.materialFamily)) addError(errors, "input.material.materialFamily", "INVALID_ENUM", `必須為 ${MATERIAL_FAMILIES.join("、")} 之一。`);
    if (input.material.grade !== undefined && input.material.grade !== null && typeof input.material.grade !== "string") addError(errors, "input.material.grade", "STRING_OR_NULL_REQUIRED", "必須為字串或 null；不會自行推導牌號。");
    validateFinite(input.material, "thicknessMm", "input.material", errors, { min: 0, exclusiveMin: true });
    validateFinite(input.material, "densityKgM3", "input.material", errors, { min: 0, exclusiveMin: true });
    if (input.material.materialFamily === "OTHER" && (!Object.prototype.hasOwnProperty.call(input.material, "densityKgM3") || input.material.densityKgM3 === undefined)) addError(errors, "input.material.densityKgM3", "DENSITY_REQUIRED", "OTHER 必須明確提供 densityKgM3；不可猜測密度。");
  }

  if (requireObject(input.blank, "input.blank", errors)) {
    validateKeys(input.blank, BLANK_KEYS, "input.blank", errors);
    for (const key of ["lengthMm", "widthMm", "quantity"]) requireKey(input.blank, key, "input.blank", errors);
    validateFinite(input.blank, "lengthMm", "input.blank", errors, { min: 0, exclusiveMin: true });
    validateFinite(input.blank, "widthMm", "input.blank", errors, { min: 0, exclusiveMin: true });
    validateFinite(input.blank, "quantity", "input.blank", errors, { min: 0, exclusiveMin: true, integer: true });
  }

  const processObjects = [
    ["cutting", CUTTING_KEYS],
    ["bending", BENDING_KEYS],
    ["welding", WELDING_KEYS],
    ["surfaceTreatment", SURFACE_KEYS],
  ];
  for (const [section, allowed] of processObjects) {
    if (!requireObject(input[section], `input.${section}`, errors)) continue;
    validateKeys(input[section], allowed, `input.${section}`, errors);
    requireKey(input[section], "enabled", `input.${section}`, errors);
    if (input[section].enabled !== undefined && typeof input[section].enabled !== "boolean") addError(errors, `input.${section}.enabled`, "BOOLEAN_REQUIRED", "必須為布林值。");
  }
  if (requireObject(input.cutting, "input.cutting", errors)) {
    if (input.cutting.enabled === true) {
      requireKey(input.cutting, "cutLengthMmPerPart", "input.cutting", errors);
      requireKey(input.cutting, "pierceCountPerPart", "input.cutting", errors);
    }
    validateFinite(input.cutting, "cutLengthMmPerPart", "input.cutting", errors, { min: 0 });
    validateFinite(input.cutting, "pierceCountPerPart", "input.cutting", errors, { min: 0, integer: true });
  }
  if (requireObject(input.bending, "input.bending", errors)) {
    if (input.bending.enabled === true) requireKey(input.bending, "bendCountPerPart", "input.bending", errors);
    validateFinite(input.bending, "bendCountPerPart", "input.bending", errors, { min: 0, integer: true });
  }
  if (requireObject(input.welding, "input.welding", errors)) {
    if (input.welding.enabled === true) requireKey(input.welding, "weldLengthMmPerPart", "input.welding", errors);
    validateFinite(input.welding, "weldLengthMmPerPart", "input.welding", errors, { min: 0 });
  }
  if (requireObject(input.surfaceTreatment, "input.surfaceTreatment", errors)) {
    if (input.surfaceTreatment.treatmentType !== undefined && input.surfaceTreatment.treatmentType !== null && typeof input.surfaceTreatment.treatmentType !== "string") addError(errors, "input.surfaceTreatment.treatmentType", "STRING_OR_NULL_REQUIRED", "必須為字串或 null。");
    validateFinite(input.surfaceTreatment, "treatedAreaMm2PerPart", "input.surfaceTreatment", errors, { min: 0 });
    if (input.surfaceTreatment.enabled === true) requireKey(input.surfaceTreatment, "treatedAreaMm2PerPart", "input.surfaceTreatment", errors);
  }

  if (requireObject(input.setup, "input.setup", errors)) {
    validateKeys(input.setup, SETUP_KEYS, "input.setup", errors);
    requireKey(input.setup, "batchCount", "input.setup", errors);
    validateFinite(input.setup, "batchCount", "input.setup", errors, { min: 0, exclusiveMin: true, integer: true });
    if (finiteNumber(input.blank?.quantity) !== null && finiteNumber(input.setup.batchCount) !== null && input.setup.batchCount > input.blank.quantity) addError(errors, "input.setup.batchCount", "OUT_OF_RANGE", "batchCount 不可大於 quantity。");
  }

  const hasUtilization = Object.prototype.hasOwnProperty.call(input, "materialUtilizationPct") && input.materialUtilizationPct !== undefined;
  const hasScrap = Object.prototype.hasOwnProperty.call(input, "scrapPct") && input.scrapPct !== undefined;
  if (hasUtilization && hasScrap) addError(errors, "input", "MUTUALLY_EXCLUSIVE", "materialUtilizationPct 與 scrapPct 不可同時提供。");
  if (hasUtilization) validateFinite(input, "materialUtilizationPct", "input", errors, { min: 0, exclusiveMin: true });
  if (hasUtilization && finiteNumber(input.materialUtilizationPct) !== null && input.materialUtilizationPct > 100) addError(errors, "input.materialUtilizationPct", "OUT_OF_RANGE", "必須小於或等於 100。");
  if (hasScrap) validateFinite(input, "scrapPct", "input", errors, { min: 0 });
  if (hasScrap && finiteNumber(input.scrapPct) !== null && input.scrapPct >= 100) addError(errors, "input.scrapPct", "OUT_OF_RANGE", "必須小於 100；100% 損耗無法形成有效材料量。");

  if (input.rateProfile !== undefined) {
    if (!requireObject(input.rateProfile, "input.rateProfile", errors)) return errors;
    validateKeys(input.rateProfile, RATE_PROFILE_KEYS, "input.rateProfile", errors);
    requireKey(input.rateProfile, "mode", "input.rateProfile", errors);
    if (input.rateProfile.mode !== undefined && !RATE_MODES.includes(input.rateProfile.mode)) addError(errors, "input.rateProfile.mode", "UNSUPPORTED_RATE_MODE", `目前只允許 ${RATE_MODES.join("、")}；${RESERVED_RATE_MODES.join("、")} 僅保留未實作。`);
    if (input.rateProfile.mode === "SYNTHETIC_TEST") {
      for (const key of RATE_FIELDS) {
        requireKey(input.rateProfile, key, "input.rateProfile", errors);
        validateFinite(input.rateProfile, key, "input.rateProfile", errors, { min: 0 });
      }
    }
    if (input.rateProfile.mode === "NO_RATE") {
      for (const key of RATE_FIELDS) if (Object.prototype.hasOwnProperty.call(input.rateProfile, key) && input.rateProfile[key] !== undefined) addError(errors, `input.rateProfile.${key}`, "RATE_NOT_ALLOWED", "NO_RATE 不接受成本率；所有貨幣欄位保持 null。");
    }
  }
  return errors;
}

function getEngineeringEstimateSchema() {
  return {
    processFamily: { type: "enum", allowed: PROCESS_FAMILIES, required: true },
    material: {
      type: "object",
      required: true,
      fields: {
        materialFamily: { type: "enum", allowed: MATERIAL_FAMILIES, required: true },
        grade: { type: "string|null", required: false, note: "不會由系統推導牌號。" },
        thicknessMm: { type: "number", unit: "mm", required: true, constraint: "> 0" },
        densityKgM3: { type: "number", unit: "kg/m³", required: false, note: "缺省時僅使用已文件化的 ENGINEERING_DEFAULT。" },
      },
    },
    blank: { type: "object", required: true, fields: { lengthMm: { type: "number", unit: "mm", constraint: "> 0" }, widthMm: { type: "number", unit: "mm", constraint: "> 0" }, quantity: { type: "integer", unit: "parts", constraint: "> 0" } } },
    cutting: { type: "object", required: true, fields: { enabled: { type: "boolean" }, cutLengthMmPerPart: { type: "number", unit: "mm/part", constraint: ">= 0 when supplied" }, pierceCountPerPart: { type: "integer", unit: "each/part", constraint: ">= 0 when supplied" } } },
    bending: { type: "object", required: true, fields: { enabled: { type: "boolean" }, bendCountPerPart: { type: "integer", unit: "each/part", constraint: ">= 0 when supplied" } } },
    welding: { type: "object", required: true, fields: { enabled: { type: "boolean" }, weldLengthMmPerPart: { type: "number", unit: "mm/part", constraint: ">= 0 when supplied" } } },
    surfaceTreatment: { type: "object", required: true, fields: { enabled: { type: "boolean" }, treatmentType: { type: "string|null" }, treatedAreaMm2PerPart: { type: "number", unit: "mm²/part", constraint: ">= 0 when supplied" } } },
    setup: { type: "object", required: true, fields: { batchCount: { type: "integer", unit: "batches", constraint: "1 <= batchCount <= quantity" } } },
    materialUtilizationPct: { type: "number", unit: "%", required: false, note: "明確輸入時才調整材料量；不提供則只算理論毛坯重量。" },
    scrapPct: { type: "number", unit: "%", required: false, note: "與 materialUtilizationPct 互斥；不提供則不假設損耗。" },
    rateProfile: { type: "object", required: false, allowedModes: RATE_MODES, note: "預設 NO_RATE；SYNTHETIC_TEST 只供測試。" },
    output: {
      physicalUnits: ["mm", "mm²", "mm³", "m", "m²", "kg"],
      monetaryFieldsWithNoRate: null,
      marketAdjustmentFactor: null,
      disclaimer: ENGINEERING_DISCLAIMER,
    },
  };
}

module.exports = {
  PROCESS_FAMILIES,
  RESERVED_PROCESS_FAMILIES,
  MATERIAL_FAMILIES,
  RATE_MODES,
  RESERVED_RATE_MODES,
  RATE_FIELDS,
  ENGINEERING_DEFAULT_DENSITIES_KG_M3,
  ENGINEERING_DISCLAIMER,
  NO_RATE_SOURCE,
  SYNTHETIC_TEST_SOURCE,
  validateEngineeringInput,
  getEngineeringEstimateSchema,
  finiteNumber,
  isPlainObject,
};
