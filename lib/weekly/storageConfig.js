const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_STORAGE_ROOT = path.join(PROJECT_ROOT, "data");
const DEFAULT_SNAPSHOT_FILE = path.join(DEFAULT_STORAGE_ROOT, "market-snapshots", "snapshots.json");
const DEFAULT_DELIVERY_LEDGER_FILE = path.join(DEFAULT_STORAGE_ROOT, "weekly-reports", "delivery-ledger.json");
const DEFAULT_REPORT_DIR = path.join(DEFAULT_STORAGE_ROOT, "weekly-reports");
const DEFAULT_REPORT_METADATA_FILE = path.join(DEFAULT_REPORT_DIR, "report-metadata.json");
const DEFAULT_JOB_STATE_FILE = path.join(DEFAULT_REPORT_DIR, "job-state.json");
const DEFAULT_BACKUP_DIR = path.join(DEFAULT_STORAGE_ROOT, "backups");
const STORAGE_PROVIDERS = Object.freeze(["filesystem", "postgres"]);

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function configuredString(env, key) {
  return String(env?.[key] || "").trim();
}

function resolveDevelopmentPath(value, fallback) {
  if (!value) return fallback;
  return path.isAbsolute(value) ? value : path.resolve(PROJECT_ROOT, value);
}

function getStorageConfig(env = process.env, options = {}) {
  const requestedProvider = configuredString(env, "STORAGE_PROVIDER").toLowerCase() || "filesystem";
  const provider = STORAGE_PROVIDERS.includes(requestedProvider) ? requestedProvider : requestedProvider;
  const databaseUrl = configuredString(env, "DATABASE_URL");
  const rootInput = configuredString(env, "PRODUCTION_STORAGE_ROOT");
  const root = rootInput && path.isAbsolute(rootInput) ? rootInput : null;
  const explicit = {
    snapshotFile: configuredString(env, "MARKET_SNAPSHOT_FILE"),
    deliveryLedgerFile: configuredString(env, "WEEKLY_DELIVERY_LEDGER"),
    reportDir: configuredString(env, "WEEKLY_REPORT_DIR"),
    reportMetadataFile: configuredString(env, "WEEKLY_REPORT_METADATA"),
    jobStateFile: configuredString(env, "WEEKLY_JOB_STATE"),
    backupDir: configuredString(env, "WEEKLY_BACKUP_DIR"),
  };
  const productionRequired = Boolean(options.forceProduction) || isTruthy(env.REQUIRE_DURABLE_STORAGE) || String(env.NODE_ENV || "").trim().toLowerCase() === "production";
  const explicitAbsolute = Object.values(explicit).filter(Boolean).every((value) => path.isAbsolute(value));
  const filesystemDurableConfigured = Boolean(root) || (Object.values(explicit).some(Boolean) && explicitAbsolute);
  const databaseConfigured = Boolean(databaseUrl);
  const durableConfigured = provider === "postgres" ? databaseConfigured : filesystemDurableConfigured;
  const snapshotFile = root ? resolveDevelopmentPath(explicit.snapshotFile, path.join(root, "market-snapshots", "snapshots.json")) : resolveDevelopmentPath(explicit.snapshotFile, DEFAULT_SNAPSHOT_FILE);
  const deliveryLedgerFile = root ? resolveDevelopmentPath(explicit.deliveryLedgerFile, path.join(root, "weekly-reports", "delivery-ledger.json")) : resolveDevelopmentPath(explicit.deliveryLedgerFile, DEFAULT_DELIVERY_LEDGER_FILE);
  const reportDir = root ? resolveDevelopmentPath(explicit.reportDir, path.join(root, "weekly-reports")) : resolveDevelopmentPath(explicit.reportDir, DEFAULT_REPORT_DIR);
  const reportMetadataFile = root ? resolveDevelopmentPath(explicit.reportMetadataFile, path.join(reportDir, "report-metadata.json")) : resolveDevelopmentPath(explicit.reportMetadataFile, DEFAULT_REPORT_METADATA_FILE);
  const jobStateFile = root ? resolveDevelopmentPath(explicit.jobStateFile, path.join(reportDir, "job-state.json")) : resolveDevelopmentPath(explicit.jobStateFile, DEFAULT_JOB_STATE_FILE);
  const backupDir = root ? resolveDevelopmentPath(explicit.backupDir, path.join(root, "backups")) : resolveDevelopmentPath(explicit.backupDir, DEFAULT_BACKUP_DIR);
  let state = "LOCAL_ONLY";
  if (!STORAGE_PROVIDERS.includes(provider)) state = "STORAGE_PROVIDER_INVALID";
  else if (productionRequired && provider === "postgres" && !databaseConfigured) state = "DATABASE_URL_REQUIRED";
  else if (productionRequired && provider === "filesystem" && !filesystemDurableConfigured) state = "STORAGE_CONFIGURATION_REQUIRED";
  else if (provider === "postgres") state = "DATABASE_CONFIGURED";
  else if (productionRequired) state = "DURABLE_CONFIGURED";
  return {
    projectRoot: PROJECT_ROOT,
    provider,
    requestedProvider,
    productionRequired,
    durableConfigured,
    filesystemDurableConfigured,
    databaseConfigured,
    databaseUrl,
    state,
    storageKind: provider === "postgres" ? "POSTGRES" : durableConfigured ? "PERSISTENT_CONFIGURED" : "LOCAL_DEVELOPMENT",
    root,
    snapshotFile,
    deliveryLedgerFile,
    reportDir,
    reportMetadataFile,
    jobStateFile,
    backupDir,
    configuredKeys: Object.entries(explicit).filter(([, value]) => Boolean(value)).map(([key]) => key),
  };
}

