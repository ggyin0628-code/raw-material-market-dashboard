const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_SENDMAIL_URL = `${GRAPH_API_BASE}/me/sendMail`;
const GRAPH_SCOPE = "https://graph.microsoft.com/Mail.Send";
const GRAPH_SCOPES = Object.freeze(["offline_access", GRAPH_SCOPE]);
const DEFAULT_GRAPH_TENANT = "consumers";
const DEFAULT_GRAPH_TIMEOUT_MS = 15000;
const MAX_GRAPH_TIMEOUT_MS = 30000;

function graphTokenUrl(tenant = DEFAULT_GRAPH_TENANT) {
  return `https://login.microsoftonline.com/${encodeURIComponent(String(tenant).trim())}/oauth2/v2.0/token`;
}

function graphErrorCode(status) {
  if (status === 401) return "GRAPH_UNAUTHORIZED";
  if (status === 403) return "GRAPH_FORBIDDEN";
  if (status === 429) return "GRAPH_THROTTLED";
  if (status >= 500) return "GRAPH_SERVER_ERROR";
  if (status >= 400) return "GRAPH_BAD_REQUEST";
  return "GRAPH_REQUEST_FAILED";
}

function graphErrorMessage(status, operation) {
  const label = operation === "token" ? "Microsoft OAuth token refresh" : "Microsoft Graph sendMail";
  return `${label} failed (${graphErrorCode(status)})`;
}

function responseJson(response) {
  if (!response || typeof response.json !== "function") return Promise.resolve(null);
  return response.json().catch(() => null);
}

function timeoutMsFromConfig(config = {}) {
  const value = Number(config.graphTimeoutMs || config.timeoutMs || DEFAULT_GRAPH_TIMEOUT_MS);
  return Math.min(Math.max(Number.isFinite(value) ? value : DEFAULT_GRAPH_TIMEOUT_MS, 1000), MAX_GRAPH_TIMEOUT_MS);
}

async function requestWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("Microsoft Graph request timeout");
      timeout.code = "GRAPH_TIMEOUT";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function createGraphHttpError(status, operation, details = {}) {
  const error = new Error(graphErrorMessage(status, operation));
  error.code = graphErrorCode(status);
  error.statusCode = status;
  error.graphOperation = operation;
  if (details.retryAfterMs) error.retryAfterMs = details.retryAfterMs;
  return error;
}

function parseRetryAfterMs(response) {
  const raw = response?.headers?.get?.("retry-after");
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.round(seconds * 1000), 30000);
  return undefined;
}

async function refreshGraphAccessToken(config, options = {}) {
  if (!config?.clientId) {
    const error = new Error("Microsoft OAuth token refresh failed (MICROSOFT_CLIENT_ID_REQUIRED)");
    error.code = "MICROSOFT_CLIENT_ID_REQUIRED";
    throw error;
  }
  if (!config?.refreshToken) {
    const error = new Error("Microsoft OAuth token refresh failed (MICROSOFT_REFRESH_TOKEN_REQUIRED)");
    error.code = "MICROSOFT_REFRESH_TOKEN_REQUIRED";
    throw error;
  }
  if (config.tenant !== DEFAULT_GRAPH_TENANT) {
    const error = new Error("Microsoft OAuth token refresh failed (MICROSOFT_TENANT_INVALID)");
    error.code = "MICROSOFT_TENANT_INVALID";
    throw error;
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    const error = new Error("Microsoft OAuth token refresh failed (FETCH_UNAVAILABLE)");
    error.code = "GRAPH_FETCH_UNAVAILABLE";
    throw error;
  }
  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
    scope: GRAPH_SCOPES.join(" "),
  });
  let response;
  try {
    response = await requestWithTimeout(fetchImpl, graphTokenUrl(config.tenant), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }, timeoutMsFromConfig(config));
  } catch (error) {
    if (error.code === "GRAPH_TIMEOUT") throw error;
    const wrapped = new Error("Microsoft OAuth token refresh failed (NETWORK_ERROR)");
    wrapped.code = "GRAPH_TOKEN_REFRESH_FAILED";
    wrapped.causeCode = error.code;
    throw wrapped;
  }
  const payload = await responseJson(response);
  if (!response.ok) {
    const error = createGraphHttpError(response.status, "token");
    error.code = "GRAPH_TOKEN_REFRESH_FAILED";
    error.oauthError = typeof payload?.error === "string" ? String(payload.error).slice(0, 80) : undefined;
    throw error;
  }
  if (!payload || typeof payload.access_token !== "string" || !payload.access_token) {
    const error = new Error("Microsoft OAuth token refresh failed (ACCESS_TOKEN_MISSING)");
    error.code = "GRAPH_TOKEN_REFRESH_FAILED";
    throw error;
  }
  return { accessToken: payload.access_token, expiresIn: Number(payload.expires_in) || null, scope: String(payload.scope || "") };
}

function graphRecipients(addresses) {
  return addresses.map((address) => ({ emailAddress: { address } }));
}

function createGraphMessage({ config, subject, html, attachments = [] }) {
  if (!config || !Array.isArray(config.to) || !config.to.length) {
    const error = new Error("Graph mail recipient payload 無效");
    error.code = "MAIL_RECIPIENTS_INVALID";
    throw error;
  }
  if (typeof html !== "string" || !html.length) {
    const error = new Error("HTML payload 無效");
    error.code = "ATTACHMENT_INVALID";
    throw error;
  }
  if (attachments.some((attachment) => !Buffer.isBuffer(attachment.content) || !attachment.content.length || !attachment.filename || !attachment.contentType)) {
    const error = new Error("週報附件 payload 無效");
    error.code = "ATTACHMENT_INVALID";
    throw error;
  }
  const message = {
    subject: String(subject || ""),
    body: { contentType: "HTML", content: html },
    from: { emailAddress: { address: config.from } },
    toRecipients: graphRecipients(config.to),
    attachments: attachments.map((attachment) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: attachment.filename,
      contentType: attachment.contentType,
      contentBytes: attachment.content.toString("base64"),
    })),
  };
  if (config.cc?.length) message.ccRecipients = graphRecipients(config.cc);
  if (config.replyTo) message.replyTo = graphRecipients([config.replyTo]);
  return { message };
}

async function graphSend(config, message, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const token = await refreshGraphAccessToken(config, { fetchImpl });
  const payload = message?.message ? message : createGraphMessage({ config, ...message });
  let response;
  try {
    response = await requestWithTimeout(fetchImpl, GRAPH_SENDMAIL_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    }, timeoutMsFromConfig(config));
  } catch (error) {
    if (error.code === "GRAPH_TIMEOUT") throw error;
    const wrapped = new Error("Microsoft Graph sendMail failed (NETWORK_ERROR)");
    wrapped.code = "GRAPH_NETWORK_ERROR";
    wrapped.causeCode = error.code;
    throw wrapped;
  }
  if (response.status !== 202) {
    throw createGraphHttpError(response.status, "sendMail", { retryAfterMs: parseRetryAfterMs(response) });
  }
  return { ok: true, status: 202 };
}

module.exports = {
  DEFAULT_GRAPH_TENANT,
  DEFAULT_GRAPH_TIMEOUT_MS,
  GRAPH_API_BASE,
  GRAPH_SENDMAIL_URL,
  GRAPH_SCOPE,
  GRAPH_SCOPES,
  graphTokenUrl,
  graphErrorCode,
  createGraphHttpError,
  createGraphMessage,
  refreshGraphAccessToken,
  graphSend,
};
