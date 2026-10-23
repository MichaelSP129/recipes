// Macros (#14): node tests/macros.test.js
// Loads the macros helpers from app.js and checks the data in recipes.json.
var fs = require("fs"), path = require("path");
var root = path.join(__dirname, "..");
var src = fs.readFileSync(path.join(root, "app.js"), "utf8");
var data = JSON.parse(fs.readFileSync(path.join(root, "recipes.json"), "utf8"));
var a = src.indexOf("  // ---------- macros (#14) ----------"), b = src.indexOf("  // ---------- cook mode + wake lock ----------");
if (a < 0 || b < a) throw new Error("macros section not found in app.js");
var api = new Function("FOODS", "ui", "esc", "fmt", "getMult", "multLabel",
  src.slice(a, b) + "\nreturn { macCalc: macCalc, macPer100: macPer100, macRound: macRound, macPanel: macPanel };")(
  data.foods, { bw: {}, macOpen: false }, function (s) { return String(s); }, String, function () { return 1; }, String);

var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL: " + msg); } }
function near(x, y, tol) { return Math.abs(x - y) <= (tol || 1e-9) * Math.max(1, Math.abs(y)); }
var K = ["kcal", "p", "c", "f"];
var withNut = data.recipes.filter(function (r) { return r.nutrition; });
ok(withNut.length >= 10, "at least 10 recipes have nutrition (" + withNut.length + ")");

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
  if (f.kcal >= 100 && !/^Spices|Vanilla extract|Leavening|Vinegar/.test(f.name)) ok(Math.abs(est - f.kcal) / f.kcal < 0.2, "FDC " + id + " " + f.name + ": kcal " + f.kcal + " vs 4/4/9 estimate " + Math.round(est));
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
var html = api.macPanel(copy); // ui/getMult stubs
ok(/Incomplete: olive oil/.test(html), "panel shows 'Incomplete: olive oil'");
ok(!api.macCalc(bol, 1).incomplete, "bolognese itself is complete");
var foc = data.recipes.filter(function (r) { return r.id === "focaccia"; })[0];
ok(api.macCalc(foc, 1).flag === "incomplete: olive oil", "focaccia is flagged incomplete: olive oil (no amount in the recipe)");
// optional items are shown but not added
var mac = data.recipes.filter(function (r) { return r.id === "mac-and-cheese"; })[0], mc = api.macCalc(mac, 1);
ok(mc.optNames.length === 3 && mc.optional.kcal > 0, "mac & cheese: crunchy top listed as optional, not in total");

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
