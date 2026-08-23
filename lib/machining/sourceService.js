const { URL } = require("node:url");
const { materials } = require("../marketData/materials");
const { listPublicObservations, upsertPublicObservations } = require("./publicObservationStore");

const DGBAS_PPI_QUERY_PAGE = "https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?funid=A030701015&sys=210";
const DGBAS_WAGE_QUERY_PAGE = "https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?sys=210&funid=A046301010";
const DGBAS_PPI_FIELD_COUNT = 100;
const DGBAS_PPI_FIELD_POSITIONS = Object.freeze({ total: 1, manufacturing: 19, basicMetals: 56, machinery: 84, utility: 98 });
const DGBAS_WAGE_FIELD_COUNT = 46;
const DGBAS_WAGE_MANUFACTURING_POSITION = 4;
const CBC_PRIMARY_ENDPOINT = "https://www.cbc.gov.tw/en/lp-700-2-1-60.html";
const CBC_SECONDARY_ENDPOINT = "https://www.cbc.gov.tw/en/lp-700-2.html";
const STATUS_VALUES = Object.freeze(["LIVE", "FALLBACK", "STALE", "API_ERROR", "NO_DATA"]);

const SOURCE_CATALOG = Object.freeze({
  dgbasPpi: {
    sourceId: "tw-dgbas-ppi-basic",
    sourceName: "DGBAS／政府資料開放平臺：生產者物價基本分類指數",
    url: "https://data.gov.tw/en/datasets/148439",
    endpoint: "https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230534/pr0701a1m.xml",
    fallbackEndpoint: DGBAS_PPI_QUERY_PAGE,
    geographicScope: "Taiwan",
    updateFrequency: "每月",
    frequency: "monthly",
    unit: "指數（民國110年=100）",
    accessConstraints: "免費；Open Government Data License, version 1.0；官方 XML／統計查詢 CSV 公開下載。",
    defaultStatus: "LIVE",
    note: "優先使用官方基本分類 XML；若 XML 傳輸或解析失敗，改用官方統計查詢 CSV，不解讀為加工報價。",
  },
  dgbasWage: {
    sourceId: "tw-dgbas-wage-manufacturing",
    sourceName: "DGBAS／政府資料開放平臺：製造業每人每月經常性薪資",
    url: "https://data.gov.tw/en/datasets/9663",
    endpoint: "https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230037/mp05002.xml",
    fallbackEndpoint: DGBAS_WAGE_QUERY_PAGE,
    geographicScope: "Taiwan",
    updateFrequency: "月資料；資料集 metadata 標示每年一月更新",
    frequency: "monthly",
    unit: "新臺幣元／人／月",
    accessConstraints: "免費；Open Government Data License, version 1.0；官方 XML／統計查詢 CSV 公開下載。",
    defaultStatus: "LIVE",
    note: "製造業月資料可作低頻勞動成本方向；比較窗口使用月，不硬轉成週資料。",
  },
  cbcFx: {
    sourceId: "tw-cbc-ntd-usd-close",
    sourceName: "中央銀行：NT$/US$ Closing Rate",
    url: "https://www.cbc.gov.tw/en/lp-700-2.html",
    endpoint: CBC_PRIMARY_ENDPOINT,
    fallbackEndpoint: CBC_SECONDARY_ENDPOINT,
    geographicScope: "Taiwan official NTD/USD",
    updateFrequency: "營業日",
    frequency: "daily",
    unit: "NTD／USD",
    accessConstraints: "官方公開 HTML 歷史清單；60 筆分頁優先，20 筆首頁作次要備援；需遵守來源網站使用條款。",
    defaultStatus: "LIVE",
    note: "匯率壓力是外幣投入成本方向參考，不是任何供應商的換匯或報價條件。",
  },
  taipowerTariff: {
    sourceId: "tw-taipower-rate-schedule",
    sourceName: "台灣電力公司：各類電價表及計算範例",
    url: "https://data.gov.tw/dataset/17060",
    endpoint: "https://service.taipower.com.tw/data/opendata/apply/file/d007008/001.json",
    geographicScope: "Taiwan electricity tariffs",
    updateFrequency: "修訂／事件驅動；官方 metadata 標示不定期更新",
    frequency: "structural",
    unit: "依電價表級距而定",
    accessConstraints: "官方 JSON 公開下載；需人工確認電壓、契約與時段適用性；不自動推導供應商加工報價。",
    defaultStatus: "NO_DATA",
    note: "作為低頻結構性電力成本來源；不產生週變化或未指定用電類別的單一價格。",
  },
});

