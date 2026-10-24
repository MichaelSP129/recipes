// Regression test for #29: saved settings in localStorage that are valid JSON but the wrong type
// must not stop the app from rendering, must not be reported as a connection error, and must not
// cost the user their other saved settings. Runs the real app.js in a Node vm with a tiny fake DOM.
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
var root = path.join(__dirname, "..");
var SRC = fs.readFileSync(path.join(root, "app.js"), "utf8");
var DATA = JSON.parse(fs.readFileSync(path.join(root, "recipes.json"), "utf8"));
var RID = (DATA.recipes || DATA)[0].id;

function noop() {}
function boot(saved, hash) {
  var store = {};
  Object.keys(saved).forEach(function (k) { store["mr:" + k] = saved[k]; });
  var els = {}, errors = [];
  function el(id) {
    if (id && els[id]) return els[id];
    var e = { id: id, innerHTML: "", textContent: "", value: "", hidden: true, style: {}, dataset: {}, scrollTop: 0,
      classList: { add: noop, remove: noop, toggle: noop, contains: function () { return false; } },
      addEventListener: noop, removeEventListener: noop, appendChild: noop, setAttribute: noop, removeAttribute: noop,
      getAttribute: function () { return null; }, hasAttribute: function () { return false; },
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      focus: noop, blur: noop, scrollIntoView: noop, setSelectionRange: noop, closest: function () { return null; },
      getBoundingClientRect: function () { return { top: 0, bottom: 0, left: 0, right: 0, height: 0, width: 0 }; } };
    e.parentNode = { classList: e.classList, style: {} };
    if (id) els[id] = e;
    return e;
  }
  var win = {
    document: { getElementById: el, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      createElement: function () { return el(); }, addEventListener: noop, body: el(), documentElement: el(), visibilityState: "visible", title: "" },
    location: { hash: hash || "", reload: noop }, history: { replaceState: noop, pushState: noop },
    navigator: {}, addEventListener: noop, removeEventListener: noop, scrollTo: noop, scrollY: 0, innerWidth: 390, innerHeight: 844,
    matchMedia: function () { return { matches: false, addEventListener: noop, addListener: noop }; },
    localStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    fetch: function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(JSON.parse(JSON.stringify(DATA))); } }); },
    setTimeout: setTimeout, clearTimeout: clearTimeout, requestAnimationFrame: function (f) { return setTimeout(f, 0); },
    console: { log: noop, warn: noop, error: function (e) { errors.push(e); } }, Promise: Promise, Math: Math, JSON: JSON, Date: Date
  };
  win.window = win; win.self = win;
  vm.createContext(win);
  vm.runInContext(SRC, win, { filename: "app.js" });
  return new Promise(function (res) { setTimeout(function () { res({ store: store, app: el("app"), toast: el("toast"), errors: errors }); }, 30); });
}

var VALID = {
  view: '"az"',
  selTags: JSON.stringify([(DATA.tagGroups || DATA.tag_groups || [{ tags: ["Chicken"] }])[0].tags[0]]),
  checked: JSON.stringify((function () { var o = {}; o[RID + ":0:0"] = true; o[RID + ":0:1"] = true; return o; })()),
  mult: JSON.stringify((function () { var o = {}; o[RID] = 2; return o; })())
};

var cases = [
  // [description, key, bad raw value, expected stored value afterwards (undefined = removed)]
  ["selTags is an object", "selTags", "{}", undefined],
  ["selTags is null", "selTags", "null", undefined],
  ["selTags is a string", "selTags", '"Chicken"', undefined],
  ["checked is null", "checked", "null", undefined],
  ["checked is an array", "checked", "[1,2]", undefined],
  ["checked has a non-true entry", "checked", '{"a:0:0":true,"b:0:0":"yes"}', '{"a:0:0":true}'],
  ["mult is null", "mult", "null", undefined],
  ["mult is a number", "mult", "3", undefined],
  ["mult has bad entries", "mult", '{"a":2,"b":"2","c":-1,"d":0,"e":1e9,"f":null}', '{"a":2}'],
  ["view is unknown", "view", '"grid"', undefined],
  ["view is a number", "view", "7", undefined],
  ["bw is null", "bw", "null", undefined],
  ["bw is an array", "bw", "[]", undefined],
  ["bw weight is a string", "bw", '{"recipe":{"g":"800"}}', "{}"],
  ["bw has mixed valid and bad entries", "bw", '{"a":{"g":800,"m":1},"b":{"g":"800"},"c":5,"d":null,"e":{"g":-5}}', '{"a":{"g":800,"m":1}}'],
  ["not JSON at all", "mult", "{oops", undefined]
];

