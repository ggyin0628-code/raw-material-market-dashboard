const assert = require("node:assert/strict");
const test = require("node:test");
const { summarizeRows } = require("../dashboard-summary");

test("dashboard summary separates fresh, fallback, stale, expired, API and no-data rows", () => {
  const summary = summarizeRows([
    { name: "fresh", status: "OK", changePercent: 2 },
    { name: "fallback", status: "FALLBACK", changePercent: -1 },
    { name: "stale", status: "STALE", changePercent: 99 },
    { name: "expired", status: "EXPIRED", changePercent: -99 },
    { name: "api", status: "API_ERROR", changePercent: 500 },
    { name: "missing", status: "NO_DATA", changePercent: 500 },
  ]);
  assert.equal(summary.freshCount, 1);
  assert.equal(summary.fallbackCount, 1);
  assert.equal(summary.usableCount, 2);
  assert.equal(summary.staleCount, 1);
  assert.equal(summary.expiredCount, 1);
  assert.equal(summary.apiErrorCount, 1);
  assert.equal(summary.noDataCount, 1);
  assert.equal(summary.topGainer.name, "fresh");
  assert.equal(summary.topLoser.name, "fallback");
  assert.equal(summary.headlineWarning, null);
});

test("dashboard summary does not rank stale or expired rows and warns when no eligible rows exist", () => {
  const summary = summarizeRows([
    { name: "old-high", status: "STALE", changePercent: 99 },
    { name: "old-low", status: "EXPIRED", changePercent: -99 },
  ]);
  assert.equal(summary.topGainer, null);
  assert.equal(summary.topLoser, null);
  assert.match(summary.headlineWarning, /沒有 freshness-eligible/);
});
