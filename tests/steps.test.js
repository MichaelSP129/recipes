// Unit tests for scaling quantities inside method steps (#4). Run: node tests/steps.test.js
"use strict";
var fs = require("fs"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
var helpers = src.slice(src.indexOf("// ---------- helpers ----------"), src.indexOf("  function baseServings(r) {"));
var api = new Function(helpers + "\nreturn { stepParts: stepParts };")();
var data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "recipes.json"), "utf8"));
var R = {}; data.recipes.forEach(function (r) { R[r.id] = r; });
var strip = function (h) { return h.replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); };
var fail = 0, n = 0;
function eq(got, want, what) { n++; if (got !== want) { fail++; console.log("FAIL " + what + "\n  got:  " + got + "\n  want: " + want); } }
var pz = R["ny-pizza-dough"];
eq(strip(api.stepParts(pz, 0, 1).html), pz.steps[0], "pizza step 1 at 1x is untouched");
eq(strip(api.stepParts(pz, 0, 2).html), pz.steps[0].replace("460 g", "920 g"), "pizza step 1 at 2x: 920 g water");
eq(strip(api.stepParts(pz, 0, 0.5).html), pz.steps[0].replace("460 g", "230 g"), "pizza step 1 at 0.5x");
eq(strip(api.stepParts(pz, 1, 2).html), pz.steps[1].replace("20 g extra", "40 g extra"), "step 2: increment 10 g fixed, 20 g extra scales");
eq(strip(api.stepParts(pz, 4, 2).html), pz.steps[4].replace("4 ×", "8 ×").replace("5 ×", "10 ×"), "step 5 at 2x: ball counts scale, ball weights fixed");
eq(strip(api.stepParts(pz, 4, 1.5).html), pz.steps[4].replace("4 ×", "6 ×").replace("5 ×", "≈8 ×"), "step 5 at 1.5x: counts rounded");
eq(api.stepParts(pz, 6, 2).html.indexOf("250–300°C") >= 0, true, "temperatures never scale");
[0, 1, 4].forEach(function (i) { eq(api.stepParts(pz, i, 2).unscaled, false, "pizza step " + (i + 1) + " fully linked, no 1x note"); });
eq(api.stepParts(R["rogan-josh"], 6, 2).unscaled, true, "unlinked amounts (Rogan Josh 300 ml) get the 1x note");
eq(api.stepParts(R["rogan-josh"], 6, 1).unscaled, false, "no note at 1x");
// every recipe/step renders at 2x without throwing, and text outside links is unchanged
data.recipes.forEach(function (r) { (r.steps || []).forEach(function (s, i) {
  var h = strip(api.stepParts(r, i, 2).html); if (!(r.stepQty || []).some(function (l) { return l.step === i; })) eq(h, s, r.id + " step " + (i + 1) + " unchanged");
}); });
console.log(fail ? fail + " of " + n + " failed" : "all " + n + " step tests passed");
process.exit(fail ? 1 : 0);
