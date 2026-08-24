const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const htmlPath = path.resolve(__dirname, "..", "standalone", "InternalEngineeringCostCalculator.html");
const html = fs.readFileSync(htmlPath, "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
assert.ok(script, "inline calculator script is required");

for (const pattern of [
  /<script\s+[^>]*src=/i,
  /<link\s+[^>]*href=/i,
  /https?:\/\//i,
  /fetch\s*\(/i,
  /XMLHttpRequest/i,
  /WebSocket/i,
  /sendBeacon/i,
  /localStorage/i,
  /indexedDB/i,
  /document\.cookie/i,
  /<form[^>]*\saction\s*=/i,
]) assert.doesNotMatch(html, pattern, `offline static check failed: ${pattern}`);

assert.match(html, /<style>[\s\S]*<\/style>/i);
assert.match(html, /<html lang="zh-Hant">/);
assert.match(html, /內部工程成本估算/);
assert.match(html, /所有輸入僅在本機瀏覽器計算，不會上傳/);
assert.match(html, /@media\s*\(max-width:\s*680px\)/);
assert.match(html, /window\.print\(\)/);

const context = { console, Intl, Number, Object, String, Array, Math, JSON, Error, TypeError, Set, Map };
vm.createContext(context);
vm.runInContext(script, context, { filename: htmlPath });
assert.equal(typeof context.InternalEngineeringCostCalculator.calculate, "function");
console.log("STANDALONE_OFFLINE_CHECK: PASS");
