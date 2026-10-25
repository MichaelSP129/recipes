// "Quick" tag rule (#8, see CONTRIBUTING.md). Run: node tests/times.test.js
var fs = require("fs"), path = require("path");
var data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "recipes.json"), "utf8"));
var fails = 0, checks = 0;
function eq(got, want, msg) { checks++; if (got !== want) { fails++; console.log("FAIL " + msg + "\n  got:  " + got + "\n  want: " + want); } }
// Decision table: stated active + cook (upper ends, first version), required wait.
var QUICK = {
  "pressure-cooker-bbq-chicken": "8 + 5 + 6 = 19 min (slaw rest runs alongside)",
  "kid-friendly-green-curry": "2 + 3 + 12 + 8 = 25 min",
  "light-coconut-rice": "15 min cook + 10 min rest (passive); bringing to a simmer is untimed, so the existing tag stays",
  "mashed-potatoes": "20 + 2 min; bringing to the boil is untimed, so the existing tag stays",
  "mexican-corn-ribs": "10 min prep + 10 min grill (shown first) = 20 min; 10–15 min rest (passive)",
  "chipotle-mayo": "5 min, no cooking; 10–15 min rest (passive)",
  "kfc-gravy": "12 + 2 + 1 = 15 min",
  "pancakes": "3–5 min per batch, number of batches not stated, so the existing tag stays",
  "burger-cheese": "5–10 min, no cooking; 30 min chill (passive, at the 30 min limit)"
};
var NOT = {
  "bolognese-maggi-quick": "long version is shown first (30–60 min simmer); even the quick finish is ~40 min with the soffritto and browning",
  "kfc-air-fryer-fillets": "20 min cook, but needs a 1 h minimum marinade",
  "bbq-chicken-lollipops": "25 + 10 min cook", "bbq-wings": "33–40 min cook", "mac-and-cheese": "30–40 min",
  "pepper-sauce": "the steaks are cooked first (untimed), so it can't be judged; not tagged before"
};
data.recipes.forEach(function (r) {
  var inTags = (r.tags || []).indexOf("Quick") >= 0, inFlags = ((r.tagGroups || {}).flags || []).indexOf("Quick") >= 0;
  eq(inTags, inFlags, r.id + ": tags and tagGroups agree on Quick");
  if (QUICK[r.id]) eq(inFlags, true, r.id + " is Quick (" + QUICK[r.id] + ")");
  else eq(inFlags, false, r.id + " is not Quick" + (NOT[r.id] ? " (" + NOT[r.id] + ")" : ""));
  if (r.category === "Non-food") eq(inFlags, false, r.id + " non-food is never Quick");
  ["prepTime", "cookTime"].forEach(function (k) {
    eq(typeof r[k], "string", r.id + " " + k + " is a string");
    // Never blank: a real time, "No cooking", or an explicit "Not stated" (#8, see CONTRIBUTING.md).
    eq(typeof r[k] === "string" && r[k].trim().length > 0, true, r.id + " " + k + " is not blank");
  });
});
Object.keys(QUICK).concat(Object.keys(NOT)).forEach(function (id) { eq(data.recipes.some(function (r) { return r.id === id; }), true, "table id exists: " + id); });
console.log(fails ? fails + " of " + checks + " failed" : "all " + checks + " times/Quick tests passed");
process.exit(fails ? 1 : 0);
