const fs = require("node:fs/promises");
const net = require("node:net");
const tls = require("node:tls");
const crypto = require("node:crypto");
const { DEFAULT_DELIVERY_LEDGER_FILE, getStorageConfig, isTruthy } = require("./storageConfig");
const { updateJobState, safeError, writeFileAtomic } = require("./storageService");
const postgres = require("./postgresAdapter");
const { DEFAULT_GRAPH_TENANT, graphSend } = require("./graphMailService");

const DEFAULT_DELIVERY_LEDGER = DEFAULT_DELIVERY_LEDGER_FILE;
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;

function parseRecipients(value) {
  const seen = new Set();
  return String(value || "").split(/[;,\s]+/).map((item) => item.trim()).filter(Boolean).filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validateEmailAddress(value) {
  return EMAIL_PATTERN.test(String(value || "").trim());
}

function readMailConfig(env = process.env) {
  const provider = String(env.MAIL_PROVIDER || "smtp").trim().toLowerCase();
  const portValue = Number(env.MAIL_PORT || 587);
  const testMode = isTruthy(env.MAIL_TEST_MODE);
  const configuredTo = parseRecipients(env.MAIL_TO);
  const testTo = parseRecipients(env.MAIL_TEST_TO);
  const to = testMode ? testTo : configuredTo;
  const cc = testMode ? [] : parseRecipients(env.MAIL_CC);
  const replyTo = testMode ? "" : String(env.MAIL_REPLY_TO || "").trim();
  const envelopeRecipients = [...new Set([...to, ...cc])];
  return {
    provider,
    enabled: isTruthy(env.MAIL_ENABLED),
    testMode,
    host: String(env.MAIL_HOST || "").trim(),
    port: Number.isInteger(portValue) && portValue > 0 && portValue <= 65535 ? portValue : null,
    secure: isTruthy(env.MAIL_SECURE),
    user: String(env.MAIL_USER || "").trim(),
    password: String(env.MAIL_PASSWORD || ""),
    from: String(env.MAIL_FROM || "").trim(),
    to,
    configuredTo,
    testTo,
    cc,
    replyTo,
    envelopeRecipients,
    timeoutMs: Math.min(Math.max(Number(env.MAIL_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, 1000), 30000),
    graphTimeoutMs: Math.min(Math.max(Number(env.MICROSOFT_GRAPH_TIMEOUT_MS) || 15000, 1000), 30000),
    clientId: String(env.MICROSOFT_CLIENT_ID || "").trim(),
    refreshToken: String(env.MICROSOFT_REFRESH_TOKEN || ""),
    tenant: String(env.MICROSOFT_TENANT || DEFAULT_GRAPH_TENANT).trim().toLowerCase(),
  };
}

function validateMailConfig(config) {
  const errors = [];
  if (!config.provider || !["smtp", "outlook_graph"].includes(config.provider)) errors.push("MAIL_PROVIDER 無效");
  if (config.provider === "outlook_graph") {
    if (!config.clientId) errors.push("MICROSOFT_CLIENT_ID 缺少");
    if (!config.refreshToken) errors.push("MICROSOFT_REFRESH_TOKEN 缺少");
    if (config.tenant !== DEFAULT_GRAPH_TENANT) errors.push("MICROSOFT_TENANT 必須為 consumers");
  } else {
    if (!config.host) errors.push("MAIL_HOST 缺少");
    if (!config.port) errors.push("MAIL_PORT 格式錯誤");
    if (!config.user) errors.push("MAIL_USER 缺少");
    if (!config.password) errors.push("MAIL_PASSWORD 缺少");
  }
  if (!validateEmailAddress(config.from)) errors.push("MAIL_FROM 格式錯誤");
  if (!config.to.length) errors.push(config.testMode ? "MAIL_TEST_TO 缺少" : "MAIL_TO 缺少");
  if (config.to.some((address) => !validateEmailAddress(address))) errors.push(config.testMode ? "MAIL_TEST_TO 含有無效收件人" : "MAIL_TO 含有無效收件人");
  if (config.cc.some((address) => !validateEmailAddress(address))) errors.push("MAIL_CC 含有無效收件人");
  if (config.replyTo && !validateEmailAddress(config.replyTo)) errors.push("MAIL_REPLY_TO 格式錯誤");
  return { valid: errors.length === 0, errors };
}

function defaultLedgerPath(env = process.env) {
  return getStorageConfig(env).deliveryLedgerFile;
}

async function readLedger(filePath, options = {}) {
  const config = options.config || getStorageConfig(options.env || process.env);
  if (config.provider === "postgres" && !filePath) return postgres.readDeliveryLedger({ env: options.env, pool: options.pool });
  const target = filePath || config.deliveryLedgerFile || DEFAULT_DELIVERY_LEDGER;
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : { weeks: {} };
  } catch (error) {
    if (error.code === "ENOENT") return { weeks: {} };
    if (error instanceof SyntaxError) {
      const wrapped = new Error(`delivery ledger 格式錯誤：${error.message}`);
      wrapped.code = "DELIVERY_LEDGER_INVALID";
      throw wrapped;
    }
    throw error;
  }
}

async function writeLedger(ledger, filePath, options = {}) {
  const config = options.config || getStorageConfig(options.env || process.env);
  if (config.provider === "postgres" && !filePath) return postgres.writeDeliveryLedger(ledger, { env: options.env, pool: options.pool });
  const target = filePath || config.deliveryLedgerFile || DEFAULT_DELIVERY_LEDGER;
  return writeFileAtomic(target, JSON.stringify(ledger, null, 2), { encoding: "utf8" });
}

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), "utf8").toString("base64")}?=`;
}

function wrapBase64(buffer) {
  return buffer.toString("base64").replace(/.{1,76}/g, "$&\r\n").trim();
}

function createMimeMessage({ from, to, cc = [], replyTo = "", subject, html, attachments = [] }) {
  if (typeof html !== "string" || html.length === 0) {
    const error = new Error("HTML payload 無效");
    error.code = "ATTACHMENT_INVALID";
    throw error;
  }
  if (attachments.some((attachment) => !Buffer.isBuffer(attachment.content) || attachment.content.length === 0)) {
    const error = new Error("週報附件 payload 無效");
    error.code = "ATTACHMENT_INVALID";
    throw error;
  }
  const boundary = `----weekly-${crypto.randomUUID()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to.join(", ")}`,
    ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
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
    const timeout = setTimeout(() => { socket.destroy(); reject(Object.assign(new Error("SMTP 連線 timeout"), { code: "ETIMEDOUT" })); }, config.timeoutMs);
    socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
    socket.once("connect", () => { clearTimeout(timeout); resolve(socket); });
    if (config.secure) socket.once("secureConnect", () => { clearTimeout(timeout); resolve(socket); });
  });
}

function smtpCommand(socket, command, expectedCodes, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => { cleanup(); reject(Object.assign(new Error("SMTP 回應 timeout"), { code: "ETIMEDOUT" })); }, timeoutMs);
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1) || "";
      if (!/^\d{3}( |$)/.test(last)) return;
      cleanup();
      const code = Number(last.slice(0, 3));
      if (!expectedCodes.includes(code)) {
        const error = new Error(`SMTP 回應 ${code}`);
        error.smtpCode = code;
        reject(error);
      } else resolve({ code, text: lines.join(" ") });
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
  let dataSubmitted = false;
  try {
    await smtpCommand(socket, "", [220], config.timeoutMs);
    await smtpCommand(socket, "EHLO weekly-market-dashboard", [250], config.timeoutMs);
    if (config.user || config.password) {
      await smtpCommand(socket, "AUTH LOGIN", [334], config.timeoutMs);
      await smtpCommand(socket, Buffer.from(config.user).toString("base64"), [334], config.timeoutMs);
      await smtpCommand(socket, Buffer.from(config.password).toString("base64"), [235], config.timeoutMs);
    }
    await smtpCommand(socket, `MAIL FROM:<${config.from}>`, [250], config.timeoutMs);
    for (const recipient of config.envelopeRecipients) await smtpCommand(socket, `RCPT TO:<${recipient}>`, [250, 251], config.timeoutMs);
    await smtpCommand(socket, "DATA", [354], config.timeoutMs);
    dataSubmitted = true;
    socket.write(`${message.replace(/^\./gm, "..")}\r\n.\r\n`);
    await smtpCommand(socket, "", [250], config.timeoutMs);
    await smtpCommand(socket, "QUIT", [221, 250], config.timeoutMs);
    return { ok: true };
  } catch (error) {
    error.maybeAccepted = dataSubmitted;
    throw error;
  } finally {
    socket.destroy();
  }
}

function isTransientMailError(error) {
  if (!error || error.maybeAccepted) return false;
  if (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH", "GRAPH_TIMEOUT", "GRAPH_NETWORK_ERROR"].includes(error.code)) return true;
  if (["GRAPH_THROTTLED", "GRAPH_SERVER_ERROR"].includes(error.code)) return true;
  return error.smtpCode >= 400 && error.smtpCode < 500;
}

async function withMailRetry(operation) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!isTransientMailError(error) || attempt >= MAX_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

let deliveryQueue = Promise.resolve();

async function sendWeeklyEmail({ report, html, xlsxBuffer, dryRun = false, env = process.env, ledgerPath, allowResend = false, storageConfig, pool, smtpSender = smtpSend, graphSender = graphSend } = {}) {
  if (!report?.reportingWeek) throw new Error("週報缺少 reportingWeek");
  const config = readMailConfig(env);
  const configCheck = validateMailConfig(config);
  const configForState = storageConfig || getStorageConfig(env);
  const targetLedger = ledgerPath || (configForState.provider === "postgres" ? null : configForState.deliveryLedgerFile);
  const ledgerOptions = { env, config: configForState, pool };
  const operation = async () => {
    await updateJobState("weeklyMail", { state: "RUNNING", lastAttemptedAt: new Date().toISOString(), reportingWeek: report.reportingWeek }, { config: configForState, env, pool }).catch(() => {});
    const ledger = await readLedger(targetLedger, ledgerOptions);
    const attachments = [{ filename: `weekly-market-intelligence-${report.reportingWeek}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content: xlsxBuffer }];
    const subject = `採購市場情報週報｜${report.reportingWeek}`;
    const prior = ledger.weeks?.[report.reportingWeek];
    const resendApproved = allowResend && isTruthy(env.ALLOW_WEEKLY_RESEND);
    if (dryRun) {
      const result = { state: "DRY_RUN", provider: config.provider, reportingWeek: report.reportingWeek, configValid: configCheck.valid, configErrors: configCheck.errors, recipientCount: config.envelopeRecipients.length, attachmentCount: attachments.length, testMode: config.testMode, sent: false };
      const next = { weeks: { ...(ledger.weeks || {}), [report.reportingWeek]: { state: "DRY_RUN", dryRunAt: new Date().toISOString(), testMode: config.testMode, recipientCount: config.envelopeRecipients.length, attachmentCount: attachments.length } } };
      await writeLedger(next, targetLedger, ledgerOptions);
      await updateJobState("weeklyMail", { state: "DRY_RUN", lastCompletedAt: new Date().toISOString(), reportingWeek: report.reportingWeek, sent: false }, { config: configForState, env, pool }).catch(() => {});
      return result;
    }
    if (["SENT", "TEST_SENT"].includes(prior?.state) && !resendApproved) {
      const duplicateAt = new Date().toISOString();
      const next = { weeks: { ...(ledger.weeks || {}), [report.reportingWeek]: { ...prior, duplicatePreventedAt: duplicateAt, lastAttemptState: "DUPLICATE_PREVENTED" } } };
      await writeLedger(next, targetLedger, ledgerOptions);
      await updateJobState("weeklyMail", { state: "DUPLICATE_PREVENTED", lastCompletedAt: duplicateAt, reportingWeek: report.reportingWeek, sent: false }, { config: configForState, env, pool }).catch(() => {});
      return { state: "DUPLICATE_PREVENTED", provider: config.provider, reportingWeek: report.reportingWeek, configValid: configCheck.valid, recipientCount: config.envelopeRecipients.length, sent: false };
    }
    if (!config.enabled) return { state: "FAILED", provider: config.provider, reportingWeek: report.reportingWeek, configValid: configCheck.valid, errorCode: "MAIL_DISABLED", error: "MAIL_ENABLED 未啟用，已 fail closed", sent: false };
    if (!configCheck.valid) return { state: "FAILED", provider: config.provider, reportingWeek: report.reportingWeek, configValid: false, errorCode: "MAIL_CONFIGURATION_INVALID", configErrors: configCheck.errors, sent: false };
    try {
      if (config.provider === "outlook_graph") {
        await withMailRetry(() => graphSender(config, { subject, html, attachments }));
      } else {
        const message = createMimeMessage({ from: config.from, to: config.to, cc: config.cc, replyTo: config.replyTo, subject, html, attachments });
        await withMailRetry(() => smtpSender(config, message));
      }
      const state = config.testMode ? "TEST_SENT" : "SENT";
      const next = { weeks: { ...(ledger.weeks || {}), [report.reportingWeek]: { state, sentAt: new Date().toISOString(), testMode: config.testMode, recipientCount: config.envelopeRecipients.length, attachmentCount: attachments.length } } };
      await writeLedger(next, targetLedger, ledgerOptions);
      await updateJobState("weeklyMail", { state, lastSuccessfulAt: new Date().toISOString(), reportingWeek: report.reportingWeek, sent: true, testMode: config.testMode }, { config: configForState, env, pool }).catch(() => {});
      return { state, provider: config.provider, reportingWeek: report.reportingWeek, configValid: true, recipientCount: config.envelopeRecipients.length, attachmentCount: attachments.length, sent: true, testMode: config.testMode };
    } catch (error) {
      const redacted = safeError(error);
      const errorCode = error.code || "MAIL_SEND_FAILED";
      const next = { weeks: { ...(ledger.weeks || {}), [report.reportingWeek]: { state: "FAILED", failedAt: new Date().toISOString(), errorCode, error: redacted, testMode: config.testMode, recipientCount: config.envelopeRecipients.length } } };
      await writeLedger(next, targetLedger, ledgerOptions).catch(() => {});
      await updateJobState("weeklyMail", { state: "FAILED", lastFailedAt: new Date().toISOString(), reportingWeek: report.reportingWeek, lastErrorCode: errorCode, lastError: redacted, sent: false }, { config: configForState, env, pool }).catch(() => {});
      return { state: "FAILED", provider: config.provider, reportingWeek: report.reportingWeek, configValid: true, errorCode, error: redacted, sent: false, testMode: config.testMode };
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
  graphSend,
  isTransientMailError,
  withMailRetry,
  sendWeeklyEmail,
};
