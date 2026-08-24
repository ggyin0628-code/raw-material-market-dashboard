const PILOT_ENV = "PRIVATE_CALIBRATION_PILOT_PATH";
const HISTORY_ENV = "PRIVATE_CALIBRATION_HISTORY_PATH";
const QUALITY_THRESHOLDS_ENV = "PRIVATE_CALIBRATION_QUALITY_THRESHOLDS_JSON";
const PILOT_SCOPE = "SINGLE_CONTROLLED_PILOT";
const OBSERVED_TIME = "OBSERVED_TIME";
const RATE_BASED = "RATE_BASED";
const OBSERVATION_MODES = Object.freeze([OBSERVED_TIME, RATE_BASED]);
const HISTORICAL_REFERENCE_TYPES = Object.freeze(["KNOWN_COMPONENT_REFERENCE", "TOTAL_ONLY_REFERENCE", "NO_HISTORICAL_REFERENCE"]);
const COMPONENT_KEYS = Object.freeze(["material", "cutting", "piercing", "bending", "welding", "surfaceTreatment", "setup"]);
const DEFAULT_SYNTHETIC_QUALITY_THRESHOLDS = Object.freeze({
  closeMatchMaxAbsPct: 5,
  moderateMatchMaxAbsPct: 20,
  source: "SYNTHETIC_DEFAULT_ONLY",
});

const TOP_LEVEL_KEYS = new Set([
  "pilotScope",
  "part",
  "material",
  "cutting",
  "bending",
  "welding",
  "surfaceTreatment",
  "engineeringSetup",
  "historicalReference",
]);
const PART_KEYS = new Set(["pilotId", "materialFamily", "grade", "thicknessMm", "blankLengthMm", "blankWidthMm", "quantity", "batchCount"]);
const MATERIAL_KEYS = new Set(["densityKgM3", "actualInternalMaterialRatePerKg"]);
const CUTTING_KEYS = new Set(["cutLengthMmPerPart", "pierceCountPerPart", "observedCuttingSpeedMmPerMin", "observedRunMinutes", "observedPierceSecondsEach", "observedSetupMinutesPerBatch", "internalMachineRatePerMinute", "internalSetupRatePerMinute", "authoritativeObservation"]);
const BENDING_KEYS = new Set(["bendCountPerPart", "observedSecondsPerBend", "observedRunMinutes", "observedSetupMinutesPerBatch", "internalMachineRatePerMinute", "internalSetupRatePerMinute", "authoritativeObservation"]);
const WELDING_KEYS = new Set(["weldLengthMmPerPart", "observedWeldingSpeedMmPerMin", "observedRunMinutes", "observedSetupMinutesPerBatch", "internalLaborRatePerMinute", "internalMachineRatePerMinute", "authoritativeObservation"]);
const SURFACE_KEYS = new Set(["treatedAreaMm2PerPart", "internalRatePerM2"]);
const ENGINEERING_SETUP_KEYS = new Set(["observedSetupMinutesPerBatch", "internalRatePerMinute"]);
const HISTORICAL_KEYS = new Set(["actualHistoricalTotalInternalCost", "actualHistoricalInternalCostPerPart", "componentCosts"]);
const COMPONENT_SET = new Set(COMPONENT_KEYS);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addError(errors, path, code, message) {
  errors.push({ path, code, message });
}

function validateKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value || {})) {
    if (!allowed.has(key)) addError(errors, `${path}.${key}`, "UNEXPECTED_FIELD", "不支援的 pilot 欄位。");
  }
}

function requireObject(value, path, errors) {
  if (!isPlainObject(value)) {
    addError(errors, path, "OBJECT_REQUIRED", "必須為物件。");
    return false;
  }
  return true;
}

function requireKey(value, key, path, errors) {
  if (!Object.prototype.hasOwnProperty.call(value || {}, key)) addError(errors, `${path}.${key}`, "REQUIRED_FIELD", "必填欄位缺失。");
}

function validateText(value, path, errors, { allowNull = false, required = false } = {}) {
  if (value === undefined && !required) return;
  if (allowNull && value === null) return;
  if (typeof value !== "string" || value.trim() === "") addError(errors, path, "STRING_REQUIRED", "必須為非空字串。");
}

