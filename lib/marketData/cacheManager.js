const fs = require("node:fs/promises");
const path = require("node:path");
const { logMarket } = require("./logger");
const { markSnapshotExpired, markSnapshotStale } = require("./staleManager");
const { canonicalizeSnapshot, isUsableStatus } = require("./dataContract");
const { allowSeedFallback, getSnapshotDataAsOf, isProduction, observationAgeDays, shouldServeStale, staleMaxAgeDays } = require("./freshness");

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

function isFresh(entry, now = Date.now()) {
  return Boolean(entry?.cachedAt && now - new Date(entry.cachedAt).getTime() < FRESH_TTL_MS);
}

function isStaleUsable(entry, now = new Date(), env = process.env) {
  return Boolean(entry?.snapshot && shouldServeStale(entry.snapshot, now, env));
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
  const canonical = canonicalizeSnapshot(snapshot);
  memoryCache = {
    cachedAt: new Date().toISOString(),
    snapshot: {
      ...canonical,
      cachedAt: new Date().toISOString(),
    },
  };
}

async function saveLocal(snapshot) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify({
      cachedAt: new Date().toISOString(),
      snapshot: {
        ...snapshot,
        cachedAt: new Date().toISOString(),
      },
    }, null, 2), "utf8");
  } catch (error) {
    await logMarket("cache_write_failed", { error: error.message });
  }
}

async function saveSuccessful(snapshot) {
  const liveRows = (snapshot.rows || []).filter((row) => row.status === "OK" || row.status === "FALLBACK").length;
  if (snapshot.acquisitionPath && snapshot.acquisitionPath !== "DIRECT_ACQUISITION") {
    await logMarket("cache_save_skipped", { liveRows, reason: "not_direct_acquisition" });
    return false;
  }
  if (!hasEnoughFreshRows(snapshot)) {
    await logMarket("cache_save_skipped", { liveRows, reason: "low_quality_snapshot" });
    return false;
  }
  setMemory(snapshot);
  await saveLocal(snapshot);
  await logMarket("cache_saved", { liveRows, dataAsOf: getSnapshotDataAsOf(snapshot) });
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
      cachedAt: new Date(seed.cachedAt || seed.generatedAt).toISOString(),
      snapshot: canonicalizeSnapshot({ ...seed, dataAsOf: seed.dataAsOf || getSnapshotDataAsOf(seed), acquisitionPath: "SEED_FALLBACK" }),
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

async function getStaleCache(reason, options = {}) {
  const env = options.env || process.env;
  const now = options.now || new Date();
  const candidates = [];
  if (hasEnoughUsableRows(memoryCache?.snapshot)) candidates.push({ tier: "memory", entry: memoryCache });
  const local = await readLocal();
  if (hasEnoughUsableRows(local?.snapshot)) candidates.push({ tier: "local", entry: local });
  if (allowSeedFallback(env)) {
    const seed = await readSeed();
    if (hasEnoughUsableRows(seed?.snapshot)) candidates.push({ tier: "seed", entry: seed });
  }

  const ranked = candidates.map((candidate) => {
    const snapshot = canonicalizeSnapshot(candidate.entry.snapshot);
    const dataAsOf = getSnapshotDataAsOf(snapshot);
    const ageDays = observationAgeDays(dataAsOf, now);
    return {
      ...candidate,
      snapshot,
      dataAsOf,
      ageDays,
      eligible: ageDays != null && ageDays <= staleMaxAgeDays(env),
      tierRank: candidate.tier === "memory" ? 3 : candidate.tier === "local" ? 2 : 1,
    };
  });
  const newestFirst = (left, right) => String(right.dataAsOf || "").localeCompare(String(left.dataAsOf || "")) || right.tierRank - left.tierRank;
  const eligible = ranked.filter((candidate) => candidate.dataAsOf && candidate.eligible).sort(newestFirst);
  if (eligible.length) {
    const candidate = eligible[0];
    if (candidate.tier === "local") memoryCache = candidate.entry;
    await logMarket("stale_trigger", { tier: candidate.tier, reason, dataAsOf: candidate.dataAsOf, ageDays: candidate.ageDays });
    return markSnapshotStale(candidate.snapshot, reason, now, env);
  }

  const expired = ranked.filter((candidate) => candidate.dataAsOf).sort(newestFirst);
  if (expired.length) {
    const candidate = expired[0];
    await logMarket("expired_trigger", { tier: candidate.tier, reason, dataAsOf: candidate.dataAsOf, ageDays: candidate.ageDays });
    return markSnapshotExpired(candidate.snapshot, reason, now);
  }

  if (isProduction(env)) await logMarket("seed_fallback_disabled", { reason });
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