const RAW_MATERIAL_SOURCE = Object.freeze({
  sourceName: "Yahoo Finance 公開圖表資料（既有原物料來源）",
  geographicScope: "國際公開期貨／市場指標",
  updateFrequency: "交易日／市場資料可得時",
  frequency: "daily",
  unit: "依指標而定",
  accessConstraints: "公開圖表端點；可用性、授權與符號內容可能變更；不得視為台灣現貨。",
});

function materialById(id) {
  return materials.find((material) => material.id === id) || null;
}

function sourceForMaterial(material, sourceName, status, lastObservationDate, note = "", fetchedAt = null) {
  const source = material?.stooqSymbol && sourceName.includes("Stooq")
    ? `https://stooq.com/q/?s=${encodeURIComponent(material.stooqSymbol.toLowerCase())}`
    : `https://finance.yahoo.com/quote/${encodeURIComponent(material?.symbol || "")}`;
  return {
    sourceId: `raw-${material?.id || "unknown"}`,
    sourceName,
    url: source,
    endpoint: source,
    geographicScope: RAW_MATERIAL_SOURCE.geographicScope,
    updateFrequency: RAW_MATERIAL_SOURCE.updateFrequency,
    frequency: RAW_MATERIAL_SOURCE.frequency,
    unit: material?.unit || RAW_MATERIAL_SOURCE.unit,
    accessConstraints: RAW_MATERIAL_SOURCE.accessConstraints,
    status,
    lastObservationDate,
    fetchedAt,
    note: note || `既有公開原物料指標 ${material?.name || material?.id || ""}；只作投入成本方向參考。`,
  };
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 45000);
  try {
    const response = await fetch(url, {
      headers: { accept: options.accept || "application/xml,text/csv,text/html,text/plain;q=0.9,*/*;q=0.8", "user-agent": "raw-material-dashboard-machining-reference/2.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value);
  return cells.map((cell) => cell.trim());
}

function parseCsv(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map(parseCsvLine);
}

function rocMonthToIso(value) {
  const text = String(value || "").replace(/[ⓇⓅ*]/g, "").trim();
  let match = text.match(/^(\d{3,4})年\s*(\d{1,2})月$/);
  if (match) {
    const year = Number(match[1]) < 1911 ? Number(match[1]) + 1911 : Number(match[1]);
    return `${year}-${String(Number(match[2])).padStart(2, "0")}-01`;
  }
  match = text.match(/^(\d{4})(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-01`;
  match = text.match(/^(\d{4})[-/]?(\d{1,2})[-/]?(\d{1,2})?$/);
  if (match && match[3]) return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
  return null;
}

function parseDgbasPpiXml(xml, match) {
  const rows = [];
  const pattern = /<Obs>\s*<Item>([^<]*)<\/Item>\s*<TIME_PERIOD>([^<]*)<\/TIME_PERIOD>\s*<FREQ>([^<]*)<\/FREQ>\s*<TYPE>([^<]*)<\/TYPE>\s*<Item_VALUE>([^<]*)<\/Item_VALUE>\s*<\/Obs>/g;
  for (const found of String(xml || "").matchAll(pattern)) {
    const [, item, period, frequency, type, rawValue] = found;
    if (type !== "原始值" || !match(item) || frequency !== "M") continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || !/^\d{4}M\d{2}$/.test(period)) continue;
    rows.push({ date: `${period.slice(0, 4)}-${period.slice(5, 7)}-01`, value });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function parseDgbasPpiCsv(csv, match) {
  const rows = parseCsv(csv);
  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.replace(/^\uFEFF/, "") === "統計期"));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((cell) => cell.replace(/^\uFEFF/, ""));
  const selectedIndexes = headers.map((header, index) => ({ header, index })).filter(({ header }) => match(header));
  const history = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const date = rocMonthToIso(row[0]);
    if (!date) continue;
    for (const { index } of selectedIndexes) {
      const value = Number(String(row[index] || "").replace(/,/g, ""));
      if (Number.isFinite(value)) history.push({ date, value });
    }
  }
  return history.sort((a, b) => a.date.localeCompare(b.date));
}

function parseDgbasPpi(text, match) {
  return /<Obs>/.test(String(text || "")) ? parseDgbasPpiXml(text, match) : parseDgbasPpiCsv(text, match);
}

function parseDgbasWageRecords(xml) {
  const rows = [];
  const recordPattern = /<每人每月經常性薪資>([\s\S]*?)<\/每人每月經常性薪資>/g;
  for (const found of String(xml || "").matchAll(recordPattern)) {
    const block = found[1];
    const period = block.match(/<年月別_Year_and_month>([^<]*)<\/年月別_Year_and_month>/)?.[1] || "";
    const rawValue = block.match(/<製造業_Manufacturing_金額_新臺幣元>([^<]*)<\/製造業_Manufacturing_金額_新臺幣元>/)?.[1] || "";
    const cleanPeriod = String(period).replace(/[ⓇⓅ*]/g, "").trim();
    const cleanValue = Number(String(rawValue).replace(/,/g, ""));
    let date = null;
    let frequency = "unknown";
    if (/^\d{6}$/.test(cleanPeriod)) {
      date = rocMonthToIso(cleanPeriod);
      frequency = "monthly";
    } else if (/^\d{4}$/.test(cleanPeriod)) {
      date = `${cleanPeriod}-12-31`;
      frequency = "annual";
    }
    if (date && Number.isFinite(cleanValue)) rows.push({ date, value: cleanValue, frequency });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function parseDgbasWageCsv(csv) {
  const rows = parseCsv(csv);
  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.replace(/^\uFEFF/, "") === "統計期"));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((cell) => cell.replace(/^\uFEFF/, ""));
  const manufacturingIndex = headers.findIndex((header) => header.includes("製造業"));
  if (manufacturingIndex < 0) return [];
  return rows.slice(headerIndex + 1).map((row) => ({ date: rocMonthToIso(row[0]), value: Number(String(row[manufacturingIndex] || "").replace(/,/g, "")), frequency: "monthly" })).filter((row) => row.date && Number.isFinite(row.value)).sort((a, b) => a.date.localeCompare(b.date));
}

function parseDgbasWage(xml) {
  return parseDgbasWageRecords(xml).map(({ date, value }) => ({ date, value }));
}

function parseCbcFx(html) {
  const text = String(html || "");
  const rows = [];
  const parse = (pattern) => {
    for (const found of text.matchAll(pattern)) {
      const [, rawDate, rawValue] = found;
      const [year, month, day] = rawDate.split("/");
      const value = Number(rawValue);
      if (Number.isFinite(value)) rows.push({ date: `${year}-${month}-${day}`, value });
    }
  };
  parse(/<tr[^>]*>[\s\S]*?<td[^>]*data-th=["']Date["'][^>]*>[\s\S]*?<span[^>]*>\s*(\d{4}\/\d{1,2}\/\d{1,2})\s*<\/span>[\s\S]*?<\/td>[\s\S]*?<td[^>]*data-th=["']NTD\/?USD["'][^>]*>[\s\S]*?<span[^>]*>\s*([\d.]+)\s*<\/span>[\s\S]*?<\/td>[\s\S]*?<\/tr>/gi);
  if (!rows.length) parse(/<tr[^>]*>\s*<td[^>]*>\s*(\d{4}\/\d{1,2}\/\d{1,2})\s*<\/td>\s*<td[^>]*>\s*([\d.]+)\s*<\/td>\s*<\/tr>/gi);
  return [...new Map(rows.map((row) => [row.date, row])).values()].sort((a, b) => a.date.localeCompare(b.date));
}

function freshnessStatus(lastObservationDate, now, staleAfterDays) {
  const latest = new Date(lastObservationDate);
  const current = new Date(now || new Date());
  if (Number.isNaN(latest.getTime()) || Number.isNaN(current.getTime())) return "API_ERROR";
  return current.getTime() - latest.getTime() > staleAfterDays * 86400000 ? "STALE" : "LIVE";
}

function sourceRecord(catalog, status, lastObservationDate, note = "", endpoint = catalog.endpoint, fetchedAt = null, overrides = {}) {
  return {
    sourceId: catalog.sourceId,
    sourceName: catalog.sourceName,
    url: catalog.url,
    endpoint: endpoint || catalog.endpoint || catalog.url,
    geographicScope: catalog.geographicScope,
    updateFrequency: catalog.updateFrequency,
    frequency: catalog.frequency || "unknown",
    unit: catalog.unit,
    accessConstraints: catalog.accessConstraints,
    status,
    lastObservationDate,
    fetchedAt,
    note: note || catalog.note,
    ...overrides,
  };
}

function rocNowParts(now = new Date()) {
  const date = new Date(now);
  const year = date.getUTCFullYear() - 1911;
  const month = date.getUTCMonth() + 1;
  return { year, month };
}

function buildDgbasPpiQueryEndpoint(now = new Date()) {
  const { year, month } = rocNowParts(now);
  const startYear = Math.max(1, year - 5);
  const selected = new Set(Object.values(DGBAS_PPI_FIELD_POSITIONS));
  const fldlst = Array.from({ length: DGBAS_PPI_FIELD_COUNT }, (_, index) => selected.has(index + 1) ? "1" : "0").join("");
  const params = new URLSearchParams({ sys: "220", funid: "A030701015", outmode: "3", ym: `${String(startYear).padStart(3, "0")}01`, ymt: `${String(year).padStart(3, "0")}${String(month).padStart(2, "0")}`, cycle: "1", outkind: "0", compmode: "0", ratenm: "統計值", fldlst });
  return `https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?${params.toString()}`;
}

function buildDgbasWageQueryEndpoint(now = new Date()) {
  const { year, month } = rocNowParts(now);
  const startYear = Math.max(1, year - 5);
  const fldlst = Array.from({ length: DGBAS_WAGE_FIELD_COUNT }, (_, index) => index + 1 === DGBAS_WAGE_MANUFACTURING_POSITION ? "1" : "0").join("");
  const params = new URLSearchParams({ sys: "220", funid: "A046301010", outmode: "3", ym: `${String(startYear).padStart(3, "0")}01`, ymt: `${String(year).padStart(3, "0")}${String(month).padStart(2, "0")}`, cycle: "1", outkind: "0", compmode: "0", ratenm: "統計值", fldlst, codlst0: "100" });
  return `https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?${params.toString()}`;
}

async function getDgbasPpiBundle({ now = new Date(), fetcher = fetchText } = {}) {
  const source = SOURCE_CATALOG.dgbasPpi;
  const candidates = [
    { endpoint: source.endpoint, kind: "XML" },
    { endpoint: buildDgbasPpiQueryEndpoint(now), kind: "QUERY_CSV" },
  ];
  const definitions = [
    ["energy", (item) => item.startsWith("四.水電燃氣"), "energy"],
    ["manufacturing", (item) => item.startsWith("三.製造業產品"), "manufacturing"],
    ["machine-capital", (item) => item.startsWith("18.機械設備"), "machine"],
    ["basic-metals", (item) => item.startsWith("13.基本金屬"), "metal"],
  ];
  let lastError = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const text = await fetcher(candidate.endpoint, { timeoutMs: candidate.kind === "XML" ? 60000 : 30000, accept: candidate.kind === "XML" ? "application/xml,text/xml,*/*;q=0.8" : "text/csv,application/vnd.ms-excel,*/*;q=0.8" });
      const histories = Object.fromEntries(definitions.map(([id, match]) => [id, parseDgbasPpi(text, match)]));
      const missing = Object.entries(histories).filter(([, history]) => !history.length).map(([id]) => id);
      if (missing.length) throw new Error(`DGBAS PPI series missing: ${missing.join(",")}`);
      const status = index === 0 ? freshnessStatus(histories.manufacturing.at(-1).date, now, 62) : (freshnessStatus(histories.manufacturing.at(-1).date, now, 62) === "STALE" ? "STALE" : "FALLBACK");
      const result = {};
      for (const [id, , suffix] of definitions) {
        const seriesSource = sourceRecord({ ...source, sourceId: `${source.sourceId}-${id}` }, status, histories[id].at(-1).date, `${candidate.kind === "QUERY_CSV" ? "XML 失敗後使用官方統計查詢 CSV；" : ""}${source.note}`, candidate.endpoint, new Date(now).toISOString(), { endpointKind: candidate.kind });
        result[`${suffix === "machine" ? "machinePpi" : suffix === "metal" ? "metalPpi" : `${suffix}Ppi`}`] = { history: histories[id], status, source: seriesSource, frequency: "monthly" };
      }
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  const failed = (id) => ({ history: [], status: "API_ERROR", source: sourceRecord({ ...source, sourceId: `${source.sourceId}-${id}` }, "API_ERROR", null, `官方 PPI XML 與查詢 CSV 均無法解析：${lastError?.message || "unknown error"}`, source.endpoint, new Date(now).toISOString()), frequency: "monthly" });
  return { energyPpi: failed("energy"), manufacturingPpi: failed("manufacturing"), machinePpi: failed("machine-capital"), metalPpi: failed("basic-metals") };
}

async function getWageObservations({ now = new Date(), fetcher = fetchText } = {}) {
  const source = SOURCE_CATALOG.dgbasWage;
  const candidates = [
    { endpoint: source.endpoint, kind: "XML" },
    { endpoint: buildDgbasWageQueryEndpoint(now), kind: "QUERY_CSV" },
  ];
  let lastError = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const text = await fetcher(candidate.endpoint, { timeoutMs: candidate.kind === "XML" ? 60000 : 30000, accept: candidate.kind === "XML" ? "application/xml,text/xml,*/*;q=0.8" : "text/csv,application/vnd.ms-excel,*/*;q=0.8" });
      const records = candidate.kind === "XML" ? parseDgbasWageRecords(text) : parseDgbasWageCsv(text);
      if (!records.length) throw new Error("DGBAS wage series missing usable observations");
      const frequency = records.some((record) => record.frequency === "monthly") ? "monthly" : "annual";
      const history = records.map(({ date, value }) => ({ date, value }));
      const freshness = frequency === "monthly" ? freshnessStatus(history.at(-1).date, now, 75) : freshnessStatus(history.at(-1).date, now, 550);
      const status = freshness === "STALE" ? "STALE" : index === 0 ? "LIVE" : "FALLBACK";
      return { history, status, frequency, source: sourceRecord(source, status, history.at(-1).date, `${candidate.kind === "QUERY_CSV" ? "XML 失敗後使用官方製造業月資料查詢 CSV；" : ""}${source.note}`, candidate.endpoint, new Date(now).toISOString(), { frequency }) };
    } catch (error) {
      lastError = error;
    }
  }
  return { history: [], status: "API_ERROR", frequency: "monthly", source: sourceRecord(source, "API_ERROR", null, `官方薪資 XML 與製造業查詢 CSV 均無法解析：${lastError?.message || "unknown error"}`, source.endpoint, new Date(now).toISOString(), { frequency: "monthly" }) };
}

async function getCbcFxObservations({ now = new Date(), fetcher = fetchText } = {}) {
  const source = SOURCE_CATALOG.cbcFx;
  const candidates = [
    { endpoint: CBC_PRIMARY_ENDPOINT, kind: "PRIMARY_60" },
    { endpoint: CBC_SECONDARY_ENDPOINT, kind: "FALLBACK_20" },
  ];
  let lastError = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const html = await fetcher(candidate.endpoint, { timeoutMs: 30000, accept: "text/html,*/*;q=0.8" });
      const history = parseCbcFx(html);
      if (!history.length) throw new Error("CBC FX page missing usable observations");
      const freshness = freshnessStatus(history.at(-1).date, now, 7);
      const status = freshness === "STALE" ? "STALE" : index === 0 ? "LIVE" : "FALLBACK";
      return { history, status, frequency: "daily", source: sourceRecord(source, status, history.at(-1).date, `${index === 1 ? "60 筆官方分頁失敗後使用 20 筆官方首頁；" : ""}${source.note}`, candidate.endpoint, new Date(now).toISOString(), { frequency: "daily" }) };
    } catch (error) {
      lastError = error;
    }
  }
  return { history: [], status: "API_ERROR", frequency: "daily", source: sourceRecord(source, "API_ERROR", null, `CBC 官方 60 筆分頁與 20 筆首頁均無法解析：${lastError?.message || "unknown error"}`, CBC_PRIMARY_ENDPOINT, new Date(now).toISOString(), { frequency: "daily" }) };
}

async function getTaipowerTariffSource({ now = new Date(), fetcher = fetchText } = {}) {
  const source = SOURCE_CATALOG.taipowerTariff;
  try {
    const text = await fetcher(source.endpoint, { timeoutMs: 30000, accept: "application/json,text/plain,*/*;q=0.8" });
    const parsed = JSON.parse(text);
    const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed?.metadata?.["實施日期"] || "")) ? parsed.metadata["實施日期"] : null;
    if (!effectiveDate || !parsed?.data || typeof parsed.data !== "object") throw new Error("台電 tariff JSON 缺少 metadata/data");
    return { status: "LIVE", source: sourceRecord(source, "LIVE", effectiveDate, "官方 JSON 可讀；電價仍為結構性、事件驅動資料，不進入週變化分數。", source.endpoint, new Date(now).toISOString(), { frequency: "structural" }) };
  } catch (error) {
    return { status: "API_ERROR", source: sourceRecord(source, "API_ERROR", null, `官方 tariff JSON 無法解析：${error.message}；不回退到 PDF 數值解析。`, source.endpoint, new Date(now).toISOString(), { frequency: "structural" }) };
  }
}

async function getRawMaterialObservations(ids = ["copper", "aluminum", "steel-hrc"], now = new Date()) {
  const { fetchYahooHistory } = require("../marketData/fetchYahoo");
  const results = await Promise.all(ids.map(async (id) => {
    const material = materialById(id);
    if (!material) return { id, label: id, history: [], status: "NO_DATA", frequency: "daily", source: sourceForMaterial(null, "Yahoo Finance", "NO_DATA", null, "既有原物料 registry 找不到此指標。", new Date(now).toISOString()) };
    try {
      const result = await fetchYahooHistory(material.symbol, "6mo", "1d");
      const history = result.rows.map((row) => ({ date: row.date, value: row.close }));
      const status = history.length ? "LIVE" : "NO_DATA";
      return { id, label: material.name, history, status, frequency: "daily", source: sourceForMaterial(material, result.source, status, history.at(-1)?.date, "既有公開原物料指標；只作投入成本方向參考。", new Date(now).toISOString()) };
    } catch (error) {
      return { id, label: material.name, history: [], status: "API_ERROR", frequency: "daily", source: sourceForMaterial(material, material.source, "API_ERROR", null, `既有公開原物料來源無法取得：${error.message}`, new Date(now).toISOString()) };
    }
  }));
  return results;
}

function sourceToObservation(result, id, label, unit = result.source.unit, valueOverride = undefined) {
  return {
    id,
    label,
    history: result.history || [],
    value: valueOverride,
    status: result.status,
    frequency: result.frequency || result.source.frequency || "unknown",
    unit,
    sourceProvenance: result.source,
  };
}

async function recoverWithPersistence(result, seriesId, { now, storage = {} } = {}) {
  const list = storage.list || listPublicObservations;
  const upsert = storage.upsert || upsertPublicObservations;
  const sourceId = result.source.sourceId;
  let stored = [];
  try {
    stored = await list({ sourceId, seriesId, env: storage.env, storageConfig: storage.storageConfig, filePath: storage.filePath, pool: storage.pool });
  } catch {
    stored = [];
  }
  const fetchedRecords = (result.history || []).map((point) => ({ sourceId, seriesId, date: point.date, value: point.value, status: result.status, frequency: result.frequency || result.source.frequency || "unknown", sourceUrl: result.source.endpoint || result.source.url, fetchedAt: result.source.fetchedAt || new Date(now).toISOString(), provenance: result.source }));
  if (fetchedRecords.length) {
    try { await upsert(fetchedRecords, { env: storage.env, storageConfig: storage.storageConfig, filePath: storage.filePath, pool: storage.pool }); } catch { /* persistence is best-effort and must not erase public response */ }
  }
  const merged = new Map(stored.map((record) => [record.date, { date: record.date, value: record.value }]));
  for (const point of result.history || []) merged.set(point.date, point);
  if (!result.history?.length && stored.length) {
    const latestStored = stored.at(-1);
    const ageStatus = freshnessStatus(latestStored.date, now, result.frequency === "monthly" ? 75 : result.frequency === "annual" ? 550 : 7);
    result.history = stored.map((record) => ({ date: record.date, value: record.value }));
    result.status = ageStatus === "STALE" ? "STALE" : "FALLBACK";
    result.source = { ...result.source, status: result.status, lastObservationDate: latestStored.date, note: `${result.source.note} 目前即時來源失敗，使用已保存的公開觀測；狀態明確標示為 ${result.status}。` };
  } else if (merged.size > (result.history || []).length) {
    result.history = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  return result;
}

async function collectPublicMachiningInputs({ now = new Date(), storage = {} } = {}) {
  const [materialResults, ppiBundle, wageRaw, fxRaw, tariff] = await Promise.all([
    getRawMaterialObservations(["copper", "aluminum", "steel-hrc"], now),
    getDgbasPpiBundle({ now }),
    getWageObservations({ now }),
    getCbcFxObservations({ now }),
    getTaipowerTariffSource({ now }),
  ]);
  const energyRaw = await getRawMaterialObservations(["wti-oil", "natural-gas"], now);
  const recoveredMaterials = await Promise.all(materialResults.map((result) => recoverWithPersistence(result, `material:${result.id}`, { now, storage })));
  const recoveredEnergy = await Promise.all(energyRaw.map((result) => recoverWithPersistence(result, `energy:${result.id}`, { now, storage })));
  const ppiResults = await Promise.all([
    recoverWithPersistence(ppiBundle.energyPpi, "ppi:energy", { now, storage }),
    recoverWithPersistence(ppiBundle.manufacturingPpi, "ppi:manufacturing", { now, storage }),
    recoverWithPersistence(ppiBundle.machinePpi, "ppi:machine-capital", { now, storage }),
    recoverWithPersistence(ppiBundle.metalPpi, "ppi:basic-metals", { now, storage }),
  ]);
  const [energyPpi, manufacturingPpi, machinePpi, metalPpi] = ppiResults;
  const recoveredWage = await recoverWithPersistence(wageRaw, "wage:manufacturing", { now, storage });
  const recoveredFx = await recoverWithPersistence(fxRaw, "fx:ntd-usd", { now, storage });
  const toObservation = (result, id, label, unit = result.source.unit, valueOverride = undefined) => sourceToObservation(result, id, label, unit, valueOverride);
  const rawMaterialObservations = recoveredMaterials.map((result) => toObservation(result, result.id, result.label, materialById(result.id)?.unit || "依指標而定"));
  const energyObservations = [
    ...recoveredEnergy.map((result) => toObservation(result, result.id, result.label, materialById(result.id)?.unit || "依指標而定")),
    toObservation(energyPpi, "ppi-energy", "台灣水電燃氣 PPI"),
    { id: "taipower-structural", label: "台電官方電價（結構性）", history: [], value: null, status: tariff.status, frequency: "structural", unit: tariff.source.unit, sourceProvenance: tariff.source },
  ];
  return {
    components: {
      materialPressure: { label: "材料壓力", observations: [...rawMaterialObservations, toObservation(metalPpi, "ppi-basic-metals", "台灣基本金屬 PPI")], expectedEvidence: 4, noDataReason: "鋼／鋁／銅等既有公開指標與台灣基本金屬 PPI 均無可用歷史。" },
      energyPressure: { label: "能源壓力", observations: energyObservations, expectedEvidence: 3, noDataReason: "WTI、天然氣或台灣水電燃氣 PPI 均無可用歷史；台電電價只作結構性來源，不產生週變化。" },
      laborPressure: { label: "勞動壓力", observations: [toObservation(recoveredWage, "wage-manufacturing", "台灣製造業每人每月經常性薪資")], expectedEvidence: 1, noDataReason: "台灣製造業薪資若可取得，僅以月資料比較；若來源失敗或無月度對照，維持不計分。" },
      fxPressure: { label: "匯率壓力", observations: [toObservation(recoveredFx, "fx-ntd-usd", "NTD/USD 官方收盤匯率")], expectedEvidence: 1, noDataReason: "中央銀行公開匯率清單無法解析或沒有可用歷史。" },
      manufacturingPricePressure: { label: "製造價格壓力", observations: [toObservation(manufacturingPpi, "ppi-manufacturing", "台灣製造業產品 PPI")], expectedEvidence: 1, noDataReason: "DGBAS 製造業產品 PPI 無法取得或沒有可用歷史。" },
      machineCapitalPressure: { label: "機械／資本成本代理", observations: [toObservation(machinePpi, "ppi-machine-capital", "台灣機械設備 PPI")], expectedEvidence: 1, noDataReason: "僅在 DGBAS 公開機械設備 PPI 可得且有月度對照時提供代理；不推導機台購置價或加工時薪。" },
    },
    sourceCoverage: [
      ...recoveredMaterials.map((result) => result.source),
      ...recoveredEnergy.map((result) => result.source),
      energyPpi.source,
      manufacturingPpi.source,
      machinePpi.source,
      metalPpi.source,
      recoveredWage.source,
      recoveredFx.source,
      tariff.source,
    ],
  };
}

module.exports = {
  CBC_PRIMARY_ENDPOINT,
  CBC_SECONDARY_ENDPOINT,
  DGBAS_PPI_FIELD_POSITIONS,
  SOURCE_CATALOG,
  RAW_MATERIAL_SOURCE,
  buildDgbasPpiQueryEndpoint,
  buildDgbasWageQueryEndpoint,
  collectPublicMachiningInputs,
  fetchText,
  freshnessStatus,
  getCbcFxObservations,
  getDgbasObservations: async ({ source = SOURCE_CATALOG.dgbasPpi, seriesMatch, now = new Date(), staleAfterDays = 62 } = {}) => {
    try {
      const endpoint = source.endpoint;
      const text = await fetchText(endpoint);
      const history = parseDgbasPpi(text, seriesMatch);
      if (!history.length) throw new Error("DGBAS PPI series missing usable observations");
      const status = freshnessStatus(history.at(-1).date, now, staleAfterDays);
      return { history, status, source: sourceRecord(source, status, history.at(-1).date, source.note, endpoint, new Date(now).toISOString()) };
    } catch (error) {
      return { history: [], status: "API_ERROR", source: sourceRecord(source, "API_ERROR", null, `公開來源無法解析：${error.message}`, source.endpoint, new Date(now).toISOString()) };
    }
  },
  getDgbasPpiBundle,
  getRawMaterialObservations,
  getTaipowerTariffSource,
  getWageObservations,
  parseCbcFx,
  parseCsv,
  parseDgbasPpi,
  parseDgbasPpiCsv,
  parseDgbasWage,
  parseDgbasWageCsv,
  parseDgbasWageRecords,
  parseDgbasPpiXml,
  rocMonthToIso,
  sourceRecord,
  recoverWithPersistence,
};
