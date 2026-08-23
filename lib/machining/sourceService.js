const { fetchYahooHistory } = require("../marketData/fetchYahoo");
const { materials } = require("../marketData/materials");

const SOURCE_CATALOG = Object.freeze({
  dgbasPpi: {
    sourceId: "tw-dgbas-ppi-basic",
    sourceName: "DGBAS／政府資料開放平臺：生產者物價基本分類指數",
    url: "https://data.gov.tw/en/datasets/148439",
    endpoint: "https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230534/pr0701a1m.xml",
    geographicScope: "Taiwan",
    updateFrequency: "每月",
    unit: "指數（民國110年=100）",
    accessConstraints: "免費；Open Government Data License, version 1.0；XML 公開下載。",
    defaultStatus: "LIVE",
    note: "可提供製造業產品、水電燃氣、基本金屬與機械設備等公開指數；不得解讀為加工報價。",
  },
  dgbasWage: {
    sourceId: "tw-dgbas-wage-annual",
    sourceName: "DGBAS／政府資料開放平臺：每人每月經常性薪資",
    url: "https://data.gov.tw/en/datasets/9663",
    endpoint: "https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230037/mp05002.xml",
    geographicScope: "Taiwan",
    updateFrequency: "每年一月（資料集頁面標示）",
    unit: "新臺幣元／人／月",
    accessConstraints: "免費；Open Government Data License, version 1.0；XML 公開下載。",
    defaultStatus: "LIVE",
    note: "製造業欄位可作勞動成本背景，但此資料集更新頻率不足以支持 4／12 週方向；V1 會保留資料品質說明。",
  },
  cbcFx: {
    sourceId: "tw-cbc-ntd-usd-close",
    sourceName: "中央銀行：NT$/US$ Closing Rate",
    url: "https://www.cbc.gov.tw/en/lp-700-2.html",
    endpoint: "https://www.cbc.gov.tw/en/lp-700-2.html",
    geographicScope: "Taiwan official NTD/USD",
    updateFrequency: "營業日",
    unit: "NTD／USD",
    accessConstraints: "官方公開 HTML 歷史清單；頁面分頁；需遵守來源網站使用條款。",
    defaultStatus: "LIVE",
    note: "匯率壓力是外幣投入成本的方向參考，不是任何供應商的換匯或報價條件。",
  },
  taipowerTariff: {
    sourceId: "tw-taipower-rate-schedule",
    sourceName: "台灣電力公司：Rate Schedules",
    url: "https://www.taipower.com.tw/2764/2765/2801/56429/normalPost",
    endpoint: "https://www.taipower.com.tw/media/vqplk13w/20251124_TAIWAN%20POWER%20COMPANY%20RATE%20SCHEDULES.pdf?mediaDL=true",
    geographicScope: "Taiwan electricity tariffs",
    updateFrequency: "修訂／事件驅動",
    unit: "依電價表級距而定",
    accessConstraints: "官方 PDF 公開下載；需以最新版本及適用級距人工確認；V1 不自動解讀 PDF 報價。",
    defaultStatus: "NO_DATA",
    note: "作為能源來源可行性／人工核對來源；V1 不把 PDF 中未解析的價格轉成數字。",
  },
});

const RAW_MATERIAL_SOURCE = Object.freeze({
  sourceName: "Yahoo Finance 公開圖表資料（既有原物料來源）",
  geographicScope: "國際公開期貨／市場指標",
  updateFrequency: "交易日／市場資料可得時",
  unit: "依指標而定",
  accessConstraints: "公開圖表端點；可用性、授權與符號內容可能變更；不得視為台灣現貨。",
});

function materialById(id) {
  return materials.find((material) => material.id === id) || null;
}

