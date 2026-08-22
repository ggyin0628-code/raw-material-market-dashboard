const crypto = require("node:crypto");
const { Pool } = require("pg");

const DEFAULT_QUERY_TIMEOUT_MS = 8000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 8000;
const STATUS_RANK = Object.freeze({ LIVE: 4, FALLBACK: 3, STALE: 2, API_ERROR: 1, NO_DATA: 0 });
const SCHEMA_VERSION = 1;

const MIGRATION_STATEMENTS = Object.freeze([
  `CREATE TABLE IF NOT EXISTS market_snapshots (
    material_id TEXT NOT NULL,
    observation_date DATE NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (material_id, observation_date)
  )`,
  "CREATE INDEX IF NOT EXISTS market_snapshots_date_idx ON market_snapshots (observation_date)",
  "CREATE INDEX IF NOT EXISTS market_snapshots_status_idx ON market_snapshots (status)",
  `CREATE TABLE IF NOT EXISTS weekly_delivery_ledger (
    reporting_week TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS weekly_report_metadata (
    reporting_week TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS weekly_job_state (
    job_name TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
]);

function clampTimeout(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 500), 30000);
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function safeDatabaseError(error) {
  if (!error) return null;
  return String(error.message || error)
    .replace(/(postgres(?:ql)?|database_url|password|token|secret|authorization)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[REDACTED]")
    .slice(0, 500);
}

function databaseError(message, code = "DATABASE_ERROR", cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function getDatabaseConfig(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  const queryTimeoutMs = clampTimeout(env.DB_QUERY_TIMEOUT_MS, DEFAULT_QUERY_TIMEOUT_MS);
  const connectionTimeoutMs = clampTimeout(env.DB_CONNECTION_TIMEOUT_MS, DEFAULT_CONNECTION_TIMEOUT_MS);
  return {
    configured: Boolean(databaseUrl),
    databaseUrl,
    ssl: isTruthy(env.DATABASE_SSL) || /neon\.tech|neon\.database/i.test(databaseUrl),
    max: Math.min(Math.max(Number(env.DB_POOL_MAX) || 2, 1), 5),
    queryTimeoutMs,
    connectionTimeoutMs,
  };
}

function createPostgresPool(env = process.env, options = {}) {
  if (options.pool) return { pool: options.pool, owned: false, config: getDatabaseConfig(env) };
  const config = getDatabaseConfig(env);
  if (!config.databaseUrl) throw databaseError("DATABASE_URL_REQUIRED：Postgres mode 必須使用 secret-managed DATABASE_URL", "DATABASE_URL_REQUIRED");
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.max,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: Math.min(config.connectionTimeoutMs * 2, 30000),
    statement_timeout: config.queryTimeoutMs,
    query_timeout: config.queryTimeoutMs,
    application_name: "raw-material-market-dashboard-weekly",
  });
  return { pool, owned: true, config };
}

async function withDatabaseClient(pool, operation) {
  const client = pool && typeof pool.connect === "function" ? await pool.connect() : pool;
  if (!client || typeof client.query !== "function") throw databaseError("Postgres client 不可用", "DATABASE_CLIENT_INVALID");
  try {
    return await operation(client);
  } finally {
    if (client !== pool && typeof client.release === "function") client.release();
  }
}

async function withTransaction(pool, operation) {
  return withDatabaseClient(pool, async (client) => {
    await client.query("BEGIN");
    try {
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

async function migratePostgres(options = {}) {
  const env = options.env || process.env;
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  try {
    const result = await withTransaction(connection.pool, async (client) => {
      for (const statement of MIGRATION_STATEMENTS) await client.query(statement);
      return { state: "DATABASE_MIGRATED", schemaVersion: SCHEMA_VERSION, statementCount: MIGRATION_STATEMENTS.length };
    });
    return result;
  } catch (error) {
    throw databaseError(`Postgres migration failed：${safeDatabaseError(error)}`, "DATABASE_MIGRATION_FAILED", error);
  } finally {
    if (connection.owned) await connection.pool.end().catch(() => {});
  }
}

async function checkPostgres(options = {}) {
  const env = options.env || process.env;
  const startedAt = Date.now();
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  try {
    const result = await withDatabaseClient(connection.pool, async (client) => {
      await client.query("SELECT 1 AS ok");
      return client.query(`SELECT
        to_regclass('public.market_snapshots') AS market_snapshots,
        to_regclass('public.weekly_delivery_ledger') AS weekly_delivery_ledger,
        to_regclass('public.weekly_report_metadata') AS weekly_report_metadata,
        to_regclass('public.weekly_job_state') AS weekly_job_state`);
    });
    const row = result.rows?.[0] || {};
    const schemaReady = ["market_snapshots", "weekly_delivery_ledger", "weekly_report_metadata", "weekly_job_state"].every((name) => Boolean(row[name]));
    return { state: schemaReady ? "DATABASE_READY" : "DATABASE_SCHEMA_REQUIRED", provider: "postgres", latencyMs: Date.now() - startedAt };
  } catch (error) {
    if (error.code === "DATABASE_SCHEMA_REQUIRED") throw error;
    throw databaseError(`Postgres health check failed：${safeDatabaseError(error)}`, "DATABASE_UNAVAILABLE", error);
  } finally {
    if (connection.owned) await connection.pool.end().catch(() => {});
  }
}

function shouldReplace(existing, incoming) {
  if (!existing) return true;
  const existingRank = STATUS_RANK[existing.status] ?? -1;
  const incomingRank = STATUS_RANK[incoming.status] ?? -1;
  if (incomingRank !== existingRank) return incomingRank > existingRank;
  return String(incoming.collectedAt || "") >= String(existing.collectedAt || "");
}

function ensureSnapshotPayload(record) {
  if (!record || typeof record !== "object" || !record.materialId || !/^\d{4}-\d{2}-\d{2}$/.test(String(record.date))) {
    throw databaseError("snapshot payload 不符合 canonical identity contract", "SNAPSHOT_PAYLOAD_INVALID");
  }
  if (!Object.prototype.hasOwnProperty.call(STATUS_RANK, record.status)) throw databaseError("snapshot status 不符合 canonical contract", "SNAPSHOT_PAYLOAD_INVALID");
  return record;
}

function rowPayload(row) {
  const payload = row?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw databaseError("Postgres snapshot JSONB payload 格式錯誤", "SNAPSHOT_PAYLOAD_INVALID");
  return payload;
}

async function upsertSnapshots(options = {}) {
  const records = Array.isArray(options.records) ? options.records : [];
  const env = options.env || process.env;
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  let inserted = 0;
  let replaced = 0;
  let ignored = 0;
  try {
    await withTransaction(connection.pool, async (client) => {
      for (const record of records) {
        const payload = ensureSnapshotPayload(record);
        const existingResult = await client.query(
          "SELECT payload FROM market_snapshots WHERE material_id = $1 AND observation_date = $2 FOR UPDATE",
          [payload.materialId, payload.date],
        );
        const existing = existingResult.rows?.[0] ? rowPayload(existingResult.rows[0]) : null;
        if (!existing) inserted += 1;
        else if (shouldReplace(existing, payload)) replaced += 1;
        else {
          ignored += 1;
          continue;
        }
        await client.query(
          `INSERT INTO market_snapshots (material_id, observation_date, payload, status, collected_at)
           VALUES ($1, $2, $3::jsonb, $4, $5)
           ON CONFLICT (material_id, observation_date) DO UPDATE SET payload = EXCLUDED.payload, status = EXCLUDED.status, collected_at = EXCLUDED.collected_at`,
          [payload.materialId, payload.date, JSON.stringify(payload), payload.status, payload.collectedAt || new Date().toISOString()],
        );
      }
    });
    return { inserted, replaced, ignored, records };
  } catch (error) {
    if (error.code?.startsWith("SNAPSHOT_")) throw error;
    throw databaseError(`Postgres snapshot upsert failed：${safeDatabaseError(error)}`, "DATABASE_WRITE_FAILED", error);
  } finally {
    if (connection.owned) await connection.pool.end().catch(() => {});
  }
}

async function listSnapshots(options = {}) {
  const env = options.env || process.env;
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  const params = [];
  const clauses = [];
  if (options.materialId) { params.push(options.materialId); clauses.push(`material_id = $${params.length}`); }
  if (options.from) { params.push(options.from); clauses.push(`observation_date >= $${params.length}`); }
  if (options.to) { params.push(options.to); clauses.push(`observation_date <= $${params.length}`); }
  if (options.status) { params.push(options.status); clauses.push(`status = $${params.length}`); }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  try {
    const result = await withDatabaseClient(connection.pool, (client) => client.query(`SELECT payload FROM market_snapshots${where} ORDER BY material_id, observation_date`, params));
    return (result.rows || []).map(rowPayload);
  } catch (error) {
    if (error.code === "SNAPSHOT_PAYLOAD_INVALID") throw error;
    throw databaseError(`Postgres snapshot query failed：${safeDatabaseError(error)}`, "DATABASE_READ_FAILED", error);
  } finally {
    if (connection.owned) await connection.pool.end().catch(() => {});
  }
}

async function readJsonRows(table, options = {}) {
  const env = options.env || process.env;
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  const keyColumn = table === "weekly_job_state" ? "job_name" : "reporting_week";
  try {
    const result = await withDatabaseClient(connection.pool, (client) => client.query(`SELECT ${keyColumn}, payload FROM ${table} ORDER BY ${keyColumn}`, []));
    return result.rows || [];
  } finally {
    if (connection.owned) await connection.pool.end().catch(() => {});
  }
}

async function readDeliveryLedger(options = {}) {
  const rows = await readJsonRows("weekly_delivery_ledger", options);
  return { weeks: Object.fromEntries(rows.map((row) => [row.reporting_week, rowPayload(row)])) };
}

async function writeDeliveryLedger(ledger, options = {}) {
  const weeks = ledger && typeof ledger.weeks === "object" ? ledger.weeks : {};
  const env = options.env || process.env;
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  try {
    await withTransaction(connection.pool, async (client) => {
      for (const [reportingWeek, payload] of Object.entries(weeks)) {
        if (!payload || typeof payload !== "object") throw databaseError("delivery ledger payload 格式錯誤", "DELIVERY_LEDGER_INVALID");
        await client.query(
          `INSERT INTO weekly_delivery_ledger (reporting_week, payload, updated_at) VALUES ($1, $2::jsonb, $3)
           ON CONFLICT (reporting_week) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
          [reportingWeek, JSON.stringify(payload), new Date().toISOString()],
        );
      }
    });
    return ledger;
  } catch (error) {
    if (error.code === "DELIVERY_LEDGER_INVALID") throw error;
    throw databaseError(`Postgres delivery ledger write failed：${safeDatabaseError(error)}`, "DATABASE_WRITE_FAILED", error);
  } finally {
    if (connection.owned) await connection.pool.end().catch(() => {});
  }
}

