const { collectAndPersistDailySnapshot } = require("./dailySnapshotService");
const { backfillPublicHistory } = require("./backfillService");
const { generateWeeklyReport, getWeeklyWorkbook } = require("./weeklyEngine");
const { renderWeeklyHtml, writeWeeklyReportFiles } = require("./reportService");
const { sendWeeklyEmail } = require("./mailService");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    if (key === "dry-run") options.dryRun = true;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) { options[key.replaceAll("-", "_")] = argv[index + 1]; index += 1; }
    else options[key.replaceAll("-", "_")] = true;
  }
  return options;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function run(command, argv = process.argv.slice(3), env = process.env) {
  const options = parseArgs(argv);
  if (command === "daily:snapshot") {
    return collectAndPersistDailySnapshot({ filePath: options.file, env });
  }
  if (command === "weekly:backfill") {
    return backfillPublicHistory({ period: options.period || "3y", filePath: options.file, env });
  }
  if (command === "weekly:report") {
    const generated = await generateWeeklyReport({ reportingWeek: options.week, outDir: options.out_dir, filePath: options.file });
    return { reportingWeek: generated.report.reportingWeek, artifacts: generated.artifacts, qualitySummary: generated.report.qualitySummary };
  }
  if (command === "weekly:preview") {
    const generated = await generateWeeklyReport({ reportingWeek: options.week, outDir: options.out_dir, filePath: options.file, writeFiles: false });
    const html = renderWeeklyHtml(generated.report);
    if (options.out) {
      const fs = require("node:fs/promises");
      await fs.writeFile(options.out, html, "utf8");
    }
    return { reportingWeek: generated.report.reportingWeek, output: options.out || "stdout", html };
  }
  if (command === "weekly:send") {
    const generated = await generateWeeklyReport({ reportingWeek: options.week, outDir: options.out_dir, filePath: options.file });
    const workbook = await getWeeklyWorkbook({ report: generated.report });
    const result = await sendWeeklyEmail({ report: generated.report, html: renderWeeklyHtml(generated.report), xlsxBuffer: workbook.buffer, dryRun: Boolean(options.dry_run || ["1", "true", "yes", "on"].includes(String(env.DRY_RUN || "").toLowerCase())), env, ledgerPath: options.ledger });
    return { ...result, artifacts: generated.artifacts };
  }
  const error = new Error("未知命令。可用：daily:snapshot、weekly:backfill、weekly:report、weekly:preview、weekly:send");
  error.statusCode = 2;
  throw error;
}

if (require.main === module) {
  run(process.argv[2]).then((result) => {
    printJson(result);
    if (["FAILED"].includes(result.state)) process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = Number(error.statusCode) || 1;
  });
}

module.exports = {
  parseArgs,
  run,
};
