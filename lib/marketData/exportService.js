const ExcelJS = require("exceljs");
const { fetchUsdTwdFallback } = require("./fetchFallback");
const { fetchYahooHistory } = require("./fetchYahoo");
const { logMarket } = require("./logger");
const { materials } = require("./materials");

const PERIODS = Object.freeze({
  "1y": { label: "近 1 年", years: 1, yahooRange: "1y" },
  "2y": { label: "近 2 年", years: 2, yahooRange: "2y" },
  "3y": { label: "近 3 年", years: 3, yahooRange: "3y" },
});

function getPeriod(period) {
  const value = PERIODS[period];
  if (!value) {
    const error = new Error("資料期間錯誤，僅支援 1y、2y、3y");
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function findMaterial(symbol) {
  const normalized = String(symbol || "").trim().toLowerCase();
  const material = materials.find((item) => item.symbol.toLowerCase() === normalized || item.id.toLowerCase() === normalized || item.name.toLowerCase() === normalized);
  if (!material) {
    const error = new Error("原物料代碼錯誤，找不到指定原物料");
    error.statusCode = 400;
    throw error;
  }
  return material;
}

function dateSpanDays(rows) {
  if (rows.length < 2) return 0;
  return (new Date(rows[rows.length - 1].date) - new Date(rows[0].date)) / 86400000;
}

function isDataInsufficient(rows, period) {
  return rows.length < 30 || dateSpanDays(rows) < period.years * 365 * 0.65;
}

function nearestFxRate(fxByDate, date) {
  if (fxByDate.has(date)) return fxByDate.get(date);
  const dates = [...fxByDate.keys()].filter((item) => item <= date).sort();
  if (dates.length) return fxByDate.get(dates[dates.length - 1]);
  const allDates = [...fxByDate.keys()].sort();
  return allDates.length ? fxByDate.get(allDates[0]) : null;
}

function addPriceCalculations(material, priceRows, fxRows, source, fxSource) {
  const fxByDate = new Map(fxRows.map((row) => [row.date, row.close]));
  return priceRows.map((row, index) => {
    const previousClose = index > 0 ? priceRows[index - 1].close : null;
    const change = typeof previousClose === "number" ? row.close - previousClose : null;
    const changePercent = typeof change === "number" && previousClose ? change / previousClose : null;
    const fxRate = nearestFxRate(fxByDate, row.date);
    return {
      date: row.date,
      materialName: material.name,
      symbol: material.symbol,
      category: material.category,
      close: row.close,
      change,
      changePercent,
      fxRate,
      twdEstimate: typeof fxRate === "number" ? row.close * (material.usdFactor || 1) * fxRate : null,
      source: `【API資料】${source}｜USD/TWD: ${fxSource}`,
    };
  });
}

function groupBy(rows, keyFn) {
  return rows.reduce((groups, row) => {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
    return groups;
  }, new Map());
}

function analyzePeriod(rows, keyFn) {
  return [...groupBy(rows, keyFn)].map(([key, group]) => {
    const closes = group.map((row) => row.close).filter(Number.isFinite);
    const twdValues = group.map((row) => row.twdEstimate).filter(Number.isFinite);
    const first = group[0]?.close;
    const last = group[group.length - 1]?.close;
    return {
      key,
      average: closes.reduce((sum, value) => sum + value, 0) / closes.length,
      high: Math.max(...closes),
      low: Math.min(...closes),
      changePercent: typeof first === "number" && typeof last === "number" && first ? (last - first) / first : null,
      twdAverage: twdValues.length ? twdValues.reduce((sum, value) => sum + value, 0) / twdValues.length : null,
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

function buildDecision(material, rows, period, insufficient) {
  const closes = rows.map((row) => row.close).filter(Number.isFinite);
  if (!closes.length) {
    return { material: material.name, currentRange: "資料不足", threeYearRange: "資料不足", position: "資料不足", signal: "穩定", action: "等待資料恢復後再判斷", risk: "沒有足夠歷史行情可分析。" };
  }
  const current = closes[closes.length - 1];
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const position = high === low ? 0.5 : (current - low) / (high - low);
  const latestChange = rows[rows.length - 1]?.changePercent ?? 0;
  let signal = "建議觀望";
  let action = "先觀察下一輪供應商報價";
  const risk = insufficient ? `${period.label}歷史資料不足，趨勢判斷需保守。` : "公開期貨行情不等於供應商現貨報價。";
  if (position >= 0.85 || latestChange >= 0.05) { signal = "高風險"; action = "暫緩追價，先確認合約價與替代料"; }
  else if (position >= 0.7 || latestChange >= 0.02) { signal = "成本上升"; action = "確認供應商報價有效期，避免一次性大量買高"; }
  else if (latestChange <= -0.04) { signal = "成本下降"; action = "追蹤供應商是否同步反映行情下跌"; }
  else if (position <= 0.3 || latestChange <= -0.02) { signal = "可議價"; action = "要求供應商依行情下修報價"; }
  else if ((high - low) / current > 0.25) { signal = "建議分批採購"; action = "分批下單，降低短期波動風險"; }
  else { signal = "穩定"; action = "維持正常採購節奏"; }
  return { material: material.name, currentRange: current.toLocaleString("zh-TW", { maximumFractionDigits: 4 }), threeYearRange: `${low.toLocaleString("zh-TW", { maximumFractionDigits: 4 })} ~ ${high.toLocaleString("zh-TW", { maximumFractionDigits: 4 })}`, position: `${Math.round(position * 100)}%`, signal, action, risk };
}

function styleWorksheet(worksheet) {
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.columns.forEach((column) => {
    let width = 10;
    column.eachCell({ includeEmpty: true }, (cell) => {
      width = Math.max(width, String(cell.value ?? "").length + 2);
      if (typeof cell.value === "number") cell.numFmt = "#,##0.00";
    });
    column.width = Math.min(width, 32);
  });
}

function setPercentFormat(worksheet, columnKeys) { for (const key of columnKeys) worksheet.getColumn(key).numFmt = "0.00%"; }
function addRows(worksheet, columns, rows) { worksheet.columns = columns; worksheet.addRows(rows); styleWorksheet(worksheet); }

async function getFxRows(period) {
  try {
    const result = await fetchYahooHistory("TWD=X", period.yahooRange, "1d");
    if (!result.rows.length) throw new Error("USD/TWD history empty");
    return { rows: result.rows, source: "Yahoo Finance 歷史匯率" };
  } catch (error) {
    try {
      const fallback = await fetchUsdTwdFallback();
      await logMarket("export_fx_fallback", { error: error.message, source: fallback.source });
      return { rows: [{ date: new Date(fallback.quote.lastTradeAt || new Date()).toISOString().slice(0, 10), close: fallback.quote.rate }], source: `備援即期匯率 ${fallback.source}` };
    } catch (fallbackError) {
      await logMarket("export_fx_failed", { error: `${error.message}; ${fallbackError.message}` });
      const wrapped = new Error(`匯率抓不到：${error.message}; ${fallbackError.message}`);
      wrapped.statusCode = 502;
      throw wrapped;
    }
  }
}

async function getHistoricalRows(material, period, fxRows) {
  try {
    const result = await fetchYahooHistory(material.symbol, period.yahooRange, "1d");
    if (!result.rows.length) throw new Error("沒有歷史行情資料");
    return { material, rows: addPriceCalculations(material, result.rows, fxRows.rows, result.source, fxRows.source), insufficient: isDataInsufficient(result.rows, period), source: result.source };
  } catch (error) {
    await logMarket("export_history_failed", { symbol: material.symbol, error: error.message });
    return { material, rows: [], insufficient: true, error: error.message };
  }
}

function buildWorkbook(dataset, period) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "raw-material-market-dashboard";
  workbook.created = new Date();
  const allRows = dataset.flatMap((item) => item.rows);
  const allDecisions = dataset.map((item) => buildDecision(item.material, item.rows, period, item.insufficient));
  const detail = workbook.addWorksheet("歷史行情明細");
  addRows(detail, [{ header: "日期", key: "date" }, { header: "原物料名稱", key: "materialName" }, { header: "代碼", key: "symbol" }, { header: "分類", key: "category" }, { header: "收盤價", key: "close" }, { header: "漲跌", key: "change" }, { header: "漲跌幅", key: "changePercent" }, { header: "USD/TWD", key: "fxRate" }, { header: "台幣估算", key: "twdEstimate" }, { header: "資料來源", key: "source" }], allRows);
  setPercentFormat(detail, ["changePercent"]);
  const monthly = workbook.addWorksheet("月均價分析");
  addRows(monthly, [{ header: "原物料", key: "materialName" }, { header: "代碼", key: "symbol" }, { header: "年月", key: "month" }, { header: "月均價", key: "average" }, { header: "月最高價", key: "high" }, { header: "月最低價", key: "low" }, { header: "月漲跌幅", key: "changePercent" }, { header: "台幣月均價", key: "twdAverage" }], dataset.flatMap((item) => analyzePeriod(item.rows, (row) => row.date.slice(0, 7)).map((row) => ({ materialName: item.material.name, symbol: item.material.symbol, month: row.key, average: row.average, high: row.high, low: row.low, changePercent: row.changePercent, twdAverage: row.twdAverage }))));
  setPercentFormat(monthly, ["changePercent"]);
  const yearly = workbook.addWorksheet("年度比較");
  const yearlyRows = dataset.flatMap((item) => { const rows = analyzePeriod(item.rows, (row) => row.date.slice(0, 4)); return rows.map((row, index) => ({ materialName: item.material.name, symbol: item.material.symbol, year: row.key, average: row.average, high: row.high, low: row.low, changePercent: row.changePercent, yearOverYear: index > 0 && rows[index - 1].average ? (row.average - rows[index - 1].average) / rows[index - 1].average : null })); });
  addRows(yearly, [{ header: "原物料", key: "materialName" }, { header: "代碼", key: "symbol" }, { header: "年度", key: "year" }, { header: "年均價", key: "average" }, { header: "年最高價", key: "high" }, { header: "年最低價", key: "low" }, { header: "年漲跌幅", key: "changePercent" }, { header: "相較去年變化", key: "yearOverYear" }], yearlyRows);
  setPercentFormat(yearly, ["changePercent", "yearOverYear"]);
  const decision = workbook.addWorksheet("採購決策建議");
  addRows(decision, [{ header: "原物料", key: "material" }, { header: "目前價格區間", key: "currentRange" }, { header: "近 3 年高低區間", key: "threeYearRange" }, { header: "目前位階", key: "position" }, { header: "採購訊號", key: "signal" }, { header: "建議動作", key: "action" }, { header: "風險說明", key: "risk" }], allDecisions);
  const missing = dataset.filter((item) => item.error || item.insufficient);
  if (missing.length) addRows(workbook.addWorksheet("資料狀態"), [{ header: "原物料", key: "material" }, { header: "狀態", key: "status" }, { header: "說明", key: "message" }], missing.map((item) => ({ material: item.material.name, status: item.error ? "匯出失敗" : "資料不足", message: item.error || `${period.label}資料不足，Excel 已依可取得資料計算。` })));
  return workbook;
}

async function createHistoricalWorkbook({ symbol, period: periodInput, all = false }) {
  const period = getPeriod(periodInput);
  const selectedMaterials = all ? materials : [findMaterial(symbol)];
  const fxRows = await getFxRows(period);
  const dataset = await Promise.all(selectedMaterials.map((material) => getHistoricalRows(material, period, fxRows)));
  if (!dataset.some((item) => item.rows.length)) { const error = new Error("API 沒資料，無法匯出 Excel"); error.statusCode = 502; throw error; }
  const workbook = buildWorkbook(dataset, period);
  return { buffer: await workbook.xlsx.writeBuffer(), filename: all ? `all-raw-materials-${periodInput}.xlsx` : `${selectedMaterials[0].id}-${periodInput}.xlsx` };
}

async function createHistoryPayload({ symbol, period: periodInput }) {
  const period = getPeriod(periodInput);
  const material = findMaterial(symbol);
  const fxRows = await getFxRows(period);
  const dataset = await getHistoricalRows(material, period, fxRows);
  if (!dataset.rows.length) { const error = new Error(`API 沒資料：${dataset.error || "沒有歷史行情資料"}`); error.statusCode = 502; throw error; }
  return { state: dataset.insufficient ? "STALE" : "OK", sourceLabel: "【API資料】", dataWarning: dataset.insufficient ? "【資料不足】" : "", generatedAt: new Date().toISOString(), period: { value: periodInput, label: period.label, years: period.years }, material: { id: material.id, name: material.name, symbol: material.symbol, category: material.category, unit: material.unit, usage: material.usage }, source: dataset.source || `Yahoo Finance - ${material.symbol}`, insufficient: dataset.insufficient, rows: dataset.rows, monthly: analyzePeriod(dataset.rows, (row) => row.date.slice(0, 7)), yearly: analyzePeriod(dataset.rows, (row) => row.date.slice(0, 4)), decision: buildDecision(material, dataset.rows, period, dataset.insufficient) };
}

module.exports = { createHistoryPayload, createHistoricalWorkbook, findMaterial, getPeriod };
