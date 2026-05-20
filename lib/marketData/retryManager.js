const { logMarket } = require("./logger");

const DEFAULT_TIMEOUT_MS = Number(process.env.MARKET_TIMEOUT_MS || 5000);
const DEFAULT_RETRIES = Number(process.env.MARKET_RETRIES || 2);

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
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
  fetchWithTimeout,
  withRetry,
};
