/* Phase 4F certified browser-local calculator core. Source is embedded into the standalone artifact and loaded by /estimate; it never performs I/O. */
"use strict";
      const DENSITIES_KG_M3 = Object.freeze({
        CARBON_STEEL: 7850,
        STAINLESS_STEEL: 8000,
        ALUMINUM: 2700,
        COPPER: 8960,
      });
      const MATERIAL_LABELS = Object.freeze({
        CARBON_STEEL: "碳鋼",
        STAINLESS_STEEL: "不鏽鋼",
        ALUMINUM: "鋁",
        COPPER: "銅",
        OTHER: "其他",
      });

      function round(value, decimals = 6) {
        if (!Number.isFinite(value)) return null;
        const factor = 10 ** decimals;
        return Number((value * factor).toFixed(0)) / factor;
      }

      function isFiniteNumber(value) {
        return typeof value === "number" && Number.isFinite(value);
      }

      function addError(errors, label, message) {
        errors.push({ label, message });
      }

      function checkNumber(errors, data, key, label, options = {}) {
        const value = data[key];
        const required = options.required === true;
        if (value === null || value === undefined || value === "") {
          if (required) addError(errors, label, "不可留白。");
          return false;
        }
        if (!isFiniteNumber(value)) {
          addError(errors, label, "必須是有限數字。");
          return false;
        }
        if (options.integer && !Number.isInteger(value)) addError(errors, label, "必須是整數。");
        if (options.min !== undefined && value < options.min) addError(errors, label, `必須大於或等於 ${options.min}。`);
        if (options.positive && value <= 0) addError(errors, label, "必須大於 0。");
        if (options.max !== undefined && value > options.max) addError(errors, label, `不可大於 ${options.max}。`);
        return true;
      }

      function validateCore(data) {
        const errors = [];
        if (!data || typeof data !== "object") return [{ label: "輸入", message: "必須提供工程輸入。" }];
        const invalidFields = data.invalidFields || {};
        Object.keys(invalidFields).forEach((label) => addError(errors, label, "必須是有限數字。"));
        if (!MATERIAL_LABELS[data.materialFamily]) addError(errors, "材質", "請選擇支援的材質。");
        checkNumber(errors, data, "thicknessMm", "厚度", { required: true, positive: true });
        checkNumber(errors, data, "lengthMm", "毛坯長度", { required: true, positive: true });
        checkNumber(errors, data, "widthMm", "毛坯寬度", { required: true, positive: true });
        checkNumber(errors, data, "quantity", "數量", { required: true, positive: true, integer: true });
        checkNumber(errors, data, "batchCount", "批次數", { required: true, positive: true, integer: true });
        if (isFiniteNumber(data.quantity) && isFiniteNumber(data.batchCount) && data.batchCount > data.quantity) addError(errors, "批次數", "不可大於數量。");
        if (data.materialFamily === "OTHER") checkNumber(errors, data, "densityKgM3", "其他材質密度", { required: true, positive: true });
        else if (data.densityKgM3 !== null && data.densityKgM3 !== undefined) checkNumber(errors, data, "densityKgM3", "密度", { positive: true });
        checkNumber(errors, data, "materialRatePerKg", "材料單價 / kg", { required: true, min: 0 });
        const hasUtilization = data.materialUtilizationPct !== null && data.materialUtilizationPct !== undefined;
        const hasScrap = data.scrapPct !== null && data.scrapPct !== undefined;
        if (hasUtilization && hasScrap) addError(errors, "材料利用率／損耗率", "不可同時提供。請只填一個。");
        if (hasUtilization) {
          checkNumber(errors, data, "materialUtilizationPct", "材料利用率", { min: 0, positive: true, max: 100 });
        }
        if (hasScrap) checkNumber(errors, data, "scrapPct", "材料損耗率", { min: 0, max: 99.999 });
        if (data.otherFixedCost !== null && data.otherFixedCost !== undefined) checkNumber(errors, data, "otherFixedCost", "其他固定成本", { min: 0 });
        return errors;
      }

      function validateComponent(data, component) {
        const errors = [];
        if (!data[`${component}Enabled`] && component !== "engineeringSetup") return errors;
        const rules = {
          cutting: [
            ["cutLengthMmPerPart", "單件切割長度", { required: true, min: 0 }],
            ["pierceCountPerPart", "單件穿孔數", { required: true, min: 0, integer: true }],
            ["cuttingSpeedMmPerMin", "切割速度", { required: true, positive: true }],
            ["pierceSecondsEach", "每次穿孔秒數", { required: true, min: 0 }],
            ["cuttingMachineRatePerMin", "切割機成本 / min", { required: true, min: 0 }],
            ["cuttingSetupRatePerMin", "切割準備成本 / min", { required: true, min: 0 }],
            ["cuttingSetupMinutesPerBatch", "切割每批準備時間", { required: true, min: 0 }],
          ],
          bending: [
            ["bendCountPerPart", "單件折彎次數", { required: true, min: 0, integer: true }],
            ["secondsPerBend", "每折秒數", { required: true, positive: true }],
            ["bendingMachineRatePerMin", "折彎機成本 / min", { required: true, min: 0 }],
            ["bendingSetupRatePerMin", "折彎準備成本 / min", { required: true, min: 0 }],
            ["bendingSetupMinutesPerBatch", "折彎每批準備時間", { required: true, min: 0 }],
          ],
          welding: [
            ["weldLengthMmPerPart", "單件焊接長度", { required: true, min: 0 }],
            ["weldingSpeedMmPerMin", "焊接速度", { required: true, positive: true }],
            ["weldingLaborRatePerMin", "焊接人工成本 / min", { required: true, min: 0 }],
            ["weldingEquipmentRatePerMin", "焊接設備成本 / min", { required: true, min: 0 }],
            ["weldingSetupMinutesPerBatch", "焊接每批準備時間", { required: true, min: 0 }],
          ],
          surfaceTreatment: [
            ["treatedAreaMm2PerPart", "單件處理面積", { required: true, min: 0 }],
            ["surfaceTreatmentRatePerM2", "表面處理成本 / m²", { required: true, min: 0 }],
          ],
          engineeringSetup: [
            ["engineeringSetupMinutesPerBatch", "工程準備時間 / batch", { required: true, min: 0 }],
            ["engineeringRatePerMin", "工程成本 / min", { required: true, min: 0 }],
          ],
        };
        (rules[component] || []).forEach(([key, label, options]) => checkNumber(errors, data, key, label, options));
        return errors;
      }

      function componentState(data, component) {
        const enabled = component === "engineeringSetup" ? Boolean(data.engineeringSetupEnabled) : Boolean(data[`${component}Enabled`]);
        if (!enabled) return { state: "DISABLED", errors: [] };
        const errors = validateComponent(data, component);
        const hasInvalidValue = errors.some((error) => !error.message.includes("不可留白"));
        return { state: errors.length ? (hasInvalidValue ? "INVALID" : "MISSING") : "READY", errors };
      }

      function densityFor(data) {
        if (isFiniteNumber(data.densityKgM3)) return { value: data.densityKgM3, source: "USER_INPUT" };
        if (data.materialFamily !== "OTHER" && DENSITIES_KG_M3[data.materialFamily]) return { value: DENSITIES_KG_M3[data.materialFamily], source: "ENGINEERING_DEFAULT" };
        return { value: null, source: "MISSING" };
      }

      function calculate(data) {
        const coreErrors = validateCore(data);
        if (coreErrors.length) {
          const error = new Error("工程輸入驗證失敗。");
          error.name = "CalculatorValidationError";
          error.errors = coreErrors;
          throw error;
        }
        const density = densityFor(data);
        if (!isFiniteNumber(density.value)) {
          const error = new Error("工程輸入驗證失敗。");
          error.name = "CalculatorValidationError";
          error.errors = [{ label: "密度", message: "無法取得有效密度。" }];
          throw error;
        }

        const quantity = data.quantity;
        const batchCount = data.batchCount;
        const blankAreaMm2 = data.lengthMm * data.widthMm;
        const blankVolumeMm3 = blankAreaMm2 * data.thicknessMm;
        const blankMassKgPerPart = blankVolumeMm3 * density.value / 1000000000;
        const theoreticalTotalBlankMassKg = blankMassKgPerPart * quantity;
        let utilization = 1;
        let utilizationLabel = "未提供利用率／損耗率；不假設隱藏效率";
        if (data.materialUtilizationPct !== null && data.materialUtilizationPct !== undefined) {
          utilization = data.materialUtilizationPct / 100;
          utilizationLabel = `${data.materialUtilizationPct}% 利用率`;
        } else if (data.scrapPct !== null && data.scrapPct !== undefined) {
          utilization = 1 - data.scrapPct / 100;
          utilizationLabel = `${data.scrapPct}% 損耗率`;
        }
        const totalMaterialMassKg = theoreticalTotalBlankMassKg / utilization;

        const cuttingStatus = componentState(data, "cutting");
        const bendingStatus = componentState(data, "bending");
        const weldingStatus = componentState(data, "welding");
        const surfaceStatus = componentState(data, "surfaceTreatment");
        const setupStatus = componentState(data, "engineeringSetup");
        const componentStatuses = [cuttingStatus, bendingStatus, weldingStatus, surfaceStatus, setupStatus];
        const componentErrors = componentStatuses.flatMap((status) => status.errors || []);
        if (componentStatuses.some((status) => status.state === "INVALID")) {
          const error = new Error("製程輸入驗證失敗。");
          error.name = "CalculatorValidationError";
          error.errors = componentErrors;
          throw error;
        }

        const cutting = (() => {
          const totalLengthMm = data.cuttingEnabled ? data.cutLengthMmPerPart * quantity : 0;
          const totalCutLengthM = totalLengthMm / 1000;
          const totalPierceCount = data.cuttingEnabled ? data.pierceCountPerPart * quantity : 0;
          if (cuttingStatus.state !== "READY") return { ...cuttingStatus, totalCutLengthM: round(totalCutLengthM), totalPierceCount: round(totalPierceCount, 3), runMinutes: null, pierceMinutes: null, setupMinutes: null, totalMinutes: null, runCost: null, pierceCost: null, setupCost: null, totalCost: null };
          const runMinutes = totalLengthMm / data.cuttingSpeedMmPerMin;
          const pierceMinutes = totalPierceCount * data.pierceSecondsEach / 60;
          const setupMinutes = data.cuttingSetupMinutesPerBatch * batchCount;
          const runCost = runMinutes * data.cuttingMachineRatePerMin;
          const pierceCost = pierceMinutes * data.cuttingMachineRatePerMin;
          const setupCost = setupMinutes * data.cuttingSetupRatePerMin;
          return { ...cuttingStatus, totalCutLengthM: round(totalCutLengthM), totalPierceCount: round(totalPierceCount, 3), runMinutes: round(runMinutes), pierceMinutes: round(pierceMinutes), setupMinutes: round(setupMinutes), totalMinutes: round(runMinutes + pierceMinutes + setupMinutes), runCost: round(runCost), pierceCost: round(pierceCost), setupCost: round(setupCost), totalCost: round(runCost + pierceCost + setupCost) };
        })();

        const bending = (() => {
          const totalBendCount = data.bendingEnabled ? data.bendCountPerPart * quantity : 0;
          if (bendingStatus.state !== "READY") return { ...bendingStatus, totalBendCount: round(totalBendCount, 3), runMinutes: null, setupMinutes: null, totalMinutes: null, runCost: null, setupCost: null, totalCost: null };
          const runMinutes = totalBendCount * data.secondsPerBend / 60;
          const setupMinutes = data.bendingSetupMinutesPerBatch * batchCount;
          const runCost = runMinutes * data.bendingMachineRatePerMin;
          const setupCost = setupMinutes * data.bendingSetupRatePerMin;
          return { ...bendingStatus, totalBendCount: round(totalBendCount, 3), runMinutes: round(runMinutes), setupMinutes: round(setupMinutes), totalMinutes: round(runMinutes + setupMinutes), runCost: round(runCost), setupCost: round(setupCost), totalCost: round(runCost + setupCost) };
        })();

        const welding = (() => {
          const totalWeldLengthM = data.weldingEnabled ? data.weldLengthMmPerPart * quantity / 1000 : 0;
          if (weldingStatus.state !== "READY") return { ...weldingStatus, totalWeldLengthM: round(totalWeldLengthM), runMinutes: null, setupMinutes: null, totalMinutes: null, laborCost: null, equipmentCost: null, setupCost: null, totalCost: null };
          const runMinutes = data.weldLengthMmPerPart * quantity / data.weldingSpeedMmPerMin;
          const setupMinutes = data.weldingSetupMinutesPerBatch * batchCount;
          const laborCost = runMinutes * data.weldingLaborRatePerMin;
          const equipmentCost = runMinutes * data.weldingEquipmentRatePerMin;
          const setupCost = setupMinutes * (data.weldingLaborRatePerMin + data.weldingEquipmentRatePerMin);
          return { ...weldingStatus, totalWeldLengthM: round(totalWeldLengthM), runMinutes: round(runMinutes), setupMinutes: round(setupMinutes), totalMinutes: round(runMinutes + setupMinutes), laborCost: round(laborCost), equipmentCost: round(equipmentCost), setupCost: round(setupCost), totalCost: round(laborCost + equipmentCost + setupCost) };
        })();

        const surfaceTreatment = (() => {
          const totalTreatedAreaM2 = data.surfaceTreatmentEnabled ? data.treatedAreaMm2PerPart * quantity / 1000000 : 0;
          if (surfaceStatus.state !== "READY") return { ...surfaceStatus, totalTreatedAreaM2: round(totalTreatedAreaM2), totalCost: null };
          return { ...surfaceStatus, totalTreatedAreaM2: round(totalTreatedAreaM2), totalCost: round(totalTreatedAreaM2 * data.surfaceTreatmentRatePerM2) };
        })();

        const engineeringSetup = (() => {
          if (setupStatus.state !== "READY") return { ...setupStatus, setupMinutes: null, totalCost: null };
          const setupMinutes = data.engineeringSetupMinutesPerBatch * batchCount;
          return { ...setupStatus, setupMinutes: round(setupMinutes), totalCost: round(setupMinutes * data.engineeringRatePerMin) };
        })();

        const materialCost = round(totalMaterialMassKg * data.materialRatePerKg);
        const totalSetupMinutes = [cutting, bending, welding, engineeringSetup].every((item) => item.state !== "MISSING")
          ? round((cutting.setupMinutes || 0) + (bending.setupMinutes || 0) + (welding.setupMinutes || 0) + (engineeringSetup.setupMinutes || 0))
          : null;
        const totalProcessMinutes = [cutting, bending, welding, engineeringSetup].every((item) => item.state !== "MISSING")
          ? round((cutting.runMinutes || 0) + (cutting.pierceMinutes || 0) + (bending.runMinutes || 0) + (welding.runMinutes || 0) + (totalSetupMinutes || 0))
          : null;
        const costReady = [cutting, bending, welding, surfaceTreatment, engineeringSetup].every((item) => item.state !== "MISSING");
        const totalCost = costReady ? round(materialCost + (cutting.totalCost || 0) + (bending.totalCost || 0) + (welding.totalCost || 0) + (surfaceTreatment.totalCost || 0) + (engineeringSetup.totalCost || 0) + (data.otherFixedCost || 0)) : null;
        return {
          physical: {
            blankAreaMm2: round(blankAreaMm2),
            blankVolumeMm3: round(blankVolumeMm3),
            blankMassKgPerPart: round(blankMassKgPerPart),
            theoreticalTotalBlankMassKg: round(theoreticalTotalBlankMassKg),
            totalMaterialMassKg: round(totalMaterialMassKg),
            densityKgM3: round(density.value),
            densitySource: density.source,
            utilizationLabel,
            quantity,
            batchCount,
            quantityPerBatch: round(quantity / batchCount),
          },
          workload: {
            totalCutLengthM: cutting.totalCutLengthM,
            totalPierceCount: cutting.totalPierceCount,
            totalBendCount: bending.totalBendCount,
            totalWeldLengthM: welding.totalWeldLengthM,
            totalTreatedAreaM2: surfaceTreatment.totalTreatedAreaM2,
          },
          components: { cutting, bending, welding, surfaceTreatment, engineeringSetup },
          costs: {
            materialCost,
            cuttingRunCost: cutting.runCost,
            piercingCost: cutting.pierceCost,
            cuttingSetupCost: cutting.setupCost,
            bendingRunCost: bending.runCost,
            bendingSetupCost: bending.setupCost,
            weldingLaborCost: welding.laborCost,
            weldingEquipmentCost: welding.equipmentCost,
            weldingSetupCost: welding.setupCost,
            surfaceTreatmentCost: surfaceTreatment.totalCost,
            engineeringSetupCost: engineeringSetup.totalCost,
            otherFixedCost: data.otherFixedCost || 0,
            totalCost,
            costPerPart: totalCost === null ? null : round(totalCost / quantity),
            costStatus: costReady ? "READY" : "MISSING",
          },
          time: {
            cuttingRunMinutes: cutting.runMinutes,
            pierceMinutes: cutting.pierceMinutes,
            bendingRunMinutes: bending.runMinutes,
            weldingRunMinutes: welding.runMinutes,
            totalSetupMinutes,
            totalProcessMinutes,
            timeStatus: totalProcessMinutes === null ? "資料不足" : "READY",
          },
          formulaTrace: buildFormulaTrace(data, { density, physical: { blankAreaMm2, blankVolumeMm3, blankMassKgPerPart, theoreticalTotalBlankMassKg, totalMaterialMassKg }, cutting, bending, welding, surfaceTreatment, engineeringSetup, totalSetupMinutes, totalProcessMinutes, materialCost, totalCost }),
        };
      }

      function buildFormulaTrace(data, values) {
        const p = values.physical;
        return [
          ["單件理論重量", "長度 × 寬度 × 厚度 × 密度 ÷ 1,000,000,000", `${data.lengthMm} × ${data.widthMm} × ${data.thicknessMm} × ${values.density.value} ÷ 1,000,000,000 = ${round(p.blankMassKgPerPart)} kg/件`],
          ["總理論重量", "單件理論重量 × 數量", `${round(p.blankMassKgPerPart)} × ${data.quantity} = ${round(p.theoreticalTotalBlankMassKg)} kg`],
          ["材料重量", "總理論重量 ÷ 利用率", `${round(p.theoreticalTotalBlankMassKg)} ÷ ${data.materialUtilizationPct !== null && data.materialUtilizationPct !== undefined ? data.materialUtilizationPct / 100 : data.scrapPct !== null && data.scrapPct !== undefined ? 1 - data.scrapPct / 100 : 1} = ${round(p.totalMaterialMassKg)} kg`],
          ["切割時間", "總切割長度 ÷ 切割速度", values.cutting.runMinutes === null ? "資料不足：未提供完整切割時間條件" : `${data.cutLengthMmPerPart} × ${data.quantity} ÷ ${data.cuttingSpeedMmPerMin} = ${values.cutting.runMinutes} min`],
          ["穿孔時間", "總穿孔數 × 每次穿孔秒數 ÷ 60", values.cutting.pierceMinutes === null ? "資料不足：未提供完整穿孔時間條件" : `${values.cutting.totalPierceCount} × ${data.pierceSecondsEach} ÷ 60 = ${values.cutting.pierceMinutes} min`],
          ["折彎時間", "總折彎次數 × 每折秒數 ÷ 60", values.bending.runMinutes === null ? "資料不足：未提供完整折彎時間條件" : `${values.bending.totalBendCount} × ${data.secondsPerBend} ÷ 60 = ${values.bending.runMinutes} min`],
          ["焊接時間", "總焊接長度 ÷ 焊接速度", values.welding.runMinutes === null ? "資料不足：未提供完整焊接時間條件" : `${data.weldLengthMmPerPart} × ${data.quantity} ÷ ${data.weldingSpeedMmPerMin} = ${values.welding.runMinutes} min`],
          ["表面處理面積", "單件面積 × 數量 ÷ 1,000,000", `${data.treatedAreaMm2PerPart || 0} × ${data.quantity} ÷ 1,000,000 = ${values.surfaceTreatment.totalTreatedAreaM2} m²`],
          ["setup 時間", "各製程每批準備時間 × 批次數後加總", values.totalSetupMinutes === null ? "資料不足：至少一個啟用製程缺少 setup 條件" : `切割＋折彎＋焊接＋工程準備 = ${values.totalSetupMinutes} min`],
          ["總內部工程成本", "材料＋切割運轉＋穿孔＋切割準備＋折彎＋焊接＋表面處理＋工程準備＋其他固定成本", values.totalCost === null ? "資料不足：至少一個啟用成本元件缺少必要 rate/time" : `所有明確成本元件加總 = ${values.totalCost}`],
          ["單件內部工程成本", "總內部工程成本 ÷ 數量", values.totalCost === null ? "資料不足" : `${values.totalCost} ÷ ${data.quantity} = ${round(values.totalCost / data.quantity)}`],
        ];
      }

      const Calculator = Object.freeze({ DENSITIES_KG_M3, MATERIAL_LABELS, round, validateCore, validateComponent, calculate });
if (typeof module !== "undefined" && module.exports) module.exports = Calculator;
if (typeof window !== "undefined") window.InternalEngineeringCostCalculator = Calculator;
