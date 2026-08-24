const crypto = require("node:crypto");
const { Pool } = require("pg");

const DEFAULT_QUERY_TIMEOUT_MS = 8000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 8000;
const DEFAULT_UPSERT_BATCH_SIZE = 250;
const MAX_UPSERT_BATCH_SIZE = 500;
const STATUS_RANK = Object.freeze({ LIVE: 4, FALLBACK: 3, STALE: 2, EXPIRED: 1, API_ERROR: 1, NO_DATA: 0 });
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
  `CREATE TABLE IF NOT EXISTS machining_public_observations (
    source_id TEXT NOT NULL,
    series_id TEXT NOT NULL,
    observation_date DATE NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL,
    frequency TEXT NOT NULL,
    source_url TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    provenance JSONB NOT NULL,
    PRIMARY KEY (source_id, series_id, observation_date)
  )`,
  "CREATE INDEX IF NOT EXISTS machining_public_observations_date_idx ON machining_public_observations (observation_date)",
  "CREATE INDEX IF NOT EXISTS machining_public_observations_status_idx ON machining_public_observations (status)",
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

function getUpsertBatchSize(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_UPSERT_BATCH_SIZE;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_UPSERT_BATCH_SIZE);
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

function ensureMachiningObservationPayload(record) {
  const sourceId = String(record?.sourceId || "").trim();
  const seriesId = String(record?.seriesId || "").trim();
  const date = String(record?.date || "").trim();
  const value = Number(record?.value);
  const status = String(record?.status || "").trim().toUpperCase();
  const frequency = String(record?.frequency || "unknown").trim().toLowerCase();
  const sourceUrl = String(record?.sourceUrl || "").trim();
  const fetchedAt = String(record?.fetchedAt || "").trim();
  const validStatuses = Object.prototype.hasOwnProperty.call(STATUS_RANK, status);
  const validFrequencies = ["daily", "weekly", "monthly", "annual", "structural", "unknown"].includes(frequency);
  if (!sourceId || !seriesId || !/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || !Number.isFinite(value) || !validStatuses || !validFrequencies || !sourceUrl || !fetchedAt || !record?.provenance || typeof record.provenance !== "object") {
    throw databaseError("machining public observation payload 不符合 canonical contract", "MACHINING_OBSERVATION_PAYLOAD_INVALID");
  }
  return { ...record, sourceId, seriesId, date, value, status, frequency, sourceUrl, fetchedAt };
}

function rowMachiningObservation(row) {
  const value = Number(row?.value);
  if (!row?.source_id || !row?.series_id || !row?.observation_date || !Number.isFinite(value)) throw databaseError("Postgres machining observation payload 格式錯誤", "MACHINING_OBSERVATION_PAYLOAD_INVALID");
  return {
    sourceId: row.source_id,
    seriesId: row.series_id,
    date: String(row.observation_date).slice(0, 10),
    value,
    status: row.status,
    frequency: row.frequency,
    sourceUrl: row.source_url,
    fetchedAt: row.fetched_at instanceof Date ? row.fetched_at.toISOString() : row.fetched_at,
    provenance: row.provenance,
  };
}

