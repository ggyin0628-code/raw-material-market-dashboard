const fs = require("node:fs/promises");
const path = require("node:path");
const ExcelJS = require("exceljs");
const { PUBLIC_MARKET_DISCLAIMER } = require("../marketData/dataContract");
const { materials } = require("../marketData/materials");
const { buildWeeklyAnalytics, finite, freshRecords, recordsForMaterial } = require("./weeklyAnalytics");
const { listSnapshots } = require("./snapshotStore");
const { previousCompletedWeek, parseReportingWeek } = require("./weekUtils");
const { DEFAULT_REPORT_DIR, getStorageConfig } = require("./storageConfig");
const { recordReportMetadata, writeFileAtomic } = require("./storageService");
const { evaluateWeeklyQuality } = require("./qualityGate");

const REPORT_VERSION = 1;
const TIMEZONE = "Asia/Taipei";
const PURCHASING_REFERENCE_NOTE = "本報告只提供公開市場趨勢與採購參考；非採購指示，也不是供應商報價、公司目標價、保證議價價或台灣現貨價。";

const COLORS = Object.freeze({
  navy: "FF102A43",
  ink: "FF172033",
  teal: "FF0F766E",
  tealSoft: "FFE6FFFB",
  blue: "FF2563EB",
  blueSoft: "FFEFF6FF",
  green: "FF15803D",
  greenSoft: "FFDCFCE7",
  red: "FFB91C1C",
  redSoft: "FFFEE2E2",
  amber: "FFB45309",
  amberSoft: "FFFFF7ED",
  slate: "FF64748B",
  line: "FFD9E2EC",
  soft: "FFF4F7FA",
  white: "FFFFFFFF",
});

const CATEGORY_GROUPS = Object.freeze([
  { key: "Energy", label: "Energy｜能源", categories: ["能源"] },
  { key: "Metals", label: "Metals｜金屬", categories: ["工業金屬", "鋼鐵"] },
  { key: "Agriculture", label: "Agriculture｜農產品", categories: ["農產品"] },
  { key: "Precious metals", label: "Precious metals｜貴金屬", categories: ["貴金屬"] },
  { key: "Other", label: "Other materials｜其他", categories: ["纖維"] },
]);

