const form = document.getElementById("privateEstimateForm");
const resultRoot = document.getElementById("privateResult");
const statusRoot = document.getElementById("privateStatus");
const errorRoot = document.getElementById("privateError");

function byId(id) { return document.getElementById(id); }
function numberValue(id) {
  const raw = byId(id).value.trim();
  return raw === "" ? undefined : Number(raw);
}
function textValue(id) {
  const raw = byId(id).value.trim();
  return raw === "" ? null : raw;
}
function valueOrNull(id) {
  const value = numberValue(id);
  return value === undefined || Number.isNaN(value) ? undefined : value;
}
function formatNumber(value, digits = 6) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: digits });
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function buildInput() {
  return {
    processFamily: "SHEET_METAL",
    material: { materialFamily: byId("materialFamily").value, grade: textValue("grade"), thicknessMm: valueOrNull("thicknessMm"), densityKgM3: valueOrNull("densityKgM3") },
    blank: { lengthMm: valueOrNull("lengthMm"), widthMm: valueOrNull("widthMm"), quantity: valueOrNull("quantity") },
    cutting: { enabled: byId("cuttingEnabled").checked, cutLengthMmPerPart: valueOrNull("cutLengthMmPerPart"), pierceCountPerPart: valueOrNull("pierceCountPerPart") },
    bending: { enabled: byId("bendingEnabled").checked, bendCountPerPart: valueOrNull("bendCountPerPart") },
    welding: { enabled: byId("weldingEnabled").checked, weldLengthMmPerPart: valueOrNull("weldLengthMmPerPart") },
    surfaceTreatment: { enabled: byId("surfaceTreatmentEnabled").checked, treatmentType: textValue("treatmentType"), treatedAreaMm2PerPart: valueOrNull("treatedAreaMm2PerPart") },
    setup: { batchCount: valueOrNull("batchCount") },
    materialUtilizationPct: valueOrNull("materialUtilizationPct"),
    scrapPct: valueOrNull("scrapPct"),
  };
}
function metric(label, value, unit, note = "") {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatNumber(value))}</strong><small>${escapeHtml(unit)}${note ? `｜${escapeHtml(note)}` : ""}</small></div>`;
}
function safeText(value) { return value === null || value === undefined || value === "" ? "—" : escapeHtml(value); }
function metadataItem(label, value) { return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${safeText(value)}</strong></div>`; }
function renderProcessTime(time) {
  const entries = [
    ["切割 setup", time.cutting.setupMinutes, "min"], ["切割 run", time.cutting.runMinutes, "min"], ["穿孔", time.cutting.pierceMinutes, "min"],
    ["折彎 setup", time.bending.setupMinutes, "min"], ["折彎 run", time.bending.runMinutes, "min"],
    ["焊接 setup", time.welding.setupMinutes, "min"], ["焊接 run", time.welding.runMinutes, "min"],
    ["總 setup", time.overall.totalSetupMinutes, "min"], ["總 run", time.overall.totalRunMinutes, "min"], ["總製程時間", time.overall.totalProcessMinutes, "min"],
  ];
  return `<div class="metrics">${entries.map(([label, value, unit]) => metric(label, value, unit)).join("")}</div><div class="safe">${escapeHtml((time.warnings || []).join(" "))}</div>`;
}
function renderCosts(costs, currency) {
  const entries = [
    ["材料成本", costs.materialCost], ["切割 setup 成本", costs.cuttingSetupCost], ["切割 run 成本", costs.cuttingRunCost], ["穿孔成本", costs.piercingCost],
    ["折彎 setup 成本", costs.bendingSetupCost], ["折彎 run 成本", costs.bendingRunCost], ["焊接 setup 成本", costs.weldingSetupCost], ["焊接 run 成本", costs.weldingRunCost],
    ["表面處理成本", costs.surfaceTreatmentCost], ["工程 setup 成本", costs.engineeringSetupCost], ["總內部工程成本", costs.totalEstimatedCost], ["每件內部工程成本", costs.estimatedCostPerPart],
  ];
  return `<div class="cost-grid">${entries.map(([label, value]) => `<div class="cost"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatNumber(value))} ${escapeHtml(currency || "")}</strong></div>`).join("")}</div>`;
}
function renderResult(payload) {
  const estimate = payload.estimate;
  const physical = estimate.physical;
  const workload = estimate.workload;
  const time = estimate.processTimeEstimate;
  const profile = estimate.rateProfile;
  const trace = (estimate.formulaTrace || []).map((item) => `<li><strong>${escapeHtml(item.field)}｜${safeText(item.result)} ${safeText(item.unit)}</strong><code>${escapeHtml(item.formula)}\n輸入：${escapeHtml(JSON.stringify(item.inputs))}\n單位轉換：${escapeHtml(item.unitConversion)}</code></li>`).join("");
  const warnings = (estimate.warnings || []).map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`).join("");
  resultRoot.innerHTML = `
    <div class="summary">
      ${metric("單件重量", physical.blankMassKgPerPart, "kg")}
      ${metric("總材料重量", physical.totalMaterialMassKg, "kg")}
      ${metric("總製程時間", time.overall.totalProcessMinutes, "min")}
    </div>
    <section class="section"><h3>工程量</h3><div class="metrics">
      ${metric("總切割長度", workload.totalCutLengthM, "m")}${metric("總穿孔", workload.totalPierceCount, "次")}${metric("總折彎", workload.totalBendCount, "次")}${metric("總焊接長度", workload.totalWeldLengthM, "m")}${metric("處理面積", workload.totalTreatedAreaM2, "m²")}${metric("每批數量", workload.quantityPerBatch, "件／批")}
    </div></section>
    <section class="section"><h3>製程時間</h3>${renderProcessTime(time)}</section>
    <section class="section"><h3>內部工程成本</h3>${renderCosts(estimate.costBreakdown, profile.currency)}</section>
    <section class="section"><h3>Profile metadata</h3><div class="meta">
      ${metadataItem("模式", profile.mode)}${metadataItem("來源", profile.source)}${metadataItem("Profile ID", profile.rateProfileId)}${metadataItem("版本", profile.version)}${metadataItem("生效日", profile.effectiveFrom)}${metadataItem("幣別", profile.currency)}
    </div></section>
    <section class="section"><h3>安全警示</h3>${warnings}</section>
    <section class="section"><details><summary><strong>查看公式與計算依據（raw rate 已遮罩）</strong></summary><ol class="trace">${trace}</ol></details></section>
    <p class="footer">${escapeHtml(estimate.disclaimer)} marketAdjustmentFactor=${safeText(estimate.marketAdjustmentFactor)}。</p>`;
}
function showError(payload) {
  const errors = (payload.errors || []).map((error) => `${error.path}｜${error.code}｜${error.message}`);
  errorRoot.innerHTML = `<strong>請求未完成：</strong><br>${errors.map(escapeHtml).join("<br>")}`;
  errorRoot.classList.remove("hidden");
  statusRoot.textContent = "未產生內部工程成本估算。";
}
function clearError() { errorRoot.textContent = ""; errorRoot.classList.add("hidden"); }
async function submitEstimate(event) {
  event.preventDefault();
  clearError();
  statusRoot.textContent = "正在使用 local private profile 計算…";
  try {
    const response = await fetch("/api/private/estimate", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(buildInput()) });
    const payload = await response.json();
    if (!response.ok || payload.state !== "OK") { showError(payload); return; }
    renderResult(payload);
    statusRoot.textContent = `已完成 ${payload.estimate.processFamily} 內部工程成本估算；profile ${payload.estimate.rateProfile.version}。`;
  } catch {
    errorRoot.textContent = "local private runtime 暫時無法使用。";
    errorRoot.classList.remove("hidden");
    statusRoot.textContent = "估算失敗。";
  }
}
function resetEstimate() {
  clearError();
  resultRoot.innerHTML = `<div class="safe"><strong>尚未計算</strong><br>請先輸入工程條件並按下「計算內部工程成本」。</div>`;
  statusRoot.textContent = "已清除結果；請輸入明確工程條件。";
}
function updateEnabledFields() {
  const groups = [["cuttingEnabled", ["cutLengthMmPerPart", "pierceCountPerPart"]], ["bendingEnabled", ["bendCountPerPart"]], ["weldingEnabled", ["weldLengthMmPerPart"]], ["surfaceTreatmentEnabled", ["treatmentType", "treatedAreaMm2PerPart"]]];
  for (const [toggle, ids] of groups) for (const id of ids) byId(id).disabled = !byId(toggle).checked;
}
form.addEventListener("submit", submitEstimate);
byId("privateReset").addEventListener("click", resetEstimate);
for (const id of ["cuttingEnabled", "bendingEnabled", "weldingEnabled", "surfaceTreatmentEnabled"]) byId(id).addEventListener("change", updateEnabledFields);
updateEnabledFields();