function publicStorageStatus(config) {
  return {
    state: config.state,
    provider: config.provider,
    storageKind: config.storageKind,
    productionRequired: config.productionRequired,
    durableConfigured: config.durableConfigured,
    databaseConfigured: config.databaseConfigured,
    configuredKeys: config.configuredKeys,
  };
}

function storageConfigurationError(config) {
  const isDatabase = config.provider === "postgres";
  const code = !STORAGE_PROVIDERS.includes(config.provider) ? "STORAGE_PROVIDER_INVALID" : isDatabase ? "DATABASE_URL_REQUIRED" : "STORAGE_CONFIGURATION_REQUIRED";
  const message = code === "DATABASE_URL_REQUIRED"
    ? "DATABASE_URL_REQUIRED：Postgres mode 必須配置 secret-managed DATABASE_URL"
    : code === "STORAGE_PROVIDER_INVALID"
      ? "STORAGE_PROVIDER_INVALID：只接受 filesystem 或 postgres"
      : "STORAGE_CONFIGURATION_REQUIRED：filesystem production 必須配置 PRODUCTION_STORAGE_ROOT 或完整 absolute storage paths";
  const error = new Error(message);
  error.code = code;
  error.statusCode = 503;
  error.storage = publicStorageStatus(config);
  return error;
}

function assertProductionStorage(config) {
  if (!STORAGE_PROVIDERS.includes(config.provider) || !config.durableConfigured) throw storageConfigurationError(config);
  return config;
}

module.exports = {
  PROJECT_ROOT,
  DEFAULT_STORAGE_ROOT,
  DEFAULT_SNAPSHOT_FILE,
  DEFAULT_DELIVERY_LEDGER_FILE,
  DEFAULT_REPORT_DIR,
  DEFAULT_REPORT_METADATA_FILE,
  DEFAULT_JOB_STATE_FILE,
  DEFAULT_BACKUP_DIR,
  STORAGE_PROVIDERS,
  isTruthy,
  getStorageConfig,
  publicStorageStatus,
  storageConfigurationError,
  assertProductionStorage,
};