function validateNullableNumber(value, path, errors, { min = 0, exclusiveMin = false, required = false } = {}) {
  if (value === undefined) {
    if (required) addError(errors, path, "REQUIRED_FIELD", "必填欄位缺失。");
    return;
  }
  if (value === null) return;
  const number = finiteNumber(value);
  if (number === null) {
    addError(errors, path, "NUMBER_OR_NULL_REQUIRED", "必須為有限數字或 null。");
    return;
  }
  if (exclusiveMin ? number <= min : number < min) addError(errors, path, "OUT_OF_RANGE", `必須${exclusiveMin ? "大於" : "大於或等於"}${min}。`);
}

function validateSection(value, allowed, path, errors) {
  if (!requireObject(value, path, errors)) return false;
  validateKeys(value, allowed, path, errors);
  return true;
}

function validateObservationPrecedence(value, path, firstKey, secondKey, errors) {
  const first = value[firstKey];
  const second = value[secondKey];
  if (first !== null && first !== undefined && second !== null && second !== undefined) {
    if (!OBSERVATION_MODES.includes(value.authoritativeObservation)) {
      addError(errors, `${path}.authoritativeObservation`, "OBSERVATION_PRECEDENCE_REQUIRED", `同時提供 ${firstKey} 與 ${secondKey} 時，必須明確標記 ${OBSERVED_TIME} 或 ${RATE_BASED}。`);
    }
  } else if (value.authoritativeObservation !== undefined && value.authoritativeObservation !== null && !OBSERVATION_MODES.includes(value.authoritativeObservation)) {
    addError(errors, `${path}.authoritativeObservation`, "INVALID_OBSERVATION_MODE", `必須為 ${OBSERVED_TIME} 或 ${RATE_BASED}。`);
  }
}

