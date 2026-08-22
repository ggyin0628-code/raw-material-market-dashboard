const { createWeeklyWorkbook, loadAndBuildWeeklyReport, renderWeeklyHtml, writeWeeklyReportFiles } = require("./reportService");
const { listSnapshots } = require("./snapshotStore");

async function generateWeeklyReport(options = {}) {
  const report = await loadAndBuildWeeklyReport(options);
  const artifacts = options.writeFiles === false ? null : await writeWeeklyReportFiles(report, options.outDir, { env: options.env, config: options.storageConfig });
  return { report, artifacts };
}

async function getWeeklyPreview(options = {}) {
  const report = await loadAndBuildWeeklyReport(options);
  return { report, html: renderWeeklyHtml(report) };
}

async function getWeeklyWorkbook(options = {}) {
  const report = options.report || await loadAndBuildWeeklyReport(options);
  const workbook = createWeeklyWorkbook(report);
  return { report, buffer: await workbook.xlsx.writeBuffer(), filename: `weekly-market-intelligence-${report.reportingWeek}.xlsx` };
}

async function getWeeklyReportRecords(options = {}) {
  return listSnapshots({ filePath: options.filePath, env: options.env, from: options.from, to: options.to });
}

module.exports = {
  generateWeeklyReport,
  getWeeklyPreview,
  getWeeklyWorkbook,
  getWeeklyReportRecords,
};
