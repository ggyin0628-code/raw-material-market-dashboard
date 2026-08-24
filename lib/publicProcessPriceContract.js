const CHECKED_AT = "2026-08-24";

const SOURCE_ROLES = Object.freeze([
  "DIRECT_VENDOR_LISTED_PRICE",
  "MARKETPLACE_QUOTE_STATISTIC",
  "INDUSTRY_MACHINE_HOUR_REFERENCE",
  "ACADEMIC_SERVICE_RATE",
  "PUBLIC_ESTIMATE_REFERENCE",
  "NO_PUBLIC_PRICE_DATA",
]);

const PROCESS_VALUES = Object.freeze(["CNC", "SHEET_METAL"]);
const CONFIDENCE_VALUES = Object.freeze(["HIGH", "MEDIUM", "LOW"]);

function record(fields) {
  return Object.freeze({
    process: fields.process,
    machineType: fields.machineType || null,
    material: fields.material || null,
    thickness: fields.thickness ?? null,
    priceMin: fields.priceMin ?? null,
    priceMax: fields.priceMax ?? null,
    priceOpenEnded: Boolean(fields.priceOpenEnded),
    currency: fields.currency ?? null,
    unit: fields.unit,
    pricingBasis: fields.pricingBasis,
    sourceName: fields.sourceName,
    sourceUrl: fields.sourceUrl || null,
    publishedAt: fields.publishedAt || null,
    checkedAt: fields.checkedAt || CHECKED_AT,
    geographicScope: fields.geographicScope,
    includes: Object.freeze([...(fields.includes || [])]),
    excludes: Object.freeze([...(fields.excludes || [])]),
    confidence: fields.confidence,
    sourceRole: fields.sourceRole,
    notes: fields.notes || "",
    smallHoleFeeMin: fields.smallHoleFeeMin ?? null,
    smallHoleFeeMax: fields.smallHoleFeeMax ?? null,
    smallHoleUnit: fields.smallHoleUnit || null,
    smallHoleBasis: fields.smallHoleBasis || null,
  });
}

const CNC_MACHINE_HOUR_SOURCE = {
  sourceName: "台灣CNC產業權威：CNC加工成本公式大公開",
  sourceUrl: "https://taiwancnc.org/%E5%8A%A0%E5%B7%A5%E6%88%90%E6%9C%AC%E5%85%AC%E5%BC%8F",
  publishedAt: "2025-02-27",
  checkedAt: CHECKED_AT,
  geographicScope: "Taiwan-oriented public estimate",
  sourceRole: "INDUSTRY_MACHINE_HOUR_REFERENCE",
  confidence: "MEDIUM",
  includes: ["machine-hour reference", "public estimate table", "Taiwan-oriented cost framing"],
  excludes: ["material cost", "customer-specific job quote", "supplier contract price", "profit margin normalization"],
};

const CNC_MARKETPLACE_SOURCE = {
  sourceName: "PRO360 達人網：CNC加工費用價格行情",
  sourceUrl: "https://www.pro360.com.tw/price/cnc_milling",
  publishedAt: "2023-08-25",
  checkedAt: CHECKED_AT,
  geographicScope: "Taiwan marketplace quote statistics",
  sourceRole: "MARKETPLACE_QUOTE_STATISTIC",
  confidence: "MEDIUM",
  includes: ["platform customer quote statistics", "CNC machining time quote range"],
  excludes: ["machine-hour cost accounting", "material cost", "individual supplier contract", "guaranteed current quote"],
};

const LASER_MINCA_SOURCE = {
  sourceName: "MINCA：雷射切割價格",
  sourceUrl: "https://www.minca.tw/zh-TW/%E6%9C%80%E6%96%B0%E6%B6%88%E6%81%AF/laser-cutting-price",
  publishedAt: null,
  checkedAt: CHECKED_AT,
  geographicScope: "Taiwan vendor-listed public price table",
  sourceRole: "DIRECT_VENDOR_LISTED_PRICE",
  confidence: "HIGH",
  includes: ["listed per-meter cutting fee", "listed small circular-hole fee for diameter up to 30 mm", "black steel", "stainless/galvanized grouping", "aluminum"],
  excludes: ["material sheet cost", "quantity/low-volume adjustment", "bevel and angled-hole fee", "holes above 30 mm charged by perimeter", "customer-specific quotation"],
};

