// Food-safety panel (#7). Run: node tests/foodsafety.test.js
var fs = require("fs"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
var escDef = src.match(/  function esc\(s\) \{[^\n]*\n/)[0];
var body = src.slice(src.indexOf("// ---------- food safety (#7) ----------"), src.indexOf("  function renderDetail(r, keepScroll) {"));
var api = new Function(escDef + body + "\nreturn {FS_MIN:FS_MIN, fsInfo:fsInfo, fsPanel:fsPanel, fsCook:fsCook};")();
var data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "recipes.json"), "utf8"));
var R = {}; data.recipes.forEach(function (r) { R[r.id] = r; });
var fails = 0, checks = 0;
function eq(got, want, msg) { checks++; if (got !== want) { fails++; console.log("FAIL " + msg + "\n  got:  " + got + "\n  want: " + want); } }
function txt(h) { return h.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }

// USDA minimums
eq(api.FS_MIN.poultry.c, 74, "poultry 74°C"); eq(api.FS_MIN.ground.c, 71, "ground 71°C");
eq(api.FS_MIN.whole.c, 63, "whole cuts 63°C"); eq(api.FS_MIN.whole.rest, 3, "whole cuts 3-min rest"); eq(api.FS_MIN.fish.c, 63, "fish 63°C");

// every recipe with raw meat/poultry/fish has a panel; others don't
var MEAT = /\b(chicken (breast|thigh|drumstick|wing|fillet)s?|chicken breasts?|chicken thighs|drumsticks|wings|mince|chuck|lamb (shoulder|chops|leg)|lamb chops|pork belly|ribs|boerewors|beef cubes|steak|fish|salmon|prawns?)\b/i;
data.recipes.forEach(function (r) {
  var raw = (r.ingredients || []).some(function (g) { return g.items.some(function (i) { return MEAT.test(i.name) && !/stock|bouillon|fat/i.test(i.name); }); });
  var hasPanel = !!api.fsPanel(r);
  if (["bbq-wings", "bbq-drumsticks", "ribs-wrap-glaze"].indexOf(r.id) >= 0) raw = true; // meat named only in the title
  eq(hasPanel, raw, r.id + ": panel only on raw meat/poultry/fish recipes");
  var f = r.foodSafety;
  if (f) {
    f.types.forEach(function (t) { eq(!!api.FS_MIN[t], true, r.id + " type " + t + " known"); });
    if (typeof f.step === "number") eq(f.step >= 0 && f.step < r.steps.length, true, r.id + " step in range");
    (f.targets || []).forEach(function (t) { eq(r.steps.concat(r.tips || []).join(" ").indexOf(t.c + "°C") >= 0, true, r.id + " target " + t.c + "°C is the recipe's own number"); });
    var p = txt(api.fsPanel(r));
    eq(/Leftovers, reheated/.test(p) && /74°C Leftovers/.test(p), true, r.id + " leftovers 74°C");
    eq(/USDA minimum is the safe temperature/.test(p) && /thermometer/.test(p), true, r.id + " safe-minimum + thermometer note");
    // never present a below-minimum target as the safe one
    eq(/Chef's doneness: \d+°C[^.]*is below/.test(p) || !(f.targets || []).some(function (t) { return parseFloat(t.c) < api.FS_MIN[f.types[0]].c; }), true, r.id + " below-minimum targets labelled chef's doneness");
  }
});
// lamb chops: 57°C is chef's doneness, 63°C medium is at the minimum
var lc = txt(api.fsPanel(R["sticky-lamb-chops"]));
eq(/63°C \+ 3-min rest Whole cuts/.test(lc), true, "lamb chops minimum 63°C + 3 min");
eq(/Chef's doneness: 57°C medium-rare is below the 63°C \+ 3-min rest safe minimum/.test(lc), true, "lamb chops 57°C labelled chef's doneness");
eq(/Recipe target: 63°C medium \(at or above/.test(lc), true, "lamb chops 63°C medium is at the minimum");
eq(txt(api.fsCook(R["sticky-lamb-chops"], 6)).indexOf("57°C is chef's doneness") >= 0, true, "cook mode note at the doneness step");
eq(api.fsCook(R["sticky-lamb-chops"], 5), "", "no cook note on other steps");
// exact cook-mode warning step (zero-based): the final doneness checkpoint, before assembly/serving
var EXACT = { "chicken-shawarma": 6, "beef-tacos": 4, "butter-chicken": 6, "sweet-and-sour-chicken": 4,
  "pepper-steak-pie": 5, "beef-curry": 6, "harira": 5, "rogan-josh": 8, "kid-friendly-green-curry": 3, "beef-lasagna": 3,
  "chicken-bacon-mushroom-alfredo": 3, "chicken-bacon-pea-pasta": 2, "bolognese-maggi-quick": 5, "bolognese-scratch": 6 };
Object.keys(EXACT).forEach(function (id) {
  var r = R[id], shown = [];
  r.steps.forEach(function (_, i) { if (api.fsCook(r, i)) shown.push(i); });
  eq(shown.join(","), String(EXACT[id]), id + ": cook-mode note shown only at step " + (EXACT[id] + 1));
});
// every recipe with a cook-mode note names its step explicitly (no silent last-step default)
data.recipes.forEach(function (r) {
  if (!r.foodSafety || r.id === "boerie-caramelised-onions") return;
  eq(typeof r.foodSafety.step, "number", r.id + ": explicit foodSafety.step");
});
// missing step: panel still shown, no cook-mode note on any step (never falls on the last step)
var nostep = { steps: ["cook the chicken", "serve"], foodSafety: { types: ["poultry"] } };
eq(!!api.fsPanel(nostep), true, "no step: panel still shown");
eq(api.fsCook(nostep, 0) + api.fsCook(nostep, 1), "", "no step: no cook-mode note, not even on the last step");
eq(R["boerie-caramelised-onions"].steps.map(function (_, i) { return api.fsCook(R["boerie-caramelised-onions"], i); }).join(""), "", "boerie onions (no meat cooked in the method): no cook-mode note");
eq(/Recipe target: 85–90°C/.test(txt(api.fsPanel(R["bbq-wings"]))), true, "wings target shown as above minimum");
eq(/71°C Minced/.test(txt(api.fsPanel(R["beef-tacos"]))), true, "tacos 71°C");
eq(api.fsPanel({ steps: ["x"] }), "", "no field, no panel");
eq(api.fsPanel({ steps: ["x"], foodSafety: { types: ["fish"] } }).indexOf("63°C") >= 0, true, "fish supported");
console.log(fails ? fails + " of " + checks + " failed" : "all " + checks + " food-safety tests passed");
process.exit(fails ? 1 : 0);
