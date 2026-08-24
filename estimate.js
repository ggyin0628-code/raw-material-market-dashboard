const calculator = window.InternalEngineeringCostCalculator;
const form = document.getElementById("estimateForm");
const resultRoot = document.getElementById("resultContent");
const emptyResult = document.getElementById("emptyResult");
const validationSummary = document.getElementById("validationSummary");
const statusMessage = document.getElementById("statusMessage");
const densityHint = document.getElementById("densityHint");

const NUMERIC_IDS = [
  "densityKgM3", "thicknessMm", "lengthMm", "widthMm", "quantity", "batchCount", "materialRatePerKg", "materialUtilizationPct", "scrapPct",
  "cutLengthMmPerPart", "pierceCountPerPart", "cuttingSpeedMmPerMin", "pierceSecondsEach", "cuttingMachineRatePerMin", "cuttingSetupRatePerMin", "cuttingSetupMinutesPerBatch",
  "bendCountPerPart", "secondsPerBend", "bendingMachineRatePerMin", "bendingSetupRatePerMin", "bendingSetupMinutesPerBatch",
  "weldLengthMmPerPart", "weldingSpeedMmPerMin", "weldingLaborRatePerMin", "weldingEquipmentRatePerMin", "weldingSetupMinutesPerBatch",
  "treatedAreaMm2PerPart", "surfaceTreatmentRatePerM2", "engineeringSetupMinutesPerBatch", "engineeringRatePerMin", "otherFixedCost",
];
const PROCESS_NAMES = ["cutting", "bending", "welding", "surfaceTreatment", "engineeringSetup"];

