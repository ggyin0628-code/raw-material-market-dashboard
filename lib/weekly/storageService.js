const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  getStorageConfig,
  publicStorageStatus,
  assertProductionStorage,
} = require("./storageConfig");
const postgres = require("./postgresAdapter");

const REPORT_METADATA_VERSION = 1;

function atomicTempPath(filePath) {
  return `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
}

function usePostgres(config, options = {}) {
  return (options.provider || config?.provider) === "postgres";
}

async function writeFileAtomic(filePath, data, options = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = atomicTempPath(filePath);
  try {
    await fs.writeFile(tempPath, data, { ...options, mode: options.mode || 0o600 });
    await fs.rename(tempPath, filePath);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function writeJsonAtomic(filePath, value) {
  return writeFileAtomic(filePath, JSON.stringify(value, null, 2), { encoding: "utf8" });
}

async function ensureStorageDirectories(env = process.env, options = {}) {
  const config = options.config || getStorageConfig(env, options);
  if (config.productionRequired) assertProductionStorage(config);
  await Promise.all([
    fs.mkdir(path.dirname(config.snapshotFile), { recursive: true }),
    fs.mkdir(path.dirname(config.deliveryLedgerFile), { recursive: true }),
    fs.mkdir(config.reportDir, { recursive: true }),
    fs.mkdir(path.dirname(config.reportMetadataFile), { recursive: true }),
    fs.mkdir(config.backupDir, { recursive: true }),
  ]);
  return config;
}

async function pathState(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return { exists: true, isFile: stat.isFile(), sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, isFile: false, sizeBytes: 0, modifiedAt: null };
    return { exists: false, isFile: false, sizeBytes: 0, modifiedAt: null, error: error.code || error.message };
  }
}

async function getStorageStatus(env = process.env, options = {}) {
  const config = options.config || getStorageConfig(env, options);
  if (usePostgres(config, options)) {
    if (!config.databaseConfigured) return { ...publicStorageStatus(config), database: { state: "DATABASE_URL_REQUIRED" }, ready: false, reportDirConfigured: Boolean(config.reportDir), backupDirConfigured: Boolean(config.backupDir) };
    try {
      const database = await postgres.checkPostgres({ env, pool: options.pool });
      return { ...publicStorageStatus(config), database, ready: true, reportDirConfigured: Boolean(config.reportDir), backupDirConfigured: Boolean(config.backupDir) };
    } catch (error) {
      return { ...publicStorageStatus(config), database: { state: error.code || "DATABASE_UNAVAILABLE", error: postgres.safeDatabaseError(error) }, ready: false, reportDirConfigured: Boolean(config.reportDir), backupDirConfigured: Boolean(config.backupDir) };
    }
  }
  const [snapshot, deliveryLedger, reportMetadata, jobState] = await Promise.all([
    pathState(config.snapshotFile),
    pathState(config.deliveryLedgerFile),
    pathState(config.reportMetadataFile),
    pathState(config.jobStateFile),
  ]);
  return {
    ...publicStorageStatus(config),
    files: { snapshot, deliveryLedger, reportMetadata, jobState },
    ready: config.durableConfigured || !config.productionRequired,
    reportDirConfigured: Boolean(config.reportDir),
    backupDirConfigured: Boolean(config.backupDir),
  };
}

async function readJobState(filePath, options = {}) {
  const config = options.config || getStorageConfig(options.env || process.env);
  if (usePostgres(config, options)) return postgres.readJobState({ env: options.env, pool: options.pool });
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    return parsed && typeof parsed === "object" && parsed.jobs && typeof parsed.jobs === "object"
      ? parsed
      : { version: 1, jobs: {} };
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, jobs: {} };
    if (error instanceof SyntaxError) {
      const wrapped = new Error(`job state 格式錯誤：${error.message}`);
      wrapped.code = "JOB_STATE_INVALID";
      throw wrapped;
    }
    throw error;
  }
}

function safeError(error) {
  if (!error) return null;
  return String(error.message || error)
    .replace(/(authorization)\s*[:=]\s*Bearer\s+[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/(MAIL_PASSWORD|password|token|secret|authorization|DATABASE_URL)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s,;]+/gi, "postgres://[REDACTED]")
    .slice(0, 500);
}

async function updateJobState(job, patch, options = {}) {
  const config = options.config || getStorageConfig(options.env || process.env);
  if (usePostgres(config, options)) {
    const current = await postgres.readJobState({ env: options.env, pool: options.pool });
    const prior = current.jobs?.[job] || {};
    const nextJob = { ...prior, ...patch, updatedAt: new Date().toISOString() };
    await postgres.writeJobState(job, nextJob, { env: options.env, pool: options.pool });
    return nextJob;
  }
  const filePath = options.filePath || config.jobStateFile;
  const current = await readJobState(filePath, { env: options.env, config });
  const prior = current.jobs?.[job] || {};
  const nextJob = { ...prior, ...patch, updatedAt: new Date().toISOString() };
  const next = { version: 1, updatedAt: new Date().toISOString(), jobs: { ...(current.jobs || {}), [job]: nextJob } };
  await writeJsonAtomic(filePath, next);
  return nextJob;
}

async function readReportMetadata(filePath, options = {}) {
  const config = options.config || getStorageConfig(options.env || process.env);
  if (usePostgres(config, options)) return postgres.readReportMetadata({ env: options.env, pool: options.pool });
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    return parsed && typeof parsed === "object" && Array.isArray(parsed.reports)
      ? parsed
      : { version: REPORT_METADATA_VERSION, reports: [] };
  } catch (error) {
    if (error.code === "ENOENT") return { version: REPORT_METADATA_VERSION, reports: [] };
    if (error instanceof SyntaxError) {
      const wrapped = new Error(`報告 metadata 格式錯誤：${error.message}`);
      wrapped.code = "REPORT_METADATA_INVALID";
      throw wrapped;
    }
    throw error;
  }
}

function publicReportMetadata(report, artifacts) {
  return {
    reportingWeek: report.reportingWeek,
    reportingPeriod: report.reportingPeriod,
    generatedAt: report.generatedAt,
    artifactNames: Object.fromEntries(Object.entries(artifacts || {}).map(([key, value]) => [key, typeof value === "string" && value ? path.basename(value) : value ? "metadata" : null])),
    qualitySummary: report.qualitySummary,
    sourceCoverage: report.sourceCoverage,
  };
}

async function recordReportMetadata(report, artifacts, options = {}) {
  if (!report?.reportingWeek) throw new Error("報告 metadata 缺少 reportingWeek");
  const config = options.config || getStorageConfig(options.env || process.env);
  const nextRecord = publicReportMetadata(report, artifacts);
  if (usePostgres(config, options)) return postgres.writeReportMetadata(nextRecord, { env: options.env, pool: options.pool });
  const filePath = options.filePath || config.reportMetadataFile;
  const current = await readReportMetadata(filePath, { env: options.env, config });
  const reports = current.reports.filter((item) => item.reportingWeek !== report.reportingWeek);
  reports.push(nextRecord);
  reports.sort((a, b) => String(a.reportingWeek).localeCompare(String(b.reportingWeek)));
  const next = { version: REPORT_METADATA_VERSION, updatedAt: new Date().toISOString(), reports };
  await writeJsonAtomic(filePath, next);
  return nextRecord;
}

async function backupPublicStorage(options = {}) {
  const config = options.config || getStorageConfig(options.env || process.env, options);
  if (config.productionRequired) assertProductionStorage(config);
  if (usePostgres(config, options)) {
    const backupId = options.backupId || new Date().toISOString().replace(/[:.]/g, "-");
    await fs.mkdir(config.backupDir, { recursive: true });
    const destination = path.join(config.backupDir, `weekly-public-backup-${backupId}`);
    await fs.mkdir(destination, { recursive: true });
    const exportPayload = await postgres.exportPublicData({ env: options.env, pool: options.pool, exportId: backupId });
    const exportPath = path.join(destination, "postgres-public-export.json");
    const manifestPath = path.join(destination, "manifest.json");
    await writeJsonAtomic(exportPath, exportPayload);
    const manifest = { version: 1, backupId, createdAt: new Date().toISOString(), scope: "PUBLIC_MARKET_DATA_ONLY", provider: "postgres", files: { export: path.basename(exportPath) } };
    await writeJsonAtomic(manifestPath, manifest);
    return { backupId, destination, files: { export: exportPath }, manifest: manifestPath };
  }
  await fs.mkdir(config.backupDir, { recursive: true });
  const backupId = options.backupId || new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(config.backupDir, `weekly-public-backup-${backupId}`);
  await fs.mkdir(destination, { recursive: true });
  const sources = {
    snapshots: config.snapshotFile,
    deliveryLedger: config.deliveryLedgerFile,
    reportMetadata: config.reportMetadataFile,
  };
  const copied = {};
  for (const [key, source] of Object.entries(sources)) {
    const state = await pathState(source);
    if (!state.exists) {
      copied[key] = null;
      continue;
    }
    const target = path.join(destination, path.basename(source));
    await fs.copyFile(source, target);
    copied[key] = target;
  }
  const manifest = { version: 1, backupId, createdAt: new Date().toISOString(), scope: "PUBLIC_MARKET_DATA_ONLY", provider: "filesystem", files: copied };
  await writeJsonAtomic(path.join(destination, "manifest.json"), manifest);
  return { backupId, destination, files: copied, manifest: path.join(destination, "manifest.json") };
}

module.exports = {
  REPORT_METADATA_VERSION,
  writeFileAtomic,
  writeJsonAtomic,
  ensureStorageDirectories,
  getStorageStatus,
  readJobState,
  updateJobState,
  safeError,
  readReportMetadata,
  publicReportMetadata,
  recordReportMetadata,
  backupPublicStorage,
};
