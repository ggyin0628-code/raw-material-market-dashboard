const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { DEFAULT_SNAPSHOT_FILE, getStorageConfig } = require("./storageConfig");
const postgres = require("./postgresAdapter");
const FX_MATERIAL_ID = "__fx_usd_twd__";
const SNAPSHOT_VERSION = 1;

const STATUS_RANK = Object.freeze({
  LIVE: 4,
  FALLBACK: 3,
  STALE: 2,
  EXPIRED: 1,
  API_ERROR: 1,
  NO_DATA: 0,
});

let writeQueue = Promise.resolve();

function canonicalWeeklyStatus(status) {
  const value = String(status || "").trim().toUpperCase();
  if (value === "OK" || value === "LIVE") return "LIVE";
  if (value === "FALLBACK") return "FALLBACK";
  if (value === "STALE") return "STALE";
  if (value === "EXPIRED") return "EXPIRED";
  if (value === "NO_DATA") return "NO_DATA";
  if (value === "API_ERROR" || value === "ERROR") return "API_ERROR";
  return "API_ERROR";
}

function getSnapshotFilePath(env = process.env) {
  return getStorageConfig(env).snapshotFile;
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function normalizeRecord(input) {
  if (!input || typeof input !== "object") return null;
  const materialId = String(input.materialId || input.id || "").trim();
  const date = String(input.date || "").trim();
  if (!materialId || !isDateKey(date)) return null;
  const status = canonicalWeeklyStatus(input.status);
  const numeric = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const collectedAt = input.collectedAt || new Date().toISOString();
  const lastTradeTimestamp = input.lastTradeTimestamp || input.lastTradeAt || null;
  return {
    materialId,
    materialName: input.materialName || input.name || materialId,
    symbol: input.symbol || null,
    category: input.category || null,
    exchange: input.exchange || null,
    date,
    observationDate: input.observationDate || date,
    marketPrice: numeric(input.marketPrice ?? input.price ?? input.close),
    sourceUnit: input.sourceUnit || input.unit || null,
    currency: input.currency || null,
    usdTwdRate: numeric(input.usdTwdRate ?? input.fxRate ?? input.fx?.rate),
    twdReferenceValue: numeric(input.twdReferenceValue ?? input.twdEstimate),
    source: input.source || null,
    status,
    lastTradeTimestamp,
    collectedAt,
    sourceReliability: input.sourceReliability || null,
    error: input.error || null,
    collectionPath: input.collectionPath || input.provenance?.collectionPath || null,
    provenance: input.provenance || { source: input.source || null, status },
  };
}

function recordIdentity(record) {
  return `${record.materialId}|${record.date}`;
}

function shouldReplace(existing, incoming) {
  if (!existing) return true;
  const existingRank = STATUS_RANK[existing.status] ?? -1;
  const incomingRank = STATUS_RANK[incoming.status] ?? -1;
  if (incomingRank !== existingRank) return incomingRank > existingRank;
  return String(incoming.collectedAt || "") >= String(existing.collectedAt || "");
}

async function readStore(filePath = getSnapshotFilePath()) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const records = Array.isArray(parsed.records) ? parsed.records.map(normalizeRecord).filter(Boolean) : [];
    return {
      version: Number(parsed.version) || SNAPSHOT_VERSION,
      updatedAt: parsed.updatedAt || null,
      records,
    };
  } catch (error) {
    if (error.code === "ENOENT") return { version: SNAPSHOT_VERSION, updatedAt: null, records: [] };
    if (error instanceof SyntaxError) {
      const wrapped = new Error(`快照儲存格式錯誤：${error.message}`);
      wrapped.code = "SNAPSHOT_STORE_INVALID";
      throw wrapped;
    }
    throw error;
  }
}

async function writeStore(store, filePath = getSnapshotFilePath()) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const payload = JSON.stringify({
    version: SNAPSHOT_VERSION,
    updatedAt: new Date().toISOString(),
    records: store.records,
  }, null, 2);
  try {
    await fs.writeFile(tempPath, payload, { encoding: "utf8", mode: 0o600 });
    await fs.rename(tempPath, filePath);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
}

async function upsertSnapshots(records, options = {}) {
  const input = Array.isArray(records) ? records : [records];
  const config = options.storageConfig || getStorageConfig(options.env || process.env);
  const normalized = input.map(normalizeRecord).filter(Boolean);
  if (!normalized.length) return { inserted: 0, replaced: 0, ignored: input.length, records: [] };
  if (config.provider === "postgres" && !options.filePath) return postgres.upsertSnapshots({ records: normalized, env: options.env, pool: options.pool, batchSize: options.batchSize, onProgress: options.onProgress });
  const filePath = options.filePath || config.snapshotFile;
  const operation = async () => {
    const store = await readStore(filePath);
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
    const nextStore = {
      version: SNAPSHOT_VERSION,
      updatedAt: new Date().toISOString(),
      records: [...byIdentity.values()].sort((a, b) => `${a.materialId}|${a.date}`.localeCompare(`${b.materialId}|${b.date}`)),
    };
    await writeStore(nextStore, filePath);
    return { inserted, replaced, ignored, records: nextStore.records };
  };
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}

async function listSnapshots(options = {}) {
  const config = options.storageConfig || getStorageConfig(options.env || process.env);
  if (config.provider === "postgres" && !options.filePath) return postgres.listSnapshots({ ...options, env: options.env, pool: options.pool });
  const store = await readStore(options.filePath || config.snapshotFile);
  return store.records.filter((record) => {
    if (options.materialId && record.materialId !== options.materialId) return false;
    if (options.from && record.date < options.from) return false;
    if (options.to && record.date > options.to) return false;
    if (options.status && record.status !== options.status) return false;
    return true;
  });
}

function clearWriteQueue() {
  writeQueue = Promise.resolve();
}

module.exports = {
  DEFAULT_SNAPSHOT_FILE,
  FX_MATERIAL_ID,
  STATUS_RANK,
  canonicalWeeklyStatus,
  getSnapshotFilePath,
  normalizeRecord,
  recordIdentity,
  readStore,
  writeStore,
  upsertSnapshots,
  listSnapshots,
  clearWriteQueue,
};
