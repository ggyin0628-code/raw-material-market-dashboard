const fs = require("node:fs/promises");
const { collectAndPersistDailySnapshot } = require("./dailySnapshotService");
const { backfillPublicHistory } = require("./backfillService");
const { generateWeeklyReport, getWeeklyWorkbook } = require("./weeklyEngine");
const { renderWeeklyHtml } = require("./reportService");
const { sendWeeklyEmail } = require("./mailService");
const {
  runProductionDaily,
  runProductionWeekly,
  runProductionBootstrap,
  runStorageCheck,
  runBackup,
  readProductionStatus,
  runDatabaseMigration,
} = require("./productionService");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    if (key === "dry-run") options.dryRun = true;
    else if (key === "allow-resend") options.allowResend = true;
    else if (key === "send") options.send = true;
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
  if (command === "daily:snapshot") return collectAndPersistDailySnapshot({ filePath: options.file, env });
  if (command === "weekly:backfill") return backfillPublicHistory({ period: options.period || "3y", filePath: options.file, env });
  if (command === "weekly:report") {
    const generated = await generateWeeklyReport({ reportingWeek: options.week, outDir: options.out_dir, filePath: options.file, env });
    return { reportingWeek: generated.report.reportingWeek, artifacts: generated.artifacts, qualitySummary: generated.report.qualitySummary, qualityGate: generated.report.qualityGate };
  }
  if (command === "weekly:preview") {
    const generated = await generateWeeklyReport({ reportingWeek: options.week, outDir: options.out_dir, filePath: options.file, env, writeFiles: false });
    const html = renderWeeklyHtml(generated.report);
    if (options.out) await fs.writeFile(options.out, html, "utf8");
    return { reportingWeek: generated.report.reportingWeek, output: options.out || "stdout", html };
  }
  if (command === "weekly:send") {
    const generated = await generateWeeklyReport({ reportingWeek: options.week, outDir: options.out_dir, filePath: options.file, env });
    const workbook = await getWeeklyWorkbook({ report: generated.report });
    const result = await sendWeeklyEmail({ report: generated.report, html: renderWeeklyHtml(generated.report), xlsxBuffer: workbook.buffer, dryRun: Boolean(options.dry_run || ["1", "true", "yes", "on"].includes(String(env.DRY_RUN || "").toLowerCase())), env, ledgerPath: options.ledger });
    return { ...result, artifacts: generated.artifacts, qualityGate: generated.report.qualityGate };
  }
  if (command === "db:migrate") return runDatabaseMigration({ env });
  if (command === "production:storage-check") return runStorageCheck({ env, forceProduction: true });
  if (command === "production:status") return readProductionStatus({ env, forceProduction: true });
  if (command === "production:bootstrap") return runProductionBootstrap({ period: options.period || "3y", filePath: options.file, env });
  if (command === "production:daily") return runProductionDaily({ filePath: options.file, env });
  if (command === "production:weekly") return runProductionWeekly({ reportingWeek: options.week, filePath: options.file, outDir: options.out_dir, ledgerPath: options.ledger, env, dryRun: Boolean(options.dryRun), send: options.send !== false, allowResend: Boolean(options.allowResend) });
  if (command === "production:backup") return runBackup({ env, backupId: options.backup_id });
  const error = new Error("未知命令。可用：db:migrate、daily:snapshot、weekly:backfill、weekly:report、weekly:preview、weekly:send、production:storage-check、production:status、production:bootstrap、production:daily、production:weekly、production:backup");
  error.statusCode = 2;
  throw error;
}

function commandExitCode(result) {
  const states = [result?.state, result?.mail?.state, result?.storage?.state, result?.storage?.database?.state, ...(result?.warnings || []), result?.storage?.errorCode].filter(Boolean);
  if (states.some((state) => ["FAILED", "SEND_BLOCKED", "STORAGE_CONFIGURATION_REQUIRED", "DATABASE_URL_REQUIRED", "DATABASE_UNAVAILABLE", "DATABASE_MIGRATION_FAILED", "DATABASE_WRITE_FAILED", "DATABASE_READ_FAILED", "STORAGE_PROVIDER_INVALID", "BOOTSTRAP_REPORT_BLOCKED"].includes(state))) return 2;
  return 0;
}

function errorExitCode(error) {
  if (["FAILED", "SEND_BLOCKED", "STORAGE_CONFIGURATION_REQUIRED", "DATABASE_URL_REQUIRED", "DATABASE_UNAVAILABLE", "DATABASE_MIGRATION_FAILED", "DATABASE_WRITE_FAILED", "DATABASE_READ_FAILED", "STORAGE_PROVIDER_INVALID", "BOOTSTRAP_REPORT_BLOCKED", "SNAPSHOT_STORE_INVALID", "JOB_STATE_INVALID", "REPORT_METADATA_INVALID", "DELIVERY_LEDGER_INVALID"].includes(error?.code)) return 2;
  if (Number(error?.statusCode) >= 400) return 2;
  return 1;
}

if (require.main === module) {
  run(process.argv[2]).then((result) => {
    printJson(result);
    process.exitCode = commandExitCode(result);
  }).catch((error) => {
    const message = String(error?.message || error || "未知錯誤").replace(/(MAIL_PASSWORD|password|token|secret|authorization)\s*[:=]\s*\S+/gi, "$1=[REDACTED]").slice(0, 500);
    process.stderr.write(`${JSON.stringify({ state: error?.code || "FAILED", error: message })}\n`);
    process.exitCode = errorExitCode(error);
  });
}

module.exports = {
  parseArgs,
  run,
  commandExitCode,
  errorExitCode,
};
