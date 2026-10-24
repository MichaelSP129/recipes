/* Michael's Recipes – plain JS PWA. Data lives in recipes.json. */
(function () {
  "use strict";
  var DATA = null, RECIPES = [], BY_ID = {}, SECTIONS = [], TAG_GROUPS = [], FOODS = {};
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem("mr:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("mr:" + k, JSON.stringify(v)); } catch (e) {} }
  };
  // ---------- saved state (#29) ----------
  // Every saved setting is checked by type and range before anything renders. A key with the wrong shape
  // falls back to its default, and a bad entry inside a map is dropped; valid entries and all other keys are kept.
  // Only a key that needed fixing is rewritten in storage, so the reset notice shows once, not on every launch.
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function okNum(v, lo, hi) { return typeof v === "number" && isFinite(v) && v >= lo && v <= hi; }
  function okMult(v) { return okNum(v, 1 / 64, 100); }
  function mapOf(ok) { return function (v) { if (!isObj(v)) return null; var o = {}; Object.keys(v).forEach(function (k) { if (ok(v[k])) o[k] = v[k]; }); return o; }; }
  var SAVED = {
    view: { label: "list view", d: function () { return "sections"; }, fix: function (v) { return v === "sections" || v === "az" ? v : null; } },
    selTags: { label: "filters", d: function () { return []; }, fix: function (v) { return Array.isArray(v) ? v.filter(function (t, i) { return typeof t === "string" && t !== "" && v.indexOf(t) === i; }) : null; } },
    checked: { label: "ticked ingredients", d: function () { return {}; }, fix: mapOf(function (x) { return x === true; }) },
    mult: { label: "servings and batch sizes", d: function () { return {}; }, fix: mapOf(okMult) },
    // finished batch weights from the macros panel (#14/#26): { g: grams, m: multiplier when weighed }
    bw: { label: "batch weights", d: function () { return {}; }, fix: mapOf(function (x) { return isObj(x) && okNum(x.g, 1, 100000) && (x.m === undefined || okMult(x.m)); }) }
  };
  var stateReset = [];
  function loadSaved(k) {
    var s = SAVED[k], raw = null, v, f;
    try { raw = localStorage.getItem("mr:" + k); } catch (e) { return s.d(); }
    if (raw === null) return s.d();
    try { v = JSON.parse(raw); f = s.fix(v); } catch (e) { f = null; }
    if (f === null) { stateReset.push(k); try { localStorage.removeItem("mr:" + k); } catch (e) {} return s.d(); }
    if (JSON.stringify(f) !== JSON.stringify(v)) { stateReset.push(k); LS.set(k, f); }
    return f;
  }
  function resetNotice() {
    return "Some saved settings couldn't be read and were reset: " + stateReset.map(function (k) { return SAVED[k].label; }).join(", ") + ". Everything else was kept.";
  }
  var ui = {
    query: "", view: loadSaved("view"), selTags: loadSaved("selTags"), showFilters: false,
    checked: loadSaved("checked"), mult: loadSaved("mult"), bw: loadSaved("bw"), macOpen: false, homeScroll: 0, sheet: false, sheetScroll: 0
  };
  var app = document.getElementById("app");

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var FRAC = { "½": .5, "¼": .25, "¾": .75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": .125, "⅜": .375, "⅝": .625, "⅞": .875 };
  function parseNum(s) {
    var t = String(s).trim(); if (!t) return null;
    var m = t.match(/^(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔⅛⅜⅝⅞])?$/);
    if (!m || (!m[1] && !m[2])) return null;
    return (m[1] ? parseFloat(m[1]) : 0) + (m[2] ? FRAC[m[2]] : 0);
  }
  // Amounts below 1 snap to the nearest ⅛ or ⅓, 1–10 to the nearest ¼ or ⅓ (see #5).
  // "≈" marks anything that moved more than 5% when rounded; below 1/16 it's "pinch".
  var FR_SMALL = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""]];
  var FR_BIG = [[0, ""], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"], [1, ""]];
  function fmt(v) {
    if (v >= 100) return String(Math.round(v / 5) * 5);
    if (v >= 10) return String(Math.round(v));
    if (v < 3 / 32) return v >= 3 / 64 ? (Math.abs(v - 1 / 16) / v > 0.05 ? "≈" : "") + "1/16" : "pinch";
    var whole = Math.floor(v), f = v - whole, best = null;
    (whole ? FR_BIG : FR_SMALL).forEach(function (c) { if (!best || Math.abs(c[0] - f) < Math.abs(best[0] - f)) best = c; });
    if (best[0] === 1) { whole++; best = [0, ""]; }
    var r = whole + best[0], s = whole ? whole + best[1] : best[1];
    return (Math.abs(r - v) / v > 0.05 ? "≈" : "") + s;
  }
  function scaleQty(q, m) {
    if (!q || m === 1) return q;
    var parts = String(q).split(/\s*[–-]\s*/), nums = parts.map(parseNum);
    if (nums.some(function (n) { return n === null; })) return q;
    if (String(q).indexOf(".") >= 0) return nums.map(function (n) { var v = n * m; return String(v >= 10 ? Math.round(v) : Math.round(v * 100) / 100); }).join("–");
    var out = nums.map(function (n) { return fmt(n * m); }), approx = out.some(function (x) { return x.charAt(0) === "≈"; });
    out = out.map(function (x) { return x.replace("≈", ""); });
    if (out.length === 2 && out[0] === out[1]) out = [out[0]];
    return (approx ? "≈" : "") + out.join("–");
  }
  // ---------- quantities inside method steps (see #4) ----------
  // recipes.json can link a quantity in a step with "stepQty": [{ step, text, round?, fixed?, one? }] ("one": text to show when a rounded count is exactly 1).
  // Linked quantities scale with the ingredient list; "fixed" ones (per-ball weights, increments) never do.
  // Any other measured amount left in a step gets a visible "for 1×" note while scaled.
  var QTY_RE = /(^|[^\w.])(\d+[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?[½¼¾⅓⅔⅛]?)?\s*(g|kg|ml|L|l|tbsp|tsp|cups?)(?![\w])/;
  function findQty(s, text, from) {
    var i = s.indexOf(text, from);
    while (i >= 0) {
      var before = s.charAt(i - 1), after = s.charAt(i + text.length);
      if (!/[\d.½¼¾⅓⅔⅛]/.test(before) && !/[\d]/.test(after) && !(/[a-z]$/i.test(text) && /[a-z]/i.test(after))) return i;
      i = s.indexOf(text, i + 1);
    }
    return -1;
  }
  function scaleLinked(link, m) {
    var mm = link.text.match(/^([\d.½¼¾⅓⅔⅛⅜⅝⅞]+(?:\s*[–-]\s*[\d.½¼¾⅓⅔⅛⅜⅝⅞]+)?)(.*)$/);
    if (!mm) return link.text;
    var q = mm[1], out;
    if (link.round) {
      var parts = q.split(/\s*[–-]\s*/).map(parseNum);
      if (parts.some(function (n) { return n === null; })) return link.text;
      var vals = parts.map(function (n) { return n * m; });
      out = (vals.some(function (v) { return Math.abs(v - Math.round(v)) > 0.01; }) ? "≈" : "") + vals.map(function (v) { return Math.max(1, Math.round(v)); }).join("–");
      if (link.one && out === "1") return link.one; // singular wording, e.g. "1 rough circle" not "1 equal rough circles"
    } else out = scaleQty(q, m);
    var rest = mm[2], last = parseNum(String(out).replace("≈", "").split(/\s*[–-]\s*/).pop());
    if (last !== null && /^\s*cups?$/.test(rest)) rest = rest.replace(/cups?/, last > 1 ? "cups" : "cup");
    return out + rest;
  }
  function stepParts(r, i, m) {
    var s = String((r.steps || [])[i] || ""), hits = [];
    if (m !== 1) (r.stepQty || []).forEach(function (l) {
      if (l.step !== i || !l.text) return;
      var at = findQty(s, l.text, 0);
      while (at >= 0 && hits.some(function (h) { return at < h.end && at + l.text.length > h.start; })) at = findQty(s, l.text, at + 1);
      if (at >= 0) hits.push({ start: at, end: at + l.text.length, link: l });
    });
    hits.sort(function (a, b) { return a.start - b.start; });
    var html = "", pos = 0, rest = "";
    hits.forEach(function (h) {
      html += esc(s.slice(pos, h.start)); rest += s.slice(pos, h.start) + " ";
      html += h.link.fixed ? esc(s.slice(h.start, h.end)) : '<b class="sq">' + esc(scaleLinked(h.link, m)) + '</b>';
      pos = h.end;
    });
    html += esc(s.slice(pos)); rest += s.slice(pos);
    return { html: html, unscaled: m !== 1 && QTY_RE.test(rest) };
  }
  function stepHtml(r, i, m, cls) {
    var p = stepParts(r, i, m);
    return p.html + (p.unscaled ? '<span class="' + (cls || "sqnote") + '">Amounts in this step are for the original recipe (1×).</span>' : "");
  }
  // Scaling model (see #3): "servings" recipes step by whole servings; everything else
  // (kg of wings, 25 mini pizzas, 3–4 servings ranges, sauces) scales as a batch: ½×, 1×, 1½×, 2×, 3×.
  var BATCH = [0.5, 1, 1.5, 2, 3];
  function scaleInfo(r) {
    if (r.scale && (r.scale.type === "servings" ? r.scale.base > 0 : r.scale.type === "batch")) return r.scale;
    // fallback for recipes without a "scale" field: a single whole number of servings, otherwise a batch
    var s = r.servings || {}, n = parseNum(s.amount == null ? "" : s.amount);
    if (n && n === Math.round(n) && /serv|portion|people/i.test(s.text || "")) return { type: "servings", base: n };
    return { type: "batch" };
  }
  function yieldText(y, m) {
    var amt = scaleQty(y.amount, m), v = parseNum(String(amt).split(/\s*[–-]\s*/).pop());
    var unit = y.one && v !== null && v <= 1 ? y.one : y.unit;
    return (y.label || "Makes") + " " + amt + " " + unit;
  }
  function servLabel(r) {
    var s = r.servings || {}, t = s.text || "";
    if (!s.amount || /^[\d½¼¾⅓⅔]/.test(t)) return t;
    return s.amount + " " + t;
  }
  function multLabel(m) {
    var k = String(Math.round(m * 100) / 100);
    return { "0.5": "½", "0.67": "⅔", "1": "1", "1.5": "1½", "2": "2", "3": "3" }[k] || k;
  }
  function groups(r) { var g = r.tagGroups || {}; return { protein: g.protein || [], cuisine: g.cuisine || [], method: g.method || [], flags: g.flags || [] }; }
  function allTags(r) { var g = groups(r); return [].concat(g.protein, g.cuisine, g.method, g.flags); }
  function relatedOf(r) {
    var out = (r.related || []).filter(function (x) { return BY_ID[x.id]; }).slice();
    // make links two-way
    RECIPES.forEach(function (o) {
      (o.related || []).forEach(function (x) {
        if (x.id === r.id && !out.some(function (y) { return y.id === o.id; })) out.push({ id: o.id, relation: x.relation });
      });
    });
    return out.sort(function (a, b) { return a.relation === b.relation ? 0 : a.relation === "goes with" ? -1 : 1; });
  }
  function toast(html, ms) {
    var t = document.getElementById("toast"); t.innerHTML = html; t.hidden = false;
    clearTimeout(toast._t); if (ms !== 0) toast._t = setTimeout(function () { t.hidden = true; }, ms || 3000);
  }

  // ---------- data ----------
  function setData(d) {
    if (Array.isArray(d)) d = { recipes: d };
    DATA = d; RECIPES = d.recipes || []; BY_ID = {}; FOODS = d.foods || {};
    RECIPES.forEach(function (r) { BY_ID[r.id] = r; });
    SECTIONS = d.sections && d.sections.length ? d.sections : [];
    // any category not listed gets its own section automatically
    RECIPES.forEach(function (r) {
      if (!SECTIONS.some(function (s) { return s.name === r.category; }))
        SECTIONS.push({ id: String(r.category || "other").toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: r.category || "Other", blurb: "" });
    });
    TAG_GROUPS = d.tagGroups || [];
    TAG_GROUPS.forEach(function (g) {
      RECIPES.forEach(function (r) { (groups(r)[g.key] || []).forEach(function (t) { if (g.tags.indexOf(t) < 0) g.tags.push(t); }); });
    });
  }
  function load() {
    return fetch("recipes.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  // ---------- filtering ----------
  // Selected tags are grouped by filter group (Protein, Cuisine, Method, Good for):
  // OR within a group, AND between groups (see #9).
  function groupKeyOf(t) {
    for (var i = 0; i < TAG_GROUPS.length; i++) if (TAG_GROUPS[i].tags.indexOf(t) >= 0) return TAG_GROUPS[i].key;
    return "_" + t; // unknown tag: its own group
  }
  function selByGroup() {
    var out = {};
    ui.selTags.forEach(function (t) { var k = groupKeyOf(t); (out[k] = out[k] || []).push(t); });
    return out;
  }
  function tagsMatch(r, sel, skipKey) {
    var tags = allTags(r);
    return Object.keys(sel).every(function (k) {
      return k === skipKey || sel[k].some(function (t) { return tags.indexOf(t) >= 0; });
    });
  }
  function filtered(skipKey) {
    var q = ui.query.trim().toLowerCase(), words = q ? q.split(/\s+/) : [], sel = selByGroup();
    return RECIPES.filter(function (r) {
      var tags = allTags(r);
      if (!tagsMatch(r, sel, skipKey)) return false;
      if (!words.length) return true;
      var hay = [r.title, r.cuisine, r.category, tags.join(" "), (r.tags || []).join(" "),
        (r.ingredients || []).map(function (g) { return g.items.map(function (i) { return i.name; }).join(" "); }).join(" ")].join(" ").toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).sort(function (a, b) { return a.title.localeCompare(b.title); });
  }

  function selLabel() {
    var sel = selByGroup();
    return TAG_GROUPS.map(function (g) { return g.key; }).concat(Object.keys(sel).filter(function (k) { return k.charAt(0) === "_"; }))
      .filter(function (k) { return sel[k]; }).map(function (k) { return sel[k].join(" or "); }).join(" · ");
  }

  // ---------- views ----------
  function renderHome() {
    var list = filtered();
    var secs = SECTIONS.map(function (s) { return { s: s, items: list.filter(function (r) { return r.category === s.name; }) }; }).filter(function (x) { return x.items.length; });
    var letters = [];
    list.forEach(function (r) {
      var L = /^[a-z]/i.test(r.title) ? r.title[0].toUpperCase() : "#";
      var last = letters[letters.length - 1];
      if (last && last.L === L) last.items.push(r); else letters.push({ L: L, items: [r] });
    });
    var counts = {}; RECIPES.forEach(function (r) { allTags(r).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var nf = ui.selTags.length;
    var h = '<div class="wrap"><div class="head"><div class="brand"><h1>Michael\'s Recipes</h1><span class="count">' + RECIPES.length + ' recipes</span></div>' +
      '<div class="seg"><button data-view="sections" class="' + (ui.view === "sections" ? "on" : "") + '">By section</button><button data-view="az" class="' + (ui.view === "az" ? "on" : "") + '">A–Z index</button></div></div>' +
      '<div class="top"><div class="top-inner">' +
      '<div class="searchrow"><div class="search"><input id="q" type="search" inputmode="search" autocomplete="off" placeholder="Search recipes or ingredients" aria-label="Search recipes or ingredients" value="' + esc(ui.query) + '">' +
      (ui.query ? '<button class="x" data-act="clearq" aria-label="Clear search">✕</button>' : "") + '</div>' +
      '<button class="btn' + (ui.showFilters || nf ? " on" : "") + '" data-act="filters">' + (nf ? "Filters (" + nf + ")" : "Filters") + (ui.showFilters ? " ▴" : "") + '</button></div>' +
      '<div class="pillwrap"><div class="pills" id="pills">' + (ui.view === "sections"
        ? secs.map(function (x) { return '<button type="button" class="pill" data-jump="sec-' + esc(x.s.id) + '" aria-label="Jump to ' + esc(x.s.name) + ', ' + x.items.length + ' recipes">' + esc(x.s.name) + '<b>' + x.items.length + '</b></button>'; }).join("")
        : letters.map(function (g) { return '<button type="button" class="pill" data-jump="az-' + (g.L === "#" ? "num" : g.L.toLowerCase()) + '" aria-label="Jump to ' + g.L + '">' + g.L + '</button>'; }).join("")) + '</div></div>' +
      '</div></div>';
    if (ui.showFilters) {
      h += '<div class="filters"><div class="fhint">Any tag within a group, all groups together. Numbers show matches.</div>' + TAG_GROUPS.map(function (g) {
        var tags = g.tags.filter(function (t) { return counts[t]; });
        // live count: recipes you'd see with this tag, given the search and the other groups' selections
        var pool = filtered(g.key);
        return '<div class="fgroup"><div class="lbl">' + esc(g.label) + '</div><div class="chips">' + tags.map(function (t) {
          var n = pool.filter(function (r) { return allTags(r).indexOf(t) >= 0; }).length, on = ui.selTags.indexOf(t) >= 0;
          return '<button class="chip' + (on ? " on" : "") + (!n && !on ? " none" : "") + '" data-tag="' + esc(t) + '" aria-pressed="' + on + '">' + esc(t) + '<small>' + n + '</small></button>';
        }).join("") + '</div></div>';
      }).join("") + '</div>';
    }
    var on = ui.query || nf;
    h += '<div class="status">' + list.length + ' of ' + RECIPES.length + ' recipes' + (nf ? ' · ' + esc(selLabel()) : "") + (on ? ' · <button type="button" class="linkbtn" data-act="clearall">clear</button>' : "") + '</div>';
    if (!list.length) h += '<div class="empty"><b>No matches.</b> Try fewer words or clear a tag.</div>';
    else if (ui.view === "sections") {
      h += secs.map(function (x) {
        return '<section class="sec" id="sec-' + esc(x.s.id) + '"><h2>' + esc(x.s.name) + ' <span>(' + x.items.length + ')</span></h2>' +
          (x.s.blurb ? '<div class="blurb">' + esc(x.s.blurb) + '</div>' : "") + '<div class="grid">' + x.items.map(card).join("") + '</div></section>';
      }).join("");
    } else {
      h += letters.map(function (g) {
        return '<section class="sec" id="az-' + (g.L === "#" ? "num" : g.L.toLowerCase()) + '"><h2>' + g.L + ' <span>(' + g.items.length + ')</span></h2>' +
          g.items.map(function (r) {
            return '<a class="azrow" href="#/r/' + encodeURIComponent(r.id) + '" data-open="' + esc(r.id) + '"><span class="t">' + esc(r.title) + '</span><span class="m">' + esc([r.category, groups(r).cuisine.join(" / ")].filter(Boolean).join(" · ")) + '</span></a>';
          }).join("") + '</section>';
      }).join("");
    }
    h += '</div>';
    app.innerHTML = h;
    var q = document.getElementById("q");
    q.addEventListener("input", function () {
      ui.query = q.value; var pos = q.selectionStart; renderHome();
      var nq = document.getElementById("q"); nq.focus(); try { nq.setSelectionRange(pos, pos); } catch (e) {}
    });
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") q.blur(); });
    var pl = document.getElementById("pills");
    if (pl) {
      var fade = function () { pl.parentNode.classList.toggle("end", pl.scrollLeft + pl.clientWidth >= pl.scrollWidth - 4); };
      pl.addEventListener("scroll", fade, { passive: true }); fade();
    }
  }
  function card(r) {
    var g = groups(r), rel = relatedOf(r);
    return '<button class="card" data-open="' + esc(r.id) + '"><h3>' + esc(r.title) + '</h3>' +
      '<div class="meta">' + esc([g.cuisine.join(" / "), servLabel(r)].filter(Boolean).join(" · ")) + '</div>' +
      '<div class="tags">' + g.method.concat(g.flags).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join("") + '</div>' +
      (rel.length ? '<div class="rel">↔ ' + esc(rel.map(function (x) { return BY_ID[x.id].title; }).join(" · ")) + '</div>' : "") + '</button>';
  }

  function getMult(r) {
    var m = okMult(ui.mult[r.id]) ? ui.mult[r.id] : 1, sc = scaleInfo(r);
    if (sc.type === "servings") return Math.max(1, Math.round(sc.base * m)) / sc.base;
    return BATCH.reduce(function (best, p) { return Math.abs(p - m) < Math.abs(best - m) ? p : best; }, 1);
  }
  function setMult(r, m) { if (Math.abs(m - 1) < 0.001) delete ui.mult[r.id]; else ui.mult[r.id] = m; LS.set("mult", ui.mult); rerender(r); }

  function ingCounts(r) {
    var total = 0, done = 0;
    (r.ingredients || []).forEach(function (grp, gi) { grp.items.forEach(function (it, ii) { total++; if (ui.checked[r.id + ":" + gi + ":" + ii]) done++; }); });
    return { total: total, done: done };
  }
  function ingList(r) {
    var m = getMult(r), h = "";
    (r.ingredients || []).forEach(function (grp, gi) {
      if (r.ingredients.length > 1 || grp.section !== "Ingredients") h += '<div class="ing-sec">' + esc(grp.section) + '</div>';
      grp.items.forEach(function (it, ii) {
        var k = r.id + ":" + gi + ":" + ii, on = !!ui.checked[k], qty = scaleQty(it.quantity, m),
          qu = qty === "pinch" ? "a pinch" : [qty, it.unit].filter(Boolean).join(" ");
        h += '<button type="button" class="ing' + (on ? " on" : "") + '" data-tick="' + esc(k) + '" role="checkbox" aria-checked="' + on + '"><span class="box" aria-hidden="true">' + (on ? "✓" : "") + '</span><span class="txt">' +
          (qu ? '<span class="q">' + esc(qu) + '</span> ' : "") + esc(it.name) + (it.note ? '<span class="n">, ' + esc(it.note) + '</span>' : "") + '</span></button>';
      });
    });
    return h;
  }
  function tickCap(r) {
    var c = ingCounts(r);
    return '<div class="tickcap"><span>' + c.done + ' of ' + c.total + ' ticked</span>' + (c.done ? '<button class="linkbtn" data-act="clearticks">Clear ticks</button>' : "") + '</div>';
  }
  function scaler(r) {
    var m = getMult(r), sc = scaleInfo(r), h = '<div class="scaler">';
    if (sc.type === "servings") {
      var st = Math.round(sc.base * m);
      h += '<span class="slbl">Servings</span><button class="btn round" data-act="minus" aria-label="Fewer servings"' + (st <= 1 ? " disabled" : "") + '>−</button><div class="val" aria-live="polite">' + st + '</div><button class="btn round" data-act="plus" aria-label="More servings">+</button>';
    } else {
      h += '<span class="slbl">' + (sc.yield ? esc(yieldText(sc.yield, m)) : "Batch") + '</span><button class="btn round" data-act="pminus" aria-label="Smaller batch"' + (m <= BATCH[0] ? " disabled" : "") + '>−</button><div class="val" aria-live="polite">×' + multLabel(m) + '</div><button class="btn round" data-act="pplus" aria-label="Bigger batch"' + (m >= BATCH[BATCH.length - 1] ? " disabled" : "") + '>+</button>';
    }
    if (m !== 1) h += '<button class="linkbtn" data-act="resetmult">Reset</button>';
    h += '</div>';
    if (m !== 1) h += '<div class="scap">Scaled from ' + esc(servLabel(r)) + '. Amounts are rounded; ≈ marks a bigger rounding.</div>';
    return h;
  }

  // ---------- food safety (#7) ----------
  // USDA FSIS safe minimum internal temperatures.
  var FS_MIN = {
    poultry: { c: 74, short: "poultry", label: "Chicken and other poultry (whole, pieces, minced)" },
    ground: { c: 71, short: "minced meat", label: "Minced beef, lamb or pork, incl. sausages" },
    whole: { c: 63, rest: 3, short: "whole cuts", label: "Whole cuts of beef, lamb or pork (steaks, chops, roasts, cubes)" },
    fish: { c: 63, short: "fish", label: "Fish" }
  };
  function fsInfo(r) {
    var fs = r.foodSafety; if (!fs || !fs.types || !fs.types.length) return null;
    var mins = fs.types.filter(function (t) { return FS_MIN[t]; }).map(function (t) { return FS_MIN[t]; });
    if (!mins.length) return null;
    var main = mins[0];
    var targets = (fs.targets || []).map(function (t) {
      var lo = parseFloat(String(t.c).split(/[–-]/)[0]);
      return { c: t.c, label: t.label || "", below: lo < main.c };
    });
    return { mins: mins, main: main, targets: targets, step: typeof fs.step === "number" ? fs.step : null }; // no explicit step: panel only, no cook-mode note (never default to the last step)
  }
  function minText(m) { return m.c + "°C" + (m.rest ? " + " + m.rest + "-min rest" : ""); }
  function fsPanel(r) {
    var f = fsInfo(r); if (!f) return "";
    return '<section class="block fs" aria-labelledby="fs-h"><h2 id="fs-h">Food safety</h2>' +
      '<div class="fs-sub">USDA safe minimum internal temperature</div><ul class="fs-list">' +
      f.mins.map(function (m) { return '<li><b>' + esc(minText(m)) + '</b><span>' + esc(m.label) + '</span></li>'; }).join("") +
      '<li><b>74°C</b><span>Leftovers, reheated</span></li></ul>' +
      f.targets.map(function (t) {
        return t.below
          ? '<div class="fs-chef"><b>Chef\'s doneness:</b> ' + esc(t.c) + '°C' + (t.label ? " " + esc(t.label) : "") + ' is below the ' + esc(minText(f.main)) + ' safe minimum.</div>'
          : '<div class="fs-target"><b>Recipe target:</b> ' + esc(t.c) + '°C' + (t.label ? " " + esc(t.label) : "") + ' (at or above the ' + f.main.c + '°C minimum).</div>';
      }).join("") +
      '<p class="fs-note">The USDA minimum is the safe temperature. Check with a food thermometer in the thickest part, not touching bone.</p></section>';
  }
  function fsCook(r, i) {
    var f = fsInfo(r); if (!f || i !== f.step) return "";
    var chef = f.targets.filter(function (t) { return t.below; });
    return '<div class="fs-cook" role="note">🌡 Safe minimum: <b>' + esc(minText(f.main)) + '</b> (' + esc(f.main.short) + ')' +
      (chef.length ? '. ' + esc(chef.map(function (t) { return t.c + "°C"; }).join(", ")) + ' is chef\'s doneness, below the minimum.' : ".") +
      ' Check with a thermometer.</div>';
  }

  function renderDetail(r, keepScroll) {
    var y = window.scrollY, g = groups(r);
    var props = [["Makes", servLabel(r)], ["Prep", r.prepTime], ["Cook", r.cookTime]].filter(function (p) { return p[1]; });
    var tagList = [].concat(g.cuisine, g.method, g.protein, g.flags).filter(function (t, i, a) { return t && a.indexOf(t) === i; });
    var rel = relatedOf(r);
    var h = '<div class="wrap"><div class="dtop"><div class="dtop-inner"><button class="btn" data-act="back">← Recipes</button>' +
      '<button class="btn primary" data-act="cook" data-step="0">▶ Cook mode</button></div></div>' +
      '<div class="dhead"><h1>' + esc(r.title) + '</h1>' +
      (props.length ? '<dl class="props">' + props.map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>'; }).join("") + '</dl>' : "") +
      (tagList.length ? '<div class="tags dtags">' + tagList.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join("") + '</div>' : "") + '</div>';
    // ingredients (with compact scaler)
    h += '<div class="block"><h2>Ingredients</h2>' + scaler(r) + tickCap(r) + ingList(r) + '</div>';
    // steps
    h += '<div class="block"><h2>Method</h2>' +
      (r.steps || []).map(function (s, i) { return '<button type="button" class="step" data-act="cook" data-step="' + i + '"><span class="num" aria-hidden="true">' + (i + 1) + '</span><span class="stxt">' + stepHtml(r, i, getMult(r)) + '</span></button>'; }).join("") + '</div>' + fsPanel(r);
    if (rel.length) h += '<div class="block"><h2>Goes with / see also</h2>' + rel.map(function (x) {
      var o = BY_ID[x.id]; return '<button class="relbtn" data-open="' + esc(o.id) + '"><small>' + esc(x.relation) + ' · ' + esc(o.category) + '</small>' + esc(o.title) + ' →</button>';
    }).join("") + '</div>';
    if (r.tips && r.tips.length) h += '<div class="block"><h2>Tips &amp; variations</h2>' + r.tips.map(function (t) { return '<div class="tip">' + esc(t) + '</div>'; }).join("") + '</div>';
    if (r.category !== "Non-food") h += macPanel(r);
    h += '</div>';
    app.innerHTML = h;
    document.title = r.title + " · Recipes";
    window.scrollTo(0, keepScroll ? y : 0);
  }

  // ---------- macros (#14) ----------
  // An estimate built from USDA FoodData Central records: recipes.json "foods" holds kcal/protein/carbs/fat per 100 g,
  // keyed by FDC ID. Each ingredient stores its FDC ID ("fdc") and its weight in grams at 1x ("g", in the state it's
  // weighed: raw meat, dry pasta). "opt": optional, shown separately and not in the total. "nc": deliberately not
  // counted (to taste, garnish, no amount), and named. Anything else without data makes the total incomplete and is
  // named; it's never counted as zero. nutrition.extra adds fat the method uses but the list doesn't quantify.
  var MAC_KEYS = ["kcal", "p", "c", "f"];
  function macZero() { return { kcal: 0, p: 0, c: 0, f: 0 }; }
  function macRows(r, m, foods) {
    var rows = [];
    function add(name, fdc, g, extra) {
      var row = { name: name, opt: !!extra.opt, note: extra.assumed ? extra.note : (extra.gNote || ""), assumed: !!extra.assumed };
      if (extra.nc) row.nc = extra.nc;
      else if (fdc && g > 0 && foods[fdc]) {
        row.fdc = fdc; row.g = g * m; row.food = foods[fdc]; row.v = {};
        MAC_KEYS.forEach(function (k) { row.v[k] = (Number(foods[fdc][k]) || 0) * row.g / 100; });
      } else row.missing = fdc && g > 0 ? "no USDA data" : (extra.gNote || "no amount");
      rows.push(row);
    }
    (r.ingredients || []).forEach(function (grp) { grp.items.forEach(function (it) { add(it.name, it.fdc, it.g, it); }); });
    ((r.nutrition || {}).extra || []).forEach(function (e) { add(e.name, e.fdc, e.g, { note: e.note, assumed: true }); });
    return rows;
  }
  function macCalc(r, m, foods) {
    var nut = r.nutrition; if (!nut || !(nut.servings > 0)) return null;
    m = m || 1; foods = foods || FOODS;
    var rows = macRows(r, m, foods), batch = macZero(), opt = macZero(), missing = [], optNames = [];
    rows.forEach(function (row) {
      if (row.missing) return missing.push(row.name);
      if (!row.v) return;
      var into = row.opt ? opt : batch; if (row.opt) optNames.push(row.name);
      MAC_KEYS.forEach(function (k) { into[k] += row.v[k]; });
    });
    var n = nut.servings * m, per = macZero(), optPer = macZero();
    MAC_KEYS.forEach(function (k) { per[k] = batch[k] / n; optPer[k] = opt[k] / n; });
    return { rows: rows, batch: batch, per: per, optional: opt, optPer: optPer, optNames: optNames, missing: missing,
      incomplete: missing.length > 0, flag: missing.length ? "incomplete: " + missing.join(", ") : "", servings: n };
  }
  function macRound(v) { var o = {}; MAC_KEYS.forEach(function (k) { o[k] = Math.round(v[k]); }); return o; }
  function macPer100(c, grams) { if (!c || !(grams > 0)) return null; var o = macZero(); MAC_KEYS.forEach(function (k) { o[k] = c.batch[k] / grams * 100; }); return o; }
  function macGrid(v) {
    v = macRound(v);
    return '<div class="mac-grid"><div><b>' + v.kcal + '</b><span>kcal</span></div><div><b>' + v.p + ' g</b><span>protein</span></div>' +
      '<div><b>' + v.c + ' g</b><span>carbs</span></div><div><b>' + v.f + ' g</b><span>fat</span></div></div>';
  }
  function macNum(v) { return v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10); }
  function macPanel(r) {
    var nut = r.nutrition;
    if (!nut) return '<section class="block mac" aria-labelledby="mac-h"><h2 id="mac-h">Macros</h2><p class="mac-none">Not worked out for this recipe yet.</p></section>';
    var m = getMult(r), c = macCalc(r, m); if (!c) return "";
    var per = nut.per || "serving", n = Math.round(c.servings * 100) / 100;
    var h = '<section class="block mac" aria-labelledby="mac-h"><h2 id="mac-h">Macros <span class="est">Estimate</span></h2>' +
      '<p class="mac-basis">Per ' + esc(per) + ' · 1 of ' + esc(fmt(n)) + (nut.basis ? ' (' + esc(nut.basis) + ')' : '') + '</p>' + macGrid(c.per);
    if (c.incomplete) h += '<p class="mac-warn" role="note"><b>Incomplete: ' + esc(c.missing.join(", ")) + '.</b> No amount or USDA data for ' + (c.missing.length > 1 ? 'these' : 'this') + ', so the real numbers are higher.</p>';
    if (c.optNames.length) h += '<p class="mac-opt">Optional extras aren\'t included: about +' + Math.round(c.optPer.kcal) + ' kcal per ' + esc(per) + ' if you use them all (' + esc(c.optNames.join(", ")) + ').</p>';
    var bw = ui.bw[r.id], p100 = bw && bw.g > 0 ? macPer100(macCalc(r, bw.m || 1), bw.g) : null;
    h += '<details class="mac-more"' + (ui.macOpen ? " open" : "") + '><summary>Per-ingredient breakdown</summary><div class="mac-scroll"><table class="mac-t"><thead><tr><th scope="col">Ingredient</th><th scope="col">g</th><th scope="col">kcal</th><th scope="col">P</th><th scope="col">C</th><th scope="col">F</th></tr></thead><tbody>';
    c.rows.forEach(function (row) {
      if (!row.v) return;
      h += '<tr' + (row.opt ? ' class="opt"' : '') + '><th scope="row">' + esc(row.name) + (row.opt ? ' <i>(optional, not in total)</i>' : '') + (row.assumed ? ' <i>(assumed)</i>' : '') +
        '<small><a href="https://fdc.nal.usda.gov/food-details/' + esc(row.fdc) + '/nutrients" target="_blank" rel="noopener">FDC ' + esc(row.fdc) + '</a> · ' + esc(row.food.name) + (row.note ? ' · ' + esc(row.note) : '') + '</small></th>' +
        '<td>' + macNum(row.g) + '</td><td>' + Math.round(row.v.kcal) + '</td><td>' + macNum(row.v.p) + '</td><td>' + macNum(row.v.c) + '</td><td>' + macNum(row.v.f) + '</td></tr>';
    });
    var b = macRound(c.batch);
    h += '</tbody><tfoot><tr><th scope="row">Whole batch' + (m !== 1 ? ' (×' + esc(multLabel(m)) + ')' : '') + '</th><td></td><td>' + b.kcal + '</td><td>' + b.p + '</td><td>' + b.c + '</td><td>' + b.f + '</td></tr></tfoot></table></div>';
    var nc = c.rows.filter(function (row) { return row.nc; }), miss = c.rows.filter(function (row) { return row.missing; });
    if (miss.length) h += '<p class="mac-warn">Missing (total incomplete): ' + esc(miss.map(function (row) { return row.name + " (" + row.missing + ")"; }).join("; ")) + '</p>';
    if (nc.length) h += '<p class="mac-small">Not counted: ' + esc(nc.map(function (row) { return row.name + " (" + row.nc + ")"; }).join("; ")) + '</p>';
    h += '<div class="mac-bw"><label for="mac-bw">Finished batch weight</label><input id="mac-bw" type="number" inputmode="numeric" min="1" step="1" data-bw placeholder="weigh it" value="' + (bw && bw.g > 0 ? esc(bw.g) : "") + '"> g' +
      (p100 ? '<div class="mac-p100"><b>Per 100 g cooked</b>' + macGrid(p100) + '</div>' : '<p class="mac-small">Weigh the cooked batch (without the pot) to see macros per 100 g, so you can weigh your portion.</p>') + '</div>' +
      '<p class="mac-small">USDA FoodData Central values, worked out from the ingredients as weighed (raw meat, dry pasta). Ranges use the mid-point (paired ranges move together) and servings match the recipe, but cooking fats and fattier meat records are counted in full, so fat errs high. Grams for spoons and "1 onion" use USDA portion weights.</p></details></section>';
    return h;
  }

  // ---------- cook mode + wake lock ----------
  var wakeLock = null, wantWake = false;
  function requestWake() {
    wantWake = true;
    if (!("wakeLock" in navigator)) return Promise.resolve(false);
    return navigator.wakeLock.request("screen").then(function (l) {
      wakeLock = l; l.addEventListener("release", function () { wakeLock = null; updateWakeLbl(); }); updateWakeLbl(); return true;
    }).catch(function () { updateWakeLbl(); return false; });
  }
  function releaseWake() { wantWake = false; if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; } }
  function updateWakeLbl() {
    var el = document.getElementById("wake"); if (!el) return;
    el.textContent = wakeLock ? "☀ Screen stays on" : ("wakeLock" in navigator ? "Tap a button to keep screen on" : "");
  }
  document.addEventListener("visibilitychange", function () { if (wantWake && document.visibilityState === "visible" && !wakeLock) requestWake(); });

  function sheetHtml(r) {
    return '<div class="sheet-bg" data-act="closesheet"></div><div class="sheet" role="dialog" aria-label="Ingredients"><div class="sheet-head"><h2>Ingredients</h2><button class="btn" data-act="closesheet">Done</button></div>' +
      '<div class="sheet-body" id="sheetbody">' + scaler(r) + tickCap(r) + ingList(r) + '</div></div>';
  }
  function cookStep() { var p = location.hash.split("/"); return p[3] === "cook" ? parseInt(p[4] || "0", 10) || 0 : -1; }
  // Re-renders replace the DOM; put keyboard focus back on the same control (see #10).
  function focusKey() {
    var a = document.activeElement, d = a && a !== document.body && a.dataset;
    if (!d) return null;
    var k = d.tick ? ["tick", d.tick] : d.tag ? ["tag", d.tag] : d.view ? ["view", d.view] : d.act ? ["act", d.act] : null;
    return k ? { k: k, inSheet: !!a.closest(".sheet") } : null;
  }
  function restoreFocus(f) {
    if (!f) return;
    var els = document.querySelectorAll("[data-" + f.k[0] + "]"), el = null;
    for (var i = 0; i < els.length; i++) if (els[i].dataset[f.k[0]] === f.k[1] && !!els[i].closest(".sheet") === f.inSheet) { el = els[i]; break; }
    if (el && !el.disabled) try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }
  function rerender(r) {
    var f = focusKey(), out = rerender_(r); restoreFocus(f); return out;
  }
  function rerender_(r) {
    var st = cookStep();
    if (st >= 0) { var sb = document.getElementById("sheetbody"); ui.sheetScroll = sb ? sb.scrollTop : 0; return renderCook(r, st); }
    return renderDetail(r, true);
  }
  function renderCook(r, i) {
    var n = (r.steps || []).length; if (!n) return renderDetail(r);
    i = Math.max(0, Math.min(n - 1, i));
    app.innerHTML = '<div class="cook"><div class="cook-top"><div class="cook-title">' + esc(r.title) + '</div><div class="cook-btns"><button class="btn" data-act="sheet">☰ Ingredients</button><button class="btn" data-act="exitcook">✕ Exit</button></div></div>' +
      '<div class="bar"><div style="width:' + ((i + 1) / n * 100) + '%"></div></div>' +
      '<div class="cook-body"><div class="cook-step-lbl">STEP ' + (i + 1) + ' / ' + n + '</div><div class="cook-text">' + stepHtml(r, i, getMult(r)) + '</div>' + fsCook(r, i) +
      (i < n - 1 ? '<div class="cook-next"><b>Next:</b> ' + stepHtml(r, i + 1, getMult(r)) + '</div>' : "") + '</div>' +
      '<div class="wake" id="wake"></div>' +
      '<div class="cook-nav"><button class="btn" data-act="cook" data-step="' + (i - 1) + '"' + (i === 0 ? " disabled" : "") + '>← Back</button>' +
      (i < n - 1 ? '<button class="btn primary" data-act="cook" data-step="' + (i + 1) + '">Next →</button>' : '<button class="btn primary" data-act="exitcook">Done ✓</button>') + '</div></div>' +
      (ui.sheet ? sheetHtml(r) : "");
    if (ui.sheet) { var sb = document.getElementById("sheetbody"); if (sb) sb.scrollTop = ui.sheetScroll || 0; }
    if (!wakeLock) requestWake(); else updateWakeLbl();
  }

  // ---------- routing ----------
  function route() {
    var hsh = location.hash.replace(/^#\/?/, ""), parts = hsh.split("/");
    if (parts[0] === "r" && BY_ID[decodeURIComponent(parts[1] || "")]) {
      var r = BY_ID[decodeURIComponent(parts[1])];
      if (parts[2] === "cook") {
        var ae = document.activeElement, fromNav = ae && ae.closest && ae.closest(".cook-nav");
        renderCook(r, parseInt(parts[3] || "0", 10) || 0);
        if (fromNav) { var nb = document.querySelector(".cook-nav .primary"); if (nb) nb.focus({ preventScroll: true }); }
        return;
      }
      releaseWake(); ui.sheet = false;
      return renderDetail(r);
    }
    releaseWake();
    document.title = "Michael's Recipes";
    renderHome();
    window.scrollTo(0, ui.homeScroll || 0);
  }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }

  // ---------- events ----------
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-open],[data-act],[data-view],[data-tag],[data-jump],[data-tick],[data-mult]");
    if (!t) return;
    var cur = currentRecipe();
    if (t.dataset.open) { e.preventDefault(); if (!cur) ui.homeScroll = window.scrollY; return go("#/r/" + encodeURIComponent(t.dataset.open)); }
    if (t.dataset.view) { var fv = focusKey(); ui.view = t.dataset.view; LS.set("view", ui.view); renderHome(); return restoreFocus(fv); }
    if (t.dataset.tag) { var tg = t.dataset.tag, i = ui.selTags.indexOf(tg); if (i >= 0) ui.selTags.splice(i, 1); else ui.selTags.push(tg); LS.set("selTags", ui.selTags); var y = scrollY, ft = focusKey(); renderHome(); scrollTo(0, y); return restoreFocus(ft); }
    if (t.dataset.jump) { e.preventDefault(); var el = document.getElementById(t.dataset.jump); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (t.dataset.tick) { var k = t.dataset.tick; if (ui.checked[k]) delete ui.checked[k]; else ui.checked[k] = true; LS.set("checked", ui.checked); return rerender(cur); }
    if (t.dataset.mult) return setMult(cur, parseFloat(t.dataset.mult));
    var a = t.dataset.act;
    if (a === "resetsaved") { Object.keys(SAVED).forEach(function (k) { try { localStorage.removeItem("mr:" + k); } catch (x) {} }); return location.reload(); }
    if (a === "filters") { var ff = focusKey(); ui.showFilters = !ui.showFilters; renderHome(); return restoreFocus(ff); }
    if (a === "clearq") { ui.query = ""; return renderHome(); }
    if (a === "clearall") { ui.query = ""; ui.selTags = []; LS.set("selTags", []); renderHome(); return restoreFocus({ k: ["act", "filters"], inSheet: false }); }
    if (a === "back") return go("#/");
    if (a === "cook") { var s = parseInt(t.dataset.step, 10); if (s < 0) return; requestWake(); return go("#/r/" + encodeURIComponent(cur.id) + "/cook/" + s); }
    if (a === "exitcook") { releaseWake(); ui.sheet = false; return go("#/r/" + encodeURIComponent(cur.id)); }
    if (a === "clearticks") { Object.keys(ui.checked).forEach(function (k) { if (k.indexOf(cur.id + ":") === 0) delete ui.checked[k]; }); LS.set("checked", ui.checked); return rerender(cur); }
    if (a === "sheet" && cur) { ui.sheet = true; ui.sheetScroll = 0; renderCook(cur, cookStep()); return restoreFocus({ k: ["act", "closesheet"], inSheet: true }); }
    if (a === "closesheet" && cur) { ui.sheet = false; renderCook(cur, cookStep()); return restoreFocus({ k: ["act", "sheet"], inSheet: false }); }
    if (a === "resetmult" && cur) return setMult(cur, 1);
    if (cur) {
      var sc = scaleInfo(cur), m = getMult(cur);
      if ((a === "plus" || a === "minus") && sc.type === "servings") { var st = Math.round(sc.base * m) + (a === "plus" ? 1 : -1); return setMult(cur, Math.max(1, st) / sc.base); }
      var idx = BATCH.indexOf(m);
      if (a === "pplus") return setMult(cur, BATCH[Math.min(BATCH.length - 1, idx + 1)]);
      if (a === "pminus") return setMult(cur, BATCH[Math.max(0, idx - 1)]);
    }
    if (a === "reload") return location.reload();
  });
  document.addEventListener("keydown", function (e) {
    var p = location.hash.split("/"); if (p[3] !== "cook") return;
    var r = currentRecipe(), i = parseInt(p[4] || "0", 10);
    if (e.key === "ArrowRight" && i < r.steps.length - 1) go("#/r/" + p[2] + "/cook/" + (i + 1));
    if (e.key === "ArrowLeft" && i > 0) go("#/r/" + p[2] + "/cook/" + (i - 1));
    if (e.key === "Escape") { if (ui.sheet) { ui.sheet = false; return renderCook(r, i); } go("#/r/" + p[2]); }
  });
  function currentRecipe() { var p = location.hash.replace(/^#\/?/, "").split("/"); return p[0] === "r" ? BY_ID[decodeURIComponent(p[1] || "")] || null : null; }
  document.addEventListener("toggle", function (e) { if (e.target.classList && e.target.classList.contains("mac-more")) ui.macOpen = e.target.open; }, true);
  document.addEventListener("change", function (e) {
    if (!e.target.hasAttribute || !e.target.hasAttribute("data-bw")) return;
    var cur = currentRecipe(); if (!cur) return;
    var g = parseFloat(e.target.value);
    if (g > 0) ui.bw[cur.id] = { g: Math.round(g), m: getMult(cur) }; else delete ui.bw[cur.id];
    LS.set("bw", ui.bw); renderDetail(cur, true);
  });
  window.addEventListener("hashchange", route);

  // ---------- test hook ----------
  // tests/load-app.js runs this file in a Node vm sandbox with window.__RECIPES_TEST__ set, and reads
  // helpers by name, so tests don't break when code moves. Never set in the browser, so this is inert there.
  if (window.__RECIPES_TEST__) window.__RECIPES_TEST__.get = function (name) { return eval(name); };

  // ---------- boot ----------
  // A failure to fetch recipes.json is a connection problem; a failure while showing them is not (see #29).
  load().then(function (d) {
    try { setData(d); route(); } catch (e) { return showRenderError(e); }
    if (stateReset.length) toast(esc(resetNotice()), 6000);
  }, function () {
    app.innerHTML = '<div class="loading">Couldn\'t load recipes. Check your connection and <a href="" onclick="location.reload();return false">try again</a>.</div>';
  });
  function showRenderError(e) {
    if (window.console) console.error(e);
    app.innerHTML = '<div class="loading">Recipes loaded, but something went wrong showing them. <a href="" onclick="location.reload();return false">Reload</a>, or ' +
      '<button type="button" class="linkbtn" data-act="resetsaved">reset saved settings</button> (ticks, servings and filters; recipes are not affected).</div>';
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        reg.addEventListener("updatefound", function () {
          var nw = reg.installing; if (!nw) return;
          nw.addEventListener("statechange", function () {
            if (nw.state === "activated" && hadController) toast('App updated. <button data-act="reload">Refresh</button>', 8000);
          });
        });
      }).catch(function () {});
    });
  }
})();
