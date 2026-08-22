const fs = require("node:fs/promises");
const path = require("node:path");
const { logMarket } = require("./logger");
const { markSnapshotStale } = require("./staleManager");
const { canonicalizeSnapshot, isUsableStatus } = require("./dataContract");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const CACHE_DIR = path.join(PROJECT_ROOT, "cache");
const CACHE_FILE = path.join(CACHE_DIR, "market-cache.json");
const SEED_FILE = path.join(PROJECT_ROOT, "market-seed.json");
const FRESH_TTL_MS = Number(process.env.MARKET_CACHE_TTL_MS || 15 * 60 * 1000);
const STALE_TTL_MS = Number(process.env.MARKET_STALE_TTL_MS || 24 * 60 * 60 * 1000);

let memoryCache = null;

function clearMemoryCache() {
  memoryCache = null;
}

function isFresh(entry) {
  return Boolean(entry?.cachedAt && Date.now() - entry.cachedAt < FRESH_TTL_MS);
}

function isStaleUsable(entry) {
  return Boolean(entry?.cachedAt && Date.now() - entry.cachedAt < STALE_TTL_MS);
}

function hasEnoughUsableRows(snapshot) {
  const rows = snapshot?.rows || [];
  if (!rows.length) return false;
  const usableRows = rows.filter((row) => (
    isUsableStatus(row.status)
    && typeof row.price === "number"
    && Number.isFinite(row.price)
  )).length;
  return usableRows >= Math.ceil(rows.length * 0.7);
}

function hasEnoughFreshRows(snapshot) {
  const rows = snapshot?.rows || [];
  if (!rows.length) return false;
  const freshRows = rows.filter((row) => (
    (row.status === "OK" || row.status === "FALLBACK")
    && typeof row.price === "number"
    && Number.isFinite(row.price)
  )).length;
  return freshRows >= Math.ceil(rows.length * 0.7);
}

function setMemory(snapshot) {
  memoryCache = {
    cachedAt: Date.now(),
    snapshot: {
      ...canonicalizeSnapshot(snapshot),
      cachedAt: Date.now(),
    },
  };
}

async function saveLocal(snapshot) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify({
      cachedAt: Date.now(),
      snapshot: {
        ...snapshot,
        cachedAt: Date.now(),
      },
    }, null, 2), "utf8");
  } catch (error) {
    await logMarket("cache_write_failed", { error: error.message });
  }
}

async function saveSuccessful(snapshot) {
  const liveRows = (snapshot.rows || []).filter((row) => row.status === "OK" || row.status === "FALLBACK").length;
  if (!hasEnoughFreshRows(snapshot)) {
    await logMarket("cache_save_skipped", { liveRows, reason: "low_quality_snapshot" });
    return false;
  }
  setMemory(snapshot);
  await saveLocal(snapshot);
  await logMarket("cache_saved", { liveRows });
  return true;
}

async function readLocal() {
  try {
    return JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function readSeed() {
  try {
    const seed = JSON.parse(await fs.readFile(SEED_FILE, "utf8"));
    return {
      cachedAt: new Date(seed.cachedAt || seed.generatedAt).getTime(),
      snapshot: canonicalizeSnapshot(seed),
    };
  } catch {
    return null;
  }
}

async function getFreshCache() {
  if (isFresh(memoryCache) && hasEnoughFreshRows(memoryCache.snapshot)) {
    await logMarket("cache_hit", { tier: "memory", state: "fresh" });
    return memoryCache.snapshot;
  }

  const local = await readLocal();
  if (isFresh(local) && hasEnoughFreshRows(local.snapshot)) {
    memoryCache = local;
    await logMarket("cache_hit", { tier: "local", state: "fresh" });
    local.snapshot = canonicalizeSnapshot(local.snapshot);
    return local.snapshot;
  }

  return null;
}

async function getStaleCache(reason) {
  if (isStaleUsable(memoryCache) && hasEnoughUsableRows(memoryCache.snapshot)) {
    await logMarket("stale_trigger", { tier: "memory", reason });
    return markSnapshotStale(memoryCache.snapshot, reason);
  }

  const local = await readLocal();
  if (isStaleUsable(local) && hasEnoughUsableRows(local.snapshot)) {
    memoryCache = local;
    await logMarket("stale_trigger", { tier: "local", reason });
    local.snapshot = canonicalizeSnapshot(local.snapshot);
    return markSnapshotStale(local.snapshot, reason);
  }

  const seed = await readSeed();
  if (seed?.snapshot && hasEnoughUsableRows(seed.snapshot)) {
    await logMarket("stale_trigger", { tier: "seed", reason });
    return markSnapshotStale(canonicalizeSnapshot(seed.snapshot), reason);
  }

  return null;
}

module.exports = {
  FRESH_TTL_MS,
  STALE_TTL_MS,
  getFreshCache,
  getStaleCache,
  saveSuccessful,
  hasEnoughUsableRows,
  hasEnoughFreshRows,
  isFresh,
  isStaleUsable,
  clearMemoryCache,
};
