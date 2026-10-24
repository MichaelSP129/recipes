// Accessibility regressions from Claude's review of #28:
// 1. The ingredient tick is decorative: no "✓" text in the checkbox markup (VoiceOver read "check mark"),
//    the tick is drawn by CSS with empty alt text, and the checked state still comes from aria-checked.
// 2. The scaler steppers (Fewer/More servings, Smaller/Bigger batch) stay at least 44x44 px: they can't
//    shrink in the flex row, and the label wraps instead.
// Plus: the app content sits in a <main> landmark.
"use strict";
var fs = require("fs"), path = require("path"), assert = require("assert");
var root = path.join(__dirname, "..");
var DATA = JSON.parse(fs.readFileSync(path.join(root, "recipes.json"), "utf8"));
var RECIPES = DATA.recipes || DATA;
var CSS = fs.readFileSync(path.join(root, "app.css"), "utf8");
var HTML = fs.readFileSync(path.join(root, "index.html"), "utf8");
var app = require("./load-app")({ data: DATA });
var pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL " + name + ": " + e.message); } }
function rule(sel) {
  var re = new RegExp("(^|[}/])\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "g"), m, out = "";
  while ((m = re.exec(CSS))) out += m[2] + ";";
  return out;
}
var ingList = app.get("ingList"), scaler = app.get("scaler"), ui = app.get("ui");

RECIPES.forEach(function (r) {
  if (!r.ingredients || !r.ingredients.length) return;
  // tick every ingredient so the "on" state is rendered
  r.ingredients.forEach(function (g, gi) { g.items.forEach(function (it, ii) { ui.checked[r.id + ":" + gi + ":" + ii] = true; }); });
  var h = ingList(r);
  t(r.id + ": checked ingredients have no tick glyph in the markup", function () {
    var boxes = h.match(/<span class="box"[^>]*>[^<]*<\/span>/g) || [];
    assert.ok(boxes.length > 0, "no .box spans rendered");
    boxes.forEach(function (b) {
      assert.ok(/aria-hidden="true"/.test(b), "box not aria-hidden: " + b);
      assert.ok(!/[✓✔☑]/.test(b), "tick glyph is text: " + b);
    });
  });
  t(r.id + ": checked state is announced via role=checkbox + aria-checked", function () {
    var n = (h.match(/role="checkbox" aria-checked="true"/g) || []).length, boxes = (h.match(/class="box"/g) || []).length;
    assert.strictEqual(n, boxes);
  });
  r.ingredients.forEach(function (g, gi) { g.items.forEach(function (it, ii) { delete ui.checked[r.id + ":" + gi + ":" + ii]; }); });

  t(r.id + ": scaler steppers sit in a non-shrinking group", function () {
    [1, 2].forEach(function (m) {
      if (m === 1) delete ui.mult[r.id]; else ui.mult[r.id] = m;
      var s = scaler(r);
      var grp = s.match(/<span class="sctl">([\s\S]*)<\/span><\/div>/);
      assert.ok(grp, "no .sctl group at x" + m);
      assert.strictEqual((grp[1].match(/class="btn round"/g) || []).length, 2, "both steppers inside .sctl at x" + m);
    });
    delete ui.mult[r.id];
  });
});

t("CSS: steppers are 44x44 and can't flex-shrink", function () {
  var c = rule(".round");
  ["width:44px", "height:44px", "min-width:44px", "min-height:44px", "flex:none"].forEach(function (d) { assert.ok(c.indexOf(d) >= 0, ".round missing " + d); });
  assert.ok(/flex:none/.test(rule(".sctl")), ".sctl must not shrink");
  assert.ok(/flex-wrap:wrap/.test(rule(".scaler")), ".scaler must wrap so the label can drop to its own row");
});
t("CSS: tick is a pseudo-element with empty alt text", function () {
  var c = rule(".ing.on .box::after");
  assert.ok(/content:"\\2713"\s*\/\s*""/.test(c), "expected content:\"\\2713\" / \"\" in .ing.on .box::after, got " + c);
});
t("index.html: app renders inside a <main> landmark", function () {
  assert.ok(/<main id="app">/.test(HTML));
});

console.log("a11y: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
