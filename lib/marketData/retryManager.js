const { logMarket } = require("./logger");

const DEFAULT_TIMEOUT_MS = boundedInteger(process.env.MARKET_TIMEOUT_MS, 5000, 250, 30000);
const DEFAULT_RETRIES = boundedInteger(process.env.MARKET_RETRIES, 2, 0, 5);

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  const safeTimeout = boundedInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 1, 30000);
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(safeTimeout),
  });
  return {
    response,
    latencyMs: Date.now() - startedAt,
  };
}

async function withRetry(operation, context = {}) {
  const retries = context.retries ?? DEFAULT_RETRIES;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    try {
      const result = await operation(attempt);
      await logMarket("fetch_success", {
        ...context,
        attempt,
        latencyMs: Date.now() - startedAt,
      });
      return {
        ...result,
        retryCount: attempt,
        latencyMs: result.latencyMs ?? Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;
      await logMarket("fetch_retry", {
        ...context,
        attempt,
        latencyMs: Date.now() - startedAt,
        error: error.message,
      });
    }
  }

  throw lastError || new Error("Retry failed");
}

module.exports = {
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT_MS,
  boundedInteger,
  fetchWithTimeout,
  withRetry,
};
