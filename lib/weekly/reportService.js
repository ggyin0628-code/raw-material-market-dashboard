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

function observationSummary(indicator) {
  const latest = indicator.latestObservation;
  return {
    value: latest?.marketPrice ?? null,
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

function indicatorRowHtml(indicator) {
  return `<tr><td><strong>${escapeHtml(indicator.materialName)}</strong><br><small>${escapeHtml(indicator.symbol)}</small></td><td>${escapeHtml(indicator.sourceUnit)}</td><td>${escapeHtml(displayStatus(indicator.latestObservation.status))}</td><td>${escapeHtml(displayPrice(indicator.latestObservation.value))}</td><td>${escapeHtml(displayValue(indicator.weeklyChangePct, "%"))}</td><td>${escapeHtml(displayValue(indicator.fourWeekChangePct, "%"))}</td><td><strong>${escapeHtml(indicator.signal)}</strong><br><small>${escapeHtml(indicator.reason)}</small></td></tr>`;
}

function summaryListHtml(title, items, valueKey) {
  const body = items.length ? items.map((item) => `<li><strong>${escapeHtml(item.materialName)}</strong> ${escapeHtml(displayValue(item[valueKey], "%"))}</li>`).join("") : "<li>目前沒有足夠資料。</li>";
  return `<section class="summary-card"><h2>${escapeHtml(title)}</h2><ul>${body}</ul></section>`;
}

function renderWeeklyHtml(report, options = {}) {
  const title = options.title || `採購市場情報週報｜${report.reportingWeek}`;
  const warningItems = report.marketSummary.dataQualityWarnings.length
    ? report.marketSummary.dataQualityWarnings.map((item) => `<li><strong>${escapeHtml(item.materialName)}</strong>：${escapeHtml(item.signal)}（${escapeHtml(item.reason || "資料品質需注意")})</li>`).join("")
    : "<li>目前沒有資料品質警示。</li>";
  const priority = report.indicators.filter((item) => ["HIGH_VOLATILITY", "COST_PRESSURE_RISING", "MARKET_WEAKENING"].includes(item.signal)).slice(0, 4);
  const visuals = priority.length ? `<section><h2>優先指標趨勢</h2><div class="visual-grid">${priority.map((item) => `<article><h3>${escapeHtml(item.materialName)}</h3>${renderTrendSvg(item)}</article>`).join("")}</div></section>` : "";
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#f1f5f9;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif;line-height:1.55}.wrap{max-width:1120px;margin:0 auto;padding:28px 18px}.header{background:#0f766e;color:#fff;padding:26px;border-radius:18px}.header h1{margin:0 0 8px;font-size:28px}.header p{margin:4px 0;color:#d7fffa}.summary-grid,.visual-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0}.summary-card,section,article{background:#fff;border:1px solid #dbe4ee;border-radius:14px;padding:16px}.summary-card h2,section h2{margin:0 0 8px;font-size:18px;color:#0f766e}.summary-card ul{margin:0;padding-left:20px}.warning{border-left:5px solid #b45309}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;min-width:920px;background:#fff}th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}th{background:#ecfeff;color:#115e59}.note{background:#fffbeb;border:1px solid #fcd34d;padding:14px;border-radius:12px}.small,small{color:#64748b}.trend{width:100%;height:auto;background:#f8fafc;border-radius:10px}.trend-empty{padding:28px;color:#64748b;background:#f8fafc;border-radius:10px}@media(max-width:700px){.summary-grid,.visual-grid{grid-template-columns:1fr}.wrap{padding:16px 10px}.header h1{font-size:23px}}</style></head><body><main class="wrap"><header class="header"><h1>${escapeHtml(title)}</h1><p>報告期間：${escapeHtml(report.reportingPeriod.start)} ～ ${escapeHtml(report.reportingPeriod.end)}（${escapeHtml(TIMEZONE)}）</p><p>產生時間：${escapeHtml(report.generatedAt)}</p></header><div class="note"><strong>公開市場參考資訊</strong><br>${escapeHtml(report.purchasingReferenceNote)}<br>${escapeHtml(report.disclaimer)}</div><div class="summary-grid">${summaryListHtml("本週主要上升", report.marketSummary.biggestRisers, "weeklyChangePct")}${summaryListHtml("本週主要下降", report.marketSummary.biggestDecliners, "weeklyChangePct")}<section class="summary-card"><h2>高波動指標</h2><ul>${report.marketSummary.highVolatility.length ? report.marketSummary.highVolatility.map((item) => `<li><strong>${escapeHtml(item.materialName)}</strong> ${escapeHtml(displayValue(item.weeklyChangePct, "%"))}，${escapeHtml(item.reason || "")}</li>`).join("") : "<li>目前沒有跨越波動參考門檻的指標。</li>"}</ul></section><section class="summary-card warning"><h2>資料品質警示</h2><ul>${warningItems}</ul></section></div>${visuals}<section><h2>主要指標明細</h2><div class="table-wrap"><table><thead><tr><th>指標</th><th>來源單位</th><th>資料狀態</th><th>最新值</th><th>近一週</th><th>近四週</th><th>外部市場訊號與原因</th></tr></thead><tbody>${report.indicators.map(indicatorRowHtml).join("")}</tbody></table></div></section><p class="small">${escapeHtml(report.purchasingReferenceNote)}</p></main></body></html>`;
}

function styleWorksheet(worksheet) {
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.columns.forEach((column) => {
    let width = 12;
    column.eachCell({ includeEmpty: true }, (cell) => { width = Math.max(width, String(cell.value ?? "").length + 2); });
    column.width = Math.min(width, 36);
  });
}

function addSheet(worksheet, columns, rows) {
  worksheet.columns = columns;
  worksheet.addRows(rows);
  styleWorksheet(worksheet);
}

function createWeeklyWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "raw-material-market-dashboard";
  workbook.created = new Date(report.generatedAt);
  const summary = workbook.addWorksheet("本週摘要");
  addSheet(summary, [{ header: "項目", key: "item" }, { header: "內容", key: "content" }], [
    { item: "報告週期", content: `${report.reportingWeek}｜${report.reportingPeriod.start}～${report.reportingPeriod.end}` },
    { item: "產生時間", content: report.generatedAt },
    { item: "時區", content: TIMEZONE },
    { item: "主要上升", content: report.marketSummary.biggestRisers.map((item) => `${item.materialName} ${displayValue(item.weeklyChangePct, "%")}`).join("；") || "無足夠資料" },
    { item: "主要下降", content: report.marketSummary.biggestDecliners.map((item) => `${item.materialName} ${displayValue(item.weeklyChangePct, "%")}`).join("；") || "無足夠資料" },
    { item: "高波動", content: report.marketSummary.highVolatility.map((item) => item.materialName).join("、") || "無" },
    { item: "資料品質警示", content: report.marketSummary.dataQualityWarnings.map((item) => `${item.materialName}：${item.signal}`).join("；") || "無" },
    { item: "公開資料聲明", content: report.disclaimer },
    { item: "採購參考說明", content: report.purchasingReferenceNote },
  ]);
  const detail = workbook.addWorksheet("市場明細");
  addSheet(detail, [
    { header: "材料", key: "material" }, { header: "代碼", key: "symbol" }, { header: "分類", key: "category" }, { header: "來源單位", key: "unit" }, { header: "最新值", key: "current" }, { header: "近一週%", key: "weekly" }, { header: "近四週%", key: "fourWeek" }, { header: "近三個月%", key: "threeMonth" }, { header: "YTD%", key: "ytd" }, { header: "52週%", key: "fiftyTwoWeek" }, { header: "週高", key: "high" }, { header: "週低", key: "low" }, { header: "週區間%", key: "range" }, { header: "滾動波動%", key: "volatility" }, { header: "訊號", key: "signal" }, { header: "原因代碼", key: "reasonCodes" }, { header: "原因", key: "reason" }, { header: "資料狀態", key: "status" }, { header: "資料來源", key: "source" }, { header: "最後交易時間", key: "lastTrade" }, { header: "收集時間", key: "collectedAt" },
  ], report.indicators.map((item) => ({ material: item.materialName, symbol: item.symbol, category: item.category, unit: item.sourceUnit, current: item.latestObservation.value, weekly: item.weeklyChangePct == null ? null : item.weeklyChangePct / 100, fourWeek: item.fourWeekChangePct == null ? null : item.fourWeekChangePct / 100, threeMonth: item.threeMonthChangePct == null ? null : item.threeMonthChangePct / 100, ytd: item.ytdChangePct == null ? null : item.ytdChangePct / 100, fiftyTwoWeek: item.fiftyTwoWeekChangePct == null ? null : item.fiftyTwoWeekChangePct / 100, high: item.weeklyHigh, low: item.weeklyLow, range: item.weeklyRangePct == null ? null : item.weeklyRangePct / 100, volatility: item.rollingVolatilityPct == null ? null : item.rollingVolatilityPct / 100, signal: item.signal, reasonCodes: (item.reasonCodes || []).join(", "), reason: item.reason, status: item.latestObservation.status, source: item.latestObservation.source, lastTrade: item.latestObservation.lastTradeTimestamp, collectedAt: item.latestObservation.collectedAt })));
  for (const key of ["weekly", "fourWeek", "threeMonth", "ytd", "fiftyTwoWeek", "range", "volatility"]) detail.getColumn(key).numFmt = "0.00%";
  const history = workbook.addWorksheet("歷史資料");
  addSheet(history, [{ header: "日期", key: "date" }, { header: "材料", key: "material" }, { header: "代碼", key: "symbol" }, { header: "價格", key: "price" }, { header: "來源單位", key: "unit" }, { header: "幣別", key: "currency" }, { header: "USD/TWD", key: "fx" }, { header: "TWD市場參考值", key: "twd" }, { header: "狀態", key: "status" }, { header: "來源", key: "source" }, { header: "最後交易時間", key: "lastTrade" }, { header: "收集時間", key: "collectedAt" }], report.historyRows.filter((row) => row.materialId !== "__fx_usd_twd__").map((row) => ({ date: row.date, material: row.materialName, symbol: row.symbol, price: row.marketPrice, unit: row.sourceUnit, currency: row.currency, fx: row.usdTwdRate, twd: row.twdReferenceValue, status: row.status, source: row.source, lastTrade: row.lastTradeTimestamp, collectedAt: row.collectedAt })));
  const sources = workbook.addWorksheet("資料來源與說明");
  addSheet(sources, [{ header: "項目", key: "item" }, { header: "說明", key: "content" }], [
    { item: "主要行情來源", content: "Yahoo Finance Chart API；依固定公開 host allowlist 取得。" },
    { item: "行情備援", content: "只使用 material registry 明確配置的 Stooq symbol；無 fallback 時保持 API_ERROR／STALE。" },
    { item: "歷史備援", content: "Yahoo direct history 失敗後可使用固定 Jina public proxy；保留來源標籤。" },
    { item: "FX來源", content: "Yahoo Finance TWD=X primary；open.er-api.com fallback。" },
    { item: "狀態", content: "LIVE、FALLBACK、STALE、NO_DATA、API_ERROR；STALE／API_ERROR 不算 fresh observation。" },
    { item: "單位", content: "原始 source unit 與 currency 必須與轉換後 TWD market-reference value 一起閱讀。" },
    { item: "報告時區", content: TIMEZONE },
    { item: "重要限制", content: report.disclaimer },
    { item: "採購參考邊界", content: report.purchasingReferenceNote },
  ]);
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
  escapeHtml,
  displayValue,
  buildWeeklyReport,
  renderTrendSvg,
  renderWeeklyHtml,
  createWeeklyWorkbook,
  writeWeeklyReportFiles,
  loadAndBuildWeeklyReport,
};