function sourceForMaterial(material, sourceName, status, lastObservationDate, note = "") {
  const source = material?.stooqSymbol && sourceName.includes("Stooq")
    ? `https://stooq.com/q/?s=${encodeURIComponent(material.stooqSymbol.toLowerCase())}`
    : `https://finance.yahoo.com/quote/${encodeURIComponent(material?.symbol || "")}`;
  return {
    sourceId: `raw-${material?.id || "unknown"}-${status.toLowerCase()}`,
    sourceName,
    url: source,
    geographicScope: RAW_MATERIAL_SOURCE.geographicScope,
    updateFrequency: RAW_MATERIAL_SOURCE.updateFrequency,
    unit: material?.unit || RAW_MATERIAL_SOURCE.unit,
    accessConstraints: RAW_MATERIAL_SOURCE.accessConstraints,
    status,
    lastObservationDate,
    note: note || `既有公開原物料指標 ${material?.name || material?.id || ""}；只作投入成本方向參考。`,
  };
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 45000);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/xml,text/html,text/plain;q=0.9,*/*;q=0.8", "user-agent": "raw-material-dashboard-machining-reference/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseDgbasPpi(xml, match) {
  const rows = [];
  const pattern = /<Obs>\s*<Item>([^<]*)<\/Item>\s*<TIME_PERIOD>([^<]*)<\/TIME_PERIOD>\s*<FREQ>([^<]*)<\/FREQ>\s*<TYPE>([^<]*)<\/TYPE>\s*<Item_VALUE>([^<]*)<\/Item_VALUE>\s*<\/Obs>/g;
  for (const found of String(xml || "").matchAll(pattern)) {
    const [, item, period, frequency, type, rawValue] = found;
    if (type !== "原始值" || !match(item)) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || !/^\d{4}M\d{2}$/.test(period)) continue;
    rows.push({ date: `${period.slice(0, 4)}-${period.slice(5, 7)}-01`, value });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function parseDgbasWage(xml) {
  const rows = [];
  const pattern = /<每人每月經常性薪資>[\s\S]*?<年月別_Year_and_month>(\d{4})<\/年月別_Year_and_month>[\s\S]*?<製造業_Manufacturing_金額_新臺幣元>([^<]*)<\/製造業_Manufacturing_金額_新臺幣元>[\s\S]*?<\/每人每月經常性薪資>/g;
  for (const found of String(xml || "").matchAll(pattern)) {
    const [, year, rawValue] = found;
    const value = Number(rawValue);
    if (Number.isFinite(value)) rows.push({ date: `${year}-12-31`, value });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
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
  parse(/<tr[^>]*>[\s\S]*?<td[^>]*data-th=["']Date["'][^>]*>[\s\S]*?<span[^>]*>\s*(\d{4}\/\d{2}\/\d{2})\s*<\/span>[\s\S]*?<\/td>[\s\S]*?<td[^>]*data-th=["']NTD\/?USD["'][^>]*>[\s\S]*?<span[^>]*>\s*([\d.]+)\s*<\/span>[\s\S]*?<\/td>[\s\S]*?<\/tr>/gi);
  if (!rows.length) parse(/<tr[^>]*>\s*<td[^>]*>\s*(\d{4}\/\d{2}\/\d{2})\s*<\/td>\s*<td[^>]*>\s*([\d.]+)\s*<\/td>\s*<\/tr>/gi);
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function freshnessStatus(lastObservationDate, now, staleAfterDays) {
  const latest = new Date(lastObservationDate);
  const current = new Date(now || new Date());
  if (Number.isNaN(latest.getTime()) || Number.isNaN(current.getTime())) return "API_ERROR";
  return current.getTime() - latest.getTime() > staleAfterDays * 86400000 ? "STALE" : "LIVE";
}

function sourceRecord(catalog, status, lastObservationDate, note = "") {
  return {
    sourceId: catalog.sourceId,
    sourceName: catalog.sourceName,
    url: catalog.url,
    endpoint: catalog.endpoint || catalog.url,
    geographicScope: catalog.geographicScope,
    updateFrequency: catalog.updateFrequency,
    unit: catalog.unit,
    accessConstraints: catalog.accessConstraints,
    status,
    lastObservationDate,
    note: note || catalog.note,
  };
}

async function getDgbasObservations({ source = SOURCE_CATALOG.dgbasPpi, seriesMatch, now = new Date(), staleAfterDays = 62 }) {
  try {
    const xml = await fetchText(source.endpoint);
    const history = parseDgbasPpi(xml, seriesMatch);
    if (!history.length) throw new Error("DGBAS PPI series missing usable observations");
    const status = freshnessStatus(history.at(-1).date, now, staleAfterDays);
    return { history, status, source: sourceRecord(source, status, history.at(-1).date) };
  } catch (error) {
    return { history: [], status: "API_ERROR", source: sourceRecord(source, "API_ERROR", null, `公開來源無法解析：${error.message}`) };
  }
}

async function getDgbasPpiBundle({ now = new Date() } = {}) {
  const source = SOURCE_CATALOG.dgbasPpi;
  try {
    const xml = await fetchText(source.endpoint, { timeoutMs: 60000 });
    const build = (seriesId, seriesMatch) => {
      const history = parseDgbasPpi(xml, seriesMatch);
      if (!history.length) throw new Error(`DGBAS PPI series missing usable observations: ${seriesId}`);
      const status = freshnessStatus(history.at(-1).date, now, 62);
      return { history, status, source: sourceRecord({ ...source, sourceId: `${source.sourceId}-${seriesId}` }, status, history.at(-1).date) };
    };
    return {
      energyPpi: build("energy", (item) => item.startsWith("四.水電燃氣")),
      manufacturingPpi: build("manufacturing", (item) => item.startsWith("三.製造業產品")),
      machinePpi: build("machine-capital", (item) => item.startsWith("18.機械設備")),
      metalPpi: build("basic-metals", (item) => item.startsWith("13.基本金屬")),
    };
  } catch (error) {
    const failed = (seriesId) => ({ history: [], status: "API_ERROR", source: sourceRecord({ ...source, sourceId: `${source.sourceId}-${seriesId}` }, "API_ERROR", null, `公開來源無法解析：${error.message}`) });
    return { energyPpi: failed("energy"), manufacturingPpi: failed("manufacturing"), machinePpi: failed("machine-capital"), metalPpi: failed("basic-metals") };
  }
}

async function getWageObservations({ now = new Date() } = {}) {
  const source = SOURCE_CATALOG.dgbasWage;
  try {
    const xml = await fetchText(source.endpoint);
    const history = parseDgbasWage(xml);
    if (!history.length) throw new Error("DGBAS wage series missing usable observations");
    const status = freshnessStatus(history.at(-1).date, now, 550);
    return { history, status, source: sourceRecord(source, status, history.at(-1).date, "年度資料；不足以單獨支援 4／12 週方向。") };
  } catch (error) {
    return { history: [], status: "API_ERROR", source: sourceRecord(source, "API_ERROR", null, `公開來源無法解析：${error.message}`) };
  }
}

async function getCbcFxObservations({ now = new Date() } = {}) {
  const source = SOURCE_CATALOG.cbcFx;
  try {
    const html = await fetchText(source.endpoint);
    const history = parseCbcFx(html);
    if (!history.length) throw new Error("CBC FX page missing usable observations");
    const status = freshnessStatus(history.at(-1).date, now, 7);
    return { history, status, source: sourceRecord(source, status, history.at(-1).date) };
  } catch (error) {
    return { history: [], status: "API_ERROR", source: sourceRecord(source, "API_ERROR", null, `公開來源無法解析：${error.message}`) };
  }
}

async function getRawMaterialObservations(ids = ["copper", "aluminum", "steel-hrc"]) {
  const results = await Promise.all(ids.map(async (id) => {
    const material = materialById(id);
    if (!material) return { id, label: id, history: [], status: "NO_DATA", source: sourceForMaterial(null, "Yahoo Finance", "NO_DATA", null, "既有原物料 registry 找不到此指標。") };
    try {
      const result = await fetchYahooHistory(material.symbol, "6mo", "1d");
      const history = result.rows.map((row) => ({ date: row.date, value: row.close }));
      return {
        id,
        label: material.name,
        history,
        status: "LIVE",
        source: sourceForMaterial(material, result.source, "LIVE", history.at(-1)?.date),
      };
    } catch (error) {
      return {
        id,
        label: material.name,
        history: [],
        status: "API_ERROR",
        source: sourceForMaterial(material, material.source, "API_ERROR", null, `既有公開原物料來源無法取得：${error.message}`),
      };
    }
  }));
  return results;
}

async function collectPublicMachiningInputs({ now = new Date() } = {}) {
  const [materialResults, ppiBundle, wage, fx] = await Promise.all([
    getRawMaterialObservations(),
    getDgbasPpiBundle({ now }),
    getWageObservations({ now }),
    getCbcFxObservations({ now }),
  ]);
  const { energyPpi, manufacturingPpi, machinePpi, metalPpi } = ppiBundle;
  const toObservation = (result, label, unit = result.source.unit) => ({
    id: result.source.sourceId,
    label,
    history: result.history,
    status: result.status,
    unit,
    sourceProvenance: result.source,
  });
  const rawMaterialObservations = materialResults.map((result) => ({
    id: result.id,
    label: result.label,
    history: result.history,
    status: result.status,
    unit: materialById(result.id)?.unit || "依指標而定",
    sourceProvenance: result.source,
  }));
  const energyRaw = await getRawMaterialObservations(["wti-oil", "natural-gas"]);
  const energyObservations = [
    ...energyRaw.map((result) => ({ id: result.id, label: result.label, history: result.history, status: result.status, unit: materialById(result.id)?.unit || "依指標而定", sourceProvenance: result.source })),
    toObservation(energyPpi, "台灣水電燃氣 PPI"),
  ];
  return {
    components: {
      materialPressure: {
        label: "材料壓力",
        observations: [...rawMaterialObservations, toObservation(metalPpi, "台灣基本金屬 PPI")],
        expectedEvidence: 4,
        noDataReason: "鋼／鋁／銅等既有公開指標與台灣基本金屬 PPI 均無可用歷史。",
      },
      energyPressure: {
        label: "能源壓力",
        observations: energyObservations,
        expectedEvidence: 3,
        noDataReason: "WTI、天然氣或台灣水電燃氣 PPI 均無可用歷史。",
      },
      laborPressure: {
        label: "勞動壓力",
        observations: [toObservation(wage, "台灣製造業每人每月經常性薪資")],
        expectedEvidence: 1,
        noDataReason: "勞動來源只有年度資料，沒有足夠的 4／12 週對照觀測；V1 不將年資料硬轉成短期加工壓力。",
      },
      fxPressure: {
        label: "匯率壓力",
        observations: [toObservation(fx, "NTD/USD 官方收盤匯率")],
        expectedEvidence: 1,
        noDataReason: "中央銀行公開匯率清單無法解析或沒有可用歷史。",
      },
      manufacturingPricePressure: {
        label: "製造價格壓力",
        observations: [toObservation(manufacturingPpi, "台灣製造業產品 PPI")],
        expectedEvidence: 1,
        noDataReason: "DGBAS 製造業產品 PPI 無法取得或沒有可用歷史。",
      },
      machineCapitalPressure: {
        label: "機械／資本成本代理",
        observations: [toObservation(machinePpi, "台灣機械設備 PPI")],
        expectedEvidence: 1,
        noDataReason: "V1 僅在 DGBAS 公開機械設備 PPI 可得時提供代理；不推導機台購置價或加工時薪。",
      },
    },
    sourceCoverage: [
      ...materialResults.map((result) => result.source),
      ...energyRaw.map((result) => result.source),
      energyPpi.source,
      manufacturingPpi.source,
      machinePpi.source,
      metalPpi.source,
      wage.source,
      fx.source,
      sourceRecord(SOURCE_CATALOG.taipowerTariff, SOURCE_CATALOG.taipowerTariff.defaultStatus, null),
    ],
  };
}

module.exports = {
  RAW_MATERIAL_SOURCE,
  SOURCE_CATALOG,
  collectPublicMachiningInputs,
  fetchText,
  getCbcFxObservations,
  getDgbasObservations,
  getDgbasPpiBundle,
  getRawMaterialObservations,
  getWageObservations,
  parseCbcFx,
  parseDgbasPpi,
  parseDgbasWage,
};
