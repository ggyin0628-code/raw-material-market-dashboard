const { backfillPublicHistory } = require("./backfillService");
const { collectAndPersistDailySnapshot } = require("./dailySnapshotService");
const { generateWeeklyReport, getWeeklyWorkbook } = require("./weeklyEngine");
const { renderWeeklyHtml } = require("./reportService");
const { sendWeeklyEmail, readMailConfig, validateMailConfig } = require("./mailService");
const { getStorageConfig, assertProductionStorage } = require("./storageConfig");
const { ensureStorageDirectories, getStorageStatus, readJobState, updateJobState, safeError, backupPublicStorage } = require("./storageService");
const { evaluateWeeklyQuality } = require("./qualityGate");
const { listSnapshots } = require("./snapshotStore");
const { previousCompletedWeek } = require("./weekUtils");
const { migratePostgres, createPostgresPool } = require("./postgresAdapter");

function productionConfig(env = process.env) {
  const config = getStorageConfig(env, { forceProduction: true });
  assertProductionStorage(config);
  return config;
}

async function ensureProductionDatabase(config, env, options = {}) {
  if (config.provider !== "postgres") return null;
  return migratePostgres({ env, pool: options.pool });
}

function storageOptions(options, config) {
  return { env: options.env, storageConfig: config, pool: options.pool, filePath: options.filePath };
}

function publicBootstrapProgress(event = {}) {
  const safe = {
    phase: String(event.phase || "unknown").slice(0, 64),
    materialIndex: Number.isFinite(event.materialIndex) ? event.materialIndex : undefined,
    materialCount: Number.isFinite(event.materialCount) ? event.materialCount : undefined,
    batchNumber: Number.isFinite(event.batchNumber) ? event.batchNumber : undefined,
    batchCount: Number.isFinite(event.batchCount) ? event.batchCount : undefined,
    materialId: event.materialId ? String(event.materialId).slice(0, 80) : undefined,
    symbol: event.symbol ? String(event.symbol).slice(0, 80) : undefined,
    rows: Number.isFinite(event.rows) ? event.rows : undefined,
    inserted: Number.isFinite(event.inserted) ? event.inserted : undefined,
    replaced: Number.isFinite(event.replaced) ? event.replaced : undefined,
    ignored: Number.isFinite(event.ignored) ? event.ignored : undefined,
    status: event.status ? String(event.status).slice(0, 32) : undefined,
  };
  return Object.fromEntries(Object.entries(safe).filter(([, value]) => value !== undefined));
}

async function runProductionDaily(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || productionConfig(env);
  await ensureProductionDatabase(config, env, options);
  await ensureStorageDirectories(env, { config });
  return collectAndPersistDailySnapshot({ ...options, env, storageConfig: config, filePath: options.filePath, pool: options.pool });
}

async function runProductionWeekly(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || productionConfig(env);
  await ensureProductionDatabase(config, env, options);
  await ensureStorageDirectories(env, { config });
  const reportingWeek = options.reportingWeek || previousCompletedWeek(options.now || new Date()).reportingWeek;
  await updateJobState("weeklyReport", { state: "RUNNING", lastAttemptedAt: new Date().toISOString(), reportingWeek }, { ...storageOptions(options, config) });
  try {
    const generated = await generateWeeklyReport({
      reportingWeek,
      records: options.records,
      filePath: options.filePath,
      outDir: options.outDir || config.reportDir,
      env,
      storageConfig: config,
      pool: options.pool,
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
        ledgerPath: options.ledgerPath,
        allowResend: Boolean(options.allowResend),
        storageConfig: config,
        pool: options.pool,
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
    }, { ...storageOptions(options, config) });
    return result;
  } catch (error) {
    await updateJobState("weeklyReport", { state: "FAILED", lastFailedAt: new Date().toISOString(), reportingWeek, lastError: safeError(error) }, { ...storageOptions(options, config) }).catch(() => {});
    throw error;
  }
}