function validatePrivateCalibrationPilot(pilot) {
  const errors = [];
  if (!requireObject(pilot, "pilot", errors)) return errors;
  validateKeys(pilot, TOP_LEVEL_KEYS, "pilot", errors);
  for (const key of ["part", "material", "cutting", "bending", "welding", "surfaceTreatment", "engineeringSetup", "historicalReference"]) requireKey(pilot, key, "pilot", errors);
  if (pilot.pilotScope !== undefined && pilot.pilotScope !== PILOT_SCOPE) addError(errors, "pilot.pilotScope", "INVALID_PILOT_SCOPE", `pilotScope 必須為 ${PILOT_SCOPE}。`);

  if (validateSection(pilot.part, PART_KEYS, "pilot.part", errors)) {
    for (const key of ["pilotId", "materialFamily", "thicknessMm", "blankLengthMm", "blankWidthMm", "quantity", "batchCount"]) requireKey(pilot.part, key, "pilot.part", errors);
    validateText(pilot.part.pilotId, "pilot.part.pilotId", errors, { required: true });
    if (pilot.part.materialFamily !== undefined && !["CARBON_STEEL", "STAINLESS_STEEL", "ALUMINUM", "COPPER", "OTHER"].includes(pilot.part.materialFamily)) addError(errors, "pilot.part.materialFamily", "INVALID_ENUM", "不支援的 materialFamily。");
    validateText(pilot.part.grade, "pilot.part.grade", errors, { allowNull: true });
    validateNullableNumber(pilot.part.thicknessMm, "pilot.part.thicknessMm", errors, { min: 0, exclusiveMin: true, required: true });
    validateNullableNumber(pilot.part.blankLengthMm, "pilot.part.blankLengthMm", errors, { min: 0, exclusiveMin: true, required: true });
    validateNullableNumber(pilot.part.blankWidthMm, "pilot.part.blankWidthMm", errors, { min: 0, exclusiveMin: true, required: true });
    validateNullableNumber(pilot.part.quantity, "pilot.part.quantity", errors, { min: 0, exclusiveMin: true, required: true });
    validateNullableNumber(pilot.part.batchCount, "pilot.part.batchCount", errors, { min: 0, exclusiveMin: true, required: true });
    if (finiteNumber(pilot.part.quantity) !== null && finiteNumber(pilot.part.batchCount) !== null && pilot.part.batchCount > pilot.part.quantity) addError(errors, "pilot.part.batchCount", "OUT_OF_RANGE", "batchCount 不可大於 quantity。");
    if (pilot.part.quantity !== undefined && pilot.part.quantity !== null && !Number.isInteger(pilot.part.quantity)) addError(errors, "pilot.part.quantity", "INTEGER_REQUIRED", "quantity 必須為整數。");
    if (pilot.part.batchCount !== undefined && pilot.part.batchCount !== null && !Number.isInteger(pilot.part.batchCount)) addError(errors, "pilot.part.batchCount", "INTEGER_REQUIRED", "batchCount 必須為整數。");
  }

  if (validateSection(pilot.material, MATERIAL_KEYS, "pilot.material", errors)) {
    validateNullableNumber(pilot.material.densityKgM3, "pilot.material.densityKgM3", errors, { min: 0, exclusiveMin: true });
    validateNullableNumber(pilot.material.actualInternalMaterialRatePerKg, "pilot.material.actualInternalMaterialRatePerKg", errors);
  }

  if (validateSection(pilot.cutting, CUTTING_KEYS, "pilot.cutting", errors)) {
    for (const key of ["cutLengthMmPerPart", "pierceCountPerPart"]) requireKey(pilot.cutting, key, "pilot.cutting", errors);
    validateNullableNumber(pilot.cutting.cutLengthMmPerPart, "pilot.cutting.cutLengthMmPerPart", errors, { min: 0, required: true });
    validateNullableNumber(pilot.cutting.pierceCountPerPart, "pilot.cutting.pierceCountPerPart", errors, { min: 0, required: true });
    validateNullableNumber(pilot.cutting.observedCuttingSpeedMmPerMin, "pilot.cutting.observedCuttingSpeedMmPerMin", errors, { min: 0, exclusiveMin: true });
    validateNullableNumber(pilot.cutting.observedRunMinutes, "pilot.cutting.observedRunMinutes", errors, { min: 0 });
    validateNullableNumber(pilot.cutting.observedPierceSecondsEach, "pilot.cutting.observedPierceSecondsEach", errors, { min: 0 });
    validateNullableNumber(pilot.cutting.observedSetupMinutesPerBatch, "pilot.cutting.observedSetupMinutesPerBatch", errors, { min: 0 });
    validateNullableNumber(pilot.cutting.internalMachineRatePerMinute, "pilot.cutting.internalMachineRatePerMinute", errors, { min: 0 });
    validateNullableNumber(pilot.cutting.internalSetupRatePerMinute, "pilot.cutting.internalSetupRatePerMinute", errors, { min: 0 });
    validateObservationPrecedence(pilot.cutting, "pilot.cutting", "observedCuttingSpeedMmPerMin", "observedRunMinutes", errors);
    if (pilot.cutting.pierceCountPerPart !== undefined && pilot.cutting.pierceCountPerPart !== null && !Number.isInteger(pilot.cutting.pierceCountPerPart)) addError(errors, "pilot.cutting.pierceCountPerPart", "INTEGER_REQUIRED", "pierceCountPerPart 必須為整數。");
  }

  if (validateSection(pilot.bending, BENDING_KEYS, "pilot.bending", errors)) {
    requireKey(pilot.bending, "bendCountPerPart", "pilot.bending", errors);
    validateNullableNumber(pilot.bending.bendCountPerPart, "pilot.bending.bendCountPerPart", errors, { min: 0, required: true });
    validateNullableNumber(pilot.bending.observedSecondsPerBend, "pilot.bending.observedSecondsPerBend", errors, { min: 0, exclusiveMin: true });
    validateNullableNumber(pilot.bending.observedRunMinutes, "pilot.bending.observedRunMinutes", errors, { min: 0 });
    validateNullableNumber(pilot.bending.observedSetupMinutesPerBatch, "pilot.bending.observedSetupMinutesPerBatch", errors, { min: 0 });
    validateNullableNumber(pilot.bending.internalMachineRatePerMinute, "pilot.bending.internalMachineRatePerMinute", errors, { min: 0 });
    validateNullableNumber(pilot.bending.internalSetupRatePerMinute, "pilot.bending.internalSetupRatePerMinute", errors, { min: 0 });
    validateObservationPrecedence(pilot.bending, "pilot.bending", "observedSecondsPerBend", "observedRunMinutes", errors);
    if (pilot.bending.bendCountPerPart !== undefined && pilot.bending.bendCountPerPart !== null && !Number.isInteger(pilot.bending.bendCountPerPart)) addError(errors, "pilot.bending.bendCountPerPart", "INTEGER_REQUIRED", "bendCountPerPart 必須為整數。");
  }

  if (validateSection(pilot.welding, WELDING_KEYS, "pilot.welding", errors)) {
    requireKey(pilot.welding, "weldLengthMmPerPart", "pilot.welding", errors);
    validateNullableNumber(pilot.welding.weldLengthMmPerPart, "pilot.welding.weldLengthMmPerPart", errors, { min: 0, required: true });
    validateNullableNumber(pilot.welding.observedWeldingSpeedMmPerMin, "pilot.welding.observedWeldingSpeedMmPerMin", errors, { min: 0, exclusiveMin: true });
    validateNullableNumber(pilot.welding.observedRunMinutes, "pilot.welding.observedRunMinutes", errors, { min: 0 });
    validateNullableNumber(pilot.welding.observedSetupMinutesPerBatch, "pilot.welding.observedSetupMinutesPerBatch", errors, { min: 0 });
    validateNullableNumber(pilot.welding.internalLaborRatePerMinute, "pilot.welding.internalLaborRatePerMinute", errors, { min: 0 });
    validateNullableNumber(pilot.welding.internalMachineRatePerMinute, "pilot.welding.internalMachineRatePerMinute", errors, { min: 0 });
    validateObservationPrecedence(pilot.welding, "pilot.welding", "observedWeldingSpeedMmPerMin", "observedRunMinutes", errors);
  }

  if (validateSection(pilot.surfaceTreatment, SURFACE_KEYS, "pilot.surfaceTreatment", errors)) {
    requireKey(pilot.surfaceTreatment, "treatedAreaMm2PerPart", "pilot.surfaceTreatment", errors);
    validateNullableNumber(pilot.surfaceTreatment.treatedAreaMm2PerPart, "pilot.surfaceTreatment.treatedAreaMm2PerPart", errors, { min: 0, required: true });
    validateNullableNumber(pilot.surfaceTreatment.internalRatePerM2, "pilot.surfaceTreatment.internalRatePerM2", errors, { min: 0 });
  }

  if (validateSection(pilot.engineeringSetup, ENGINEERING_SETUP_KEYS, "pilot.engineeringSetup", errors)) {
    validateNullableNumber(pilot.engineeringSetup.observedSetupMinutesPerBatch, "pilot.engineeringSetup.observedSetupMinutesPerBatch", errors, { min: 0 });
    validateNullableNumber(pilot.engineeringSetup.internalRatePerMinute, "pilot.engineeringSetup.internalRatePerMinute", errors, { min: 0 });
  }

  if (validateSection(pilot.historicalReference, HISTORICAL_KEYS, "pilot.historicalReference", errors)) {
    const totalPresent = pilot.historicalReference.actualHistoricalTotalInternalCost !== undefined && pilot.historicalReference.actualHistoricalTotalInternalCost !== null;
    const perPartPresent = pilot.historicalReference.actualHistoricalInternalCostPerPart !== undefined && pilot.historicalReference.actualHistoricalInternalCostPerPart !== null;
    validateNullableNumber(pilot.historicalReference.actualHistoricalTotalInternalCost, "pilot.historicalReference.actualHistoricalTotalInternalCost", errors, { min: 0 });
    validateNullableNumber(pilot.historicalReference.actualHistoricalInternalCostPerPart, "pilot.historicalReference.actualHistoricalInternalCostPerPart", errors, { min: 0 });
    if (totalPresent && perPartPresent) addError(errors, "pilot.historicalReference", "HISTORICAL_REFERENCE_AMBIGUOUS", "actualHistoricalTotalInternalCost 與 actualHistoricalInternalCostPerPart 不可同時提供。");
    if (pilot.historicalReference.componentCosts !== undefined && pilot.historicalReference.componentCosts !== null) {
      if (requireObject(pilot.historicalReference.componentCosts, "pilot.historicalReference.componentCosts", errors)) {
        validateKeys(pilot.historicalReference.componentCosts, COMPONENT_SET, "pilot.historicalReference.componentCosts", errors);
        for (const key of COMPONENT_KEYS) validateNullableNumber(pilot.historicalReference.componentCosts[key], `pilot.historicalReference.componentCosts.${key}`, errors, { min: 0 });
      }
    }
  }
  return errors;
}