const LASER_ZHONGKAI_SOURCE = {
  sourceName: "仲凱雷射：雷射切割與折彎成型服務",
  sourceUrl: "https://www.zhongkai-laser.com/services",
  publishedAt: null,
  checkedAt: CHECKED_AT,
  geographicScope: "Taichung, Taiwan vendor-listed public price table",
  sourceRole: "DIRECT_VENDOR_LISTED_PRICE",
  confidence: "HIGH",
  includes: ["listed per-meter cutting fee", "SS41 black steel", "SUS304 stainless steel", "AL6061 aluminum"],
  excludes: ["small-hole surcharge not separately published on checked page", "thick-plate separately discussed", "low-volume/sample adjustment", "material sheet cost", "customer-specific quotation"],
};

function cncHour(fields) {
  return record({ process: "CNC", machineType: fields.machineType, material: null, thickness: null, priceMin: fields.priceMin, priceMax: fields.priceMax, priceOpenEnded: fields.priceOpenEnded, currency: "TWD", unit: "TWD/hr", pricingBasis: "industry machine-hour reference; hourly rate", ...CNC_MACHINE_HOUR_SOURCE, notes: "此為機台小時費率公開參考；不可與 marketplace TWD/min 直接平均。" });
}

function laserRow(source, material, thickness, price, smallHole = null) {
  return record({
    process: "SHEET_METAL",
    machineType: "LASER_CUTTING",
    material,
    thickness: `${thickness} mm`,
    priceMin: price,
    priceMax: price,
    currency: "TWD",
    unit: "TWD/m",
    pricingBasis: "direct vendor listed per-meter cutting fee by material and thickness",
    ...source,
    notes: source === LASER_MINCA_SOURCE ? "MINCA listed table；同頁另列小圓孔費與孔徑規則。" : "仲凱雷射 listed table；厚板價格另議。",
    smallHoleFeeMin: smallHole,
    smallHoleFeeMax: smallHole,
    smallHoleUnit: smallHole == null ? null : "TWD/hole",
    smallHoleBasis: smallHole == null ? null : "直徑 30 mm 以下圓孔切割費",
  });
}

