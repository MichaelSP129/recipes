// Macros (#14): node tests/macros.test.js
// Loads app.js (tests/load-app.js) and checks the macros helpers and the data in recipes.json.
var fs = require("fs"), path = require("path");
var root = path.join(__dirname, "..");
var data = JSON.parse(fs.readFileSync(path.join(root, "recipes.json"), "utf8"));
// app.js runs in a vm sandbox (tests/load-app.js) with recipes.json loaded through its own setData()
var app = require("./load-app")({ data: data });
var api = { macCalc: app.get("macCalc"), macPer100: app.get("macPer100"), macRound: app.get("macRound"), macPanel: app.get("macPanel") };

var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL: " + msg); } }
function near(x, y, tol) { return Math.abs(x - y) <= (tol || 1e-9) * Math.max(1, Math.abs(y)); }
var K = ["kcal", "p", "c", "f"];
var withNut = data.recipes.filter(function (r) { return r.nutrition; });
ok(withNut.length >= 50, "at least 50 recipes have nutrition (" + withNut.length + ")");

// 1. data integrity: every ingredient is accounted for, every FDC ID has data
withNut.forEach(function (r) {
  ok(r.nutrition.servings > 0, r.id + ": nutrition.servings > 0");
  r.ingredients.forEach(function (g) {
    g.items.forEach(function (it) {
      var accounted = (it.fdc && it.g > 0) || it.nc || it.gNote;
      ok(accounted, r.id + ": " + it.name + " has fdc+g, nc or a reason");
      if (it.fdc) {
        var f = data.foods[String(it.fdc)];
        ok(f && K.every(function (k) { return typeof f[k] === "number"; }), r.id + ": FDC " + it.fdc + " has kcal/p/c/f");
      }
    });
  });
  (r.nutrition.extra || []).forEach(function (e) { ok(e.fdc && e.g > 0 && data.foods[String(e.fdc)] && e.note, r.id + ": extra " + e.name + " is complete"); });
});
Object.keys(data.foods).forEach(function (id) {
  var f = data.foods[id];
  // 4/4/9 sanity check on each energy-dense USDA record (catches typos). USDA uses food-specific factors, and
  // spices, leavening, vinegar and juices are off from 4/4/9 by design, so they're skipped.
  var est = 4 * f.p + 4 * f.c + 9 * f.f;
  // Alcoholic drinks: most of their energy is alcohol (7 kcal/g), which isn't in P/C/F. Cocoa powder is ~1/3 fibre.
  if (f.kcal >= 100 && !/^Spices|Vanilla extract|Leavening|Vinegar|^Alcoholic|^Cocoa/.test(f.name)) ok(Math.abs(est - f.kcal) / f.kcal < 0.2, "FDC " + id + " " + f.name + ": kcal " + f.kcal + " vs 4/4/9 estimate " + Math.round(est));
});

// 2. Everyday Plate agreement (values copied from MichaelSP129/everyday-plate engine.js, per 100 g)
var EP = { 171413: [884, 0, 0, 100], 173410: [717, 0.85, 0.06, 81.1], 171287: [143, 12.6, 0.7, 9.5], 173414: [403, 22.9, 3.4, 33.3], 322892: [60, 3.3, 4.7, 3.2] };
Object.keys(EP).forEach(function (id) {
  var f = data.foods[id]; if (!f) return;
  K.forEach(function (k, i) { ok(Math.abs(f[k] - EP[id][i]) <= 0.1, "FDC " + id + " " + k + " matches Everyday Plate (" + f[k] + " vs " + EP[id][i] + ")"); });
});

// 3. per serving doesn't change with servings; batch totals scale with the batch
withNut.forEach(function (r) {
  var base = api.macCalc(r, 1);
  [0.5, 1.5, 2, 3, 1.25].forEach(function (m) {
    var c = api.macCalc(r, m);
    K.forEach(function (k) {
      ok(near(c.per[k], base.per[k], 1e-9), r.id + " ×" + m + ": per-serving " + k + " unchanged");
      ok(near(c.batch[k], base.batch[k] * m, 1e-9), r.id + " ×" + m + ": batch " + k + " scales");
    });
    ok(JSON.stringify(api.macRound(c.per)) === JSON.stringify(api.macRound(base.per)), r.id + " ×" + m + ": displayed whole numbers unchanged");
  });
});
var bol = data.recipes.filter(function (r) { return r.id === "bolognese-scratch"; })[0];
var s4 = api.macCalc(bol, 4 / 4), s8 = api.macCalc(bol, 8 / 4);
ok(s4.servings === 4 && s8.servings === 8, "bolognese: 4 → 8 servings");
K.forEach(function (k) { ok(near(s8.per[k], s4.per[k]), "bolognese 4 → 8 servings: per-serving " + k + " unchanged"); ok(near(s8.batch[k], 2 * s4.batch[k]), "bolognese doubled: batch " + k + " doubles"); });

