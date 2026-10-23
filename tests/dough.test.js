// Mass balance for dough recipes: the stated division (N × a–b g) must match
// the sum of the gram/ml ingredients. Run: node tests/dough.test.js
var fs = require("fs"), path = require("path");
var data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "recipes.json"), "utf8"));
var fails = 0, checks = 0;
function eq(got, want, msg) { checks++; if (got !== want) { fails++; console.log("FAIL " + msg + "\n  got:  " + got + "\n  want: " + want); } }
function num(q) {
  q = String(q).replace(/(\d)½/g, "$1.5").replace(/½/g, "0.5").replace(/¼/g, "0.25").replace(/¾/g, "0.75");
  var p = q.split(/\s*[–-]\s*/).map(Number);
  return p.every(isFinite) && q ? [p[0], p[p.length - 1]] : null;
}
// Allowed difference: ±4% (bench loss, flour on the board, rounding of ball weights).
var TOL = 0.04;
// Spoon weights, rounded USDA-style averages (salt, sugar, leaveners ≈4.5 g/tsp; butter or oil ≈14 g/tbsp).
var SPOON = { tsp: 4.5, tbsp: 14 };
// Known mismatches still waiting for a decision (keep this list short and linked to an issue).
var KNOWN = {};
var DIV = /(\d+)(?:\s*[–-]\s*(\d+))?\s*(?:×|balls|pieces)\s*(?:\(|of\s+)?(?:about\s*)?(\d+)(?:\s*[–-]\s*(\d+))?\s*g/g;
var seen = 0;
data.recipes.forEach(function (r) {
  var lo = 0, hi = 0;
  (r.ingredients || []).forEach(function (s) { s.items.forEach(function (it) {
    var n = num(it.quantity), g = it.unit === "g" || it.unit === "ml" ? 1 : SPOON[it.unit];
    if (!n || !g) return;
    // Optional lines and sections only count towards the upper bound.
    if (!/optional/i.test((it.note || "") + " " + s.section)) lo += n[0] * g;
    hi += n[1] * g;
  }); });
  (r.steps || []).forEach(function (st, i) {
    var m; DIV.lastIndex = 0;
    while ((m = DIV.exec(st))) {
      var c1 = +m[1], c2 = +(m[2] || m[1]), w1 = +m[3], w2 = +(m[4] || m[3]);
      var divLo = c1 * w1, divHi = c2 * w2;
      var ok = divHi >= lo * (1 - TOL) && divLo <= hi * (1 + TOL);
      seen++;
      if (KNOWN[r.id]) { console.log("known: " + r.id + " (" + KNOWN[r.id] + ")"); continue; }
      eq(ok, true, r.id + " step " + (i + 1) + ": '" + m[0] + "' = " + divLo + "–" + divHi + " g vs ingredients " + lo + "–" + hi + " g");
    }
  });
});
eq(seen >= 3, true, "found the dough divisions to check");
// NY pizza dough specifically (#6): quantities unchanged, division matches.
var ny = data.recipes.filter(function (r) { return r.id === "ny-pizza-dough"; })[0];
eq(ny.ingredients[0].items.map(function (i) { return i.quantity; }).join(","), "750,50,460–480,8,5–6,22,25–30", "pizza dough quantities unchanged");
eq(/4 × 325–335 g or 5 × 260–270 g/.test(ny.steps[4]), true, "pizza step 5 division");
(ny.stepQty || []).forEach(function (l) { eq(ny.steps[l.step].indexOf(l.text) >= 0, true, "pizza link '" + l.text + "' found"); });
// Skillet naan: quantities unchanged, division matches (≈1 kg dough → 10 × 100 g).
var naan = data.recipes.filter(function (r) { return r.id === "skillet-naan"; })[0];
eq(naan.ingredients.map(function (s) { return s.items.map(function (i) { return i.quantity + i.unit; }).join(","); }).join("|"), "500g,2tsp,½tsp,1tsp|240ml,2tsp,7g|180g,3tbsp,1tbsp|1tbsp,2tsp,", "naan quantities unchanged");
eq(/10 balls of about 100 g each/.test(naan.steps[5]) && /about 100 g dough each/.test(naan.servings.text), true, "naan step 6 and servings text agree");
console.log(fails ? fails + " of " + checks + " failed" : "all " + checks + " dough tests passed");
process.exit(fails ? 1 : 0);
