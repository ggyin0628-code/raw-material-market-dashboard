const fs = require("node:fs/promises");
const path = require("node:path");

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "market.log");
const DEBUG = process.env.DEBUG === "true";

async function logMarket(event, details = {}) {
  const entry = {
    time: new Date().toISOString(),
    event,
    ...details,
  };

  if (DEBUG) {
    console.log(`[market] ${event}`, JSON.stringify(details));
  }

  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Logging must never break the market API.
  }
}

module.exports = {
  DEBUG,
  logMarket,
};
