const fs = require("node:fs/promises");
const path = require("node:path");
const { logMarket } = require("./logger");
const { markSnapshotStale } = require("./staleManager");

const CACHE_DIR = path.join(process.cwd(), "cache");
const CACHE_FILE = path.join(CACHE_DIR, "market-cache.json");
const SEED_FILE = path.join(process.cwd(), "market-seed.json");
const FRESH_TTL_MS = Number(process.env.MARKET_CACHE_TTL_MS || 15 * 60 * 1000);
const STALE_TTL_MS = Number(process.env.MARKET_STALE_TTL_MS || 24 * 60 * 60 * 1000);

let memoryCache = null;

function isFresh(entry) {
  return Boolean(entry?.cachedAt && Date.now() - entry.cachedAt < FRESH_TTL_MS);
}

function isStaleUsable(entry) {
  return Boolean(entry?.cachedAt && Date.now() - entry.cachedAt < STALE_TTL_MS);
}

function setMemory(snapshot) {
  memoryCache = {
    cachedAt: Date.now(),
    snapshot: {
      ...snapshot,
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
  const liveRows = (snapshot.rows || []).filter((row) => row.status !== "API_ERROR" && row.status !== "NO_DATA").length;
  if (!liveRows) return false;
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
      snapshot: seed,
    };
  } catch {
    return null;
  }
}

async function getFreshCache() {
  if (isFresh(memoryCache)) {
    await logMarket("cache_hit", { tier: "memory", state: "fresh" });
    return memoryCache.snapshot;
  }

  const local = await readLocal();
  if (isFresh(local)) {
    memoryCache = local;
    await logMarket("cache_hit", { tier: "local", state: "fresh" });
    return local.snapshot;
  }

  return null;
}

async function getStaleCache(reason) {
  if (isStaleUsable(memoryCache)) {
    await logMarket("stale_trigger", { tier: "memory", reason });
    return markSnapshotStale(memoryCache.snapshot, reason);
  }

  const local = await readLocal();
  if (isStaleUsable(local)) {
    memoryCache = local;
    await logMarket("stale_trigger", { tier: "local", reason });
    return markSnapshotStale(local.snapshot, reason);
  }

  const seed = await readSeed();
  if (seed?.snapshot) {
    await logMarket("stale_trigger", { tier: "seed", reason });
    return markSnapshotStale(seed.snapshot, reason);
  }

  return null;
}

module.exports = {
  FRESH_TTL_MS,
  STALE_TTL_MS,
  getFreshCache,
  getStaleCache,
  saveSuccessful,
};
