const { backfillPublicHistory } = require("./backfillService");
const { collectAndPersistDailySnapshot } = require("./dailySnapshotService");
const { generateWeeklyReport, getWeeklyWorkbook } = require("./weeklyEngine");
const { renderWeeklyHtml } = require("./reportService");
const { sendWeeklyEmail } = require("./mailService");
const { getStorageConfig, assertProductionStorage } = require("./storageConfig");
const { ensureStorageDirectories, getStorageStatus, readJobState, updateJobState, safeError } = require("./storageService");
const { evaluateWeeklyQuality } = require("./qualityGate");
const { listSnapshots } = require("./snapshotStore");
const { previousCompletedWeek } = require("./weekUtils");

function productionConfig(env = process.env) {
  const config = getStorageConfig(env, { forceProduction: true });
  assertProductionStorage(config);
  return config;
}

async function runProductionDaily(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || productionConfig(env);
  await ensureStorageDirectories(env, { config });
  return collectAndPersistDailySnapshot({ ...options, env, storageConfig: config, filePath: options.filePath || config.snapshotFile });
}

async function runProductionWeekly(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || productionConfig(env);
  await ensureStorageDirectories(env, { config });
  const reportingWeek = options.reportingWeek || previousCompletedWeek(options.now || new Date()).reportingWeek;
  await updateJobState("weeklyReport", { state: "RUNNING", lastAttemptedAt: new Date().toISOString(), reportingWeek }, { config });
  try {
    const generated = await generateWeeklyReport({
      reportingWeek,
      records: options.records,
      filePath: options.filePath || config.snapshotFile,
      outDir: options.outDir || config.reportDir,
      env,
      storageConfig: config,
    });
    const qualityGate = evaluateWeeklyQuality(generated.report, { artifactIntegrity: Boolean(generated.artifacts?.jsonPath && generated.artifacts?.htmlPath && generated.artifacts?.xlsxPath) });
    const dryRun = Boolean(options.dryRun || String(env.DRY_RUN || "").trim() === "1");
    let mail = { state: "NOT_REQUESTED", reportingWeek, sent: false };
    if (options.send !== false && qualityGate.readyForDelivery) {
      const workbook = await getWeeklyWorkbook({ report: generated.report });
      mail = await sendWeeklyEmail({
        report: generated.report,
        html: renderWeeklyHtml(generated.report),
        xlsxBuffer: workbook.buffer,
        dryRun,
        env,
        ledgerPath: options.ledgerPath || config.deliveryLedgerFile,
        allowResend: Boolean(options.allowResend),
        storageConfig: config,
      });
    } else if (!qualityGate.readyForDelivery) {
      mail = { state: "SEND_BLOCKED", reportingWeek, sent: false, reason: qualityGate.integrityReasons.concat(qualityGate.warningReasons) };
    }
    const result = {
      state: qualityGate.state,
      reportingWeek,
      qualityGate,
      mail,
      artifacts: generated.artifacts,
      report: generated.report,
    };
    await updateJobState("weeklyReport", {
      state: qualityGate.state,
      lastSuccessfulAt: new Date().toISOString(),
      reportingWeek,
      qualityGate,
      mailState: mail.state,
      artifacts: generated.artifacts ? Object.fromEntries(Object.entries(generated.artifacts).filter(([key]) => key !== "metadata")) : null,
    }, { config });
    return result;
  } catch (error) {
    await updateJobState("weeklyReport", { state: "FAILED", lastFailedAt: new Date().toISOString(), reportingWeek, lastError: safeError(error) }, { config }).catch(() => {});
    throw error;
  }
}

async function runProductionBootstrap(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || productionConfig(env);
  await ensureStorageDirectories(env, { config });
  const startedAt = new Date().toISOString();
  await updateJobState("productionBootstrap", { state: "RUNNING", lastAttemptedAt: startedAt }, { config });
  try {
    const backfill = options.backfill
      ? await options.backfill({ period: options.period || "3y", filePath: options.filePath || config.snapshotFile, env, collectedAt: startedAt })
      : await backfillPublicHistory({ period: options.period || "3y", filePath: options.filePath || config.snapshotFile, env, collectedAt: startedAt });
    const recordCount = (await listSnapshots({ filePath: options.filePath || config.snapshotFile })).length;
    const weekly = await runProductionWeekly({
      ...options,
      env,
      storageConfig: config,
      filePath: options.filePath || config.snapshotFile,
      send: false,
      dryRun: true,
    });
    const result = {
      state: weekly.qualityGate.state === "SEND_BLOCKED" ? "BOOTSTRAP_REPORT_BLOCKED" : "BOOTSTRAP_COMPLETE",
      startedAt,
      period: options.period || "3y",
      backfill,
      persistedRecordCount: recordCount,
      weekly: {
        reportingWeek: weekly.reportingWeek,
        qualityGate: weekly.qualityGate,
        mail: weekly.mail,
        artifacts: weekly.artifacts,
      },
    };
    await updateJobState("productionBootstrap", { state: result.state, lastSuccessfulAt: new Date().toISOString(), persistedRecordCount: recordCount, reportingWeek: weekly.reportingWeek, qualityGate: weekly.qualityGate }, { config });
    return result;
  } catch (error) {
    await updateJobState("productionBootstrap", { state: "FAILED", lastFailedAt: new Date().toISOString(), lastError: safeError(error) }, { config }).catch(() => {});
    throw error;
  }
}

async function runStorageCheck(options = {}) {
  const env = options.env || process.env;
  return getStorageStatus(env, { forceProduction: Boolean(options.forceProduction), config: options.storageConfig });
}

async function runBackup(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || productionConfig(env);
  await ensureStorageDirectories(env, { config });
  const { backupPublicStorage } = require("./storageService");
  return backupPublicStorage({ ...options, env, config });
}

function publicJobState(job) {
  if (!job || typeof job !== "object") return {};
  const result = { ...job };
  if (result.lastError) result.lastError = String(result.lastError).slice(0, 500);
  if (result.artifacts && typeof result.artifacts === "object") {
    result.artifacts = Object.fromEntries(Object.entries(result.artifacts).map(([key, value]) => [key, value ? require("node:path").basename(String(value)) : null]));
  }
  return result;
}

async function readProductionStatus(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || getStorageConfig(env, { forceProduction: Boolean(options.forceProduction) });
  const storage = await getStorageStatus(env, { config });
  const jobs = await readJobState(config.jobStateFile);
  return {
    generatedAt: new Date().toISOString(),
    timezone: "Asia/Taipei",
    storage,
    jobs: Object.fromEntries(Object.entries(jobs.jobs || {}).map(([name, value]) => [name, publicJobState(value)])),
    currentWeek: previousCompletedWeek(options.now || new Date()),
    warnings: [storage.state === "STORAGE_CONFIGURATION_REQUIRED" ? "STORAGE_CONFIGURATION_REQUIRED" : null].filter(Boolean),
  };
}

module.exports = {
  productionConfig,
  runProductionDaily,
  runProductionWeekly,
  runProductionBootstrap,
  runStorageCheck,
  runBackup,
  publicJobState,
  readProductionStatus,
};