function historicalReferenceType(historicalReference) {
  const hasComponent = isPlainObject(historicalReference?.componentCosts) && COMPONENT_KEYS.some((key) => finiteNumber(historicalReference.componentCosts[key]) !== null);
  const hasTotal = finiteNumber(historicalReference?.actualHistoricalTotalInternalCost) !== null || finiteNumber(historicalReference?.actualHistoricalInternalCostPerPart) !== null;
  if (hasComponent) return "KNOWN_COMPONENT_REFERENCE";
  if (hasTotal) return "TOTAL_ONLY_REFERENCE";
  return "NO_HISTORICAL_REFERENCE";
}

function pilotToEngineeringInput(pilot) {
  const part = pilot.part;
  const cutting = pilot.cutting;
  const bending = pilot.bending;
  const welding = pilot.welding;
  const surfaceTreatment = pilot.surfaceTreatment;
  return {
    processFamily: "SHEET_METAL",
    material: {
      materialFamily: part.materialFamily,
      grade: part.grade ?? null,
      thicknessMm: part.thicknessMm,
      ...(finiteNumber(pilot.material?.densityKgM3) !== null ? { densityKgM3: pilot.material.densityKgM3 } : {}),
    },
    blank: { lengthMm: part.blankLengthMm, widthMm: part.blankWidthMm, quantity: part.quantity },
    cutting: { enabled: cutting.cutLengthMmPerPart > 0 || cutting.pierceCountPerPart > 0, cutLengthMmPerPart: cutting.cutLengthMmPerPart, pierceCountPerPart: cutting.pierceCountPerPart },
    bending: { enabled: bending.bendCountPerPart > 0, bendCountPerPart: bending.bendCountPerPart },
    welding: { enabled: welding.weldLengthMmPerPart > 0, weldLengthMmPerPart: welding.weldLengthMmPerPart },
    surfaceTreatment: { enabled: surfaceTreatment.treatedAreaMm2PerPart > 0, treatmentType: null, treatedAreaMm2PerPart: surfaceTreatment.treatedAreaMm2PerPart },
    setup: { batchCount: part.batchCount },
  };
}

