const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { estimateEngineeringInput } = require("./lib/engineering/engineeringEstimator");
const { PRIVATE_SCOPE } = require("./lib/engineering/privateRateProfileContract");
const { createProtectedPrivateCostResponse } = require("./lib/engineering/privateCostService");
const {
  PROFILE_ENV,
  REPOSITORY_ROOT,
  loadPrivateRateProfile,
  normalizeAbsolutePath,
  isInsideRepository,
} = require("./lib/engineering/privateProfileLoader");

const ENABLE_FLAG = "PRIVATE_RUNTIME_ENABLED";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4174;
const DEFAULT_IDENTITY = "local-private-session";
const DEFAULT_AUDIT_PATH = path.join(require("node:os").tmpdir(), "raw-material-private-audit.jsonl");
const MAX_JSON_BODY_LENGTH = 256 * 1024;
const PRIVATE_UI_PATH = path.join(REPOSITORY_ROOT, "private-estimate.html");
const PRIVATE_JS_PATH = path.join(REPOSITORY_ROOT, "private-estimate.js");

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  };
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    ...securityHeaders(),
    ...extraHeaders,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    ...securityHeaders(),
    ...extraHeaders,
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendJavaScript(res, status, body) {
  res.writeHead(status, {
    ...securityHeaders(),
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function safeErrorResponse(error, fallbackCode = "PRIVATE_RUNTIME_ERROR", fallbackMessage = "private runtime 暫時無法完成請求。") {
  const statusCode = Number(error?.statusCode) || 500;
  const publicCode = error?.code || fallbackCode;
  const errors = Array.isArray(error?.errors)
    ? error.errors.map((item) => ({
        path: typeof item.path === "string" ? item.path : "request",
        code: typeof item.code === "string" ? item.code : publicCode,
        message: typeof item.message === "string" ? item.message : fallbackMessage,
      }))
    : [{ path: "request", code: publicCode, message: statusCode < 500 ? (error?.message || fallbackMessage) : fallbackMessage }];
  return {
    state: statusCode === 403 ? "FORBIDDEN" : "ERROR",
    code: publicCode,
    message: statusCode < 500 ? (error?.message || fallbackMessage) : fallbackMessage,
    errors,
  };
}

function startGuard(environment = process.env) {
  if (String(environment[ENABLE_FLAG] || "") !== "1") {
    const error = new Error("private runtime disabled by default");
    error.code = "PRIVATE_RUNTIME_DISABLED";
    error.statusCode = 403;
    throw error;
  }
}

function resolvePrivateHost(environment = process.env) {
  const host = environment.PRIVATE_RUNTIME_HOST || DEFAULT_HOST;
  if (host !== DEFAULT_HOST) {
    const error = new Error("private runtime must bind only to 127.0.0.1");
    error.code = "PRIVATE_RUNTIME_MUST_BIND_LOOPBACK";
    error.statusCode = 403;
    throw error;
  }
  return host;
}

function resolvePrivatePort(environment = process.env) {
  const raw = environment.PRIVATE_RUNTIME_PORT || DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    const error = new Error("private runtime port invalid");
    error.code = "PRIVATE_RUNTIME_PORT_INVALID";
    error.statusCode = 400;
    throw error;
  }
  return port;
}

function assertPrivateArtifactPath(artifactPath) {
  const resolved = normalizeAbsolutePath(artifactPath);
  const reject = () => {
    const error = new Error("private artifact must be outside repository");
    error.code = "PRIVATE_ARTIFACT_MUST_BE_OUTSIDE_REPOSITORY";
    error.statusCode = 500;
    throw error;
  };
  if (isInsideRepository(resolved, REPOSITORY_ROOT)) reject();
  for (const candidate of [resolved, path.dirname(resolved)]) {
    try {
      const realPath = fs.realpathSync.native(candidate);
      if (isInsideRepository(realPath, REPOSITORY_ROOT)) reject();
    } catch (error) {
      if (error.code === "PRIVATE_ARTIFACT_MUST_BE_OUTSIDE_REPOSITORY") throw error;
    }
  }
  return resolved;
}

function resolveAuditPath(environment = process.env) {
  return assertPrivateArtifactPath(environment.PRIVATE_AUDIT_LOG_PATH || DEFAULT_AUDIT_PATH);
}

function ensureAuditFile(auditPath) {
  fs.mkdirSync(path.dirname(auditPath), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(auditPath)) fs.writeFileSync(auditPath, "", { mode: 0o600 });
  fs.chmodSync(auditPath, 0o600);
}

function createRedactedAuditLogger(auditPath) {
  ensureAuditFile(auditPath);
  return (event) => {
    const safeEvent = {
      timestamp: String(event.timestamp),
      authorizedLocalIdentity: String(event.authorizedLocalIdentity),
      rateProfileId: String(event.rateProfileId),
      rateProfileVersion: String(event.rateProfileVersion),
      processFamily: String(event.processFamily),
      estimateId: String(event.estimateId),
      resultStatus: String(event.resultStatus),
    };
    fs.appendFileSync(auditPath, `${JSON.stringify(safeEvent)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(auditPath, 0o600);
  };
}

function parseCookies(cookieHeader) {
  return new Map(String(cookieHeader || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    return separator === -1 ? [part, ""] : [part.slice(0, separator), part.slice(separator + 1)];
  }));
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function requireLoopback(req) {
  const address = req.socket?.remoteAddress;
  if (address && !isLoopbackAddress(address)) {
    const error = new Error("private runtime 只接受 loopback request。");
    error.statusCode = 403;
    error.code = "PRIVATE_RUNTIME_LOOPBACK_ONLY";
    throw error;
  }
}

function issueSession(sessionStore, identity) {
  const token = crypto.randomBytes(32).toString("hex");
  sessionStore.set(token, { identity, createdAt: new Date().toISOString() });
  return token;
}

function authorizeSession(req, sessionStore) {
  const token = parseCookies(req.headers.cookie).get("private_session");
  const session = token ? sessionStore.get(token) : null;
  if (!session) {
    const error = new Error("需要 local private session authorization。");
    error.statusCode = 401;
    error.code = "PRIVATE_LOCAL_AUTHENTICATION_REQUIRED";
    error.errors = [{ path: "authorization", code: error.code, message: error.message }];
    throw error;
  }
  return session;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let totalBytes = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_JSON_BODY_LENGTH) {
        settled = true;
        const error = new Error("請求內容過大。");
        error.statusCode = 413;
        error.code = "PRIVATE_REQUEST_TOO_LARGE";
        reject(error);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch {
        const error = new Error("請求內容必須是有效 JSON。");
        error.statusCode = 400;
        error.code = "PRIVATE_JSON_INVALID";
        reject(error);
      }
    });
    req.on("error", (error) => {
      if (!settled) {
        settled = true;
        error.code = "PRIVATE_REQUEST_READ_FAILED";
        reject(error);
      }
    });
  });
}

function privateInputError(code, message, pathName = "input") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  error.errors = [{ path: pathName, code, message }];
  return error;
}

function privateSessionCookie(token) {
  return `private_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`;
}

function loadPrivateUiAsset(assetPath) {
  try {
    return fs.readFileSync(assetPath, "utf8");
  } catch {
    const error = new Error("private UI asset unavailable");
    error.statusCode = 500;
    error.code = "PRIVATE_UI_ASSET_UNAVAILABLE";
    throw error;
  }
}

async function handlePrivateRequest(req, res, context) {
  requireLoopback(req);
  const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = requestUrl.pathname;
  if (req.method !== "GET" && req.method !== "POST") {
    res.writeHead(405, { ...securityHeaders(), allow: "GET, POST" });
    res.end("Method Not Allowed");
    return;
  }

  if (req.method === "GET" && (pathname === "/private-estimate" || pathname === "/private-estimate/")) {
    const token = issueSession(context.sessions, context.identity);
    sendHtml(res, 200, loadPrivateUiAsset(PRIVATE_UI_PATH), { "set-cookie": privateSessionCookie(token) });
    return;
  }
  if (req.method === "GET" && pathname === "/private-estimate.js") {
    sendJavaScript(res, 200, loadPrivateUiAsset(PRIVATE_JS_PATH));
    return;
  }
  if (pathname === "/private-estimate.html") {
    if (req.method === "GET") {
      const token = issueSession(context.sessions, context.identity);
      sendHtml(res, 308, "", { location: "/private-estimate", "set-cookie": privateSessionCookie(token) });
    } else {
      res.writeHead(405, { ...securityHeaders(), allow: "GET" });
      res.end("Method Not Allowed");
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/private/estimate") {
    try {
      const session = authorizeSession(req, context.sessions);
      const contentType = String(req.headers["content-type"] || "").toLowerCase();
      if (!contentType.startsWith("application/json")) throw privateInputError("PRIVATE_CONTENT_TYPE_REQUIRED", "Content-Type 必須為 application/json。", "headers.content-type");
      const input = await readJsonBody(req);
      if (!input || typeof input !== "object" || Array.isArray(input)) throw privateInputError("PRIVATE_INPUT_OBJECT_REQUIRED", "工程輸入必須為 JSON object。", "input");
      if (Object.prototype.hasOwnProperty.call(input, "rateProfile")) throw privateInputError("PRIVATE_PROFILE_NOT_ACCEPTED_IN_REQUEST", "private profile 由 local runtime 載入；request 不接受 profile 欄位。", "input.rateProfile");
      const baseEstimate = estimateEngineeringInput(input);
      const estimateId = crypto.randomUUID();
      const estimate = createProtectedPrivateCostResponse({
        baseEstimate,
        input,
        profile: context.profile,
        authorization: { authenticated: true, subject: session.identity, scopes: [PRIVATE_SCOPE] },
        auditLogger: context.auditLogger,
        estimateId,
      });
      sendJson(res, 200, { state: "OK", generatedAt: new Date().toISOString(), estimateId, estimate });
    } catch (error) {
      sendJson(res, Number(error.statusCode) || 500, safeErrorResponse(error));
    }
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, { status: "OK", runtime: "LOCAL_PRIVATE", binding: DEFAULT_HOST, profile: { rateProfileId: context.profile.rateProfileId, version: context.profile.version } });
    return;
  }

  res.writeHead(404, { ...securityHeaders(), "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function startPrivateRuntime({ environment = process.env, now = new Date() } = {}) {
  startGuard(environment);
  const host = resolvePrivateHost(environment);
  const port = resolvePrivatePort(environment);
  const auditPath = resolveAuditPath(environment);
  const loaded = loadPrivateRateProfile({ profilePath: environment[PROFILE_ENV], repositoryRoot: REPOSITORY_ROOT, now });
  const identity = typeof environment.PRIVATE_LOCAL_IDENTITY === "string" && environment.PRIVATE_LOCAL_IDENTITY.trim()
    ? environment.PRIVATE_LOCAL_IDENTITY.trim()
    : DEFAULT_IDENTITY;
  const context = {
    profile: loaded.profile,
    profilePath: loaded.profilePath,
    auditPath,
    identity,
    auditLogger: createRedactedAuditLogger(auditPath),
    sessions: new Map(),
  };
  const server = http.createServer((req, res) => {
    handlePrivateRequest(req, res, context).catch((error) => sendJson(res, Number(error.statusCode) || 500, safeErrorResponse(error)));
  });
  server.listen(port, host);
  return { server, host, port, profilePath: loaded.profilePath, auditPath, profile: loaded.profile, context };
}

if (require.main === module) {
  try {
    const runtime = startPrivateRuntime();
    runtime.server.on("listening", () => {
      console.log(`Local private estimate runtime listening on http://${runtime.host}:${runtime.port}`);
      console.log("Profile loaded outside repository; raw rates are not printed.");
    });
  } catch (error) {
    console.error(`PRIVATE_RUNTIME_START_FAILED ${error.code || "PRIVATE_RUNTIME_ERROR"}`);
    process.exitCode = 1;
  }
}

module.exports = {
  ENABLE_FLAG,
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_IDENTITY,
  MAX_JSON_BODY_LENGTH,
  startGuard,
  resolvePrivateHost,
  resolvePrivatePort,
  assertPrivateArtifactPath,
  resolveAuditPath,
  createRedactedAuditLogger,
  parseCookies,
  isLoopbackAddress,
  requireLoopback,
  authorizeSession,
  readJsonBody,
  handlePrivateRequest,
  startPrivateRuntime,
};
