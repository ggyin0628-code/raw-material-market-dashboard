const DEFAULT_STALE_MAX_AGE_DAYS = 7;
const DEFAULT_WEEKLY_MAX_OBSERVATION_AGE_DAYS = 10;

function finiteDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value == null || value === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function iso(value) {
  const date = finiteDate(value);
  return date ? date.toISOString() : null;
}

function dateKey(value) {
  const date = finiteDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function maxDate(values = []) {
  const dates = values.map(finiteDate).filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function getSnapshotDataAsOf(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const rowDates = (snapshot.rows || []).flatMap((row) => [row?.lastTradeAt, row?.lastTradeTimestamp, row?.observationDate]);
  const dates = [snapshot.dataAsOf, snapshot.latestMarketObservationAt, snapshot.fx?.lastTradeAt, snapshot.fx?.observationDate, ...rowDates];
  return iso(maxDate(dates));
}

function observationAgeDays(observedAt, now = new Date()) {
  const observed = finiteDate(observedAt);
  const current = finiteDate(now);
  if (!observed || !current) return null;
  return Math.max(0, (current.getTime() - observed.getTime()) / 86400000);
}

function configuredAgeDays(env = process.env, key, fallback) {
  const value = Number(env?.[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function staleMaxAgeDays(env = process.env) {
  return configuredAgeDays(env, "MARKET_STALE_MAX_AGE_DAYS", DEFAULT_STALE_MAX_AGE_DAYS);
}

function weeklyMaxObservationAgeDays(env = process.env) {
  return configuredAgeDays(env, "WEEKLY_MAX_OBSERVATION_AGE_DAYS", DEFAULT_WEEKLY_MAX_OBSERVATION_AGE_DAYS);
}

function isProduction(env = process.env) {
  return String(env?.NODE_ENV || "").trim().toLowerCase() === "production";
}

function isFreshnessEligible(status, observedAt, now = new Date(), maxAgeDays = DEFAULT_WEEKLY_MAX_OBSERVATION_AGE_DAYS) {
  if (!["OK", "LIVE", "FALLBACK"].includes(String(status || "").toUpperCase())) return false;
  const age = observationAgeDays(observedAt, now);
  return age != null && age <= maxAgeDays;
}

function classifyObservation({ status, observedAt, now = new Date(), maxAgeDays = DEFAULT_WEEKLY_MAX_OBSERVATION_AGE_DAYS } = {}) {
  const normalized = String(status || "NO_DATA").trim().toUpperCase();
  const ageDays = observationAgeDays(observedAt, now);
  if (["API_ERROR", "NO_DATA", "EXPIRED"].includes(normalized)) return { status: normalized, ageDays, eligible: false };
  if (ageDays == null) return { status: normalized === "STALE" ? "STALE" : "NO_DATA", ageDays: null, eligible: false };
  if (ageDays > maxAgeDays) return { status: "EXPIRED", ageDays, eligible: false };
  if (normalized === "STALE") return { status: "STALE", ageDays, eligible: false };
  if (normalized === "FALLBACK") return { status: "FALLBACK", ageDays, eligible: true };
  return { status: "OK", ageDays, eligible: true };
}

function shouldServeStale(snapshot, now = new Date(), env = process.env) {
  const observedAt = getSnapshotDataAsOf(snapshot) || snapshot?.cachedAt || snapshot?.generatedAt;
  const ageDays = observationAgeDays(observedAt, now);
  return ageDays != null && ageDays <= staleMaxAgeDays(env);
}

function allowSeedFallback(env = process.env) {
  return !isProduction(env) && String(env?.ALLOW_MARKET_SEED_FALLBACK || "1") !== "0";
}

module.exports = {
  DEFAULT_STALE_MAX_AGE_DAYS,
  DEFAULT_WEEKLY_MAX_OBSERVATION_AGE_DAYS,
  allowSeedFallback,
  classifyObservation,
  dateKey,
  finiteDate,
  getSnapshotDataAsOf,
  isFreshnessEligible,
  isProduction,
  iso,
  maxDate,
  observationAgeDays,
  shouldServeStale,
  staleMaxAgeDays,
  weeklyMaxObservationAgeDays,
};