async function runProductionBootstrap(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || productionConfig(env);
  const runtime = config.provider === "postgres" && !options.pool ? createPostgresPool(env) : { pool: options.pool, owned: false };
  const runtimeOptions = { ...options, pool: runtime.pool };
  const stateOptions = storageOptions(runtimeOptions, config);
  const startedAt = new Date().toISOString();
  let progressEventCount = 0;
  const emitProgress = async (event) => {
    const progress = publicBootstrapProgress(event);
    progressEventCount += 1;
    if (options.logProgress !== false) process.stdout.write(`[bootstrap] ${JSON.stringify(progress)}\n`);
    await updateJobState("productionBootstrap", { state: "RUNNING", lastAttemptedAt: startedAt, progress }, stateOptions);
    if (typeof options.onProgress === "function") await options.onProgress(progress);
  };
  try {
    await ensureProductionDatabase(config, env, runtimeOptions);
    await ensureStorageDirectories(env, { config });
    await updateJobState("productionBootstrap", { state: "RUNNING", lastAttemptedAt: startedAt }, stateOptions);
    const backfill = options.backfill
      ? await options.backfill({ period: options.period || "3y", filePath: options.filePath, env, storageConfig: config, pool: runtime.pool, collectedAt: startedAt, onProgress: emitProgress })
      : await backfillPublicHistory({ period: options.period || "3y", filePath: options.filePath, env, storageConfig: config, pool: runtime.pool, collectedAt: startedAt, batchSize: options.batchSize, onProgress: emitProgress });
    const recordCount = (await listSnapshots({ filePath: options.filePath, env, storageConfig: config, pool: runtime.pool })).length;
    const weekly = await runProductionWeekly({
      ...runtimeOptions,
      env,
      storageConfig: config,
      filePath: options.filePath,
      pool: runtime.pool,
      send: false,
      dryRun: true,
    });
    const elapsedMs = Date.now() - Date.parse(startedAt);
    const result = {
      state: weekly.qualityGate.state === "SEND_BLOCKED" ? "BOOTSTRAP_REPORT_BLOCKED" : "BOOTSTRAP_COMPLETE",
      startedAt,
      completedAt: new Date().toISOString(),
      elapsedMs,
      period: options.period || "3y",
      materialCount: backfill.materialCount ?? backfill.results?.length ?? 0,
      fetchedRows: backfill.fetchedRows ?? backfill.recordCount ?? 0,
      apiErrorMaterials: backfill.failureCount ?? backfill.results?.filter((item) => item.status === "API_ERROR").length ?? 0,
      progressEventCount,
      backfill,
      persistedRecordCount: recordCount,
      weekly: { reportingWeek: weekly.reportingWeek, qualityGate: weekly.qualityGate, mail: weekly.mail, artifacts: weekly.artifacts },
    };
    await updateJobState("productionBootstrap", { state: result.state, lastSuccessfulAt: result.completedAt, elapsedMs, period: result.period, materialCount: result.materialCount, fetchedRows: result.fetchedRows, apiErrorMaterials: result.apiErrorMaterials, persistedRecordCount: recordCount, reportingWeek: weekly.reportingWeek, qualityGate: weekly.qualityGate }, stateOptions);
    return result;
  } catch (error) {
    await updateJobState("productionBootstrap", { state: "FAILED", lastFailedAt: new Date().toISOString(), elapsedMs: Date.now() - Date.parse(startedAt), lastError: safeError(error) }, stateOptions).catch(() => {});
    throw error;
  } finally {
    if (runtime.owned) await runtime.pool.end().catch(() => {});
  }
}

async function runDatabaseMigration(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || getStorageConfig(env, { forceProduction: true });
  if (config.provider !== "postgres") return { state: "DATABASE_MIGRATION_NOT_REQUIRED", provider: config.provider };
  assertProductionStorage(config);
  return migratePostgres({ env, pool: options.pool });
}

async function runStorageCheck(options = {}) {
  const env = options.env || process.env;
  return getStorageStatus(env, { forceProduction: Boolean(options.forceProduction), config: options.storageConfig, pool: options.pool });
}

async function runBackup(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || productionConfig(env);
  await ensureStorageDirectories(env, { config });
  return backupPublicStorage({ ...options, env, config, pool: options.pool });
}

function publicJobState(job) {
  if (!job || typeof job !== "object") return {};
  const result = { ...job };
  if (result.lastError) result.lastError = String(result.lastError).slice(0, 500);
  if (result.artifacts && typeof result.artifacts === "object") {
    result.artifacts = Object.fromEntries(Object.entries(result.artifacts).map(([key, value]) => [key, typeof value === "string" ? require("node:path").basename(value) : value ? "metadata" : null]));
  }
  return result;
}

async function readProductionStatus(options = {}) {
  const env = options.env || process.env;
  const config = options.storageConfig || getStorageConfig(env, { forceProduction: Boolean(options.forceProduction) });
  const storage = await getStorageStatus(env, { config, pool: options.pool });
  const jobs = !storage.ready
    ? { version: 1, jobs: {} }
    : await readJobState(config.jobStateFile, { env, config, pool: options.pool });
  const publicJobs = Object.fromEntries(Object.entries(jobs.jobs || {}).map(([name, value]) => [name, publicJobState(value)]));
  const mailConfig = readMailConfig(env);
  const mailCheck = validateMailConfig(mailConfig);
  const databaseState = config.provider === "postgres"
    ? (storage.database?.state === "DATABASE_READY" ? "DATABASE_READY" : storage.database?.state || "DATABASE_UNAVAILABLE")
    : "DATABASE_NOT_USED";
  const dailyState = publicJobs.dailySnapshot?.state === "SUCCEEDED" ? "DAILY_DATA_READY" : "DAILY_DATA_NOT_READY";
  const weeklyState = ["SEND_OK", "SEND_WITH_WARNINGS"].includes(publicJobs.weeklyReport?.state) ? "WEEKLY_REPORT_READY" : "WEEKLY_REPORT_NOT_READY";
  const warnings = [];
  if (!storage.ready) warnings.push(storage.database?.state || storage.state);
  if (!mailCheck.valid) warnings.push("MAIL_CONFIGURATION_REQUIRED");
  return {
    generatedAt: new Date().toISOString(),
    timezone: "Asia/Taipei",
    readiness: {
      web: "WEB_READY",
      database: databaseState,
      dailyData: dailyState,
      weeklyReport: weeklyState,
      mailConfiguration: mailCheck.valid ? "MAIL_CONFIGURATION_READY" : "MAIL_CONFIGURATION_REQUIRED",
    },
    storage,
    jobs: publicJobs,
    currentWeek: previousCompletedWeek(options.now || new Date()),
    warnings: [...new Set(warnings.filter(Boolean))],
  };
}

module.exports = {
  productionConfig,
  ensureProductionDatabase,
  runProductionDaily,
  runProductionWeekly,
  runProductionBootstrap,
  runDatabaseMigration,
  runStorageCheck,
  runBackup,
  publicJobState,
  publicBootstrapProgress,
  readProductionStatus,
};