// 4. no silent zeros: an ingredient without an FDC ID flags the total
var copy = JSON.parse(JSON.stringify(bol));
delete copy.ingredients[0].items[1].fdc; // olive oil
var cc = api.macCalc(copy, 1);
ok(cc.incomplete && cc.flag === "incomplete: olive oil", "missing FDC ID gives 'incomplete: olive oil' (got '" + cc.flag + "')");
ok(cc.missing.indexOf("olive oil") >= 0, "missing list names the item");
var copy2 = JSON.parse(JSON.stringify(bol)); copy2.ingredients[0].items[0].fdc = 999999999;
ok(api.macCalc(copy2, 1).flag === "incomplete: beef mince", "unknown FDC ID gives 'incomplete: beef mince'");
var html = api.macPanel(copy);
ok(/Incomplete: olive oil/.test(html), "panel shows 'Incomplete: olive oil'");
ok(!api.macCalc(bol, 1).incomplete, "bolognese itself is complete");
// a synthetic recipe with an amount-less item is flagged and names it (no real recipe is incomplete any more)
var syn = { id: "synthetic", nutrition: { servings: 2 }, ingredients: [{ items: [
  { quantity: "100", unit: "g", name: "flour", fdc: 168894, g: 100 }, { quantity: "", unit: "", name: "olive oil", note: "", gNote: "no amount in the recipe" }] }] };
var sc = api.macCalc(syn, 1);
ok(sc.incomplete && sc.flag === "incomplete: olive oil", "synthetic recipe with no oil amount: 'incomplete: olive oil' (got '" + sc.flag + "')");
ok(/Incomplete: olive oil/.test(api.macPanel(syn)), "synthetic recipe panel shows 'Incomplete: olive oil'");
// focaccia uses the measured oil (#27): 10 tsp ≈ 45 g, complete
var foc = data.recipes.filter(function (r) { return r.id === "focaccia"; })[0];
var fo = api.macCalc(foc, 1);
ok(!fo.incomplete, "focaccia is complete (got '" + fo.flag + "')");
var focOil = 0; foc.ingredients.forEach(function (g) { g.items.forEach(function (it) { if (/olive oil/.test(it.name) && it.fdc === 171413) focOil += it.g; }); });
ok(Math.abs(focOil - 45) < 0.01, "focaccia olive oil totals 45 g (got " + focOil + ")");
// every food recipe has nutrition, and none is incomplete
var NONFOOD = /^Non-food$/;
data.recipes.forEach(function (r) {
  if (NONFOOD.test(r.category || "")) return;
  ok(!!r.nutrition, r.id + " has nutrition");
  if (r.nutrition) ok(!api.macCalc(r, 1).incomplete, r.id + " is complete (" + api.macCalc(r, 1).flag + ")");
});
// optional items are shown but not added
var mac = data.recipes.filter(function (r) { return r.id === "mac-and-cheese"; })[0], mc = api.macCalc(mac, 1);
ok(mc.optNames.length === 3 && mc.optional.kcal > 0, "mac & cheese: crunchy top listed as optional, not in total");

// mid-points, not upper amounts (PR #26 review): paired ranges move together, fats and fattier meat records in full
function rec(id) { return data.recipes.filter(function (r) { return r.id === id; })[0]; }
function item(r, name) { var f = null; r.ingredients.forEach(function (g) { g.items.forEach(function (it) { if (it.name === name) f = it; }); }); return f; }
var melt = rec("shredded-beef-melt");
ok(item(melt, "sturdy bread").g === 630 && melt.nutrition.servings === 7, "shredded beef melt: 14 slices (mid of 12–16) for 7 sandwiches");
ok(item(melt, "chuck roast").fdc === 169491, "chuck roast uses the pot-roast lean-and-fat record");
ok(item(rec("beef-tacos"), "lean beef mince").fdc === 171796, "beef tacos mince uses the 85/15 record");
ok(item(rec("harira"), "neutral oil").g === 42, "harira oil still counted at the upper amount (fat)");
ok(item(rec("sticky-lamb-chops"), "lamb chops").g === 850, "lamb chops: 10 chops (mid of 8–12)");
ok(rec("pancakes").nutrition.servings === 14 && rec("mac-and-cheese").nutrition.servings === 7, "servings follow the recipe's own servings / mid-point");

// "not counted" notes must not describe a rinse the method doesn't do (#28 integration review: #22 no-rinse + #26)
data.recipes.forEach(function (r) {
  var rinsesInMethod = r.steps.some(function (s) { return /\brinse/i.test(s.replace(/don't rinse|do not rinse|no rinse|not rinse/gi, "")); });
  r.ingredients.forEach(function (g) { g.items.forEach(function (it) {
    if (it.nc && /rins/i.test(it.nc)) ok(rinsesInMethod, r.id + ": " + it.name + " note says rinsed, but the method has no rinse step");
  }); });
});
var ss = rec("sweet-and-sour-chicken");
var velvet = ss.ingredients[0].items.filter(function (it) { return it.name === "baking soda" || it.name === "water"; });
ok(velvet.length === 2 && velvet.every(function (it) { return it.nc && !/rins/i.test(it.nc); }), "sweet & sour: velveting notes don't claim a rinse (method-neutral)");

// 5. per 100 g
var p = api.macPer100(s4, 1000);
K.forEach(function (k) { ok(near(p[k], s4.batch[k] / 10), "per 100 g " + k); });
ok(api.macPer100(s4, 0) === null, "no batch weight → no per-100 g");

// 6. hand check: bolognese per serving (worked by hand from USDA values in the PR)
var bp = api.macRound(api.macCalc(bol, 1).per);
console.log("bolognese per serving:", JSON.stringify(bp));
withNut.forEach(function (r) { var c = api.macCalc(r, 1); console.log("  " + r.id + " per " + (r.nutrition.per || "serving") + " (1 of " + r.nutrition.servings + "): " + JSON.stringify(api.macRound(c.per)) + (c.flag ? " [" + c.flag + "]" : "") + (c.optNames.length ? " optional +" + Math.round(c.optPer.kcal) + " kcal" : "")); });

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