// Batch weights (#26). Any build that saves them (the macros panel) must load them through loadSaved("bw"),
// and then the bw cases are mandatory and a legitimate saved weight must survive. A build without the
// macros panel has no bw key, so those cases do not apply there.
var SAVES_BW = /LS\.set\("bw"/.test(SRC), LOADS_BW = /loadSaved\("bw"\)/.test(SRC);
if (SAVES_BW && !LOADS_BW) { console.error("FAIL macros panel saves bw but does not load it with loadSaved(\"bw\")"); process.exitCode = 1; }
if (LOADS_BW) VALID.bw = JSON.stringify((function () { var o = {}; o[RID] = { g: 812, m: 2 }; return o; })());
else cases = cases.filter(function (c) { return c[1] !== "bw"; });

var passed = 0;
function check(name, fn) { return fn().then(function () { passed++; }, function (e) { console.error("FAIL " + name + ": " + e.message); process.exitCode = 1; }); }

var chain = Promise.resolve();
cases.forEach(function (c) {
  ["", "#/r/" + RID].forEach(function (hash) {
    chain = chain.then(function () {
      return check(c[0] + (hash ? " (recipe page)" : " (home)"), function () {
        var saved = Object.assign({}, VALID); saved[c[1]] = c[2];
        return boot(saved, hash).then(function (r) {
          assert.ok(!/Check your connection/.test(r.app.innerHTML), "shows a connection error");
          assert.ok(!/something went wrong/.test(r.app.innerHTML), "render failed: " + r.errors.join("; "));
          assert.ok(r.app.innerHTML.length > 200, "nothing rendered");
          assert.strictEqual(r.store["mr:" + c[1]], c[3], "bad key " + c[1] + " not cleaned as expected");
          Object.keys(VALID).forEach(function (k) { if (k !== c[1]) assert.strictEqual(r.store["mr:" + k], VALID[k], "valid key " + k + " was changed"); });
          assert.ok(!r.toast.hidden && /couldn(&#39;|')t be read/.test(r.toast.innerHTML), "no reset notice");
        });
      });
    });
  });
});

// all valid: nothing rewritten, no notice; ticks and multiplier show on the recipe page
chain = chain.then(function () {
  return check("valid saved state survives untouched", function () {
    return boot(VALID, "#/r/" + RID).then(function (r) {
      Object.keys(VALID).forEach(function (k) { assert.strictEqual(r.store["mr:" + k], VALID[k], k + " changed"); });
      assert.ok(r.toast.hidden || !/couldn(&#39;|')t be read/.test(r.toast.innerHTML), "spurious reset notice");
      assert.ok(!/Check your connection|something went wrong/.test(r.app.innerHTML));
    });
  });
});
// nothing saved at all
chain = chain.then(function () {
  return check("empty storage", function () {
    return boot({}, "").then(function (r) {
      assert.ok(r.app.innerHTML.length > 200 && !/Check your connection|something went wrong/.test(r.app.innerHTML));
      assert.deepStrictEqual(Object.keys(r.store), []);
    });
  });
});
chain.then(function () { console.log("savedstate: " + passed + " passed (batch-weight cases " + (LOADS_BW ? "run" : "not applicable, no macros panel") + ")" + (process.exitCode ? ", some FAILED" : "")); });
