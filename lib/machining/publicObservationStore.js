const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { getStorageConfig } = require("../weekly/storageConfig");
const postgres = require("../weekly/postgresAdapter");
const { normalizeDate, normalizeProvenance, finiteNumber } = require("./machiningContract");

const STORE_VERSION = 1;
const DEFAULT_STATUS = "API_ERROR";
const STATUS_RANK = Object.freeze({ LIVE: 4, FALLBACK: 3, STALE: 2, API_ERROR: 1, NO_DATA: 0 });
const FREQUENCY_VALUES = Object.freeze(["daily", "weekly", "monthly", "annual", "structural", "unknown"]);
const DEFAULT_FILE_NAME = "public-observations.json";
let writeQueue = Promise.resolve();

function canonicalStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(STATUS_RANK, status) ? status : DEFAULT_STATUS;
}

function canonicalFrequency(value) {
  const frequency = String(value || "unknown").trim().toLowerCase();
  return FREQUENCY_VALUES.includes(frequency) ? frequency : "unknown";
}

function timestamp(value, fallback = null) {
  const parsed = new Date(value || fallback || "");
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getObservationFilePath(env = process.env) {
  const config = getStorageConfig(env);
  if (config.root) return path.join(config.root, "machining", DEFAULT_FILE_NAME);
  return path.join(config.projectRoot, "data", "machining", DEFAULT_FILE_NAME);
}

function normalizeObservation(input = {}) {
  if (!input || typeof input !== "object") return null;
  const provenance = input.provenance || input.sourceProvenance || {};
  const sourceId = String(input.sourceId || provenance.sourceId || "").trim();
  const seriesId = String(input.seriesId || input.id || "").trim();
  const date = normalizeDate(input.date || input.observedAt || provenance.lastObservationDate);
  const value = finiteNumber(input.value);
  const fetchedAt = timestamp(input.fetchedAt || input.collectedAt, new Date());
  const sourceUrl = String(input.sourceUrl || provenance.endpoint || provenance.url || "").trim();
  if (!sourceId || !seriesId || !date || value === null || !fetchedAt || !sourceUrl) return null;
  const status = canonicalStatus(input.status || provenance.status);
  const frequency = canonicalFrequency(input.frequency || provenance.frequency);
  return {
    sourceId,
    seriesId,
    date,
    value,
    status,
    frequency,
    sourceUrl,
    fetchedAt,
    provenance: normalizeProvenance({
      ...provenance,
      sourceId,
      endpoint: provenance.endpoint || sourceUrl,
      url: provenance.url || sourceUrl,
      status,
      frequency,
      lastObservationDate: date,
      fetchedAt,
    }),
  };
}

function recordIdentity(record) {
  return `${record.sourceId}|${record.seriesId}|${record.date}`;
}

function shouldReplace(existing, incoming) {
  if (!existing) return true;
  const existingRank = STATUS_RANK[existing.status] ?? -1;
  const incomingRank = STATUS_RANK[incoming.status] ?? -1;
  if (incomingRank !== existingRank) return incomingRank > existingRank;
  return String(incoming.fetchedAt || "") >= String(existing.fetchedAt || "");
}

async function readFileStore(filePath = getObservationFilePath()) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    const records = Array.isArray(parsed.records) ? parsed.records.map(normalizeObservation).filter(Boolean) : [];
    return { version: Number(parsed.version) || STORE_VERSION, updatedAt: parsed.updatedAt || null, records };
  } catch (error) {
    if (error.code === "ENOENT") return { version: STORE_VERSION, updatedAt: null, records: [] };
    if (error instanceof SyntaxError) {
      const wrapped = new Error(`machining public observation store 格式錯誤：${error.message}`);
      wrapped.code = "MACHINING_OBSERVATION_STORE_INVALID";
      throw wrapped;
    }
    throw error;
  }
}

async function writeFileStore(store, filePath = getObservationFilePath()) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    await fs.writeFile(temporary, JSON.stringify({ version: STORE_VERSION, updatedAt: new Date().toISOString(), records: store.records }, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function storageIsWritable(config) {
  return !config.productionRequired || config.durableConfigured;
}

async function upsertPublicObservations(records, options = {}) {
  const input = Array.isArray(records) ? records : [records];
  const normalized = input.map(normalizeObservation).filter(Boolean);
  const config = options.storageConfig || getStorageConfig(options.env || process.env);
  if (!normalized.length) return { inserted: 0, replaced: 0, ignored: input.length, records: [], state: "NO_DATA" };
  if (!storageIsWritable(config)) return { inserted: 0, replaced: 0, ignored: normalized.length, records: normalized, state: "SKIPPED_NO_DURABLE_STORAGE" };
  if (config.provider === "postgres" && !options.filePath) {
    return postgres.upsertMachiningObservations({ records: normalized, env: options.env, pool: options.pool, batchSize: options.batchSize });
  }
  const filePath = options.filePath || getObservationFilePath(options.env || process.env);
  const operation = async () => {
    const store = await readFileStore(filePath);
    const byIdentity = new Map(store.records.map((record) => [recordIdentity(record), record]));
    let inserted = 0;
    let replaced = 0;
    let ignored = input.length - normalized.length;
    for (const record of normalized) {
      const identity = recordIdentity(record);
      const existing = byIdentity.get(identity);
      if (!existing) inserted += 1;
      else if (shouldReplace(existing, record)) replaced += 1;
      else {
        ignored += 1;
        continue;
      }
      byIdentity.set(identity, record);
    }
    const nextStore = { version: STORE_VERSION, updatedAt: new Date().toISOString(), records: [...byIdentity.values()].sort((a, b) => recordIdentity(a).localeCompare(recordIdentity(b))) };
    await writeFileStore(nextStore, filePath);
    return { inserted, replaced, ignored, records: nextStore.records, state: "PERSISTED_FILESYSTEM" };
  };
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}

async function listPublicObservations(options = {}) {
  const config = options.storageConfig || getStorageConfig(options.env || process.env);
  if (!storageIsWritable(config)) return [];
  if (config.provider === "postgres" && !options.filePath) return postgres.listMachiningObservations({ ...options, env: options.env, pool: options.pool });
  const store = await readFileStore(options.filePath || getObservationFilePath(options.env || process.env));
  return store.records.filter((record) => {
    if (options.sourceId && record.sourceId !== options.sourceId) return false;
    if (options.seriesId && record.seriesId !== options.seriesId) return false;
    if (options.from && record.date < options.from) return false;
    if (options.to && record.date > options.to) return false;
    return true;
  });
}

function clearWriteQueue() {
  writeQueue = Promise.resolve();
}

module.exports = {
  DEFAULT_FILE_NAME,
  FREQUENCY_VALUES,
  STATUS_RANK,
  canonicalFrequency,
  canonicalStatus,
  clearWriteQueue,
  getObservationFilePath,
  listPublicObservations,
  normalizeObservation,
  recordIdentity,
  readFileStore,
  shouldReplace,
  upsertPublicObservations,
  writeFileStore,
};