const SIGNAL_LABELS = Object.freeze({
  COST_PRESSURE_RISING: "成本壓力上升",
  MARKET_WEAKENING: "市場轉弱",
  HIGH_VOLATILITY: "高波動",
  DATA_QUALITY_WARNING: "資料品質警示",
  DATA_INSUFFICIENT: "資料不足",
  STABLE: "穩定區間",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayValue(value, suffix = "") {
  if (!finite(value)) return "—";
  return `${value.toFixed(2)}${suffix}`;
}

function displayPrice(value) {
  if (!finite(value)) return "—";
  return value.toLocaleString("zh-TW", { maximumFractionDigits: 4 });
}

function displayStatus(status) {
  const labels = {
    LIVE: "LIVE｜公開來源",
    FALLBACK: "FALLBACK｜公開備援",
    STALE: "STALE｜舊快取",
    NO_DATA: "NO_DATA｜無資料",
    API_ERROR: "API_ERROR｜來源錯誤",
  };
  return labels[status] || status || "—";
}

function signalLabel(signal) {
  return SIGNAL_LABELS[signal] || signal || "—";
}

function movementClass(value) {
  if (!finite(value) || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function movementMark(value) {
  if (!finite(value) || value === 0) return "•";
  return value > 0 ? "▲" : "▼";
}

function displayMovement(value) {
  if (!finite(value)) return "—";
  return `${movementMark(value)} ${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function statusClass(status) {
  if (status === "LIVE") return "status-live";
  if (status === "FALLBACK") return "status-fallback";
  return "status-warning";
}

function observationSummary(indicator) {
  const latest = indicator.latestObservation;
  return {
    value: latest?.marketPrice ?? latest?.value ?? null,
    date: latest?.date || null,
    status: latest?.status || "NO_DATA",
    source: latest?.source || null,
    lastTradeTimestamp: latest?.lastTradeTimestamp || null,
    collectedAt: latest?.collectedAt || null,
    provenance: latest?.provenance || null,
  };
}

function createTrendPoints(indicator) {
  const latest = indicator.latestValidObservation?.date || indicator.latestObservation?.date;
  if (!latest) return [];
  return (indicator._freshRecords || []).slice(-30).map((record) => ({ date: record.date, value: record.marketPrice }));
}

function toIndicatorReport(indicator) {
  const { _freshRecords, ...publicIndicator } = indicator;
  return {
    ...publicIndicator,
    latestObservation: observationSummary(indicator),
    latestValidObservation: observationSummary({ latestObservation: indicator.latestValidObservation }),
    trendPoints: createTrendPoints(indicator),
    purchasingReferenceNote: PURCHASING_REFERENCE_NOTE,
  };
}

function summarizeIndicator(indicator) {
  return {
    materialId: indicator.materialId,
    materialName: indicator.materialName,
    symbol: indicator.symbol,
    category: indicator.category,
    weeklyChangePct: indicator.weeklyChangePct,
    fourWeekChangePct: indicator.fourWeekChangePct,
    signal: indicator.signal,
    reasonCodes: indicator.reasonCodes,
    reason: indicator.reason,
    status: indicator.latestObservation?.status || "NO_DATA",
    source: indicator.latestObservation?.source || null,
    currentObservationFreshness: indicator.currentObservationFreshness || null,
    headlineEligible: indicator.headlineEligible === true,
  };
}

function buildWeeklyReport({ records = [], reportingWeek, generatedAt = new Date().toISOString() } = {}) {
  const week = reportingWeek ? parseReportingWeek(reportingWeek) : previousCompletedWeek(generatedAt);
  const analytics = buildWeeklyAnalytics(records, week);
  const indicatorsWithInternal = analytics.indicators.map((indicator) => ({
    ...indicator,
    _freshRecords: freshRecords(recordsForMaterial(records, indicator.materialId)).filter((record) => record.date <= week.end),
  }));
  const indicators = indicatorsWithInternal.map(toIndicatorReport);
  const indicatorMap = new Map(indicators.map((indicator) => [indicator.materialId, indicator]));
  const orderedRisers = analytics.risers.map((item) => indicatorMap.get(item.materialId)).filter(Boolean);
  const orderedDecliners = analytics.decliners.map((item) => indicatorMap.get(item.materialId)).filter(Boolean);
  const orderedVolatile = analytics.highVolatility.map((item) => indicatorMap.get(item.materialId)).filter(Boolean);
  const warnings = analytics.qualityWarnings.map((item) => indicatorMap.get(item.materialId)).filter(Boolean);
  const historyRows = (records || []).filter((record) => record.date <= week.end && record.date >= `${Number(week.end.slice(0, 4)) - 1}-01-01`);
  const report = {
    version: REPORT_VERSION,
    reportingWeek: week.reportingWeek,
    reportingPeriod: { start: week.start, end: week.end, timezone: TIMEZONE },
    generatedAt,
    sourceCoverage: analytics.coverage,
    qualitySummary: {
      latestValidCount: analytics.summary.latestValidCount,
      dataQualityWarningCount: analytics.summary.dataQualityWarningCount,
      highVolatilityCount: analytics.summary.highVolatilityCount,
      freshnessEligibleCount: analytics.summary.freshnessEligibleCount,
      headlineEligibleCount: analytics.summary.headlineEligibleCount,
      expiredObservationCount: analytics.summary.expiredObservationCount,
      statuses: analytics.coverage.counts,
    },
    marketSummary: {
      biggestRisers: orderedRisers.map(summarizeIndicator),
      biggestDecliners: orderedDecliners.map(summarizeIndicator),
      highVolatility: orderedVolatile.map(summarizeIndicator),
      dataQualityWarnings: warnings.map(summarizeIndicator),
    },
    indicators,
    fx: analytics.fx,
    historyRows,
    purchasingReferenceNote: PURCHASING_REFERENCE_NOTE,
    disclaimer: PUBLIC_MARKET_DISCLAIMER,
  };
  report.qualityGate = evaluateWeeklyQuality(report);
  return report;
}

function getCategoryGroup(category) {
  return CATEGORY_GROUPS.find((group) => group.categories.includes(category)) || CATEGORY_GROUPS.at(-1);
}

function buildCategoryMomentum(report) {
  const buckets = new Map(CATEGORY_GROUPS.map((group) => [group.key, { ...group, values: [], positiveCount: 0, negativeCount: 0 }]));
  for (const indicator of report.indicators || []) {
    const group = getCategoryGroup(indicator.category);
    const bucket = buckets.get(group.key);
    if (!bucket) continue;
    if (finite(indicator.weeklyChangePct)) {
      bucket.values.push(indicator.weeklyChangePct);
      if (indicator.weeklyChangePct > 0) bucket.positiveCount += 1;
      if (indicator.weeklyChangePct < 0) bucket.negativeCount += 1;
    }
  }
  return CATEGORY_GROUPS.map((group) => {
    const bucket = buckets.get(group.key);
    const averageWeeklyChangePct = bucket.values.length ? bucket.values.reduce((sum, value) => sum + value, 0) / bucket.values.length : null;
    return {
      key: group.key,
      label: group.label,
      indicatorCount: bucket.values.length,
      positiveCount: bucket.positiveCount,
      negativeCount: bucket.negativeCount,
      averageWeeklyChangePct,
    };
  }).filter((group) => group.indicatorCount || group.key !== "Other");
}

function getSignalDistribution(report) {
  const counts = new Map(Object.keys(SIGNAL_LABELS).map((signal) => [signal, 0]));
  for (const indicator of report.indicators || []) counts.set(indicator.signal, (counts.get(indicator.signal) || 0) + 1);
  return Object.keys(SIGNAL_LABELS).map((signal) => ({ signal, label: signalLabel(signal), count: counts.get(signal) || 0 }));
}

function priorityIndicators(report) {
  const seen = new Set();
  const priority = [];
  const sources = [report.marketSummary.highVolatility, report.marketSummary.biggestRisers, report.marketSummary.biggestDecliners, report.marketSummary.dataQualityWarnings];
  for (const list of sources) {
    for (const item of list || []) {
      if (seen.has(item.materialId)) continue;
      seen.add(item.materialId);
      priority.push(item);
      if (priority.length >= 6) return priority;
    }
  }
  return priority;
}

function renderTrendSvg(indicator) {
  const points = (indicator.trendPoints || []).filter((point) => finite(point.value));
  if (points.length < 2) return `<div class="trend-empty">無足夠新鮮公開觀測可繪製趨勢。</div>`;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const polyline = points.map((point, index) => `${(index / (points.length - 1) * 280 + 10).toFixed(1)},${(100 - ((point.value - min) / span * 76 + 12)).toFixed(1)}`).join(" ");
  return `<svg class="trend" viewBox="0 0 300 112" role="img" aria-label="${escapeHtml(indicator.materialName)} 公開市場趨勢"><polyline points="${polyline}" fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline><text x="10" y="108" fill="#64748b" font-size="10">${escapeHtml(points[0].date)}</text><text x="290" y="108" fill="#64748b" font-size="10" text-anchor="end">${escapeHtml(points.at(-1).date)}</text></svg>`;
}

function movementHtml(value) {
  return `<span class="movement ${movementClass(value)}"><span class="movement-mark" aria-hidden="true">${movementMark(value)}</span>${escapeHtml(displayValue(value, "%"))}</span>`;
}

function indicatorRowHtml(indicator) {
  const observation = indicator.latestObservation || {};
  return `<tr class="${statusClass(observation.status)}"><td><strong>${escapeHtml(indicator.materialName)}</strong><small>${escapeHtml(indicator.symbol)}</small></td><td>${escapeHtml(indicator.category)}</td><td class="numeric">${escapeHtml(displayPrice(observation.value))}</td><td>${escapeHtml(indicator.sourceUnit)}</td><td>${movementHtml(indicator.weeklyChangePct)}</td><td>${movementHtml(indicator.fourWeekChangePct)}</td><td><span class="signal-pill">${escapeHtml(signalLabel(indicator.signal))}</span></td><td>${escapeHtml(indicator.reason || "—")}</td><td><span class="status-pill ${statusClass(observation.status)}">${escapeHtml(observation.status || "NO_DATA")}</span></td><td>${escapeHtml(observation.source || "—")}<small>${escapeHtml(observation.date || "—")}</small></td></tr>`;
}

function renderKpiHtml(label, value, detail, tone = "teal") {
  return `<article class="kpi-card ${escapeHtml(tone)}"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><span>${escapeHtml(detail)}</span></article>`;
}

function renderChangeOverviewHtml(indicators) {
  const finiteChanges = indicators.map((item) => item.weeklyChangePct).filter(finite);
  const maxAbs = Math.max(...finiteChanges.map((value) => Math.abs(value)), 1);
  const rows = indicators.map((item) => {
    const width = finite(item.weeklyChangePct) ? Math.max(4, Math.round(Math.abs(item.weeklyChangePct) / maxAbs * 100)) : 0;
    const barClass = movementClass(item.weeklyChangePct);
    return `<div class="change-row"><div class="change-label"><strong>${escapeHtml(item.materialName)}</strong><small>${escapeHtml(item.category)}</small></div><div class="change-track"><span class="change-bar ${barClass}" style="width:${width}%"></span></div><span class="change-value ${barClass}">${escapeHtml(displayMovement(item.weeklyChangePct))}</span></div>`;
  }).join("");
  return rows || `<p class="muted">目前沒有可用的週變化資料。</p>`;
}

function renderPriorityHtml(report) {
  const priorities = priorityIndicators(report);
  if (!priorities.length) return `<p class="muted">目前沒有需要優先檢視的公開市場變化。</p>`;
  return `<div class="priority-list">${priorities.map((item, index) => `<article class="priority-item"><span class="priority-index">${index + 1}</span><div><strong>${escapeHtml(item.materialName)}</strong><span>${escapeHtml(signalLabel(item.signal))} · ${escapeHtml(item.category)}</span><p>${escapeHtml(item.reason || "請查看詳細市場資料")}</p></div><b class="${movementClass(item.weeklyChangePct)}">${escapeHtml(displayMovement(item.weeklyChangePct))}</b></article>`).join("")}</div>`;
}

function renderCategoryMomentumHtml(report) {
  return buildCategoryMomentum(report).map((group) => `<article class="category-card"><span>${escapeHtml(group.label)}</span><strong class="${movementClass(group.averageWeeklyChangePct)}">${escapeHtml(displayMovement(group.averageWeeklyChangePct))}</strong><small>${group.indicatorCount} 項可比指標 · 上升 ${group.positiveCount} · 下降 ${group.negativeCount}</small></article>`).join("");
}

function renderSignalDistributionHtml(report) {
  const distribution = getSignalDistribution(report);
  const total = report.indicators.length || 1;
  return distribution.map((item) => `<div class="signal-row"><span>${escapeHtml(item.label)}</span><div class="signal-track"><span style="width:${Math.round(item.count / total * 100)}%"></span></div><b>${item.count}</b></div>`).join("");
}

function renderWeeklyHtml(report, options = {}) {
  const title = options.title || `採購市場情報週報｜${report.reportingWeek}`;
  const gate = report.qualityGate || {};
  const topRise = report.marketSummary.biggestRisers[0];
  const topDecline = report.marketSummary.biggestDecliners[0];
  const completeness = `${gate.usableIndicatorCount ?? report.qualitySummary.latestValidCount}/${gate.trackedIndicatorCount ?? report.sourceCoverage.totalIndicators}`;
  const completenessDetail = `${Number(gate.materialUsabilityPct || 0).toFixed(0)}% 可用公開指標 · ${gate.state || "—"}`;
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title><style>:root{--navy:#102a43;--ink:#172033;--muted:#64748b;--teal:#0f766e;--teal-soft:#e6fffb;--line:#d9e2ec;--surface:#fff;--canvas:#f4f7fa;--green:#15803d;--green-soft:#dcfce7;--red:#b91c1c;--red-soft:#fee2e2;--amber:#b45309;--amber-soft:#fff7ed}*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC","Segoe UI",sans-serif;line-height:1.55}.email-shell{max-width:1180px;margin:0 auto;padding:16px}.hero{background:linear-gradient(135deg,var(--navy),#0f766e);color:#fff;border-radius:20px;padding:24px 22px;box-shadow:0 12px 28px rgba(16,42,67,.14)}.eyebrow{margin:0 0 7px;text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:#b9f5ee;font-weight:700}.hero h1{margin:0;font-size:25px;line-height:1.2}.hero-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.hero-meta span{padding:6px 10px;border:1px solid rgba(255,255,255,.24);border-radius:999px;color:#e6fffb;font-size:12px}.section{margin-top:16px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:0 4px 12px rgba(16,42,67,.04)}.section-heading{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:14px}.section-heading h2{margin:0;color:var(--navy);font-size:18px}.section-heading p{margin:0;color:var(--muted);font-size:12px}.kpi-grid{display:grid;grid-template-columns:1fr;gap:10px}.kpi-card{min-height:116px;border:1px solid var(--line);border-top:4px solid var(--teal);border-radius:12px;padding:14px;background:#fff}.kpi-card.green{border-top-color:var(--green)}.kpi-card.red{border-top-color:var(--red)}.kpi-card.amber{border-top-color:var(--amber)}.kpi-card p{margin:0 0 8px;color:var(--muted);font-size:12px;font-weight:700}.kpi-card strong{display:block;font-size:22px;line-height:1.2;color:var(--navy)}.kpi-card span{display:block;margin-top:8px;color:var(--muted);font-size:12px}.two-column{display:grid;grid-template-columns:1fr;gap:16px}.change-row{display:grid;grid-template-columns:112px 1fr 78px;align-items:center;gap:10px;margin:9px 0}.change-label{min-width:0}.change-label strong,.change-label small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.change-label small,.priority-item span,.category-card small{color:var(--muted);font-size:11px}.change-track,.signal-track{height:9px;background:#edf2f7;border-radius:999px;overflow:hidden}.change-bar{display:block;height:100%;border-radius:999px;background:var(--muted)}.change-bar.positive{background:var(--green)}.change-bar.negative{background:var(--red)}.change-value{text-align:right;font-size:12px;font-weight:800}.positive{color:var(--green)}.negative{color:var(--red)}.neutral{color:var(--muted)}.priority-list{display:grid;gap:8px}.priority-item{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:start;padding:10px;border-radius:10px;background:#f8fafc;border:1px solid #edf2f7}.priority-index{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:var(--teal-soft);color:var(--teal);font-weight:800}.priority-item strong,.priority-item span,.priority-item p{display:block}.priority-item p{margin:3px 0 0;font-size:12px;color:var(--ink)}.priority-item b{font-size:12px;white-space:nowrap}.category-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.category-card{border:1px solid var(--line);border-radius:10px;padding:12px;background:#fbfdff}.category-card span,.category-card strong,.category-card small{display:block}.category-card span{font-size:12px;font-weight:700;color:var(--navy)}.category-card strong{font-size:20px;margin:5px 0}.signal-row{display:grid;grid-template-columns:120px 1fr 24px;gap:8px;align-items:center;margin:10px 0;font-size:12px}.signal-track span{display:block;height:100%;min-width:2px;background:var(--teal);border-radius:999px}.signal-row b{text-align:right}.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px}table{border-collapse:collapse;width:100%;min-width:940px;background:#fff}th,td{padding:10px 9px;border-bottom:1px solid #edf2f7;text-align:left;vertical-align:top;font-size:12px}th{background:#f0fdfa;color:#115e59;font-size:11px;white-space:nowrap}td strong,td small{display:block}td small{color:var(--muted);font-size:10px;margin-top:2px}.numeric{text-align:right;font-variant-numeric:tabular-nums}.movement{white-space:nowrap;font-weight:800}.movement-mark{font-size:10px;margin-right:3px}.signal-pill,.status-pill{display:inline-block;padding:4px 7px;border-radius:999px;font-size:10px;font-weight:700;white-space:nowrap}.signal-pill{background:var(--blue-soft);color:#1d4ed8}.status-live{color:var(--green)}.status-fallback{color:#0369a1}.status-warning{color:var(--amber)}td .status-pill.status-live{background:var(--green-soft)}td .status-pill.status-fallback{background:#e0f2fe}td .status-pill.status-warning{background:var(--amber-soft)}tr.status-warning td{background:#fffaf0}.disclaimer{margin-top:16px;padding:14px 16px;border:1px solid #f6d58b;border-radius:12px;background:#fffbeb;color:#713f12;font-size:11px}.disclaimer strong{display:block;margin-bottom:5px;color:#92400e}.muted{color:var(--muted);font-size:12px}.trend{width:100%;height:auto;background:#f8fafc;border-radius:10px}.trend-empty{padding:28px;color:var(--muted);background:#f8fafc;border-radius:10px}@media(min-width:620px){.email-shell{padding:24px}.kpi-grid{grid-template-columns:repeat(2,1fr)}.two-column{grid-template-columns:1fr 1fr}.category-grid{grid-template-columns:repeat(3,1fr)}}@media(min-width:920px){.kpi-grid{grid-template-columns:repeat(4,1fr)}.hero{padding:30px}.hero h1{font-size:30px}.email-shell{padding:32px 20px}}</style></head><body><main class="email-shell"><header class="hero"><p class="eyebrow">WEEKLY MARKET INTELLIGENCE · PROCUREMENT REVIEW</p><h1>${escapeHtml(title)}</h1><div class="hero-meta"><span>報告期間 ${escapeHtml(report.reportingPeriod.start)} ～ ${escapeHtml(report.reportingPeriod.end)}</span><span>時區 ${escapeHtml(TIMEZONE)}</span><span>品質狀態 ${escapeHtml(gate.state || "—")}</span></div></header><section class="section"><div class="kpi-grid">${renderKpiHtml("最大週漲幅", topRise ? `${topRise.materialName} ${displayMovement(topRise.weeklyChangePct)}` : "—", topRise?.category || "沒有可比資料", "green")}${renderKpiHtml("最大週跌幅", topDecline ? `${topDecline.materialName} ${displayMovement(topDecline.weeklyChangePct)}` : "—", topDecline?.category || "沒有可比資料", "red")}${renderKpiHtml("高波動指標", `${report.qualitySummary.highVolatilityCount} 項`, "依既有公開市場波動判定", "amber")}${renderKpiHtml("資料完整度", completeness, completenessDetail, "teal")}</div></section><section class="section"><div class="section-heading"><h2>Weekly change overview｜週變化總覽</h2><p>依既有週變化計算結果排序視覺化</p></div>${renderChangeOverviewHtml(report.indicators)}</section><div class="two-column"><section class="section"><div class="section-heading"><h2>Procurement review priorities</h2><p>優先檢視市場異動與資料警示</p></div>${renderPriorityHtml(report)}</section><section class="section"><div class="section-heading"><h2>Market signal distribution</h2><p>既有 signals 的目前分布</p></div>${renderSignalDistributionHtml(report)}</section></div><section class="section"><div class="section-heading"><h2>Category momentum｜類別動能</h2><p>以既有週變化欄位作 presentation-level 彙整</p></div><div class="category-grid">${renderCategoryMomentumHtml(report)}</div></section><section class="section"><div class="section-heading"><h2>Market detail｜市場明細</h2><p>優先呈現可供採購管理 review 的欄位</p></div><div class="table-wrap"><table><thead><tr><th>Material</th><th>Category</th><th>Latest value</th><th>Source unit</th><th>Weekly change</th><th>Four-week change</th><th>Market signal</th><th>Reason</th><th>Data status</th><th>Source / observation date</th></tr></thead><tbody>${report.indicators.map(indicatorRowHtml).join("")}</tbody></table></div></section><footer class="disclaimer"><strong>公開市場參考資訊</strong>${escapeHtml(report.purchasingReferenceNote)}<br>${escapeHtml(report.disclaimer)}</footer></main></body></html>`;
}

function excelColumnLetter(number) {
  let value = number;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function fillRange(worksheet, startCol, endCol, startRow, endRow, fill, font, alignment = {}) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      if (fill) cell.fill = fill;
      if (font) cell.font = font;
      cell.alignment = { vertical: "middle", ...alignment };
    }
  }
}

function solidFill(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function addMergedSectionTitle(worksheet, row, startCol, endCol, title) {
  worksheet.mergeCells(row, startCol, row, endCol);
  const cell = worksheet.getCell(row, startCol);
  cell.value = title;
  fillRange(worksheet, startCol, endCol, row, row, solidFill(COLORS.navy), { bold: true, color: { argb: COLORS.white }, size: 12 }, { horizontal: "left" });
  worksheet.getRow(row).height = 23;
}

function addCard(worksheet, startCol, endCol, row, title, value, detail, tone) {
  worksheet.mergeCells(row, startCol, row, endCol);
  worksheet.mergeCells(row + 1, startCol, row + 1, endCol);
  worksheet.mergeCells(row + 2, startCol, row + 2, endCol);
  const fill = tone === "green" ? COLORS.greenSoft : tone === "red" ? COLORS.redSoft : tone === "amber" ? COLORS.amberSoft : COLORS.tealSoft;
  const accent = tone === "green" ? COLORS.green : tone === "red" ? COLORS.red : tone === "amber" ? COLORS.amber : COLORS.teal;
  fillRange(worksheet, startCol, endCol, row, row + 2, solidFill(fill), { color: { argb: COLORS.ink } }, { horizontal: "left", wrapText: true });
  worksheet.getCell(row, startCol).value = title;
  worksheet.getCell(row, startCol).font = { bold: true, color: { argb: COLORS.slate }, size: 10 };
  worksheet.getCell(row + 1, startCol).value = value;
  worksheet.getCell(row + 1, startCol).font = { bold: true, color: { argb: accent }, size: 15 };
  worksheet.getCell(row + 2, startCol).value = detail;
  worksheet.getCell(row + 2, startCol).font = { color: { argb: COLORS.slate }, size: 9 };
  for (let current = row; current <= row + 2; current += 1) worksheet.getRow(current).height = current === row + 1 ? 27 : 19;
}

function styleHeaderRow(worksheet, row, startCol, endCol) {
  fillRange(worksheet, startCol, endCol, row, row, solidFill(COLORS.teal), { bold: true, color: { argb: COLORS.white }, size: 10 }, { horizontal: "left", wrapText: true });
  worksheet.getRow(row).height = 28;
  for (let col = startCol; col <= endCol; col += 1) worksheet.getCell(row, col).border = { bottom: { style: "thin", color: { argb: COLORS.line } } };
}

function styleDataRows(worksheet, startRow, endRow, startCol, endCol) {
  for (let row = startRow; row <= endRow; row += 1) {
    if ((row - startRow) % 2 === 1) fillRange(worksheet, startCol, endCol, row, row, solidFill("FFF8FAFC"));
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: COLORS.line } } };
    }
    worksheet.getRow(row).height = 21;
  }
}