async function upsertMachiningObservations(options = {}) {
  const records = Array.isArray(options.records) ? options.records : [];
  const env = options.env || process.env;
  if (!records.length) return { inserted: 0, replaced: 0, ignored: 0, records: [], state: "NO_DATA" };
  const prepared = records.map(ensureMachiningObservationPayload);
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  try {
    const params = [];
    const values = prepared.map((record, index) => {
      const offset = index * 9;
      params.push(record.sourceId, record.seriesId, record.date, record.value, record.status, record.frequency, record.sourceUrl, record.fetchedAt, JSON.stringify(record.provenance));
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}::jsonb)`;
    });
    const result = await withDatabaseClient(connection.pool, (client) => client.query(
      `INSERT INTO machining_public_observations (source_id, series_id, observation_date, value, status, frequency, source_url, fetched_at, provenance)
       VALUES ${values.join(", ")}
       ON CONFLICT (source_id, series_id, observation_date) DO UPDATE
         SET value = EXCLUDED.value, status = EXCLUDED.status, frequency = EXCLUDED.frequency, source_url = EXCLUDED.source_url, fetched_at = EXCLUDED.fetched_at, provenance = EXCLUDED.provenance
         WHERE
           CASE machining_public_observations.status
             WHEN 'LIVE' THEN 4
             WHEN 'FALLBACK' THEN 3
             WHEN 'STALE' THEN 2
             WHEN 'API_ERROR' THEN 1
             WHEN 'NO_DATA' THEN 0
             ELSE -1
           END < CASE EXCLUDED.status
             WHEN 'LIVE' THEN 4
             WHEN 'FALLBACK' THEN 3
             WHEN 'STALE' THEN 2
             WHEN 'API_ERROR' THEN 1
             WHEN 'NO_DATA' THEN 0
             ELSE -1
           END
           OR (
             machining_public_observations.status = EXCLUDED.status
             AND EXCLUDED.fetched_at >= machining_public_observations.fetched_at
           )
       RETURNING (xmax = 0) AS inserted`,
      params,
    ));
    const returned = result.rows || [];
    const inserted = returned.filter((row) => row.inserted === true || row.inserted === "true").length;
    return { inserted, replaced: returned.length - inserted, ignored: prepared.length - returned.length, records: prepared, state: "PERSISTED_POSTGRES" };
  } catch (error) {
    if (error.code === "MACHINING_OBSERVATION_PAYLOAD_INVALID") throw error;
    throw databaseError(`Postgres machining observation upsert failed：${safeDatabaseError(error)}`, "DATABASE_WRITE_FAILED", error);
  } finally {
    if (connection.owned) await connection.pool.end().catch(() => {});
  }
}

async function listMachiningObservations(options = {}) {
  const env = options.env || process.env;
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  const params = [];
  const clauses = [];
  if (options.sourceId) { params.push(options.sourceId); clauses.push(`source_id = $${params.length}`); }
  if (options.seriesId) { params.push(options.seriesId); clauses.push(`series_id = $${params.length}`); }
  if (options.from) { params.push(options.from); clauses.push(`observation_date >= $${params.length}`); }
  if (options.to) { params.push(options.to); clauses.push(`observation_date <= $${params.length}`); }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  try {
    const result = await withDatabaseClient(connection.pool, (client) => client.query(
      `SELECT source_id, series_id, observation_date, value, status, frequency, source_url, fetched_at, provenance
       FROM machining_public_observations${where} ORDER BY source_id, series_id, observation_date`,
      params,
    ));
    return (result.rows || []).map(rowMachiningObservation);
  } catch (error) {
    if (error.code === "MACHINING_OBSERVATION_PAYLOAD_INVALID") throw error;
    throw databaseError(`Postgres machining observation query failed：${safeDatabaseError(error)}`, "DATABASE_READ_FAILED", error);
  } finally {
    if (connection.owned) await connection.pool.end().catch(() => {});
  }
}

function rowPayload(row) {
  const payload = row?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw databaseError("Postgres snapshot JSONB payload 格式錯誤", "SNAPSHOT_PAYLOAD_INVALID");
  return payload;
}

function dedupeSnapshotBatch(records) {
  const byIdentity = new Map();
  let duplicateIgnored = 0;
  for (const record of records) {
    const existing = byIdentity.get(`${record.materialId}|${record.date}`);
    if (!existing || shouldReplace(existing, record)) byIdentity.set(`${record.materialId}|${record.date}`, record);
    else duplicateIgnored += 1;
  }
  return { records: [...byIdentity.values()], duplicateIgnored };
}

async function upsertSnapshotBatch(client, records) {
  if (!records.length) return { inserted: 0, replaced: 0, ignored: 0 };
  const params = [];
  const values = records.map((record, index) => {
    const offset = index * 5;
    params.push(record.materialId, record.date, JSON.stringify(record), record.status, record.collectedAt);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb, $${offset + 4}, $${offset + 5})`;
  });
  const result = await client.query(
    `INSERT INTO market_snapshots (material_id, observation_date, payload, status, collected_at)
     VALUES ${values.join(", ")}
     ON CONFLICT (material_id, observation_date) DO UPDATE
       SET payload = EXCLUDED.payload, status = EXCLUDED.status, collected_at = EXCLUDED.collected_at
       WHERE
         CASE market_snapshots.status
           WHEN 'LIVE' THEN 4
           WHEN 'FALLBACK' THEN 3
           WHEN 'STALE' THEN 2
           WHEN 'EXPIRED' THEN 1
           WHEN 'API_ERROR' THEN 1
           WHEN 'NO_DATA' THEN 0
           ELSE -1
         END < CASE EXCLUDED.status
           WHEN 'LIVE' THEN 4
           WHEN 'FALLBACK' THEN 3
           WHEN 'STALE' THEN 2
           WHEN 'EXPIRED' THEN 1
           WHEN 'API_ERROR' THEN 1
           WHEN 'NO_DATA' THEN 0
           ELSE -1
         END
         OR (
           CASE market_snapshots.status
             WHEN 'LIVE' THEN 4
             WHEN 'FALLBACK' THEN 3
             WHEN 'STALE' THEN 2
             WHEN 'API_ERROR' THEN 1
             WHEN 'NO_DATA' THEN 0
             ELSE -1
           END = CASE EXCLUDED.status
             WHEN 'LIVE' THEN 4
             WHEN 'FALLBACK' THEN 3
             WHEN 'STALE' THEN 2
             WHEN 'API_ERROR' THEN 1
             WHEN 'NO_DATA' THEN 0
             ELSE -1
           END
           AND EXCLUDED.collected_at >= market_snapshots.collected_at
         )
     RETURNING (xmax = 0) AS inserted`,
    params,
  );
  const returned = result.rows || [];
  const inserted = returned.filter((row) => row.inserted === true || row.inserted === "true").length;
  return { inserted, replaced: returned.length - inserted, ignored: records.length - returned.length };
}

