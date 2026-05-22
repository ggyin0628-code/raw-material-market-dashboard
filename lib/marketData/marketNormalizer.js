function latestValid(values = []) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (typeof values[index] === "number" && Number.isFinite(values[index])) return values[index];
  }
  return null;
}

function latestValidPoint(timestamps = [], values = []) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (typeof values[index] === "number" && Number.isFinite(values[index]) && timestamps[index]) {
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
  const metaTime = meta.regularMarketTime || null;
  const metaLooksFresh = metaTime && latestPoint?.timestamp ? metaTime >= latestPoint.timestamp - 86400 : false;
  const price = metaLooksFresh && typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : latestPoint?.value ?? latestValid(close);
  const previousPoint = latestPoint ? latestValidPoint(timestamps.slice(0, latestPoint.index), close.slice(0, latestPoint.index)) : null;
  const previousClose = typeof meta.previousClose === "number" && metaLooksFresh ? meta.previousClose : previousPoint?.value ?? null;
  const change = typeof price === "number" && typeof previousClose === "number" ? price - previousClose : null;
  const changePercent = typeof change === "number" && previousClose ? (change / previousClose) * 100 : null;
  const lastTrade = metaLooksFresh ? metaTime : latestPoint?.timestamp || timestamps[timestamps.length - 1] || null;

  return {
    price,
    previousClose,
    change,
    changePercent,
    currency: meta.currency || "USD",
    exchangeName: meta.exchangeName || meta.fullExchangeName || "",
    marketState: meta.marketState || "",
    lastTradeAt: lastTrade ? new Date(lastTrade * 1000).toISOString() : null,
    history: timestamps.map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      close: close[index] ?? null,
    })).filter((point) => typeof point.close === "number"),
  };
}

function normalizeYahooHistory(payload) {
  const result = payload?.chart?.result?.[0];
  const error = payload?.chart?.error;
  if (!result || error) throw new Error(error?.description || "Yahoo history response missing result");

  const close = result.indicators?.quote?.[0]?.close || [];
  const timestamps = result.timestamp || [];
  const meta = result.meta || {};

  return timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    close: close[index] ?? null,
    currency: meta.currency || "USD",
    source: "Yahoo Finance",
  })).filter((point) => typeof point.close === "number" && Number.isFinite(point.close));
}

function parseStooqCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length < 2) throw new Error("Stooq response missing quote");
  const headers = rows[0].split(",");
  const values = rows[1].split(",");
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

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeStooqQuote(text, material) {
  const row = parseStooqCsv(text);
  const rawClose = finiteNumber(row.Close);
  const rawOpen = finiteNumber(row.Open);
  if (row.Date === "N/D" || typeof rawClose !== "number") throw new Error("Stooq quote unavailable");

  const factor = material.stooqPriceFactor || 1;
  const price = rawClose * factor;
  const previousClose = typeof rawOpen === "number" ? rawOpen * factor : null;
  const change = typeof previousClose === "number" ? price - previousClose : null;
  const changePercent = typeof change === "number" && previousClose ? (change / previousClose) * 100 : null;
  const lastTradeAt = row.Date && row.Time && row.Date !== "N/D" && row.Time !== "N/D"
    ? new Date(`${row.Date}T${row.Time}Z`).toISOString()
    : null;

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
  normalizeYahooHistory,
  normalizeStooqQuote,
  normalizeYahooChart,
};