async function readReportMetadata(options = {}) {
  const rows = await readJsonRows("weekly_report_metadata", options);
  return { version: SCHEMA_VERSION, reports: rows.map((row) => rowPayload(row)) };
}

async function writeReportMetadata(record, options = {}) {
  if (!record?.reportingWeek) throw databaseError("report metadata 缺少 reportingWeek", "REPORT_METADATA_INVALID");
  const env = options.env || process.env;
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  try {
    await withDatabaseClient(connection.pool, (client) => client.query(
      `INSERT INTO weekly_report_metadata (reporting_week, payload, updated_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (reporting_week) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
      [record.reportingWeek, JSON.stringify(record), new Date().toISOString()],
    ));
    return record;
  } catch (error) {
    if (error.code === "REPORT_METADATA_INVALID") throw error;
    throw databaseError(`Postgres report metadata write failed：${safeDatabaseError(error)}`, "DATABASE_WRITE_FAILED", error);
  } finally {
    if (connection.owned) await connection.pool.end().catch(() => {});
  }
}

async function readJobState(options = {}) {
  const rows = await readJsonRows("weekly_job_state", options);
  return { version: SCHEMA_VERSION, updatedAt: null, jobs: Object.fromEntries(rows.map((row) => [row.job_name, rowPayload(row)])) };
}

async function writeJobState(job, payload, options = {}) {
  if (!job || !payload || typeof payload !== "object") throw databaseError("job state payload 格式錯誤", "JOB_STATE_INVALID");
  const env = options.env || process.env;
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  try {
    await withDatabaseClient(connection.pool, (client) => client.query(
      `INSERT INTO weekly_job_state (job_name, payload, updated_at) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (job_name) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
      [job, JSON.stringify(payload), new Date().toISOString()],
    ));
    return payload;
  } catch (error) {
    if (error.code === "JOB_STATE_INVALID") throw error;
    throw databaseError(`Postgres job state write failed：${safeDatabaseError(error)}`, "DATABASE_WRITE_FAILED", error);
  } finally {
    if (connection.owned) await connection.pool.end().catch(() => {});
  }
}

