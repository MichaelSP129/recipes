// Unit tests for quantity scaling/rounding in app.js (no dependencies).
// Run: node tests/qty.test.js
"use strict";
var fs = require("fs"), path = require("path"), assert = require("assert");
var src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
var helpers = src.slice(src.indexOf("// ---------- helpers ----------"), src.indexOf("// ---------- data ----------"));
var api = new Function(helpers + "\nreturn { fmt: fmt, scaleQty: scaleQty, parseNum: parseNum };")();

var cases = [
  // [quantity, multiplier, expected]
  ["⅛", 0.5, "1/16"],       // was "⅛": halving silently did nothing
  ["⅛", 0.25, "pinch"],     // was "⅛"
  ["⅓", 0.5, "≈⅛"],         // 1/6 has no measuring spoon; flagged as approximate
  ["¾", 2 / 3, "½"],
  ["⅛", 1, "⅛"],            // 1× is always untouched
  ["⅛", 2, "¼"],
  ["⅓", 2, "⅔"],            // thirds stay thirds
  ["⅔", 1.5, "1"],
  ["1⅓", 1.5, "2"],
  ["½–¾", 0.5, "¼–⅜"],
  ["460–480", 2, "920–960"],
  ["10–12", 1.5, "15–18"],
  ["3", 0.5, "1½"],
  ["1", 1 / 3, "⅓"],
  ["1.2", 1.5, "1.8"],      // decimal quantities keep decimals
  ["¼", 0.25, "1/16"],
  ["⅛–¼", 0.25, "pinch–1/16"],
  ["", 2, ""],
  ["a few", 2, "a few"]     // non-numeric left alone
];
var fail = 0;
cases.forEach(function (c) {
  var got = api.scaleQty(c[0], c[1]);
  if (got !== c[2]) { fail++; console.log("FAIL scaleQty(" + JSON.stringify(c[0]) + ", " + c[1] + ") = " + JSON.stringify(got) + ", expected " + JSON.stringify(c[2])); }
});
// a scaled amount below 1 must never equal the unscaled one unless it really is the same
["⅛", "¼", "⅓", "½", "¾"].forEach(function (q) {
  [0.5, 0.25].forEach(function (m) { if (api.scaleQty(q, m) === q) { fail++; console.log("FAIL " + q + " ×" + m + " unchanged"); } });
});
console.log(fail ? fail + " failed" : "all " + (cases.length + 10) + " quantity tests passed");
process.exit(fail ? 1 : 0);
