const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

async function loadUi() {
  const script = await fs.readFile(path.join(ROOT, "public-process-price-ui.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(script, context, { filename: "public-process-price-ui.js" });
  return context.window.publicProcessPriceUi;
}

test("open-ended CNC references are valid monetary cards and render plus ranges", async () => {
  const ui = await loadUi();
  const fiveAxis = { sourceRole: "INDUSTRY_MACHINE_HOUR_REFERENCE", priceMin: 2000, priceMax: null, priceOpenEnded: true, currency: "TWD", currencyEvidence: "EXPLICIT", unit: "TWD/hr" };
  const turnMill = { ...fiveAxis, priceMin: 1800 };
  assert.equal(ui.hasMonetaryData(fiveAxis), true);
  assert.equal(ui.hasMonetaryData(turnMill), true);
  assert.equal(ui.priceText(fiveAxis), "NT$ 2,000+ / hr");
  assert.equal(ui.priceText(turnMill), "NT$ 1,800+ / hr");
});

test("locale-inferred laser currency keeps numeric table but never presents NT$ as source-explicit", async () => {
  const ui = await loadUi();
  const minca = { sourceRole: "DIRECT_VENDOR_LISTED_PRICE", priceMin: 20, priceMax: 20, priceOpenEnded: false, currency: "TWD", currencyEvidence: "LOCALE_INFERRED", unit: "TWD/m", smallHoleFeeMin: 5.2, smallHoleFeeMax: 5.2, smallHoleUnit: "TWD/hole", smallHoleBasis: "直徑 30 mm 以下圓孔切割費" };
  assert.equal(ui.hasMonetaryData(minca), true);
  assert.equal(ui.priceText(minca), "網站列示：20 / m");
  assert.match(ui.currencyEvidenceText(minca), /來源頁未明示/);
  assert.match(ui.smallHoleText(minca), /網站列示：5\.2 \/ hole/);
  assert.doesNotMatch(ui.priceText(minca), /NT\$/);
});

test("NO_PUBLIC_PRICE_DATA is the no-data card state", async () => {
  const ui = await loadUi();
  const noData = { sourceRole: "NO_PUBLIC_PRICE_DATA", priceMin: null, priceMax: null, priceOpenEnded: false, unit: "NO_PUBLIC_PRICE_DATA" };
  assert.equal(ui.hasMonetaryData(noData), false);
  assert.equal(ui.priceText(noData), "公開金額資料不足");
  assert.match(ui.currencyEvidenceText(noData), /不適用/);
});

test("both process pages load the shared public price UI before their page client", async () => {
  const [machining, sheetMetal] = await Promise.all([
    fs.readFile(path.join(ROOT, "machining.html"), "utf8"),
    fs.readFile(path.join(ROOT, "sheet-metal.html"), "utf8"),
  ]);
  for (const html of [machining, sheetMetal]) {
    assert.match(html, /public-process-price-ui\.js/);
    assert.ok(html.indexOf("public-process-price-ui.js") < html.indexOf("machining.js") || html.indexOf("public-process-price-ui.js") < html.indexOf("sheet-metal.js"));
  }
  assert.match(machining, /本頁僅列示可追溯的公開市場／公開價目參考/);
  assert.match(sheetMetal, /本頁的金額僅來自可追溯公開價目/);
});