function safePilotMetadata(pilot) {
  return {
    pilotId: pilot?.part?.pilotId || null,
    pilotScope: pilot?.pilotScope || PILOT_SCOPE,
    historicalReferenceType: historicalReferenceType(pilot?.historicalReference),
    privateSource: "REPOSITORY_EXTERNAL_LOCAL_ONLY",
  };
}

function getCalibrationPilotSchema() {
  return {
    internalOnly: true,
    publicExposure: "NEVER",
    pilotScope: PILOT_SCOPE,
    source: "repository-external local private file only",
    historicalReferenceTypes: HISTORICAL_REFERENCE_TYPES,
    observationModes: OBSERVATION_MODES,
    rawFields: "NEVER_RETURNED_TO_PUBLIC_API_OR_AUDIT",
    automaticProfileWriteBack: "DENY",
  };
}

module.exports = {
  PILOT_ENV,
  HISTORY_ENV,
  QUALITY_THRESHOLDS_ENV,
  PILOT_SCOPE,
  OBSERVED_TIME,
  RATE_BASED,
  OBSERVATION_MODES,
  HISTORICAL_REFERENCE_TYPES,
  COMPONENT_KEYS,
  DEFAULT_SYNTHETIC_QUALITY_THRESHOLDS,
  validatePrivateCalibrationPilot,
  historicalReferenceType,
  pilotToEngineeringInput,
  safePilotMetadata,
  getCalibrationPilotSchema,
  isPlainObject,
  finiteNumber,
};
