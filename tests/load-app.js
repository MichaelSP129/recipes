// Loads the real app.js in a Node vm sandbox (no browser needed) and returns a
// lookup for its internal helpers, so tests don't depend on where code sits in the file.
// Usage: var app = require("./load-app")(); var stepParts = app.get("stepParts");
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");
module.exports = function loadApp(opts) {
  opts = opts || {};
  var root = path.join(__dirname, "..");
  var src = fs.readFileSync(path.join(root, "app.js"), "utf8");
  function el() {
    return { innerHTML: "", textContent: "", hidden: false, style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: function () { return false; } },
      addEventListener: noop, removeEventListener: noop, appendChild: noop, setAttribute: noop, getAttribute: function () { return null; },
      querySelector: function () { return null; }, querySelectorAll: function () { return []; }, focus: noop, scrollIntoView: noop };
  }
  function noop() {}
  var store = {};
  var hook = {};
  var win = {
    __RECIPES_TEST__: hook,
    document: { getElementById: el, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, createElement: el,
      addEventListener: noop, body: el(), documentElement: el(), visibilityState: "visible" },
    location: { hash: "", reload: noop }, history: { replaceState: noop, pushState: noop },
    navigator: {}, addEventListener: noop, removeEventListener: noop, scrollTo: noop, scrollY: 0, innerWidth: 390, innerHeight: 844,
    matchMedia: function () { return { matches: false, addEventListener: noop }; },
    localStorage: { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } },
    // keep the app from booting: recipes are handed to the helpers directly by each test
    fetch: function () { return new Promise(noop); },
    setTimeout: setTimeout, clearTimeout: clearTimeout, requestAnimationFrame: function (f) { return setTimeout(f, 0); },
    console: console, Promise: Promise, Math: Math, JSON: JSON, Date: Date
  };
  win.window = win; win.self = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: "app.js" });
  if (typeof hook.get !== "function") throw new Error("app.js did not install the test hook (window.__RECIPES_TEST__)");
  if (opts.data && hook.get("typeof setData") === "function") hook.get("setData")(opts.data);
  return hook;
};