function excelPercent(value) {
  return finite(value) ? value / 100 : null;
}

function detailRow(item) {
  const observation = item.latestObservation || {};
  return {
    material: item.materialName,
    category: item.category,
    latestValue: observation.value,
    unit: item.sourceUnit,
    weekly: excelPercent(item.weeklyChangePct),
    fourWeek: excelPercent(item.fourWeekChangePct),
    signal: signalLabel(item.signal),
    reason: item.reason || "—",
    status: observation.status || "NO_DATA",
    sourceObservation: `${observation.source || "—"}｜${observation.date || "—"}`,
    symbol: item.symbol,
    threeMonth: excelPercent(item.threeMonthChangePct),
    ytd: excelPercent(item.ytdChangePct),
    fiftyTwoWeek: excelPercent(item.fiftyTwoWeekChangePct),
    high: item.weeklyHigh,
    low: item.weeklyLow,
    range: excelPercent(item.weeklyRangePct),
    volatility: excelPercent(item.rollingVolatilityPct),
    observationCount: item.observationCountInWeek,
    freshCount: item.freshObservationCount,
    lastTrade: observation.lastTradeTimestamp,
    collectedAt: observation.collectedAt,
    reasonCodes: (item.reasonCodes || []).join(", "),
  };
}

function applyMovementFont(cell, value) {
  if (finite(value) && value > 0) cell.font = { color: { argb: COLORS.green }, bold: true };
  else if (finite(value) && value < 0) cell.font = { color: { argb: COLORS.red }, bold: true };
}

function createWeeklyWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "raw-material-market-dashboard";
  workbook.created = new Date(report.generatedAt);
  workbook.modified = new Date(report.generatedAt);

  const summary = workbook.addWorksheet("本週摘要", { properties: { tabColor: COLORS.teal } });
  summary.views = [{ state: "frozen", ySplit: 11, showGridLines: false }];
  for (let col = 1; col <= 8; col += 1) summary.getColumn(col).width = 17;
  summary.getColumn(1).width = 22;
  summary.getColumn(2).width = 18;
  summary.mergeCells("A1:H1");
  summary.getCell("A1").value = `採購市場情報週報｜${report.reportingWeek}`;
  fillRange(summary, 1, 8, 1, 1, solidFill(COLORS.navy), { bold: true, color: { argb: COLORS.white }, size: 18 }, { horizontal: "left" });
  summary.getRow(1).height = 32;
  summary.mergeCells("A2:H2");
  summary.getCell("A2").value = `報告期間 ${report.reportingPeriod.start} ～ ${report.reportingPeriod.end}｜${TIMEZONE}`;
  fillRange(summary, 1, 8, 2, 2, solidFill(COLORS.navy), { color: { argb: "FFD9FFFA" }, size: 10 }, { horizontal: "left" });
  summary.mergeCells("A3:H3");
  summary.getCell("A3").value = `品質狀態：${report.qualityGate.state}｜產生時間：${report.generatedAt}`;
  fillRange(summary, 1, 8, 3, 3, solidFill(COLORS.blueSoft), { color: { argb: COLORS.blue }, bold: true, size: 10 }, { horizontal: "left" });

  const topRise = report.marketSummary.biggestRisers[0];
  const topDecline = report.marketSummary.biggestDecliners[0];
  const gate = report.qualityGate;
  addCard(summary, 1, 2, 5, "Biggest weekly rise｜最大週漲幅", topRise ? `${topRise.materialName} ${displayMovement(topRise.weeklyChangePct)}` : "—", topRise?.category || "沒有可比資料", "green");
  addCard(summary, 3, 4, 5, "Biggest weekly decline｜最大週跌幅", topDecline ? `${topDecline.materialName} ${displayMovement(topDecline.weeklyChangePct)}` : "—", topDecline?.category || "沒有可比資料", "red");
  addCard(summary, 5, 6, 5, "High-volatility indicators｜高波動", `${report.qualitySummary.highVolatilityCount} 項`, "依既有公開市場波動判定", "amber");
  addCard(summary, 7, 8, 5, "Data completeness｜資料完整度", `${gate.usableIndicatorCount}/${gate.trackedIndicatorCount}`, `${Number(gate.materialUsabilityPct || 0).toFixed(0)}% usable · ${gate.state}`, "teal");

  addMergedSectionTitle(summary, 10, 1, 8, "Weekly change overview｜週變化總覽");
  const overviewHeaderRow = 11;
  const overviewColumns = ["Material", "Category", "Latest value", "Source unit", "Weekly change", "Market signal", "Data status", "Source / date"];
  overviewColumns.forEach((header, index) => { summary.getCell(overviewHeaderRow, index + 1).value = header; });
  styleHeaderRow(summary, overviewHeaderRow, 1, 8);
  const overviewStart = 12;
  const overviewRows = report.indicators.map((item) => {
    const row = detailRow(item);
    return [row.material, row.category, row.latestValue, row.unit, row.weekly, row.signal, row.status, row.sourceObservation];
  });
  overviewRows.forEach((row) => summary.addRow(row));
  const overviewEnd = overviewStart + Math.max(overviewRows.length - 1, 0);
  styleDataRows(summary, overviewStart, overviewEnd, 1, 8);
  for (let row = overviewStart; row <= overviewEnd; row += 1) {
    summary.getCell(row, 3).numFmt = "#,##0.####;[Red]-#,##0.####";
    summary.getCell(row, 5).numFmt = "0.00%;[Red]-0.00%";
    applyMovementFont(summary.getCell(row, 5), summary.getCell(row, 5).value == null ? null : summary.getCell(row, 5).value * 100);
    if (["STALE", "NO_DATA", "API_ERROR"].includes(summary.getCell(row, 7).value)) fillRange(summary, 1, 8, row, row, solidFill(COLORS.amberSoft));
  }
  summary.autoFilter = { from: `A${overviewHeaderRow}`, to: `H${overviewEnd}` };
  summary.addConditionalFormatting({ ref: `E${overviewStart}:E${overviewEnd}`, rules: [
    { type: "cellIs", operator: "greaterThan", formulae: ["0"], style: { font: { color: { argb: COLORS.green }, bold: true } } },
    { type: "cellIs", operator: "lessThan", formulae: ["0"], style: { font: { color: { argb: COLORS.red }, bold: true } } },
  ] });
  summary.addConditionalFormatting({ ref: `E${overviewStart}:E${overviewEnd}`, rules: [{ type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }], color: { argb: COLORS.teal } }] });

  let row = overviewEnd + 3;
  addMergedSectionTitle(summary, row, 1, 8, "Procurement review priorities｜採購檢視優先序");
  row += 1;
  ["Priority", "Material", "Movement", "Signal", "Category", "Reason"].forEach((header, index) => { summary.getCell(row, index + 1).value = header; });
  summary.mergeCells(row, 6, row, 8);
  styleHeaderRow(summary, row, 1, 8);
  const priorityHeader = row;
  row += 1;
  const priorities = priorityIndicators(report);
  priorities.forEach((item, index) => {
    const values = [index + 1, item.materialName, item.weeklyChangePct == null ? "—" : displayMovement(item.weeklyChangePct), signalLabel(item.signal), item.category, item.reason || "—"];
    values.forEach((value, index2) => summary.getCell(row, index2 + 1).value = value);
    summary.mergeCells(row, 6, row, 8);
    styleDataRows(summary, row, row, 1, 8);
    applyMovementFont(summary.getCell(row, 3), item.weeklyChangePct);
    row += 1;
  });
  if (!priorities.length) {
    summary.mergeCells(row, 1, row, 8);
    summary.getCell(row, 1).value = "目前沒有需要優先檢視的公開市場變化。";
    styleDataRows(summary, row, row, 1, 8);
    row += 1;
  }

  row += 1;
  addMergedSectionTitle(summary, row, 1, 8, "Category momentum｜類別動能");
  row += 1;
  ["Category", "Average weekly change", "Indicators", "Positive", "Negative"].forEach((header, index) => { summary.getCell(row, index + 1).value = header; });
  summary.mergeCells(row, 5, row, 8);
  styleHeaderRow(summary, row, 1, 8);
  row += 1;
  const categoryStart = row;
  for (const group of buildCategoryMomentum(report)) {
    summary.getCell(row, 1).value = group.label;
    summary.getCell(row, 2).value = excelPercent(group.averageWeeklyChangePct);
    summary.getCell(row, 3).value = group.indicatorCount;
    summary.getCell(row, 4).value = group.positiveCount;
    summary.getCell(row, 5).value = group.negativeCount;
    summary.mergeCells(row, 5, row, 8);
    styleDataRows(summary, row, row, 1, 8);
    summary.getCell(row, 2).numFmt = "0.00%;[Red]-0.00%";
    applyMovementFont(summary.getCell(row, 2), group.averageWeeklyChangePct);
    row += 1;
  }
  const categoryEnd = row - 1;

  row += 1;
  addMergedSectionTitle(summary, row, 1, 8, "Market signal distribution｜市場訊號分布");
  row += 1;
  ["Signal", "Count", "Share"].forEach((header, index) => { summary.getCell(row, index + 1).value = header; });
  summary.mergeCells(row, 4, row, 8);
  styleHeaderRow(summary, row, 1, 8);
  row += 1;
  const signalStart = row;
  const signalRows = getSignalDistribution(report);
  signalRows.forEach((item) => {
    summary.getCell(row, 1).value = item.label;
    summary.getCell(row, 2).value = item.count;
    summary.getCell(row, 3).value = report.indicators.length ? item.count / report.indicators.length : 0;
    summary.mergeCells(row, 4, row, 8);
    styleDataRows(summary, row, row, 1, 8);
    summary.getCell(row, 3).numFmt = "0.0%";
    row += 1;
  });
  const signalEnd = row - 1;

  row += 1;
  summary.mergeCells(row, 1, row, 8);
  summary.getCell(row, 1).value = `${report.purchasingReferenceNote} ${report.disclaimer}`;
  fillRange(summary, 1, 8, row, row, solidFill(COLORS.amberSoft), { color: { argb: "FF713F12" }, size: 9 }, { wrapText: true, vertical: "top" });
  summary.getRow(row).height = 42;
  summary.getColumn(6).width = 30;
  summary.getColumn(7).width = 18;
  summary.getColumn(8).width = 28;

  const detail = workbook.addWorksheet("市場明細", { properties: { tabColor: COLORS.blue } });
  detail.views = [{ state: "frozen", xSplit: 2, ySplit: 4, showGridLines: false }];
  detail.mergeCells("A1:W1");
  detail.getCell("A1").value = `市場明細｜${report.reportingWeek}`;
  fillRange(detail, 1, 23, 1, 1, solidFill(COLORS.navy), { bold: true, color: { argb: COLORS.white }, size: 16 }, { horizontal: "left" });
  detail.getRow(1).height = 30;
  detail.mergeCells("A2:W2");
  detail.getCell("A2").value = "核心欄位優先呈現；其餘完整 report data 保留於右側延伸欄位，可取消隱藏檢視。";
  fillRange(detail, 1, 23, 2, 2, solidFill(COLORS.blueSoft), { color: { argb: COLORS.blue }, size: 10 }, { horizontal: "left" });
  detail.mergeCells("A3:W3");
  detail.getCell("A3").value = `資料品質：${report.qualityGate.state}｜報告期間：${report.reportingPeriod.start} ～ ${report.reportingPeriod.end}`;
  fillRange(detail, 1, 23, 3, 3, solidFill(COLORS.soft), { color: { argb: COLORS.slate }, size: 9 }, { horizontal: "left" });

  const detailColumns = [
    { header: "Material", key: "material", width: 19 },
    { header: "Category", key: "category", width: 15 },
    { header: "Latest value", key: "latestValue", width: 14 },
    { header: "Source unit", key: "unit", width: 17 },
    { header: "Weekly change", key: "weekly", width: 14 },
    { header: "Four-week change", key: "fourWeek", width: 16 },
    { header: "Market signal", key: "signal", width: 19 },
    { header: "Reason", key: "reason", width: 42 },
    { header: "Data status", key: "status", width: 14 },
    { header: "Source / observation date", key: "sourceObservation", width: 30 },
    { header: "Symbol", key: "symbol", width: 13 },
    { header: "Three-month change", key: "threeMonth", width: 17 },
    { header: "YTD change", key: "ytd", width: 14 },
    { header: "52-week change", key: "fiftyTwoWeek", width: 16 },
    { header: "Weekly high", key: "high", width: 13 },
    { header: "Weekly low", key: "low", width: 13 },
    { header: "Weekly range", key: "range", width: 14 },
    { header: "Rolling volatility", key: "volatility", width: 16 },
    { header: "Observations in week", key: "observationCount", width: 17 },
    { header: "Fresh observations", key: "freshCount", width: 17 },
    { header: "Last trade", key: "lastTrade", width: 23 },
    { header: "Collected at", key: "collectedAt", width: 23 },
    { header: "Reason codes", key: "reasonCodes", width: 38 },
  ];
  detail.columns = detailColumns;
  const detailHeaderRow = 4;
  detailColumns.forEach((column, index) => { detail.getCell(detailHeaderRow, index + 1).value = column.header; });
  styleHeaderRow(detail, detailHeaderRow, 1, detailColumns.length);
  const detailRows = report.indicators.map(detailRow);
  detailRows.forEach((record) => detail.addRow(record));
  const detailStart = 5;
  const detailEnd = detailStart + Math.max(detailRows.length - 1, 0);
  styleDataRows(detail, detailStart, detailEnd, 1, detailColumns.length);
  for (let current = detailStart; current <= detailEnd; current += 1) {
    detail.getCell(current, 3).numFmt = "#,##0.####;[Red]-#,##0.####";
    for (const col of [5, 6, 12, 13, 14, 17, 18]) detail.getCell(current, col).numFmt = "0.00%;[Red]-0.00%";
    for (const col of [5, 6, 12, 13, 14, 17, 18]) applyMovementFont(detail.getCell(current, col), detail.getCell(current, col).value == null ? null : detail.getCell(current, col).value * 100);
    for (const col of [15, 16]) detail.getCell(current, col).numFmt = "#,##0.####;[Red]-#,##0.####";
    const status = detail.getCell(current, 9).value;
    const signal = detail.getCell(current, 7).value;
    if (["STALE", "NO_DATA", "API_ERROR"].includes(status) || ["資料品質警示", "資料不足"].includes(signal)) fillRange(detail, 1, detailColumns.length, current, current, solidFill(COLORS.amberSoft));
  }
  detail.autoFilter = { from: `A${detailHeaderRow}`, to: `${excelColumnLetter(detailColumns.length)}${detailEnd}` };
  detail.addConditionalFormatting({ ref: `E${detailStart}:F${detailEnd}`, rules: [
    { type: "cellIs", operator: "greaterThan", formulae: ["0"], style: { font: { color: { argb: COLORS.green }, bold: true } } },
    { type: "cellIs", operator: "lessThan", formulae: ["0"], style: { font: { color: { argb: COLORS.red }, bold: true } } },
  ] });
  detail.addConditionalFormatting({ ref: `A${detailStart}:${excelColumnLetter(detailColumns.length)}${detailEnd}`, rules: [{
    type: "expression",
    formulae: [`OR($I${detailStart}="STALE",$I${detailStart}="NO_DATA",$I${detailStart}="API_ERROR",$G${detailStart}="資料品質警示",$G${detailStart}="資料不足")`],
    style: { fill: solidFill(COLORS.amberSoft) },
  }] });
  for (let col = 11; col <= detailColumns.length; col += 1) detail.getColumn(col).hidden = true;

  const history = workbook.addWorksheet("歷史資料", { properties: { tabColor: COLORS.slate } });
  history.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  const historyColumns = [
    { header: "Date", key: "date", width: 13 }, { header: "Material", key: "material", width: 19 }, { header: "Symbol", key: "symbol", width: 13 }, { header: "Price", key: "price", width: 14 }, { header: "Source unit", key: "unit", width: 17 }, { header: "Currency", key: "currency", width: 11 }, { header: "USD/TWD", key: "fx", width: 12 }, { header: "TWD reference", key: "twd", width: 16 }, { header: "Status", key: "status", width: 14 }, { header: "Source", key: "source", width: 32 }, { header: "Last trade", key: "lastTrade", width: 23 }, { header: "Collected at", key: "collectedAt", width: 23 },
  ];
  history.columns = historyColumns;
  styleHeaderRow(history, 1, 1, historyColumns.length);
  report.historyRows.filter((record) => record.materialId !== "__fx_usd_twd__").forEach((record) => history.addRow({ date: record.date, material: record.materialName, symbol: record.symbol, price: record.marketPrice, unit: record.sourceUnit, currency: record.currency, fx: record.usdTwdRate, twd: record.twdReferenceValue, status: record.status, source: record.source, lastTrade: record.lastTradeTimestamp, collectedAt: record.collectedAt }));
  styleDataRows(history, 2, history.rowCount, 1, historyColumns.length);
  history.autoFilter = { from: "A1", to: `${excelColumnLetter(historyColumns.length)}${history.rowCount}` };
  for (let current = 2; current <= history.rowCount; current += 1) {
    history.getCell(current, 4).numFmt = "#,##0.####;[Red]-#,##0.####";
    history.getCell(current, 7).numFmt = "0.0000";
    history.getCell(current, 8).numFmt = "#,##0.####;[Red]-#,##0.####";
  }

  const sources = workbook.addWorksheet("資料來源與說明", { properties: { tabColor: COLORS.amber } });
  sources.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  sources.columns = [{ header: "Item", key: "item", width: 24 }, { header: "Description", key: "content", width: 100 }];
  styleHeaderRow(sources, 1, 1, 2);
  [
    { item: "主要行情來源", content: "Yahoo Finance Chart API；依固定公開 host allowlist 取得。" },
    { item: "行情備援", content: "只使用 material registry 明確配置的 Stooq symbol；無 fallback 時保持 API_ERROR／STALE。" },
    { item: "歷史備援", content: "Yahoo direct history 失敗後可使用固定 Jina public proxy；保留來源標籤。" },
    { item: "FX來源", content: "Yahoo Finance TWD=X primary；open.er-api.com fallback。" },
    { item: "狀態", content: "LIVE、FALLBACK、STALE、NO_DATA、API_ERROR；STALE／API_ERROR 不算 fresh observation。" },
    { item: "報告呈現", content: "本次 redesign 僅調整 HTML／XLSX presentation layer；market logic、analytics、quality gate 與 canonical report payload 不變。" },
    { item: "報告時區", content: TIMEZONE },
    { item: "重要限制", content: report.disclaimer },
    { item: "採購參考邊界", content: report.purchasingReferenceNote },
  ].forEach((record) => sources.addRow(record));
  styleDataRows(sources, 2, sources.rowCount, 1, 2);
  sources.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  for (let current = 2; current <= sources.rowCount; current += 1) sources.getRow(current).height = 34;

  return workbook;
}

