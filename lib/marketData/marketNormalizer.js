function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toDateOnly(timestamp) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function toIsoTimestamp(timestamp) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeDateRows(rows = []) {
  const byDate = new Map();
  for (const row of rows) {
    if (!row || typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    if (typeof row.close !== "number" || !Number.isFinite(row.close)) continue;
    byDate.set(row.date, { date: row.date, close: row.close });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function latestValidPoint(timestamps = [], values = []) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (finiteNumber(values[index]) !== null && typeof timestamps[index] === "number" && Number.isFinite(timestamps[index])) {
      return { value: values[index], timestamp: timestamps[index], index };
    }
  }
  return null;
}

function normalizeYahooChart(payload) {
  const result = payload?.chart?.result?.[0];
  const error = payload?.chart?.error;
  if (!result || error) throw new Error(error?.description || "Yahoo chart response missing result");

  const close = result.indicators?.quote?.[0]?.close || [];
  const timestamps = result.timestamp || [];
  const meta = result.meta || {};
  const latestPoint = latestValidPoint(timestamps, close);
  const metaTime = finiteNumber(meta.regularMarketTime);
  const metaLooksFresh = metaTime !== null && latestPoint?.timestamp ? metaTime >= latestPoint.timestamp - 86400 : false;
  const price = metaLooksFresh && finiteNumber(meta.regularMarketPrice) !== null
    ? meta.regularMarketPrice
    : latestPoint?.value ?? null;
  if (typeof price !== "number" || !Number.isFinite(price)) throw new Error("Yahoo chart response missing finite price");

  const previousPoint = latestPoint ? latestValidPoint(timestamps.slice(0, latestPoint.index), close.slice(0, latestPoint.index)) : null;
  const previousClose = metaLooksFresh && finiteNumber(meta.previousClose) !== null
    ? meta.previousClose
    : previousPoint?.value ?? null;
  const change = typeof previousClose === "number" ? price - previousClose : null;
  const changePercent = typeof change === "number" && previousClose ? (change / previousClose) * 100 : null;
  const lastTradeAt = metaLooksFresh ? toIsoTimestamp(metaTime) : toIsoTimestamp(latestPoint?.timestamp);
  const history = normalizeDateRows(timestamps.map((timestamp, index) => ({
    date: toDateOnly(timestamp),
    close: close[index],
  })));

  return {
    price,
    previousClose,
    change,
    changePercent,
    currency: meta.currency || "USD",
    exchangeName: meta.exchangeName || meta.fullExchangeName || "",
    marketState: meta.marketState || "",
    lastTradeAt,
    history,
  };
}

function normalizeYahooHistory(payload) {
  const result = payload?.chart?.result?.[0];
  const error = payload?.chart?.error;
  if (!result || error) throw new Error(error?.description || "Yahoo history response missing result");

  const close = result.indicators?.quote?.[0]?.close || [];
  const timestamps = result.timestamp || [];
  const rows = normalizeDateRows(timestamps.map((timestamp, index) => ({
    date: toDateOnly(timestamp),
    close: close[index],
  })));
  return rows.map((row) => ({
    ...row,
    currency: result.meta?.currency || "USD",
    source: "Yahoo Finance",
  }));
}

function parseStooqCsv(text) {
  const rows = String(text || "").trim().split(/\r?\n/);
  if (rows.length < 2) throw new Error("Stooq response missing quote");
  const headers = rows[0].split(",").map((value) => value.trim());
  const values = rows[1].split(",").map((value) => value.trim());
  const aliases = {
    Data: "Date",
    Czas: "Time",
    Otwarcie: "Open",
    Najwyzszy: "High",
    Najnizszy: "Low",
    Zamkniecie: "Close",
    Wolumen: "Volume",
  };
  return Object.fromEntries(headers.map((header, index) => [aliases[header] || header, values[index]]));
}

function normalizeStooqQuote(text, material) {
  const row = parseStooqCsv(text);
  const rawClose = Number(row.Close);
  const rawOpen = Number(row.Open);
  if (material?.stooqSymbol && row.Symbol && row.Symbol.toLowerCase() !== material.stooqSymbol.toLowerCase()) throw new Error("Stooq symbol mismatch");
  if (row.Date === "N/D" || !Number.isFinite(rawClose)) throw new Error("Stooq quote unavailable");

  const factor = material.stooqPriceFactor || 1;
  const price = rawClose * factor;
  const previousClose = Number.isFinite(rawOpen) ? rawOpen * factor : null;
  const change = typeof previousClose === "number" ? price - previousClose : null;
  const changePercent = typeof change === "number" && previousClose ? (change / previousClose) * 100 : null;
  const parsedDate = row.Date && row.Time && row.Date !== "N/D" && row.Time !== "N/D"
    ? new Date(`${row.Date}T${row.Time}Z`)
    : null;
  const lastTradeAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;

  return {
    price,
    previousClose,
    change,
    changePercent,
    currency: "USD",
    exchangeName: "Stooq",
    marketState: "",
    lastTradeAt,
    history: [{ date: row.Date, close: price }],
  };
}

module.exports = {
  normalizeDateRows,
  normalizeYahooHistory,
  normalizeStooqQuote,
  normalizeYahooChart,
};
