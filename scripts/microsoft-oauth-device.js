const fs = require("node:fs/promises");
const path = require("node:path");
const { GRAPH_SCOPE, GRAPH_SCOPES, DEFAULT_GRAPH_TENANT } = require("../lib/weekly/graphMailService");

const DEVICE_CODE_URL = `https://login.microsoftonline.com/${DEFAULT_GRAPH_TENANT}/oauth2/v2.0/devicecode`;
const TOKEN_URL = `https://login.microsoftonline.com/${DEFAULT_GRAPH_TENANT}/oauth2/v2.0/token`;
const DEFAULT_OUTPUT = "/tmp/raw-material-dashboard-microsoft-refresh-token.json";
const DEFAULT_POLL_LIMIT = 180;

function parseArgs(argv) {
  const options = { output: DEFAULT_OUTPUT, clientId: process.env.MICROSOFT_CLIENT_ID || "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--client-id") options.clientId = argv[++index] || "";
    else if (value === "--output") options.output = argv[++index] || DEFAULT_OUTPUT;
  }
  return options;
}

function safeOAuthError(code, status) {
  const error = new Error(`Microsoft OAuth device flow failed (${code || "OAUTH_REQUEST_FAILED"})`);
  error.code = code || "OAUTH_REQUEST_FAILED";
  error.statusCode = status;
  return error;
}

async function parseResponse(response) {
  let body = null;
  try { body = await response.json(); } catch (_) { body = null; }
  return { response, body };
}

async function postForm(fetchImpl, url, params) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
  } catch (_) {
    throw safeOAuthError("OAUTH_NETWORK_ERROR");
  }
  const { body } = await parseResponse(response);
  if (!response.ok) throw safeOAuthError(body?.error, response.status);
  return body;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDeviceFlow(options = {}) {
  const clientId = String(options.clientId || "").trim();
  if (!clientId) throw safeOAuthError("MICROSOFT_CLIENT_ID_REQUIRED");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw safeOAuthError("FETCH_UNAVAILABLE");
  const output = path.resolve(options.output || DEFAULT_OUTPUT);
  const repositoryRoot = path.resolve(__dirname, "..");
  if (output === repositoryRoot || output.startsWith(`${repositoryRoot}${path.sep}`)) throw safeOAuthError("OAUTH_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY");
  const device = await postForm(fetchImpl, DEVICE_CODE_URL, { client_id: clientId, scope: GRAPH_SCOPES.join(" ") });
  if (!device?.device_code || !device.user_code || !device.verification_uri) throw safeOAuthError("DEVICE_CODE_RESPONSE_INVALID");
  const intervalSeconds = Math.max(Number(device.interval) || 5, 1);
  const sleepImpl = options.sleepImpl || sleep;
  const maxPolls = Math.min(Math.max(Number(options.maxPolls) || DEFAULT_POLL_LIMIT, 1), 360);
  process.stdout.write(`Sign in with the personal Microsoft account ggyin0628@hotmail.com.\n`);
  process.stdout.write(`verification_uri=${device.verification_uri}\n`);
  process.stdout.write(`user_code=${device.user_code}\n`);
  process.stdout.write(`scope=${GRAPH_SCOPES.join(" ")}\n`);
  process.stdout.write(`expires_in=${Number(device.expires_in) || 900}\n`);
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    await sleepImpl(intervalSeconds * 1000);
    let token;
    try {
      token = await postForm(fetchImpl, TOKEN_URL, {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: clientId,
        device_code: device.device_code,
      });
    } catch (error) {
      if (["authorization_pending", "slow_down"].includes(error.code)) {
        if (error.code === "slow_down") await sleepImpl(5000);
        continue;
      }
      throw error;
    }
    if (typeof token?.refresh_token !== "string" || !token.refresh_token) throw safeOAuthError("REFRESH_TOKEN_MISSING");
    await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
    await fs.writeFile(output, `${JSON.stringify({ tenant: DEFAULT_GRAPH_TENANT, clientId, scopes: GRAPH_SCOPES, refreshToken: token.refresh_token }, null, 2)}\n`, { mode: 0o600 });
    return { state: "MICROSOFT_OAUTH_BOOTSTRAP_COMPLETE", tenant: DEFAULT_GRAPH_TENANT, clientId, scopes: GRAPH_SCOPES, output };
  }
  throw safeOAuthError("DEVICE_CODE_POLL_TIMEOUT");
}

if (require.main === module) {
  runDeviceFlow(parseArgs(process.argv.slice(2))).then((result) => {
    process.stdout.write(`${result.state}\n`);
    process.stdout.write(`tenant=${result.tenant}\n`);
    process.stdout.write(`client_id=${result.clientId}\n`);
    process.stdout.write(`scope=${result.scopes.join(" ")}\n`);
    process.stdout.write(`refresh_token_file=${result.output}\n`);
    process.stdout.write("The refresh token was written only to this mode-600 local file; it was not printed or added to the repository.\n");
    process.stdout.write("Use the file as secret-manager input for MICROSOFT_REFRESH_TOKEN, then delete it securely.\n");
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ state: error.code || "FAILED", error: error.message })}\n`);
    process.exitCode = 2;
  });
}

module.exports = { DEVICE_CODE_URL, TOKEN_URL, parseArgs, safeOAuthError, runDeviceFlow };