async function writeWeeklyReportFiles(report, outDir, options = {}) {
  const config = options.config || getStorageConfig(options.env || process.env);
  const targetDir = outDir || config.reportDir;
  await fs.mkdir(targetDir, { recursive: true });
  const safeWeek = report.reportingWeek.replace(/[^0-9W-]/g, "_");
  const jsonPath = path.join(targetDir, `weekly-market-intelligence-${safeWeek}.json`);
  const htmlPath = path.join(targetDir, `weekly-market-intelligence-${safeWeek}.html`);
  const xlsxPath = path.join(targetDir, `weekly-market-intelligence-${safeWeek}.xlsx`);
  await writeFileAtomic(jsonPath, JSON.stringify(report, null, 2), { encoding: "utf8" });
  await writeFileAtomic(htmlPath, renderWeeklyHtml(report), { encoding: "utf8" });
  const workbookBuffer = await (await createWeeklyWorkbook(report)).xlsx.writeBuffer();
  await writeFileAtomic(xlsxPath, workbookBuffer);
  const metadata = await recordReportMetadata(report, { jsonPath, htmlPath, xlsxPath }, { config });
  return { jsonPath, htmlPath, xlsxPath, metadata };
}

async function loadAndBuildWeeklyReport(options = {}) {
  const records = options.records || await listSnapshots({ filePath: options.filePath, env: options.env, storageConfig: options.storageConfig, pool: options.pool });
  return buildWeeklyReport({ records, reportingWeek: options.reportingWeek, generatedAt: options.generatedAt });
}

module.exports = {
  REPORT_VERSION,
  TIMEZONE,
  PURCHASING_REFERENCE_NOTE,
  DEFAULT_REPORT_DIR,
  COLORS,
  CATEGORY_GROUPS,
  SIGNAL_LABELS,
  escapeHtml,
  displayValue,
  displayPrice,
  displayStatus,
  buildWeeklyReport,
  buildCategoryMomentum,
  getSignalDistribution,
  priorityIndicators,
  renderTrendSvg,
  renderWeeklyHtml,
  createWeeklyWorkbook,
  writeWeeklyReportFiles,
  loadAndBuildWeeklyReport,
};