const PUBLIC_PRICE_REFERENCES = Object.freeze([
  cncHour({ machineType: "CNC_3_AXIS_MILL", priceMin: 1000, priceMax: 1600 }),
  cncHour({ machineType: "CNC_2_AXIS_LATHE", priceMin: 900, priceMax: 1500 }),
  cncHour({ machineType: "CNC_5_AXIS_MILL", priceMin: 2000, priceMax: null, priceOpenEnded: true }),
  cncHour({ machineType: "CNC_TURN_MILL", priceMin: 1800, priceMax: null, priceOpenEnded: true }),
  record({ process: "CNC", machineType: "CNC_MILL_OR_LATHE", priceMin: 80, priceMax: 120, currency: "TWD", unit: "TWD/min", pricingBasis: "marketplace customer quote statistic by machining time", ...CNC_MARKETPLACE_SOURCE, notes: "PRO360 platform quote statistic；保留 TWD/min 單位，不轉成或平均為 machine-hour cost。" }),

  laserRow(LASER_MINCA_SOURCE, "BLACK_STEEL", "1.0", 10, 2.5),
  laserRow(LASER_MINCA_SOURCE, "BLACK_STEEL", "1.2", 12, 2.5),
  laserRow(LASER_MINCA_SOURCE, "BLACK_STEEL", "1.5", 15, 2.5),
  laserRow(LASER_MINCA_SOURCE, "BLACK_STEEL", "2.0", 20, 2.5),
  laserRow(LASER_MINCA_SOURCE, "BLACK_STEEL", "2.5", 25, 2.5),
  laserRow(LASER_MINCA_SOURCE, "BLACK_STEEL", "3.0", 30, 3),
  laserRow(LASER_MINCA_SOURCE, "BLACK_STEEL", "4.0", 40, 4),
  laserRow(LASER_MINCA_SOURCE, "BLACK_STEEL", "4.5", 45, 4.5),
  laserRow(LASER_MINCA_SOURCE, "BLACK_STEEL", "5.0", 50, 5),
  laserRow(LASER_MINCA_SOURCE, "BLACK_STEEL", "6.0", 60, 6),
  laserRow(LASER_MINCA_SOURCE, "STAINLESS_OR_GALVANIZED", "1.0", 20, 5.2),
  laserRow(LASER_MINCA_SOURCE, "STAINLESS_OR_GALVANIZED", "1.2", 24, 5.2),
  laserRow(LASER_MINCA_SOURCE, "STAINLESS_OR_GALVANIZED", "1.5", 30, 5.2),
  laserRow(LASER_MINCA_SOURCE, "STAINLESS_OR_GALVANIZED", "2.0", 40, 5.2),
  laserRow(LASER_MINCA_SOURCE, "STAINLESS_OR_GALVANIZED", "2.5", 50, 5.2),
  laserRow(LASER_MINCA_SOURCE, "STAINLESS_OR_GALVANIZED", "3.0", 60, 6.24),
  laserRow(LASER_MINCA_SOURCE, "STAINLESS_OR_GALVANIZED", "4.0", 80, 8.32),
  laserRow(LASER_MINCA_SOURCE, "STAINLESS_OR_GALVANIZED", "4.5", 90, 9.36),
  laserRow(LASER_MINCA_SOURCE, "STAINLESS_OR_GALVANIZED", "5.0", 100, 10.4),
  laserRow(LASER_MINCA_SOURCE, "STAINLESS_OR_GALVANIZED", "6.0", 120, 12.48),
  laserRow(LASER_MINCA_SOURCE, "ALUMINUM", "1.0", 30, 7.5),
  laserRow(LASER_MINCA_SOURCE, "ALUMINUM", "1.2", 36, 7.5),
  laserRow(LASER_MINCA_SOURCE, "ALUMINUM", "1.5", 45, 7.5),
  laserRow(LASER_MINCA_SOURCE, "ALUMINUM", "2.0", 60, 7.5),
  laserRow(LASER_MINCA_SOURCE, "ALUMINUM", "2.5", 75, 7.5),
  laserRow(LASER_MINCA_SOURCE, "ALUMINUM", "3.0", 90, 9),
  laserRow(LASER_MINCA_SOURCE, "ALUMINUM", "4.0", 120, 12),
  laserRow(LASER_MINCA_SOURCE, "ALUMINUM", "4.5", 135, 13.5),
  laserRow(LASER_MINCA_SOURCE, "ALUMINUM", "5.0", 150, 15),
  laserRow(LASER_MINCA_SOURCE, "ALUMINUM", "6.0", 180, 18),

  laserRow(LASER_ZHONGKAI_SOURCE, "BLACK_STEEL", "1.2", 12),
  laserRow(LASER_ZHONGKAI_SOURCE, "BLACK_STEEL", "1.6", 16),
  laserRow(LASER_ZHONGKAI_SOURCE, "BLACK_STEEL", "2.0", 20),
  laserRow(LASER_ZHONGKAI_SOURCE, "BLACK_STEEL", "2.3", 23),
  laserRow(LASER_ZHONGKAI_SOURCE, "BLACK_STEEL", "3.0", 30),
  laserRow(LASER_ZHONGKAI_SOURCE, "BLACK_STEEL", "4.0", 40),
  laserRow(LASER_ZHONGKAI_SOURCE, "BLACK_STEEL", "4.5", 45),
  laserRow(LASER_ZHONGKAI_SOURCE, "BLACK_STEEL", "5.0", 50),
  laserRow(LASER_ZHONGKAI_SOURCE, "BLACK_STEEL", "6.0", 60),
  laserRow(LASER_ZHONGKAI_SOURCE, "STAINLESS_STEEL", "1.2", 21.6),
  laserRow(LASER_ZHONGKAI_SOURCE, "STAINLESS_STEEL", "1.5", 27),
  laserRow(LASER_ZHONGKAI_SOURCE, "STAINLESS_STEEL", "2.0", 36),
  laserRow(LASER_ZHONGKAI_SOURCE, "STAINLESS_STEEL", "2.3", 45),
  laserRow(LASER_ZHONGKAI_SOURCE, "STAINLESS_STEEL", "3.0", 54),
  laserRow(LASER_ZHONGKAI_SOURCE, "STAINLESS_STEEL", "4.0", 72),
  laserRow(LASER_ZHONGKAI_SOURCE, "STAINLESS_STEEL", "4.5", 81),
  laserRow(LASER_ZHONGKAI_SOURCE, "STAINLESS_STEEL", "5.0", 90),
  laserRow(LASER_ZHONGKAI_SOURCE, "STAINLESS_STEEL", "6.0", 108),
  laserRow(LASER_ZHONGKAI_SOURCE, "ALUMINUM", "1.2", 36),
  laserRow(LASER_ZHONGKAI_SOURCE, "ALUMINUM", "1.6", 48),
  laserRow(LASER_ZHONGKAI_SOURCE, "ALUMINUM", "2.0", 60),
  laserRow(LASER_ZHONGKAI_SOURCE, "ALUMINUM", "3.0", 90),
  laserRow(LASER_ZHONGKAI_SOURCE, "ALUMINUM", "4.0", 120),
  laserRow(LASER_ZHONGKAI_SOURCE, "ALUMINUM", "4.5", 135),
  laserRow(LASER_ZHONGKAI_SOURCE, "ALUMINUM", "5.0", 150),
  laserRow(LASER_ZHONGKAI_SOURCE, "ALUMINUM", "6.0", 180),

  record({ process: "SHEET_METAL", machineType: "BENDING", material: null, thickness: null, priceMin: null, priceMax: null, currency: "TWD", unit: "NO_PUBLIC_PRICE_DATA", pricingBasis: "public monetary basis not accepted; known drivers are per bend, quantity, workpiece length, material, thickness and setup/tooling complexity", sourceName: "公開來源稽核：折彎目前沒有足夠可靠的台灣公開金額表", sourceUrl: null, publishedAt: null, checkedAt: CHECKED_AT, geographicScope: "Taiwan", includes: ["per-bend driver", "quantity driver", "workpiece length", "material", "thickness", "setup/tooling complexity"], excludes: ["pressure score as money", "old marketplace listing elevated to current benchmark", "supplier quotation"], confidence: "LOW", sourceRole: "NO_PUBLIC_PRICE_DATA", notes: "顯示公開金額資料不足；不以 pressure score 代替折彎價格。" }),
  record({ process: "SHEET_METAL", machineType: "WELDING_TIG", material: null, thickness: null, priceMin: null, priceMax: null, currency: "TWD", unit: "NO_PUBLIC_PRICE_DATA", pricingBasis: "no accepted current public monetary range; possible bases include per hour, per weld length or per piece", sourceName: "公開來源稽核：TIG 焊目前沒有足夠可靠的台灣公開金額表", sourceUrl: null, publishedAt: null, checkedAt: CHECKED_AT, geographicScope: "Taiwan", includes: ["TIG process distinction", "per-hour/per-length/per-piece driver distinction"], excludes: ["MIG/CO2 rate substitution", "spot-weld point rate substitution", "pressure score as money", "supplier quotation"], confidence: "LOW", sourceRole: "NO_PUBLIC_PRICE_DATA", notes: "TIG 以 NO_PUBLIC_PRICE_DATA 呈現；不發明每小時或每米費率。" }),
  record({ process: "SHEET_METAL", machineType: "WELDING_MIG_CO2", material: null, thickness: null, priceMin: null, priceMax: null, currency: "TWD", unit: "NO_PUBLIC_PRICE_DATA", pricingBasis: "no accepted current public monetary range; possible bases include per hour, per weld length or per piece", sourceName: "公開來源稽核：MIG/CO2 焊目前沒有足夠可靠的台灣公開金額表", sourceUrl: null, publishedAt: null, checkedAt: CHECKED_AT, geographicScope: "Taiwan", includes: ["MIG/CO2 process distinction", "per-hour/per-length/per-piece driver distinction"], excludes: ["TIG rate substitution", "spot-weld point rate substitution", "pressure score as money", "supplier quotation"], confidence: "LOW", sourceRole: "NO_PUBLIC_PRICE_DATA", notes: "MIG/CO2 以 NO_PUBLIC_PRICE_DATA 呈現；不發明每小時或每米費率。" }),
  record({ process: "SHEET_METAL", machineType: "WELDING_SPOT", material: null, thickness: null, priceMin: null, priceMax: null, currency: "TWD", unit: "NO_PUBLIC_PRICE_DATA", pricingBasis: "no accepted current public monetary range; possible basis includes per point or per piece", sourceName: "公開來源稽核：點焊目前沒有足夠可靠的台灣公開金額表", sourceUrl: null, publishedAt: null, checkedAt: CHECKED_AT, geographicScope: "Taiwan", includes: ["spot-welding process distinction", "per-point/per-piece driver distinction"], excludes: ["TIG rate substitution", "MIG/CO2 rate substitution", "pressure score as money", "supplier quotation"], confidence: "LOW", sourceRole: "NO_PUBLIC_PRICE_DATA", notes: "點焊以 NO_PUBLIC_PRICE_DATA 呈現；不發明每點或每件費率。" }),
]);

