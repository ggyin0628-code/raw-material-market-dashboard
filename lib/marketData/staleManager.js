const { MARKET_STATES } = require("./status");

function markSnapshotStale(snapshot, reason) {
  return {
    ...snapshot,
    state: MARKET_STATES.STALE,
    generatedAt: new Date().toISOString(),
    cache: {
      ...(snapshot.cache || {}),
      status: MARKET_STATES.STALE,
      reason,
    },
    fx: snapshot.fx ? {
      ...snapshot.fx,
      status: snapshot.fx.status === MARKET_STATES.API_ERROR ? MARKET_STATES.API_ERROR : MARKET_STATES.STALE,
      sourceReliability: "STALE",
      error: reason,
    } : null,
    rows: (snapshot.rows || []).map((row) => ({
      ...row,
      status: row.status === MARKET_STATES.API_ERROR ? MARKET_STATES.API_ERROR : MARKET_STATES.STALE,
      sourceReliability: "STALE",
      error: row.status === MARKET_STATES.API_ERROR ? row.error : reason,
    })),
    disclaimer: `${snapshot.disclaimer || ""} 目前行情來源失敗時，系統只會顯示最近一次成功抓取的真實快取資料，並標示 STALE。`,
  };
}

module.exports = {
  markSnapshotStale,
};
