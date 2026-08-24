const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CHECKED_AT,
  getPublicPriceReferences,
  validatePublicPriceReference,
  validatePublicPriceReferences,
} = require("../lib/publicProcessPriceContract");

test("public price references satisfy traceable schema without private/company fields", () => {
  const references = getPublicPriceReferences();
  assert.ok(references.length >= 50);
  assert.equal(validatePublicPriceReferences(references).length, 0);
  for (const item of references) {
    for (const key of ["process", "machineType", "unit", "pricingBasis", "sourceName", "checkedAt", "geographicScope", "includes", "excludes", "confidence", "sourceRole", "notes", "priceOpenEnded"]) assert.ok(Object.prototype.hasOwnProperty.call(item, key), `${key} missing`);
    assert.equal(Object.hasOwn(item, "companyRate"), false);
    assert.equal(Object.hasOwn(item, "privateRate"), false);
    assert.equal(item.checkedAt, CHECKED_AT);
  }
});

test("CNC machine-hour and marketplace references remain separate pricing bases", () => {
  const cnc = getPublicPriceReferences({ process: "CNC" });
  const hourly = cnc.filter((item) => item.unit === "TWD/hr");
  const marketplace = cnc.filter((item) => item.unit === "TWD/min");
  assert.ok(hourly.some((item) => item.machineType === "CNC_3_AXIS_MILL" && item.priceMin === 1000 && item.priceMax === 1600));
  assert.ok(hourly.some((item) => item.machineType === "CNC_2_AXIS_LATHE"));
  const fiveAxis = hourly.find((item) => item.machineType === "CNC_5_AXIS_MILL");
  const turnMill = hourly.find((item) => item.machineType === "CNC_TURN_MILL");
  assert.equal(fiveAxis.priceMin, 2000);
  assert.equal(fiveAxis.priceMax, null);
  assert.equal(fiveAxis.priceOpenEnded, true);
  assert.equal(turnMill.priceMin, 1800);
  assert.equal(turnMill.priceMax, null);
  assert.equal(turnMill.priceOpenEnded, true);
  assert.equal(marketplace.length, 1);
  assert.equal(marketplace[0].machineType, "CNC_MILL_OR_LATHE");
  assert.match(marketplace[0].notes, /不轉成或平均為 machine-hour cost/);
});

test("laser references preserve material, thickness, per-meter basis and explicit hole fee", () => {
  const laser = getPublicPriceReferences({ process: "SHEET_METAL" }).filter((item) => item.machineType === "LASER_CUTTING");
  assert.ok(laser.some((item) => item.material === "BLACK_STEEL" && item.thickness === "1.2 mm" && item.unit === "TWD/m"));
  assert.ok(laser.some((item) => item.material === "STAINLESS_OR_GALVANIZED"));
  assert.ok(laser.some((item) => item.material === "ALUMINUM"));
  const minca = laser.find((item) => item.sourceName.startsWith("MINCA") && item.material === "BLACK_STEEL" && item.thickness === "1.2 mm");
  assert.equal(minca.smallHoleFeeMin, 2.5);
  assert.equal(minca.smallHoleUnit, "TWD/hole");
  assert.match(minca.smallHoleBasis, /30 mm/);
  assert.ok(laser.some((item) => item.sourceName.startsWith("仲凱") && item.smallHoleFeeMin === null));
});

test("bending and TIG/MIG/spot welding do not invent monetary rates", () => {
  const references = getPublicPriceReferences({ process: "SHEET_METAL" });
  for (const machineType of ["BENDING", "WELDING_TIG", "WELDING_MIG_CO2", "WELDING_SPOT"]) {
    const item = references.find((candidate) => candidate.machineType === machineType);
    assert.ok(item);
    assert.equal(item.sourceRole, "NO_PUBLIC_PRICE_DATA");
    assert.equal(item.priceMin, null);
    assert.equal(item.priceMax, null);
    assert.equal(item.unit, "NO_PUBLIC_PRICE_DATA");
  }
});

test("contract rejects incompatible units, missing sources and hidden averages", () => {
  const base = getPublicPriceReferences({ process: "CNC" })[0];
  assert.deepEqual(validatePublicPriceReference({ ...base, sourceUrl: null }), ["accepted monetary source requires sourceUrl"]);
  assert.ok(validatePublicPriceReference({ ...base, priceMin: 80, priceMax: 120, unit: "TWD/min", pricingBasis: "hidden average of hourly and marketplace sources" }).length === 0, "unit-compatible marketplace records remain valid only when basis is explicit");
  assert.ok(validatePublicPriceReference({ ...base, priceMin: 1200, priceMax: 800, unit: "TWD/hr" }).includes("priceMin must not exceed priceMax"));
  assert.ok(validatePublicPriceReference({ ...base, priceMin: 2000, priceMax: 3500, priceOpenEnded: true }).includes("open-ended price requires priceMin and null priceMax"));
  assert.ok(validatePublicPriceReference({ ...base, sourceRole: "NO_PUBLIC_PRICE_DATA", priceMin: 1, priceMax: 2 }).includes("NO_PUBLIC_PRICE_DATA cannot carry a monetary range"));
});
