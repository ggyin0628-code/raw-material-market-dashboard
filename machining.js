const $ = (selector) => document.querySelector(selector);
const els = {
  refresh: $("#machiningRefreshButton"),
  status: $("#machiningStatus"),
  overall: $("#machiningOverall"),
  overallNote: $("#machiningOverallNote"),
  evidence: $("#machiningEvidence"),
  quality: $("#machiningQuality"),
  qualityNote: $("#machiningQualityNote"),
  date: $("#machiningDate"),
  trend: $("#machiningTrend"),
  grid: $("#pressureGrid"),
  explanations: $("#machiningExplanations"),
  provenance: $("#machiningProvenance"),
  publicPriceGrid: $("#machiningPublicPriceGrid"),
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}
function number(value, digits = 2) { return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--"; }
function direction(value) { return ({ FALLING: "下降", STABLE: "穩定", RISING: "上升" }[value] || "資料不足"); }
function level(value) { return value ? ({ LOW: "低", NORMAL: "正常", ELEVATED: "偏高", HIGH: "高" }[value] || value) : "資料不足"; }
function statusClass(value) { return String(value || "NO_DATA").toLowerCase().replace(/[^a-z_]/g, "_"); }
function sourceStatus(value) { return value === "LIVE" ? "LIVE" : value || "NO_DATA"; }
function change(value) { return typeof value === "number" && Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${number(value)}%` : "資料不足"; }
function date(value) { return value || "--"; }
function machineLabel(value) { return ({ CNC_3_AXIS_MILL: "CNC 三軸銑床", CNC_2_AXIS_LATHE: "CNC 二軸車床", CNC_5_AXIS_MILL: "CNC 五軸", CNC_TURN_MILL: "車銑複合", CNC_MILL_OR_LATHE: "CNC 加工（平台統計）" }[value] || value || "公開製程參考"); }
function materialLabel(value) { return ({ BLACK_STEEL: "黑鐵／碳鋼", STAINLESS_STEEL: "不鏽鋼", STAINLESS_OR_GALVANIZED: "不鏽鋼／鍍鋅（來源合併）", ALUMINUM: "鋁" }[value] || value || "一般材料"); }
const priceUi = window.publicProcessPriceUi;
function priceText(item) { return priceUi.priceText(item); }
function groupPriceReferences(items) {
  const groups = new Map();
  for (const item of items) {
    const key = [item.machineType, item.material, item.thickness, item.unit, item.pricingBasis].join("|");
    const current = groups.get(key);
    if (!current) groups.set(key, { ...item, sourceCount: 1, sources: [item] });
    else {
      current.sourceCount += 1;
      current.sources.push(item);
      if (item.priceMin != null) current.priceMin = current.priceMin == null ? item.priceMin : Math.min(current.priceMin, item.priceMin);
      if (item.priceMax != null) current.priceMax = current.priceMax == null ? item.priceMax : Math.max(current.priceMax, item.priceMax);
      if (item.smallHoleFeeMin != null) current.smallHoleFeeMin = current.smallHoleFeeMin == null ? item.smallHoleFeeMin : Math.min(current.smallHoleFeeMin, item.smallHoleFeeMin);
      if (item.smallHoleFeeMax != null) current.smallHoleFeeMax = current.smallHoleFeeMax == null ? item.smallHoleFeeMax : Math.max(current.smallHoleFeeMax, item.smallHoleFeeMax);
    }
  }
  return [...groups.values()];
}
function renderPublicPriceCard(item) {
  const noData = !priceUi.hasMonetaryData(item);
  const title = item.process === "CNC" ? machineLabel(item.machineType) : `${machineLabel(item.machineType)}｜${materialLabel(item.material)}${item.thickness ? `｜${item.thickness}` : ""}`;
  const sourceNames = (item.sources || [item]).map((source) => source.sourceName).join("、");
  const sourceLinks = (item.sources || [item]).filter((source) => source.sourceUrl).map((source) => `<a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noopener noreferrer">來源</a>`).join(" ");
  const hole = item.smallHoleFeeMin == null ? "" : `<small>${escapeHtml(priceUi.smallHoleText(item))}</small>`;
  const currencyEvidence = `<small>${escapeHtml(priceUi.currencyEvidenceText(item))}</small>`;
  return `<article class="public-price-card ${noData ? "no-data" : ""}"><h3>${escapeHtml(title)}</h3><strong class="price-value">${escapeHtml(priceText(item))}</strong><small>pricing basis：${escapeHtml(item.pricingBasis)}</small>${currencyEvidence}${hole}<div class="public-price-meta"><div><span>來源數</span><strong>${escapeHtml(item.sourceCount || 1)} 筆</strong></div><div><span>confidence</span><strong>${escapeHtml(item.confidence || "--")}</strong></div></div><small>checked ${escapeHtml(item.checkedAt || "--")}｜${escapeHtml(item.geographicScope || "--")}</small><small>${escapeHtml(sourceNames)} ${sourceLinks}</small><small>${escapeHtml(item.notes || "")}</small></article>`;
}
function renderPublicPrices(items = []) { const grouped = groupPriceReferences(items); return grouped.length ? grouped.map(renderPublicPriceCard).join("") : `<div class="machining-loading">目前沒有可列示的公開金額參考。</div>`; }
function renderComparisonWindows(component) {
  const windows = Array.isArray(component.comparisonWindows) ? component.comparisonWindows : [];
  if (!windows.length) return `<div><span>適頻率方向</span><strong>資料不足</strong></div>`;
  return windows.slice(0, 3).map((item) => `<div><span>近 ${escapeHtml(item.label || "適頻率窗口")}</span><strong>${escapeHtml(change(item.changePct))}<br>${escapeHtml(direction(item.direction))}</strong></div>`).join("");
}

function renderComponent(id, component) {
  const empty = component.pressureScore === null;
  return `<article class="pressure-card ${empty ? "empty" : ""}">
    <div class="pressure-head"><h2>${escapeHtml(component.label || id)}</h2><strong class="pressure-score">${empty ? "--" : number(component.pressureScore)}</strong></div>
    <span class="pressure-level ${statusClass(component.pressureLevel)}">${escapeHtml(level(component.pressureLevel))}｜${escapeHtml(sourceStatus(component.dataQuality))}</span>
    <p>${escapeHtml((component.explanation || ["沒有足夠的公開觀測。"])[0])}</p>
    <div class="pressure-meta">${renderComparisonWindows(component)}</div>
    <div class="pressure-meta"><div><span>公開證據</span><strong>${escapeHtml(component.evidenceCount)} 筆</strong></div><div><span>信心</span><strong>${escapeHtml(number((component.confidence || 0) * 100, 0))}%</strong></div></div>
  </article>`;
}

function renderProvenance(sources = []) {
  if (!sources.length) return `<div class="machining-loading">目前沒有可列示的來源。</div>`;
  return sources.map((source) => `<article class="provenance-item"><strong>${escapeHtml(source.sourceName)}</strong><small>${escapeHtml(source.geographicScope)}｜${escapeHtml(source.unit)}｜${escapeHtml(source.updateFrequency)}</small><small>最後觀測：${escapeHtml(date(source.lastObservationDate))}｜存取：${escapeHtml(source.accessConstraints)}</small><span class="source-status ${statusClass(source.status)}">${escapeHtml(sourceStatus(source.status))}</span><small>${source.url ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">公開來源頁</a>` : "無公開 URL"}</small><small>${escapeHtml(source.note || "")}</small></article>`).join("");
}

function render(payload) {
  const reference = payload.reference || {};
  els.publicPriceGrid.innerHTML = renderPublicPrices(payload.publicPriceReferences || reference.publicPriceReferences || []);
  const score = reference.compositePressureScore;
  els.overall.textContent = score === null || score === undefined ? "資料不足" : `${number(score)}｜${level(reference.pressureLevel)}`;
  els.overallNote.textContent = score === null || score === undefined ? "未達最低公開證據門檻；不產生綜合分數。" : `方向：${direction(reference.trend)}。此為公開市場推導，非供應商報價。`;
  const derived = reference.derivedMarketReference || {};
  els.evidence.textContent = `${derived.evidenceCount ?? 0}/${derived.minimumEvidence ?? "--"}`;
  els.quality.textContent = reference.dataQuality || "--";
  els.qualityNote.textContent = reference.dataQuality === "DATA_INSUFFICIENT" ? "證據不足；未產生綜合分數。" : "來源狀態已保留並可追溯。";
  els.date.textContent = date(reference.referenceDate);
  const compositeWindows = Array.isArray(derived.comparisonWindows) ? derived.comparisonWindows : [];
  els.trend.textContent = compositeWindows.length ? compositeWindows.slice(0, 3).map((item) => `近${item.label}：${direction(item.direction)}`).join("｜") : "適頻率方向：資料不足";
  const components = ["materialPressure", "energyPressure", "laborPressure", "fxPressure", "manufacturingPricePressure", "machineCapitalPressure"];
  els.grid.innerHTML = components.map((id) => renderComponent(id, reference[id] || { label: id, pressureScore: null, dataQuality: "NO_DATA", explanation: ["沒有資料"] })).join("");
  els.explanations.innerHTML = (reference.explanation || ["目前沒有可顯示的公開推導說明。"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  els.provenance.innerHTML = renderProvenance(payload.sourceCoverage || reference.sourceProvenance || []);
  els.status.textContent = `${payload.state || "NO_DATA"}｜產生時間 ${payload.generatedAt || "--"}｜只使用外部公開資料。`;
}

async function loadMachiningReference(force = false) {
  els.refresh.disabled = true;
  els.status.textContent = "正在讀取台灣優先公開來源…";
  try {
    const url = force ? "/api/machining/reference?force=true" : "/api/machining/reference";
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    render(payload);
  } catch (error) {
    els.overall.textContent = "API_ERROR";
    els.overallNote.textContent = "公開來源暫時無法取得；未補入任何假價格。";
    els.quality.textContent = "API_ERROR";
    els.status.textContent = `公開來源讀取失敗：${error.message}`;
    els.grid.innerHTML = `<div class="machining-loading">${escapeHtml(error.message)}</div>`;
    els.explanations.innerHTML = `<li>來源 API_ERROR；請稍後重試，並查看既有公開來源狀態。</li>`;
  } finally {
    els.refresh.disabled = false;
  }
}

els.refresh.addEventListener("click", () => loadMachiningReference(true));
loadMachiningReference();