async function upsertSnapshots(options = {}) {
  const records = Array.isArray(options.records) ? options.records : [];
  const env = options.env || process.env;
  const batchSize = getUpsertBatchSize(options.batchSize ?? env.POSTGRES_UPSERT_BATCH_SIZE);
  const prepared = records.map((record) => {
    const payload = ensureSnapshotPayload(record);
    return { ...payload, collectedAt: payload.collectedAt || new Date().toISOString() };
  });
  if (!prepared.length) return { inserted: 0, replaced: 0, ignored: records.length, records, batchCount: 0, queryCount: 0 };
  const connection = options.pool ? { pool: options.pool, owned: false } : createPostgresPool(env, options);
  let inserted = 0;
  let replaced = 0;
  let ignored = 0;
  const batchCount = Math.ceil(prepared.length / batchSize);
  try {
    for (let offset = 0, batchNumber = 1; offset < prepared.length; offset += batchSize, batchNumber += 1) {
      const deduped = dedupeSnapshotBatch(prepared.slice(offset, offset + batchSize));
      const result = await withTransaction(connection.pool, (client) => upsertSnapshotBatch(client, deduped.records));
      inserted += result.inserted;
      replaced += result.replaced;
      ignored += result.ignored + deduped.duplicateIgnored;
      if (typeof options.onProgress === "function") {
        await options.onProgress({
          phase: "batch_committed",
          batchNumber,
          batchCount,
          records: deduped.records.length,
          inserted: result.inserted,
          replaced: result.replaced,
          ignored: result.ignored + deduped.duplicateIgnored,
        });
      }
    }
    return { inserted, replaced, ignored, records: prepared, batchCount, queryCount: batchCount };
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
  DEFAULT_UPSERT_BATCH_SIZE,
  MAX_UPSERT_BATCH_SIZE,
  SCHEMA_VERSION,
  MIGRATION_STATEMENTS,
  getDatabaseConfig,
  getUpsertBatchSize,
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
  ensureMachiningObservationPayload,
  upsertMachiningObservations,
  listMachiningObservations,
};