function validatePublicPriceReference(item) {
  const errors = [];
  if (!item || typeof item !== "object" || Array.isArray(item)) return ["reference must be an object"];
  if (!PROCESS_VALUES.includes(item.process)) errors.push("invalid process");
  if (!item.machineType) errors.push("machineType is required");
  if (!item.unit) errors.push("unit is required");
  if (!item.pricingBasis) errors.push("pricingBasis is required");
  if (!item.sourceName) errors.push("sourceName is required");
  if (!item.checkedAt || Number.isNaN(new Date(item.checkedAt).getTime())) errors.push("checkedAt must be a valid date");
  if (!item.geographicScope) errors.push("geographicScope is required");
  if (!SOURCE_ROLES.includes(item.sourceRole)) errors.push("invalid sourceRole");
  if (!CONFIDENCE_VALUES.includes(item.confidence)) errors.push("invalid confidence");
  if (!Array.isArray(item.includes) || !Array.isArray(item.excludes)) errors.push("includes/excludes must be arrays");
  if (typeof item.priceOpenEnded !== "boolean") errors.push("priceOpenEnded must be boolean");
  for (const key of ["priceMin", "priceMax", "smallHoleFeeMin", "smallHoleFeeMax"]) {
    if (item[key] !== null && (typeof item[key] !== "number" || !Number.isFinite(item[key]) || item[key] < 0)) errors.push(`${key} must be null or a non-negative finite number`);
  }
  if (item.priceMin !== null && item.priceMax !== null && item.priceMin > item.priceMax) errors.push("priceMin must not exceed priceMax");
  if (item.priceOpenEnded && (item.priceMin === null || item.priceMax !== null)) errors.push("open-ended price requires priceMin and null priceMax");
  if (item.sourceRole === "NO_PUBLIC_PRICE_DATA" && (item.priceMin !== null || item.priceMax !== null || item.priceOpenEnded)) errors.push("NO_PUBLIC_PRICE_DATA cannot carry a monetary range");
  if (item.sourceRole !== "NO_PUBLIC_PRICE_DATA" && !item.sourceUrl) errors.push("accepted monetary source requires sourceUrl");
  if (item.smallHoleFeeMin !== null && !item.smallHoleUnit) errors.push("small-hole fee requires smallHoleUnit");
  return errors;
}

function validatePublicPriceReferences(references) {
  if (!Array.isArray(references)) return ["publicPriceReferences must be an array"];
  return references.flatMap((item, index) => validatePublicPriceReference(item).map((error) => `references[${index}]: ${error}`));
}

function getPublicPriceReferences({ process } = {}) {
  return PUBLIC_PRICE_REFERENCES.filter((item) => !process || item.process === process).map((item) => ({ ...item, includes: [...item.includes], excludes: [...item.excludes] }));
}

module.exports = {
  CHECKED_AT,
  CONFIDENCE_VALUES,
  PROCESS_VALUES,
  PUBLIC_PRICE_REFERENCES,
  SOURCE_ROLES,
  getPublicPriceReferences,
  validatePublicPriceReference,
  validatePublicPriceReferences,
};
