const {
  fetchText,
  getCbcFxObservations,
  getDgbasPpiBundle,
  getRawMaterialObservations,
  getTaipowerTariffSource,
  getWageObservations,
  parseCsv,
  recoverWithPersistence,
  rocMonthToIso,
} = require("../machining/sourceService");

const MOEA_INDUSTRIAL_ENDPOINT = "https://service.moea.gov.tw/EE520/opendata/d.csv";
const MOEA_INDUSTRIAL_DATASET = "https://data.gov.tw/en/datasets/6607";
const MOEA_STALE_AFTER_DAYS = 95;
const STATUS_VALUES = Object.freeze(["LIVE", "FALLBACK", "STALE", "API_ERROR", "NO_DATA"]);

const MOEA_SOURCE_CATALOG = Object.freeze({
  manufacturing: {
    sourceId: "tw-moea-ipi-manufacturing",
    sourceName: "經濟部工業生產統計：製造業生產指數",
    url: MOEA_INDUSTRIAL_DATASET,
    endpoint: MOEA_INDUSTRIAL_ENDPOINT,
    geographicScope: "Taiwan",
    updateFrequency: "不定期更新；實際觀測日期以資料期為準",
    frequency: "monthly",
    unit: "指數（民國110年=100）",
    accessConstraints: "免費；Open Government Data License, version 1.0；官方 CSV 公開下載；資料集 metadata 標示不定期更新。",
    note: "廣義製造業活動代理；只作鈑金需求／產能方向參考，不是加工報價。",
  },
  basicMetal: {
    sourceId: "tw-moea-ipi-basic-metal",
    sourceName: "經濟部工業生產統計：基本金屬製造業生產指數",
    url: MOEA_INDUSTRIAL_DATASET,
    endpoint: MOEA_INDUSTRIAL_ENDPOINT,
    geographicScope: "Taiwan",
    updateFrequency: "不定期更新；實際觀測日期以資料期為準",
    frequency: "monthly",
    unit: "指數（民國110年=100）",
    accessConstraints: "免費；Open Government Data License, version 1.0；官方 CSV 公開下載；資料集 metadata 標示不定期更新。",
    note: "金屬上游／產業活動代理；不解讀為鋼板或鈑金供應商價格。",
  },
  fabricatedMetal: {
    sourceId: "tw-moea-ipi-fabricated-metal",
    sourceName: "經濟部工業生產統計：金屬製品製造業生產指數",
    url: MOEA_INDUSTRIAL_DATASET,
    endpoint: MOEA_INDUSTRIAL_ENDPOINT,
    geographicScope: "Taiwan",
    updateFrequency: "不定期更新；實際觀測日期以資料期為準",
    frequency: "monthly",
    unit: "指數（民國110年=100）",
    accessConstraints: "免費；Open Government Data License, version 1.0；官方 CSV 公開下載；資料集 metadata 標示不定期更新。",
    note: "台灣金屬製品製造業活動／需求壓力代理；不是任何供應商的鈑金報價。",
  },
  machinery: {
    sourceId: "tw-moea-ipi-machinery",
    sourceName: "經濟部工業生產統計：機械設備製造業生產指數",
    url: MOEA_INDUSTRIAL_DATASET,
    endpoint: MOEA_INDUSTRIAL_ENDPOINT,
    geographicScope: "Taiwan",
    updateFrequency: "不定期更新；實際觀測日期以資料期為準",
    frequency: "monthly",
    unit: "指數（民國110年=100）",
    accessConstraints: "免費；Open Government Data License, version 1.0；官方 CSV 公開下載；資料集 metadata 標示不定期更新。",
    note: "機械製造活動／需求壓力代理；不推導機台價格或加工時薪。",
  },
});

