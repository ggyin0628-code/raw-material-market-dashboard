const fs = require("node:fs/promises");
const path = require("node:path");
const { materials } = require("../lib/marketData/materials");
const { buildWeeklyReport, createWeeklyWorkbook, renderWeeklyHtml } = require("../lib/weekly/reportService");

const REPORTING_WEEK = "2026-W33";
const GENERATED_AT = "2026-08-17T01:00:00.000Z";
const DEFAULT_OUTPUT = path.resolve(__dirname, "../../raw-material-dashboard-previews", REPORTING_WEEK);

function previewRecords() {
  const weeklyFactors = [1.08, 0.94, 1.035, 0.975, 1.012, 0.982, 1.055, 1.04, 0.97, 1.015, 1.02, 0.99, 1.045, 0.96];
  const profiles = materials.flatMap((material, index) => {
    const base = 85 + index * 7;
    const prior = base;
    const current = base * weeklyFactors[index];
    const rows = [
      { material, date: "2026-07-19", marketPrice: base * (1 - (index % 3) * 0.012), status: "LIVE", source: "offline public-safe fixture" },
      { material, date: "2026-08-09", marketPrice: prior, status: "LIVE", source: "offline public-safe fixture" },
      { material, date: "2026-08-16", marketPrice: current, status: "LIVE", source: "offline public-safe fixture" },
    ];
    if (material.id === "gold") {
      rows[0].marketPrice = base * 0.92;
      rows[1].marketPrice = base * 0.9;
      rows[2].marketPrice = base * 1.18;
    }
    if (material.id === "coffee") rows[2] = { ...rows[2], status: "FALLBACK", source: "offline public fallback fixture" };
    if (material.id === "cotton") rows[2] = { ...rows[2], marketPrice: base * 0.98, status: "STALE", source: "offline stale public fixture" };
    if (material.id === "platinum") rows[2] = { ...rows[2], marketPrice: null, status: "NO_DATA", source: "offline public fixture" };
    if (material.id === "iron-ore") rows[2] = { ...rows[2], marketPrice: null, status: "API_ERROR", source: "offline public fixture" };
    return rows.map((row) => ({
      materialId: material.id,
      materialName: material.name,
      symbol: material.symbol,
      category: material.category,
      exchange: material.exchange,
      date: row.date,
      marketPrice: row.marketPrice,
      sourceUnit: material.unit,
      currency: material.currency,
      usdTwdRate: 32.1,
      twdReferenceValue: typeof row.marketPrice === "number" ? row.marketPrice * 32.1 : null,
      source: row.source,
      status: row.status,
      collectedAt: GENERATED_AT,
      lastTradeTimestamp: `${row.date}T12:00:00.000Z`,
    }));
  });
  return profiles.concat([
    { materialId: "__fx_usd_twd__", materialName: "USD/TWD", symbol: "TWD=X", category: "匯率", exchange: "PUBLIC FX", date: "2026-07-19", marketPrice: 31.9, sourceUnit: "TWD/USD", currency: "TWD", usdTwdRate: 31.9, twdReferenceValue: 31.9, source: "offline public FX fixture", status: "LIVE", collectedAt: GENERATED_AT, lastTradeTimestamp: "2026-07-19T12:00:00.000Z" },
    { materialId: "__fx_usd_twd__", materialName: "USD/TWD", symbol: "TWD=X", category: "匯率", exchange: "PUBLIC FX", date: "2026-08-09", marketPrice: 32, sourceUnit: "TWD/USD", currency: "TWD", usdTwdRate: 32, twdReferenceValue: 32, source: "offline public FX fixture", status: "LIVE", collectedAt: GENERATED_AT, lastTradeTimestamp: "2026-08-09T12:00:00.000Z" },
    { materialId: "__fx_usd_twd__", materialName: "USD/TWD", symbol: "TWD=X", category: "匯率", exchange: "PUBLIC FX", date: "2026-08-16", marketPrice: 32.1, sourceUnit: "TWD/USD", currency: "TWD", usdTwdRate: 32.1, twdReferenceValue: 32.1, source: "offline public FX fixture", status: "LIVE", collectedAt: GENERATED_AT, lastTradeTimestamp: "2026-08-16T12:00:00.000Z" },
  ]);
}

async function main() {
  const outputDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUTPUT;
  await fs.mkdir(outputDir, { recursive: true });
  const report = buildWeeklyReport({ records: previewRecords(), reportingWeek: REPORTING_WEEK, generatedAt: GENERATED_AT });
  const jsonPath = path.join(outputDir, `weekly-market-intelligence-${REPORTING_WEEK}.json`);
  const htmlPath = path.join(outputDir, `weekly-market-intelligence-${REPORTING_WEEK}.html`);
  const xlsxPath = path.join(outputDir, `weekly-market-intelligence-${REPORTING_WEEK}.xlsx`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(htmlPath, renderWeeklyHtml(report), "utf8");
  await (await createWeeklyWorkbook(report)).xlsx.writeFile(xlsxPath);
  process.stdout.write(JSON.stringify({
    reportingWeek: report.reportingWeek,
    qualityGate: report.qualityGate,
    outputDir,
    files: { jsonPath, htmlPath, xlsxPath },
    generatedOffline: true,
    networkCalls: 0,
    mailSent: false,
  }, null, 2) + "\n");
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { REPORTING_WEEK, GENERATED_AT, previewRecords, main };
