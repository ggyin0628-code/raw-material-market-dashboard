const fs = require("node:fs/promises");
const net = require("node:net");
const tls = require("node:tls");
const path = require("node:path");
const crypto = require("node:crypto");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_DELIVERY_LEDGER = path.join(PROJECT_ROOT, "data", "weekly-reports", "delivery-ledger.json");
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function parseRecipients(value) {
  return String(value || "").split(/[;,\s]+/).map((item) => item.trim()).filter(Boolean);
}

function validateEmailAddress(value) {
  return EMAIL_PATTERN.test(String(value || "").trim());
}

function readMailConfig(env = process.env) {
  const portValue = Number(env.MAIL_PORT || 587);
  return {
    enabled: isTruthy(env.MAIL_ENABLED),
    host: String(env.MAIL_HOST || "").trim(),
    port: Number.isInteger(portValue) && portValue > 0 && portValue <= 65535 ? portValue : null,
    secure: isTruthy(env.MAIL_SECURE),
    user: String(env.MAIL_USER || "").trim(),
    password: String(env.MAIL_PASSWORD || ""),
    from: String(env.MAIL_FROM || "").trim(),
    to: parseRecipients(env.MAIL_TO),
    timeoutMs: Math.min(Math.max(Number(env.MAIL_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, 1000), 30000),
  };
}

function validateMailConfig(config) {
  const errors = [];
  if (!config.host) errors.push("MAIL_HOST 缺少");
  if (!config.port) errors.push("MAIL_PORT 格式錯誤");
  if (!config.user) errors.push("MAIL_USER 缺少");
  if (!config.password) errors.push("MAIL_PASSWORD 缺少");
  if (!validateEmailAddress(config.from)) errors.push("MAIL_FROM 格式錯誤");
  if (!config.to.length) errors.push("MAIL_TO 缺少");
  if (config.to.some((address) => !validateEmailAddress(address))) errors.push("MAIL_TO 含有無效收件人");
  return { valid: errors.length === 0, errors };
}

function defaultLedgerPath(env = process.env) {
  const configured = String(env.WEEKLY_DELIVERY_LEDGER || "").trim();
  if (!configured) return DEFAULT_DELIVERY_LEDGER;
  return path.isAbsolute(configured) ? configured : path.resolve(PROJECT_ROOT, configured);
}

async function readLedger(filePath = DEFAULT_DELIVERY_LEDGER) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : { weeks: {} };
  } catch (error) {
    if (error.code === "ENOENT") return { weeks: {} };
    throw error;
  }
}

async function writeLedger(ledger, filePath = DEFAULT_DELIVERY_LEDGER) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    await fs.writeFile(temp, JSON.stringify(ledger, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.rename(temp, filePath);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), "utf8").toString("base64")}?=`;
}

function wrapBase64(buffer) {
  return buffer.toString("base64").replace(/.{1,76}/g, "$&\r\n").trim();
}

function createMimeMessage({ from, to, subject, html, attachments = [] }) {
  const boundary = `----weekly-${crypto.randomUUID()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to.join(", ")}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
  ];
  for (const attachment of attachments) {
    lines.push(`--${boundary}`, `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`, `Content-Disposition: attachment; filename="${attachment.filename}"`, "Content-Transfer-Encoding: base64", "", wrapBase64(attachment.content));
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

function smtpConnection(config) {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true })
      : net.createConnection({ host: config.host, port: config.port });
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error("SMTP 連線 timeout")); }, config.timeoutMs);
    socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
    socket.once("connect", () => { clearTimeout(timeout); resolve(socket); });
    if (config.secure) socket.once("secureConnect", () => { clearTimeout(timeout); resolve(socket); });
  });
}

function smtpCommand(socket, command, expectedCodes, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => { cleanup(); reject(new Error("SMTP 回應 timeout")); }, timeoutMs);
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1) || "";
      if (!/^\d{3}( |$)/.test(last)) return;
      cleanup();
      const code = Number(last.slice(0, 3));
      if (!expectedCodes.includes(code)) reject(new Error(`SMTP 回應 ${code}`));
      else resolve({ code, text: lines.join(" ") });
    };
    const cleanup = () => { clearTimeout(timer); socket.off("data", onData); socket.off("error", onError); };
    const onError = (error) => { cleanup(); reject(error); };
    socket.on("data", onData);
    socket.once("error", onError);
    if (command) socket.write(`${command}\r\n`);
  });
}