const GLOBAL_SOURCE_CATALOG = Object.freeze({
  coldRolledSteel: {
    sourceId: "global-fred-ppi-cold-rolled-steel",
    sourceName: "FRED／U.S. BLS PPI：Cold Rolled Steel Sheet and Strip",
    url: "https://fred.stlouisfed.org/series/WPU101707",
    endpoint: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=WPU101707",
    geographicScope: "United States; international import-market reference",
    marketScope: "International import-market reference",
    marketRole: "GLOBAL_IMPORT_REFERENCE",
    pricingBasis: "U.S. BLS producer-price index for cold rolled steel sheet and strip; index Jun 1982=100",
    currency: null,
    updateFrequency: "Monthly",
    frequency: "monthly",
    unit: "Index Jun 1982=100",
    accessConstraints: "Public FRED CSV/page; source BLS; not a Taiwan domestic supplier price",
    note: "Accepted international cold-rolled reference for imported-material context; not Taiwan domestic pricing and not a supplier quotation.",
  },
  stainlessSteel: {
    sourceId: "global-fred-ppi-stainless-steel",
    sourceName: "FRED／U.S. BLS PPI：Steel Pipe and Tube, Stainless Steel",
    url: "https://fred.stlouisfed.org/series/WPU10170674",
    endpoint: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=WPU10170674",
    geographicScope: "United States; international import-market reference",
    marketScope: "International import-market reference",
    marketRole: "GLOBAL_IMPORT_REFERENCE",
    pricingBasis: "U.S. BLS producer-price index for stainless steel pipe and tube; index Dec 2010=100",
    currency: null,
    updateFrequency: "Monthly",
    frequency: "monthly",
    unit: "Index Dec 2010=100",
    accessConstraints: "Public FRED CSV/page; source BLS; product scope is stainless pipe/tube, not Taiwan sheet quotation",
    note: "Accepted finished-stainless public reference with limited product scope; never interpreted as Taiwan stainless-sheet price.",
  },
  nickel: {
    sourceId: "global-fred-imf-nickel",
    sourceName: "FRED／IMF Primary Commodity Prices：Global Nickel",
    url: "https://fred.stlouisfed.org/series/PNICKUSDM",
    endpoint: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=PNICKUSDM",
    geographicScope: "Global benchmark; international upstream input proxy",
    marketScope: "Global upstream input-cost proxy",
    marketRole: "GLOBAL_INPUT_PROXY",
    pricingBasis: "IMF global benchmark price; nominal USD per metric ton; period average",
    currency: "USD",
    updateFrequency: "Monthly",
    frequency: "monthly",
    unit: "USD/metric ton",
    accessConstraints: "Public FRED CSV/page; source IMF Primary Commodity Prices; not a stainless conversion price",
    note: "Stainless upstream nickel pressure only; no alloy formula or stainless conversion factor is applied.",
  },
});

const FRED_STALE_AFTER_DAYS = 95;

function parseFredCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.replace(/^\uFEFF/, ""));
  const dateIndex = header.indexOf("observation_date");
  const valueIndex = header.findIndex((name, index) => index > dateIndex && name);
  if (dateIndex < 0 || valueIndex < 0) return [];
  return rows.slice(1).map((row) => ({
    date: row[dateIndex],
    value: Number(String(row[valueIndex] || "").replace(/,/g, "")),
  })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function globalSourceRecord(catalog, status, history, fetchedAt, note = catalog.note) {
  const lastObservationDate = history.at(-1)?.date || null;
  return { ...catalog, status, lastObservationDate, observationDate: lastObservationDate, fetchedAt, note };
}

async function getGlobalSheetMetalSources({ now = new Date(), fetcher = fetchText } = {}) {
  const fetchedAt = new Date(now).toISOString();
  const entries = Object.entries(GLOBAL_SOURCE_CATALOG);
  const results = await Promise.all(entries.map(async ([id, catalog]) => {
    try {
      const text = await fetcher(catalog.endpoint, { timeoutMs: 30000, accept: "text/csv,text/plain,*/*;q=0.8" });
      const history = parseFredCsv(text);
      if (!history.length) throw new Error("FRED CSV missing usable observations");
      const stale = new Date(now).getTime() - new Date(history.at(-1).date).getTime() > FRED_STALE_AFTER_DAYS * 86400000;
      const status = stale ? "STALE" : "LIVE";
      return [id, { history, status, frequency: "monthly", source: globalSourceRecord(catalog, status, history, fetchedAt) }];
    } catch (error) {
      return [id, { history: [], status: "API_ERROR", frequency: "monthly", source: globalSourceRecord(catalog, "API_ERROR", [], fetchedAt, `公開國際序列無法解析：${error.message}；不補入虛構值。`) }];
    }
  }));
  return Object.fromEntries(results);
}

function normalizeMoeaMonth(value) {
  const text = String(value || "").replace(/[ⓇⓅ*]/g, "").trim();
  if (/^\d{5}$/.test(text)) return `${Number(text.slice(0, 3)) + 1911}-${text.slice(3, 5)}-01`;
  return rocMonthToIso(text);
}

function parseMoeaIndustrialCsv(text, industryCode = "25") {
  const rows = parseCsv(text);
  const headers = rows.find((row) => row.some((cell) => cell.replace(/^\uFEFF/, "") === "行業代碼"));
  if (!headers) return [];
  const headerIndex = rows.indexOf(headers);
  const headerNames = headers.map((cell) => cell.replace(/^\uFEFF/, ""));
  const indexes = Object.fromEntries(["統計項目", "行業代碼", "資料期(民國年)", "統計值(指數)"].map((name) => [name, headerNames.indexOf(name)]));
  if (Object.values(indexes).some((index) => index < 0)) return [];
  return rows.slice(headerIndex + 1).map((row) => ({
    date: normalizeMoeaMonth(row[indexes["資料期(民國年)"]]),
    value: Number(String(row[indexes["統計值(指數)"]] || "").replace(/,/g, "")),
    item: String(row[indexes["統計項目"]] || "").trim(),
    industry: String(row[indexes["行業代碼"]] || "").trim(),
  })).filter((row) => row.item === "生產指數" && row.industry === String(industryCode) && row.date && Number.isFinite(row.value))
    .map(({ date, value }) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function freshnessStatus(lastObservationDate, now, staleAfterDays = MOEA_STALE_AFTER_DAYS) {
  const latest = new Date(lastObservationDate);
  const current = new Date(now || new Date());
  if (Number.isNaN(latest.getTime()) || Number.isNaN(current.getTime())) return "API_ERROR";
  return current.getTime() - latest.getTime() > staleAfterDays * 86400000 ? "STALE" : "LIVE";
}

function sourceRecord(catalog, status, lastObservationDate, fetchedAt, note = catalog.note) {
  return {
    ...catalog,
    marketScope: catalog.marketScope || "Taiwan domestic public indicator",
    marketRole: catalog.marketRole || "TAIWAN_DOMESTIC",
    pricingBasis: catalog.pricingBasis || "Official Taiwan industrial production index",
    currency: catalog.currency ?? null,
    status,
    lastObservationDate,
    observationDate: lastObservationDate,
    fetchedAt,
    note,
  };
}

async function getMoeaIndustrialBundle({ now = new Date(), fetcher = fetchText } = {}) {
  const fetchedAt = new Date(now).toISOString();
  try {
    const text = await fetcher(MOEA_INDUSTRIAL_ENDPOINT, { timeoutMs: 30000, accept: "text/csv,text/plain,*/*;q=0.8" });
    const definitions = [
      ["manufacturing", "C"],
      ["basicMetal", "24"],
      ["fabricatedMetal", "25"],
      ["machinery", "29"],
    ];
    const histories = Object.fromEntries(definitions.map(([id, code]) => [id, parseMoeaIndustrialCsv(text, code)]));
    const missing = Object.entries(histories).filter(([, history]) => !history.length).map(([id]) => id);
    if (missing.length) throw new Error(`MOEA industrial series missing: ${missing.join(",")}`);
    const status = freshnessStatus(histories.fabricatedMetal.at(-1).date, now);
    return Object.fromEntries(definitions.map(([id]) => {
      const catalog = MOEA_SOURCE_CATALOG[id];
      const history = histories[id];
      return [id, {
        history,
        status,
        frequency: "monthly",
        source: sourceRecord(catalog, status, history.at(-1).date, fetchedAt),
      }];
    }));
  } catch (error) {
    const failed = (id) => ({
      history: [],
      status: "API_ERROR",
      frequency: "monthly",
      source: sourceRecord(MOEA_SOURCE_CATALOG[id], "API_ERROR", null, fetchedAt, `官方 MOEA 工業生產 CSV 無法解析：${error.message}；不以外部或虛構序列補洞。`),
    });
    return Object.fromEntries(Object.keys(MOEA_SOURCE_CATALOG).map((id) => [id, failed(id)]));
  }
}

function unavailableSource(sourceId, sourceName, note) {
  return {
    sourceId,
    sourceName,
    url: MOEA_INDUSTRIAL_DATASET,
    endpoint: MOEA_INDUSTRIAL_ENDPOINT,
    geographicScope: "Taiwan",
    marketScope: "Taiwan domestic public indicator",
    marketRole: "TAIWAN_DOMESTIC",
    pricingBasis: "No accepted Taiwan domestic public price series",
    currency: null,
    updateFrequency: "未確認",
    frequency: "monthly",
    unit: "未指定",
    accessConstraints: "尚未找到通過稽核的台灣公開序列；不納入評分。",
    status: "NO_DATA",
    lastObservationDate: null,
    observationDate: null,
    fetchedAt: null,
    note,
  };
}

function sourceToObservation(result, id, label, unit = result.source.unit) {
  return {
    id,
    label,
    history: result.history || [],
    status: result.status,
    frequency: result.frequency || result.source.frequency || "unknown",
    unit,
    sourceProvenance: result.source,
  };
}

function classifyRawMarketResult(result, marketRole) {
  const marketScope = marketRole === "GLOBAL_INPUT_PROXY" ? "International upstream input-cost indicator" : "International/import-market reference";
  const pricingBasis = marketRole === "GLOBAL_INPUT_PROXY" ? "Public upstream commodity indicator; not a Taiwan domestic supplier price" : "Public international/import-market indicator; not a Taiwan domestic supplier price";
  return {
    ...result,
    source: {
      ...result.source,
      marketScope: result.source.marketScope || marketScope,
      marketRole,
      pricingBasis: result.source.pricingBasis || pricingBasis,
      currency: result.source.currency ?? "USD",
      observationDate: result.source.observationDate || result.source.lastObservationDate || null,
    },
  };
}

function classifyDomesticResult(result, { marketRole = "TAIWAN_DOMESTIC", marketScope = "Taiwan domestic public indicator", pricingBasis = "Official Taiwan public indicator; not a supplier quotation", currency = null } = {}) {
  return {
    ...result,
    source: {
      ...result.source,
      marketScope: result.source.marketScope || marketScope,
      marketRole,
      pricingBasis: result.source.pricingBasis || pricingBasis,
      currency: result.source.currency ?? currency,
      observationDate: result.source.observationDate || result.source.lastObservationDate || null,
    },
  };
}

async function collectPublicSheetMetalInputs({ now = new Date(), storage = {} } = {}) {
  const [materialResults, ppiBundle, wageRaw, fxRaw, tariffRaw, moeaBundle, globalSources] = await Promise.all([
    getRawMaterialObservations(["aluminum", "steel-hrc", "copper"], now),
    getDgbasPpiBundle({ now }),
    getWageObservations({ now }),
    getCbcFxObservations({ now }),
    getTaipowerTariffSource({ now }),
    getMoeaIndustrialBundle({ now }),
    getGlobalSheetMetalSources({ now }),
  ]);
  const energyRaw = await getRawMaterialObservations(["wti-oil", "natural-gas"], now);
  const recoveredMaterials = (await Promise.all(materialResults.map((result) => recoverWithPersistence(result, `sheet-metal:material:${result.id}`, { now, storage })))).map((result) => classifyRawMarketResult(result, "GLOBAL_IMPORT_REFERENCE"));
  const recoveredEnergy = (await Promise.all(energyRaw.map((result) => recoverWithPersistence(result, `sheet-metal:energy:${result.id}`, { now, storage })))).map((result) => classifyRawMarketResult(result, "GLOBAL_INPUT_PROXY"));
  const [energyPpiRaw, manufacturingPpiRaw, machinePpiRaw, metalPpiRaw] = await Promise.all([
    recoverWithPersistence(ppiBundle.energyPpi, "sheet-metal:ppi:energy", { now, storage }),
    recoverWithPersistence(ppiBundle.manufacturingPpi, "sheet-metal:ppi:manufacturing", { now, storage }),
    recoverWithPersistence(ppiBundle.machinePpi, "sheet-metal:ppi:machine-capital", { now, storage }),
    recoverWithPersistence(ppiBundle.metalPpi, "sheet-metal:ppi:basic-metals", { now, storage }),
  ]);
  const energyPpi = classifyDomesticResult(energyPpiRaw, { pricingBasis: "Official Taiwan producer-price index" });
  const manufacturingPpi = classifyDomesticResult(manufacturingPpiRaw, { pricingBasis: "Official Taiwan producer-price index" });
  const machinePpi = classifyDomesticResult(machinePpiRaw, { pricingBasis: "Official Taiwan producer-price index" });
  const metalPpi = classifyDomesticResult(metalPpiRaw, { pricingBasis: "Official Taiwan producer-price index" });
  const recoveredWage = classifyDomesticResult(await recoverWithPersistence(wageRaw, "sheet-metal:wage:manufacturing", { now, storage }), { pricingBasis: "Official Taiwan monthly manufacturing wage statistic", currency: "TWD" });
  const recoveredFx = classifyDomesticResult(await recoverWithPersistence(fxRaw, "sheet-metal:fx:ntd-usd", { now, storage }), { pricingBasis: "Official NTD/USD closing-rate table", currency: "TWD/USD" });
  const tariff = classifyDomesticResult(tariffRaw, { marketRole: "STRUCTURAL", marketScope: "Taiwan domestic structural information", pricingBasis: "Official tariff schedule; applicability depends on contract, voltage and time-of-use", currency: "TWD" });
  const recoveredMoea = await Promise.all(Object.entries(moeaBundle).map(async ([id, result]) => [id, await recoverWithPersistence(result, `sheet-metal:moea:${id}`, { now, storage })]));
  const moea = Object.fromEntries(recoveredMoea);
  const recoveredGlobalSources = await Promise.all(Object.entries(globalSources).map(async ([id, result]) => [id, await recoverWithPersistence(result, `sheet-metal:global:${id}`, { now, storage })]));
  const global = Object.fromEntries(recoveredGlobalSources);
  const toObservation = (result, id, label, unit = result.source.unit) => sourceToObservation(result, id, label, unit);
  const rawMaterialObservations = recoveredMaterials.map((result) => toObservation(result, result.id, result.label));
  const globalMaterialObservations = [
    toObservation(global.coldRolledSteel, "global-cold-rolled-steel", "國際冷軋鋼進口市場參考"),
    toObservation(global.stainlessSteel, "global-stainless-steel", "國際不鏽鋼公開市場參考"),
    toObservation(global.nickel, "global-nickel", "鎳不鏽鋼上游投入代理"),
  ];
  const energyObservations = [
    ...recoveredEnergy.map((result) => toObservation(result, result.id, result.label)),
    toObservation(energyPpi, "ppi-energy", "台灣水電燃氣 PPI"),
    { id: "taipower-structural", label: "台電官方電價（結構性）", history: [], value: null, status: tariff.status, frequency: "structural", unit: tariff.source.unit, sourceProvenance: tariff.source },
  ];
  const capacityObservations = [
    toObservation(moea.fabricatedMetal, "ipi-fabricated-metal", "金屬製品製造業生產指數"),
    toObservation(moea.basicMetal, "ipi-basic-metal", "基本金屬製造業生產指數"),
    toObservation(moea.machinery, "ipi-machinery", "機械設備製造業生產指數"),
    toObservation(moea.manufacturing, "ipi-manufacturing", "製造業生產指數"),
  ];
  return {
    components: {
      materialPressure: { label: "材料壓力", observations: [...rawMaterialObservations, ...globalMaterialObservations, toObservation(metalPpi, "ppi-basic-metals", "台灣基本金屬 PPI")], expectedEvidence: 7, noDataReason: "台灣基本金屬 PPI、國際冷軋鋼／不鏽鋼參考、鋁、熱軋鋼、銅或鎳等公開指標均無可用歷史。" },
      energyPressure: { label: "能源壓力", observations: energyObservations, expectedEvidence: 3, noDataReason: "WTI、天然氣或台灣水電燃氣 PPI 均無可用歷史；台電電價只作結構性來源，不產生週變化。" },
      laborPressure: { label: "勞動壓力", observations: [toObservation(recoveredWage, "wage-manufacturing", "台灣製造業每人每月經常性薪資")], expectedEvidence: 1, noDataReason: "台灣製造業薪資僅以月資料比較；若來源失敗或無月度對照，維持不計分。" },
      fxPressure: { label: "匯率壓力", observations: [toObservation(recoveredFx, "fx-ntd-usd", "NTD/USD 官方收盤匯率")], expectedEvidence: 1, noDataReason: "中央銀行公開匯率清單無法解析或沒有可用歷史。" },
      manufacturingPricePressure: { label: "製造價格壓力", observations: [toObservation(manufacturingPpi, "ppi-manufacturing", "台灣製造業產品 PPI")], expectedEvidence: 1, noDataReason: "DGBAS 製造業產品 PPI 無法取得或沒有可用月度對照。" },
      capacityDemandPressure: { label: "產能／需求熱度", observations: capacityObservations, expectedEvidence: 3, noDataReason: "MOEA 官方工業生產 CSV 沒有可用的金屬製品、基本金屬、機械或製造業生產指數。" },
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
      ...Object.values(moea).map((result) => result.source),
      ...Object.values(global).map((result) => result.source),
      unavailableSource("tw-sheet-metal-cold-rolled-steel-proxy", "冷軋鋼台灣公開價格代理（未納入）", "未找到通過稽核、可穩定取得且可明確對應台灣冷軋鋼板的公開序列；保留 NO_DATA，但另列合格的國際進口市場參考。"),
      unavailableSource("tw-sheet-metal-stainless-steel-proxy", "不鏽鋼台灣公開價格代理（未納入）", "未找到通過稽核、可穩定取得且可明確對應台灣不鏽鋼板的公開序列；保留 NO_DATA，但另列合格的國際不鏽鋼公開市場參考與鎳上游投入代理。"),
    ],
  };
}

module.exports = {
  MOEA_INDUSTRIAL_DATASET,
  MOEA_INDUSTRIAL_ENDPOINT,
  MOEA_SOURCE_CATALOG,
  GLOBAL_SOURCE_CATALOG,
  FRED_STALE_AFTER_DAYS,
  MOEA_STALE_AFTER_DAYS,
  STATUS_VALUES,
  collectPublicSheetMetalInputs,
  freshnessStatus,
  getMoeaIndustrialBundle,
  getGlobalSheetMetalSources,
  globalSourceRecord,
  normalizeMoeaMonth,
  parseFredCsv,
  parseMoeaIndustrialCsv,
  unavailableSource,
  classifyRawMarketResult,
  classifyDomesticResult,
};
