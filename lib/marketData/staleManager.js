const { MARKET_STATES } = require("./status");
const { getSnapshotDataAsOf, iso, observationAgeDays, staleMaxAgeDays } = require("./freshness");

function mapRows(snapshot, status, reason) {
  return (snapshot.rows || []).map((row) => ({
    ...row,
    status: row.status === MARKET_STATES.API_ERROR ? MARKET_STATES.API_ERROR : status,
    sourceReliability: status,
    error: row.status === MARKET_STATES.API_ERROR ? row.error : reason,
  }));
}

function markSnapshotStale(snapshot, reason, now = new Date(), env = process.env) {
  const dataAsOf = getSnapshotDataAsOf(snapshot);
  const servedAt = iso(now) || new Date().toISOString();
  const ageDays = observationAgeDays(dataAsOf, now);
  if (ageDays == null || ageDays > staleMaxAgeDays(env)) return markSnapshotExpired(snapshot, reason, now);
  return {
    ...snapshot,
    state: MARKET_STATES.STALE,
    servedAt,
    generatedAt: snapshot.generatedAt || dataAsOf || servedAt,
    dataAsOf,
    latestMarketObservationAt: dataAsOf,
    cache: {
      ...(snapshot.cache || {}),
      status: MARKET_STATES.STALE,
      reason,
      servedAt,
      dataAsOf,
      ageDays,
    },
    fx: snapshot.fx ? {
      ...snapshot.fx,
      status: snapshot.fx.status === MARKET_STATES.API_ERROR ? MARKET_STATES.API_ERROR : MARKET_STATES.STALE,
      sourceReliability: "STALE",
      error: reason,
    } : null,
    rows: mapRows(snapshot, MARKET_STATES.STALE, reason),
    disclaimer: `${snapshot.disclaimer || ""} 目前行情來源失敗時，系統只會顯示最近一次成功抓取的真實快取資料，並標示 STALE；頁面更新時間與行情資料截至時間分開顯示。`,
  };
}

function markSnapshotExpired(snapshot, reason, now = new Date()) {
  const dataAsOf = getSnapshotDataAsOf(snapshot);
  const servedAt = iso(now) || new Date().toISOString();
  const ageDays = observationAgeDays(dataAsOf, now);
  return {
    ...snapshot,
    state: MARKET_STATES.EXPIRED,
    servedAt,
    generatedAt: snapshot.generatedAt || dataAsOf || servedAt,
    dataAsOf,
    latestMarketObservationAt: dataAsOf,
    cache: {
      ...(snapshot.cache || {}),
      status: MARKET_STATES.EXPIRED,
      reason,
      servedAt,
      dataAsOf,
      ageDays,
    },
    fx: snapshot.fx ? {
      ...snapshot.fx,
      status: snapshot.fx.status === MARKET_STATES.API_ERROR ? MARKET_STATES.API_ERROR : MARKET_STATES.EXPIRED,
      sourceReliability: "EXPIRED",
      error: reason,
    } : null,
    rows: mapRows(snapshot, MARKET_STATES.EXPIRED, reason),
    disclaimer: `${snapshot.disclaimer || ""} 可取得的公開行情已超出允許 freshness window，系統不將其視為目前行情；請等待新的公開來源或顯示 NO_DATA。`,
  };
}

module.exports = {
  markSnapshotExpired,
  markSnapshotStale,
};
