const { PUBLIC_MARKET_DISCLAIMER } = require("./machiningContract");
const { buildMachiningReference } = require("./pressureModel");
const { collectPublicMachiningInputs } = require("./sourceService");

const CACHE_TTL_MS = 15 * 60 * 1000;
let cachedPayload = null;
let refreshPromise = null;

function buildPayload(reference, sourceCoverage, generatedAt) {
  return {
    state: reference.compositePressureScore === null ? "DATA_INSUFFICIENT" : reference.dataQuality,
    generatedAt,
    reference,
    sourceCoverage,
    disclaimer: PUBLIC_MARKET_DISCLAIMER,
  };
}

async function refreshMachiningReference({ collector = collectPublicMachiningInputs, now = new Date(), weights, minimumEvidence } = {}) {
  const generatedAt = new Date(now).toISOString();
  const input = await collector({ now });
  const reference = buildMachiningReference({
    ...input,
    referenceDate: generatedAt,
    weights,
    minimumEvidence,
  });
  const payload = buildPayload(reference, input.sourceCoverage || reference.sourceProvenance, generatedAt);
  cachedPayload = { payload, cachedAt: Date.now() };
  return payload;
}

async function getMachiningReference(options = {}) {
  const force = options.force === true;
  if (!force && cachedPayload && Date.now() - cachedPayload.cachedAt < CACHE_TTL_MS) {
    return {
      ...cachedPayload.payload,
      cache: { status: "MEMORY_CACHE", cachedAt: new Date(cachedPayload.cachedAt).toISOString(), ttlSeconds: CACHE_TTL_MS / 1000 },
    };
  }
  if (!refreshPromise) {
    refreshPromise = refreshMachiningReference(options).finally(() => {
      refreshPromise = null;
    });
  }
  const payload = await refreshPromise;
  return {
    ...payload,
    cache: { status: "LIVE", cachedAt: new Date().toISOString(), ttlSeconds: CACHE_TTL_MS / 1000 },
  };
}

function resetMachiningCache() {
  cachedPayload = null;
  refreshPromise = null;
}

module.exports = {
  CACHE_TTL_MS,
  buildPayload,
  getMachiningReference,
  refreshMachiningReference,
  resetMachiningCache,
};
