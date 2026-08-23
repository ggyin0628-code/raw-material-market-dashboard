const form = document.getElementById("estimateForm");
const resultRoot = document.getElementById("estimateResult");
const statusRoot = document.getElementById("estimateStatus");
const errorRoot = document.getElementById("estimateError");

function byId(id) { return document.getElementById(id); }
function numberValue(id) {
  const raw = byId(id).value.trim();
  return raw === "" ? undefined : Number(raw);
}
function textValue(id) {
  const raw = byId(id).value.trim();
  return raw === "" ? null : raw;
}
function formatNumber(value, digits = 6) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: digits });
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function valueOrNull(id) {
  const value = numberValue(id);
  return value === undefined || Number.isNaN(value) ? undefined : value;
}
function buildInput() {
  return {
    processFamily: "SHEET_METAL",
    material: {
      materialFamily: byId("materialFamily").value,
      grade: textValue("grade"),
      thicknessMm: valueOrNull("thicknessMm"),
      densityKgM3: valueOrNull("densityKgM3"),
    },
    blank: {
      lengthMm: valueOrNull("lengthMm"),
      widthMm: valueOrNull("widthMm"),
      quantity: valueOrNull("quantity"),
    },
    cutting: {
      enabled: byId("cuttingEnabled").checked,
      cutLengthMmPerPart: valueOrNull("cutLengthMmPerPart"),
      pierceCountPerPart: valueOrNull("pierceCountPerPart"),
    },
    bending: {
      enabled: byId("bendingEnabled").checked,
      bendCountPerPart: valueOrNull("bendCountPerPart"),
    },
    welding: {
      enabled: byId("weldingEnabled").checked,
      weldLengthMmPerPart: valueOrNull("weldLengthMmPerPart"),
    },
    surfaceTreatment: {
      enabled: byId("surfaceTreatmentEnabled").checked,
      treatmentType: textValue("treatmentType"),
      treatedAreaMm2PerPart: valueOrNull("treatedAreaMm2PerPart"),
    },
    setup: { batchCount: valueOrNull("batchCount") },
    materialUtilizationPct: valueOrNull("materialUtilizationPct"),
    scrapPct: valueOrNull("scrapPct"),
  };
}
function renderMetric(label, value, unit, note = "") {
  return `<div class="estimate-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatNumber(value))}</strong><small>${escapeHtml(unit)}${note ? `｜${escapeHtml(note)}` : ""}</small></div>`;
}
function renderCost(cost, rateProfile) {
  if (rateProfile.mode === "NO_RATE") return `<div class="estimate-cost"><strong>尚未設定成本參數</strong>目前為 NO_RATE；所有貨幣欄位保持 null，不呈現任何假價格或公司成本。</div>`;
  return `<div class="estimate-cost"><strong>SYNTHETIC / DEMO / TEST ONLY</strong>此模式只供 deterministic tests；成本不是市場價格、公司成本或供應商報價。總額：${escapeHtml(formatNumber(cost.totalEstimatedCost))}</div>`;
}
function renderProcessTime(processTime) {
  if (!processTime || processTime.state !== "CALCULATED") return `<div class="estimate-cost"><strong>尚未載入製程時間校正參數</strong>目前不猜測切割速度、每折秒數、焊接速度、setup 或操作效率；製程時間欄位保持 null。</div>`;
  return `<div class="estimate-metric-grid">
    ${renderMetric("總 setup 時間", processTime.overall.totalSetupMinutes, "min")}
    ${renderMetric("總 run 時間", processTime.overall.totalRunMinutes, "min")}
    ${renderMetric("總製程時間", processTime.overall.totalProcessMinutes, "min")}
  </div>`;
}
function renderResult(payload) {
  const estimate = payload.estimate;
  const physical = estimate.physical;
  const workload = estimate.workload;
  const costs = estimate.costBreakdown;
  const trace = estimate.formulaTrace.map((item) => `<li><strong>${escapeHtml(item.field)}｜${escapeHtml(item.result)} ${escapeHtml(item.unit)}</strong><code>${escapeHtml(item.formula)}\n輸入：${escapeHtml(JSON.stringify(item.inputs))}\n單位轉換：${escapeHtml(item.unitConversion)}</code></li>`).join("");
  const warnings = estimate.warnings.length ? `<ul class="estimate-warning-list">${estimate.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : "<p>沒有額外警示。</p>";
  resultRoot.innerHTML = `
    <div class="estimate-summary">
      <div class="estimate-stat"><span>單件重量</span><strong>${escapeHtml(formatNumber(physical.blankMassKgPerPart))} kg</strong><small>理論毛坯重量</small></div>
      <div class="estimate-stat"><span>總材料重量</span><strong>${escapeHtml(formatNumber(physical.totalMaterialMassKg))} kg</strong><small>未填利用率時不假設損耗</small></div>
      <div class="estimate-stat estimate-market"><span>估算模式</span><strong>${escapeHtml(estimate.rateProfile.mode)}</strong><small>${escapeHtml(estimate.rateProfile.source)}</small></div>
    </div>
    <section class="estimate-result-section"><h3>物理計算</h3><div class="estimate-metric-grid">
      ${renderMetric("毛坯面積", physical.blankAreaMm2, "mm²")}
      ${renderMetric("毛坯體積", physical.blankVolumeMm3, "mm³")}
      ${renderMetric("密度", physical.densityKgM3, "kg/m³", physical.densitySource)}
      ${renderMetric("數量", physical.quantity, "件")}
      ${renderMetric("理論總毛坯重量", physical.theoreticalTotalBlankMassKg, "kg")}
      ${renderMetric("材料利用率", physical.materialUtilizationPct ?? (physical.scrapPct === null ? null : 100 - physical.scrapPct), "%", physical.materialUtilizationPct !== null ? "明確輸入" : physical.scrapPct !== null ? `由損耗率 ${physical.scrapPct}% 換算` : "未提供")}
      ${renderMetric("材料損耗率", physical.scrapPct, "%", physical.scrapPct === null ? "未提供" : "明確輸入")}
    </div></section>
    <section class="estimate-result-section"><h3>製造工作量</h3><div class="estimate-metric-grid">
      ${renderMetric("總切割長度", workload.totalCutLengthM, "m")}
      ${renderMetric("總穿孔", workload.totalPierceCount, "次")}
      ${renderMetric("總折彎", workload.totalBendCount, "次")}
      ${renderMetric("總焊接長度", workload.totalWeldLengthM, "m")}
      ${renderMetric("總表處面積", workload.totalTreatedAreaM2, "m²")}
      ${renderMetric("批次數", workload.batchCount, "批")}
      ${renderMetric("每批數量", workload.quantityPerBatch, "件／批")}
    </div></section>
    <section class="estimate-result-section"><h3>製程時間</h3>${renderProcessTime(estimate.processTimeEstimate)}</section>
    <section class="estimate-result-section"><h3>成本估算</h3>${renderCost(costs, estimate.rateProfile)}</section>
    <section class="estimate-result-section"><h3>警示與資料邊界</h3>${warnings}</section>
    <section class="estimate-result-section"><details><summary><strong>查看公式與計算依據</strong></summary><ol class="estimate-trace-list">${trace}</ol></details></section>
    <p class="estimate-footer-note">${escapeHtml(estimate.disclaimer)} 市場參考不會被轉成 marketAdjustmentFactor；目前為 ${escapeHtml(String(estimate.marketAdjustmentFactor))}。</p>`;
}
function showValidationError(payload) {
  const errors = (payload.errors || []).map((error) => `${error.path}｜${error.code}｜${error.message}`);
  errorRoot.innerHTML = `<strong>輸入需要修正：</strong><br>${errors.map(escapeHtml).join("<br>")}`;
  errorRoot.classList.remove("hidden");
  statusRoot.textContent = "未產生估算結果；請依結構化錯誤修正輸入。";
}
function clearError() { errorRoot.textContent = ""; errorRoot.classList.add("hidden"); }
async function submitEstimate(event) {
  event.preventDefault();
  clearError();
  statusRoot.textContent = "正在計算明確工程量…";
  try {
    const response = await fetch("/api/engineering/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildInput()) });
    const payload = await response.json();
    if (!response.ok || payload.state !== "OK") { showValidationError(payload); return; }
    renderResult(payload);
    statusRoot.textContent = `已完成 ${payload.estimate.processFamily} 工程量計算；成本模式 ${payload.estimate.rateProfile.mode}。`;
  } catch (error) {
    errorRoot.textContent = "估算服務暫時無法使用，請稍後再試。";
    errorRoot.classList.remove("hidden");
    statusRoot.textContent = "估算失敗。";
  }
}
function resetEstimate() {
  clearError();
  resultRoot.innerHTML = `<div class="estimate-cost"><strong>尚未計算</strong>請先輸入工程條件並按下「計算工程量」。</div>`;
  statusRoot.textContent = "已清除結果；請輸入明確工程條件。";
}
function updateEnabledFields() {
  const groups = [
    ["cuttingEnabled", ["cutLengthMmPerPart", "pierceCountPerPart"]],
    ["bendingEnabled", ["bendCountPerPart"]],
    ["weldingEnabled", ["weldLengthMmPerPart"]],
    ["surfaceTreatmentEnabled", ["treatmentType", "treatedAreaMm2PerPart"]],
  ];
  for (const [toggle, ids] of groups) for (const id of ids) byId(id).disabled = !byId(toggle).checked;
}
form.addEventListener("submit", submitEstimate);
byId("estimateReset").addEventListener("click", resetEstimate);
for (const id of ["cuttingEnabled", "bendingEnabled", "weldingEnabled", "surfaceTreatmentEnabled"]) byId(id).addEventListener("change", updateEnabledFields);
updateEnabledFields();
