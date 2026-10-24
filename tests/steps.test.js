// Unit tests for scaling quantities inside method steps (#4). Run: node tests/steps.test.js
"use strict";
var fs = require("fs"), path = require("path");
// app.js runs in a vm sandbox (tests/load-app.js); no slicing of the source by marker comments
var app = require("./load-app")();
var api = { stepParts: app.get("stepParts") };
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
// Rogan Josh: every amount in steps 7-11 linked
var rj = R["rogan-josh"];
eq(strip(api.stepParts(rj, 6, 2).html), rj.steps[6].replace("300 ml", "600 ml").replace("½ tsp garam", "1 tsp garam").replace("1½ tsp salt", "3 tsp salt"), "Rogan Josh step 7 at 2x");
eq(strip(api.stepParts(rj, 7, 2).html), rj.steps[7].replace("500 g", "1000 g"), "Rogan Josh step 8 at 2x");
eq(strip(api.stepParts(rj, 8, 2).html), rj.steps[8], "Rogan Josh step 9: '50-100 ml at a time' is an increment, fixed");
eq(api.stepParts(rj, 6, 2).unscaled, false, "Rogan Josh step 7 fully linked, no 1x note");
// other fixed things: per-litre salt, per-cob seasoning, per-ball weights, per-bun spread, per-custard sugar
eq(strip(api.stepParts(R["roasted-pepper-ricotta-pasta"], 3, 2).html), R["roasted-pepper-ricotta-pasta"].steps[3].replace("240 ml", "480 ml"), "10 g salt per litre fixed, 240 ml pasta water scales");
eq(strip(api.stepParts(R["mexican-corn-ribs"], 3, 2).html), R["mexican-corn-ribs"].steps[3], "¾ tsp Tajín per cob fixed");
eq(strip(api.stepParts(R["mini-party-pizza-bases"], 4, 2).html), R["mini-party-pizza-bases"].steps[4], "mini pizza ball weights fixed");
eq(strip(api.stepParts(R["skillet-naan"], 5, 2).html), R["skillet-naan"].steps[5].replace("10 balls", "20 balls").replace("1 kg", "2 kg"), "naan: count and total scale, 100 g each fixed");
// focaccia: the piece/tin count follows the batch, the oil per tin stays fixed
[[0.5, "1 rough circle"], [1, "2 equal rough circles"], [1.5, "3 equal rough circles"], [2, "4 equal rough circles"], [3, "6 equal rough circles"]].forEach(function (c) {
  var want = R["focaccia"].steps[5].replace("2 equal rough circles", c[1]);
  eq(strip(api.stepParts(R["focaccia"], 5, c[0]).html), want, "focaccia step 6 at x" + c[0] + ": " + c[1] + ", 2 tsp oil per tin");
  eq(api.stepParts(R["focaccia"], 5, c[0]).unscaled, false, "focaccia step 6 at x" + c[0] + " has no 1x note");
});
eq(strip(api.stepParts(R["focaccia"], 8, 3).html), R["focaccia"].steps[8], "focaccia: 1 tsp oil per tin fixed");
eq(strip(api.stepParts(R["harira"], 4, 0.5).html), R["harira"].steps[4].replace("1.3 L", "0.65 L"), "decimal litres scale");
eq(strip(api.stepParts(R["creamy-pesto-pasta"], 0, 2).html), R["creamy-pesto-pasta"].steps[0].replace("1 cup", "2 cups"), "cup/cups follows the amount");
eq(strip(api.stepParts(R["chicken-bacon-mushroom-alfredo"], 0, 0.5).html), R["chicken-bacon-mushroom-alfredo"].steps[0].replace("1½ cups", "¾ cup"), "cups -> cup below 1");
// the 1x-note safety net still works for anything not linked (e.g. a new recipe)
var fake = { steps: ["Add 300 ml stock and 1 tsp salt."], stepQty: [{ step: 0, text: "300 ml" }] };
eq(api.stepParts(fake, 0, 2).unscaled, true, "unlinked amount in a step gets the 1x note");
eq(api.stepParts(fake, 0, 1).unscaled, false, "no note at 1x");
// with all 51 recipes linked, no step needs the note at any multiplier
[0.5, 1.5, 2, 3].forEach(function (m) { data.recipes.forEach(function (r) { (r.steps || []).forEach(function (s, i) {
  if (api.stepParts(r, i, m).unscaled) eq(true, false, r.id + " step " + (i + 1) + " still has an unlinked amount at x" + m);
}); }); });
// every link must be found in its step
data.recipes.forEach(function (r) { (r.stepQty || []).forEach(function (l) {
  eq(api.stepParts(r, l.step, 2).html.indexOf(esc2(l.fixed ? l.text : "")) >= 0 && (r.steps[l.step] || "").indexOf(l.text) >= 0, true, r.id + " link '" + l.text + "' found in step " + (l.step + 1));
}); });
function esc2(t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
// every recipe/step renders at 2x without throwing, and text outside links is unchanged
data.recipes.forEach(function (r) { (r.steps || []).forEach(function (s, i) {
  var h = strip(api.stepParts(r, i, 2).html); if (!(r.stepQty || []).some(function (l) { return l.step === i; })) eq(h, s, r.id + " step " + (i + 1) + " unchanged");
}); });
console.log(fail ? fail + " of " + n + " failed" : "all " + n + " step tests passed");
process.exit(fail ? 1 : 0);