async function smtpSend(config, message) {
  const socket = await smtpConnection(config);
  try {
    await smtpCommand(socket, "", [220], config.timeoutMs);
    await smtpCommand(socket, "EHLO weekly-market-dashboard", [250], config.timeoutMs);
    if (config.user || config.password) {
      await smtpCommand(socket, "AUTH LOGIN", [334], config.timeoutMs);
      await smtpCommand(socket, Buffer.from(config.user).toString("base64"), [334], config.timeoutMs);
      await smtpCommand(socket, Buffer.from(config.password).toString("base64"), [235], config.timeoutMs);
    }
    await smtpCommand(socket, `MAIL FROM:<${config.from}>`, [250], config.timeoutMs);
    for (const recipient of config.to) await smtpCommand(socket, `RCPT TO:<${recipient}>`, [250, 251], config.timeoutMs);
    await smtpCommand(socket, "DATA", [354], config.timeoutMs);
    socket.write(`${message.replace(/^\./gm, "..")}\r\n.\r\n`);
    await smtpCommand(socket, "", [250], config.timeoutMs);
    await smtpCommand(socket, "QUIT", [221, 250], config.timeoutMs);
    return { ok: true };
  } finally {
    socket.destroy();
  }
}

async function withMailRetry(operation, config) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try { return await operation(); } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

let deliveryQueue = Promise.resolve();

async function sendWeeklyEmail({ report, html, xlsxBuffer, dryRun = false, env = process.env, ledgerPath } = {}) {
  if (!report?.reportingWeek) throw new Error("週報缺少 reportingWeek");
  const config = readMailConfig(env);
  const configCheck = validateMailConfig(config);
  const targetLedger = ledgerPath || defaultLedgerPath(env);
  const operation = async () => {
    const ledger = await readLedger(targetLedger);
    const prior = ledger.weeks?.[report.reportingWeek];
    const attachments = [{ filename: `weekly-market-intelligence-${report.reportingWeek}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: xlsxBuffer }];
    const subject = `採購市場情報週報｜${report.reportingWeek}`;
    if (dryRun) {
      return { state: "DRY_RUN", reportingWeek: report.reportingWeek, configValid: configCheck.valid, configErrors: configCheck.errors, recipientCount: config.to.length, attachmentCount: attachments.length, sent: false };
    }
    if (prior?.state === "SENT") return { state: "DUPLICATE_PREVENTED", reportingWeek: report.reportingWeek, configValid: configCheck.valid, recipientCount: config.to.length, sent: false };
    if (!config.enabled) return { state: "FAILED", reportingWeek: report.reportingWeek, configValid: configCheck.valid, error: "MAIL_ENABLED 未啟用，已 fail closed", sent: false };
    if (!configCheck.valid) return { state: "FAILED", reportingWeek: report.reportingWeek, configValid: false, configErrors: configCheck.errors, sent: false };
    const message = createMimeMessage({ from: config.from, to: config.to, subject, html, attachments });
    try {
      await withMailRetry(() => smtpSend(config, message), config);
      const next = { weeks: { ...(ledger.weeks || {}), [report.reportingWeek]: { state: "SENT", sentAt: new Date().toISOString(), recipientCount: config.to.length, attachmentCount: attachments.length } } };
      await writeLedger(next, targetLedger);
      return { state: "SENT", reportingWeek: report.reportingWeek, configValid: true, recipientCount: config.to.length, attachmentCount: attachments.length, sent: true };
    } catch (error) {
      return { state: "FAILED", reportingWeek: report.reportingWeek, configValid: true, error: error.message, sent: false };
    }
  };
  deliveryQueue = deliveryQueue.then(operation, operation);
  return deliveryQueue;
}

module.exports = {
  DEFAULT_DELIVERY_LEDGER,
  EMAIL_PATTERN,
  isTruthy,
  parseRecipients,
  validateEmailAddress,
  readMailConfig,
  validateMailConfig,
  defaultLedgerPath,
  readLedger,
  writeLedger,
  createMimeMessage,
  smtpSend,
  sendWeeklyEmail,
};