function byId(id) { return document.getElementById(id); }
function textValue(id) { const value = byId(id).value.trim(); return value === "" ? null : value; }
function numberValue(id, invalidFields) {
  const raw = byId(id).value.trim();
  if (raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) invalidFields[id] = true;
  return Number.isFinite(value) ? value : null;
}
function readInput() {
  const invalidFields = {};
  const values = {};
  NUMERIC_IDS.forEach((id) => { values[id] = numberValue(id, invalidFields); });
  return {
    ...values,
    materialFamily: byId("materialFamily").value,
    grade: textValue("grade"),
    cuttingEnabled: byId("cuttingEnabled").checked,
    bendingEnabled: byId("bendingEnabled").checked,
    weldingEnabled: byId("weldingEnabled").checked,
    surfaceTreatmentEnabled: byId("surfaceTreatmentEnabled").checked,
    engineeringSetupEnabled: byId("engineeringSetupEnabled").checked,
    invalidFields,
  };
}
function formatValue(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "資料不足";
  return new Intl.NumberFormat("zh-Hant", { maximumFractionDigits: 6 }).format(Number(value));
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}
function setOutput(key, value, raw = false) {
  document.querySelectorAll(`[data-output="${key}"]`).forEach((node) => { node.textContent = raw ? String(value) : formatValue(value); });
}
function componentLabel(key) {
  return { cutting: "雷射切割／切割", bending: "折彎", welding: "焊接", surfaceTreatment: "表面處理", engineeringSetup: "工程／其他準備" }[key] || key;
}
function stateText(state) {
  return state === "READY" ? "已完成" : state === "DISABLED" ? "未啟用" : state === "INVALID" ? "資料錯誤" : "資料不足";
}
function showValidation(errors) {
  if (!errors.length) {
    validationSummary.classList.add("hidden");
    validationSummary.innerHTML = "";
    return;
  }
  validationSummary.classList.remove("hidden");
  validationSummary.innerHTML = `<strong>請先修正輸入：</strong><ul>${errors.map((error) => `<li>${escapeHtml(error.label)}：${escapeHtml(error.message)}</li>`).join("")}</ul>`;
}
function renderBreakdown(result) {
  const c = result.costs;
  const rows = [
    ["材料成本", c.materialCost],
    ["切割運轉成本", c.cuttingRunCost],
    ["穿孔成本", c.piercingCost],
    ["切割準備成本", c.cuttingSetupCost],
    ["折彎運轉成本", c.bendingRunCost],
    ["折彎準備成本", c.bendingSetupCost],
    ["焊接人工成本", c.weldingLaborCost],
    ["焊接設備成本", c.weldingEquipmentCost],
    ["焊接準備成本", c.weldingSetupCost],
    ["表面處理成本", c.surfaceTreatmentCost],
    ["setup／engineering 成本", c.engineeringSetupCost],
    ["其他固定成本（獨立）", c.otherFixedCost],
    ["總額", c.totalCost],
  ];
  byId("costBreakdown").innerHTML = rows.map(([label, value]) => `<div class="estimate-breakdown-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(formatValue(value))}</span></div>`).join("");
}
function renderComponents(result) {
  const entries = [
    ["cutting", result.components.cutting, `運轉 ${formatValue(result.components.cutting.runMinutes)} min；穿孔 ${formatValue(result.components.cutting.pierceMinutes)} min；setup ${formatValue(result.components.cutting.setupMinutes)} min`, result.components.cutting.totalCost],
    ["bending", result.components.bending, `運轉 ${formatValue(result.components.bending.runMinutes)} min；setup ${formatValue(result.components.bending.setupMinutes)} min`, result.components.bending.totalCost],
    ["welding", result.components.welding, `運轉 ${formatValue(result.components.welding.runMinutes)} min；setup ${formatValue(result.components.welding.setupMinutes)} min`, result.components.welding.totalCost],
    ["surfaceTreatment", result.components.surfaceTreatment, `總面積 ${formatValue(result.components.surfaceTreatment.totalTreatedAreaM2)} m²；不猜測製程時間`, result.components.surfaceTreatment.totalCost],
    ["engineeringSetup", result.components.engineeringSetup, `setup ${formatValue(result.components.engineeringSetup.setupMinutes)} min`, result.components.engineeringSetup.totalCost],
  ];
  byId("componentResults").innerHTML = entries.map(([key, item, detail, cost]) => {
    const stateClass = item.state === "MISSING" ? "missing" : item.state === "INVALID" ? "invalid" : item.state === "DISABLED" ? "disabled" : "";
    const errors = item.errors?.length ? `<div class="detail">${item.errors.map((error) => `${escapeHtml(error.label)}：${escapeHtml(error.message)}`).join("；")}</div>` : "";
    return `<article class="estimate-component"><h4>${escapeHtml(componentLabel(key))}</h4><span class="state ${stateClass}">${escapeHtml(stateText(item.state))}</span><div class="detail">${escapeHtml(detail)}</div>${errors}<div class="cost"><span>成本</span><span>${escapeHtml(formatValue(cost))}</span></div></article>`;
  }).join("");
}
function renderFormulas(result) {
  byId("formulaList").innerHTML = result.formulaTrace.map(([label, formula, detail]) => `<li><strong>${escapeHtml(label)}</strong><code>${escapeHtml(formula)}<br>${escapeHtml(detail)}</code></li>`).join("");
}
function renderResult(result) {
  emptyResult.classList.add("hidden");
  resultRoot.classList.remove("hidden");
  setOutput("blankMassKgPerPart", result.physical.blankMassKgPerPart);
  setOutput("totalMaterialMassKg", result.physical.totalMaterialMassKg);
  setOutput("totalCutLengthM", result.workload.totalCutLengthM);
  setOutput("totalPierceCount", result.workload.totalPierceCount);
  setOutput("totalBendCount", result.workload.totalBendCount);
  setOutput("totalWeldLengthM", result.workload.totalWeldLengthM);
  setOutput("totalTreatedAreaM2", result.workload.totalTreatedAreaM2);
  setOutput("quantityPerBatch", result.physical.quantityPerBatch);
  setOutput("cuttingRunMinutes", result.time.cuttingRunMinutes);
  setOutput("pierceMinutes", result.time.pierceMinutes);
  setOutput("bendingRunMinutes", result.time.bendingRunMinutes);
  setOutput("weldingRunMinutes", result.time.weldingRunMinutes);
  setOutput("totalSetupMinutes", result.time.totalSetupMinutes);
  setOutput("totalProcessMinutes", result.time.totalProcessMinutes);
  setOutput("timeStatus", result.time.timeStatus, true);
  setOutput("totalCost", result.costs.totalCost);
  setOutput("costPerPart", result.costs.costPerPart);
  setOutput("costStatus", result.costs.costStatus === "READY" ? "READY" : "資料不足", true);
  renderBreakdown(result);
  renderComponents(result);
  renderFormulas(result);
}
function clearResult(message = "尚未計算。填入明確資料後開始。") {
  emptyResult.classList.remove("hidden");
  resultRoot.classList.add("hidden");
  document.querySelectorAll("[data-output]").forEach((node) => { node.textContent = "資料不足"; });
  ["costBreakdown", "componentResults", "formulaList"].forEach((id) => { byId(id).textContent = ""; });
  validationSummary.classList.add("hidden");
  validationSummary.innerHTML = "";
  statusMessage.className = "estimate-status";
  statusMessage.textContent = message;
}
function updateDensity() {
  const family = byId("materialFamily").value;
  const standard = calculator.DENSITIES_KG_M3[family];
  densityHint.textContent = standard ? `工程預設值 ${standard} kg/m³；可直接覆寫。` : "其他材質必須明確提供密度；工具不猜測。";
}
function updateProcessState() {
  PROCESS_NAMES.forEach((name) => {
    const toggleId = name === "surfaceTreatment" ? "surfaceTreatmentEnabled" : name === "engineeringSetup" ? "engineeringSetupEnabled" : `${name}Enabled`;
    const toggle = byId(toggleId);
    const container = document.querySelector(`[data-process-fields="${name}"]`);
    const card = document.querySelector(`[data-process="${name}"]`);
    if (!toggle || !container || !card) return;
    container.classList.toggle("is-disabled", !toggle.checked);
    container.querySelectorAll("input, select, textarea").forEach((field) => { field.disabled = !toggle.checked; });
    card.classList.toggle("is-disabled", !toggle.checked);
  });
}
function resetEstimate() {
  form.reset();
  updateDensity();
  updateProcessState();
  clearResult();
}
function handleSubmit(event) {
  event.preventDefault();
  showValidation([]);
  statusMessage.className = "estimate-status";
  statusMessage.textContent = "正在於目前瀏覽器頁面計算…";
  try {
    const result = calculator.calculate(readInput());
    renderResult(result);
    statusMessage.className = "estimate-status ok";
    statusMessage.textContent = result.costs.costStatus === "READY" ? "計算完成。結果只存在目前頁面。" : "工程量已完成；部分啟用元件資料不足，成本總額暫不計算。";
  } catch (error) {
    clearResult("輸入格式不正確，尚未產生估算。");
    showValidation(error.errors || [{ label: "輸入", message: "請檢查欄位。" }]);
    statusMessage.className = "estimate-status error";
    statusMessage.textContent = "輸入格式不正確，尚未產生估算。";
  }
}

form.addEventListener("submit", handleSubmit);
byId("clearButton").addEventListener("click", resetEstimate);
byId("printButton").addEventListener("click", () => window.print());
byId("materialFamily").addEventListener("change", () => {
  const standard = calculator.DENSITIES_KG_M3[byId("materialFamily").value];
  byId("densityKgM3").value = standard || "";
  updateDensity();
});
PROCESS_NAMES.forEach((name) => {
  const toggleId = name === "surfaceTreatment" ? "surfaceTreatmentEnabled" : name === "engineeringSetup" ? "engineeringSetupEnabled" : `${name}Enabled`;
  byId(toggleId).addEventListener("change", updateProcessState);
});
window.addEventListener("pageshow", resetEstimate);
updateDensity();
updateProcessState();
clearResult();