async function exportPublicData(options = {}) {
  const env = options.env || process.env;
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  try {
    const [snapshots, ledger, metadata, jobs] = await Promise.all([
      withDatabaseClient(connection.pool, (client) => client.query("SELECT payload FROM market_snapshots ORDER BY material_id, observation_date")),
      withDatabaseClient(connection.pool, (client) => client.query("SELECT reporting_week, payload FROM weekly_delivery_ledger ORDER BY reporting_week")),
      withDatabaseClient(connection.pool, (client) => client.query("SELECT reporting_week, payload FROM weekly_report_metadata ORDER BY reporting_week")),
      withDatabaseClient(connection.pool, (client) => client.query("SELECT job_name, payload FROM weekly_job_state ORDER BY job_name")),
    ]);
    const exportPayload = {
      version: SCHEMA_VERSION,
      exportId: options.exportId || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      scope: "PUBLIC_MARKET_DATA_ONLY",
      marketSnapshots: (snapshots.rows || []).map(rowPayload),
      weeklyDeliveryLedger: Object.fromEntries((ledger.rows || []).map((row) => [row.reporting_week, rowPayload(row)])),
      weeklyReportMetadata: (metadata.rows || []).map(rowPayload),
      weeklyJobState: Object.fromEntries((jobs.rows || []).map((row) => [row.job_name, rowPayload(row)])),
    };
    return exportPayload;
  } catch (error) {
    throw databaseError(`Postgres public export failed：${safeDatabaseError(error)}`, "DATABASE_READ_FAILED", error);
  } finally {
    if (connection.owned) await connection.pool.end().catch(() => {});
  }
}

module.exports = {
  SCHEMA_VERSION,
  MIGRATION_STATEMENTS,
  getDatabaseConfig,
  createPostgresPool,
  safeDatabaseError,
  databaseError,
  withDatabaseClient,
  withTransaction,
  migratePostgres,
  checkPostgres,
  upsertSnapshots,
  listSnapshots,
  readDeliveryLedger,
  writeDeliveryLedger,
  readReportMetadata,
  writeReportMetadata,
  readJobState,
  writeJobState,
  exportPublicData,
};
