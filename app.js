/* Michael's Recipes – plain JS PWA. Data lives in recipes.json. */
(function () {
  "use strict";
  var DATA = null, RECIPES = [], BY_ID = {}, SECTIONS = [], TAG_GROUPS = [];
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem("mr:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("mr:" + k, JSON.stringify(v)); } catch (e) {} }
  };
  var ui = {
    query: "", view: LS.get("view", "sections"), selTags: LS.get("selTags", []), showFilters: false,
    checked: LS.get("checked", {}), mult: LS.get("mult", {}), homeScroll: 0, sheet: false, sheetScroll: 0
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
  function fmt(v) {
    if (v >= 100) return String(Math.round(v / 5) * 5);
    if (v >= 10) return String(Math.round(v));
    var step = v < 1 ? 8 : 4, r = Math.round(v * step) / step;
    if (r === 0) return "⅛";
    var whole = Math.floor(r), frac = r - whole;
    var g = { "0.125": "⅛", "0.25": "¼", "0.375": "⅜", "0.5": "½", "0.625": "⅝", "0.75": "¾", "0.875": "⅞" }[String(frac)] || "";
    return whole === 0 ? (g || "0") : whole + g;
  }
  function scaleQty(q, m) {
    if (!q || m === 1) return q;
    var parts = String(q).split(/\s*[–-]\s*/), nums = parts.map(parseNum);
    if (nums.some(function (n) { return n === null; })) return q;
    if (String(q).indexOf(".") >= 0) return nums.map(function (n) { var v = n * m; return String(v >= 10 ? Math.round(v) : Math.round(v * 100) / 100); }).join("–");
    return nums.map(function (n) { return fmt(n * m); }).join("–");
  }
  // ---------- quantities inside method steps (see #4) ----------
  // recipes.json can link a quantity in a step with "stepQty": [{ step, text, round?, fixed? }].
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
  function baseServings(r) {
    if (!r.servings || !r.servings.amount) return null;
    var p = String(r.servings.amount).split(/\s*[–-]\s*/).map(parseNum);
    if (p.some(function (n) { return n === null; })) return null;
    return p.reduce(function (a, b) { return a + b; }, 0) / p.length;
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
    DATA = d; RECIPES = d.recipes || []; BY_ID = {};
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
  function filtered() {
    var q = ui.query.trim().toLowerCase(), words = q ? q.split(/\s+/) : [];
    return RECIPES.filter(function (r) {
      var tags = allTags(r);
      if (ui.selTags.some(function (t) { return tags.indexOf(t) < 0; })) return false;
      if (!words.length) return true;
      var hay = [r.title, r.cuisine, r.category, tags.join(" "), (r.tags || []).join(" "),
        (r.ingredients || []).map(function (g) { return g.items.map(function (i) { return i.name; }).join(" "); }).join(" ")].join(" ").toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).sort(function (a, b) { return a.title.localeCompare(b.title); });
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
        ? secs.map(function (x) { return '<a class="pill" data-jump="sec-' + esc(x.s.id) + '">' + esc(x.s.name) + '<b>' + x.items.length + '</b></a>'; }).join("")
        : letters.map(function (g) { return '<a class="pill" data-jump="az-' + (g.L === "#" ? "num" : g.L.toLowerCase()) + '">' + g.L + '</a>'; }).join("")) + '</div></div>' +
      '</div></div>';
    if (ui.showFilters) {
      h += '<div class="filters">' + TAG_GROUPS.map(function (g) {
        var tags = g.tags.filter(function (t) { return counts[t]; });
        return '<div class="fgroup"><div class="lbl">' + esc(g.label) + '</div><div class="chips">' + tags.map(function (t) {
          return '<button class="chip' + (ui.selTags.indexOf(t) >= 0 ? " on" : "") + '" data-tag="' + esc(t) + '">' + esc(t) + '<small>' + counts[t] + '</small></button>';
        }).join("") + '</div></div>';
      }).join("") + '</div>';
    }
    var on = ui.query || nf;
    h += '<div class="status">' + list.length + ' of ' + RECIPES.length + ' recipes' + (nf ? ' · ' + esc(ui.selTags.join(" + ")) : "") + (on ? ' · <a data-act="clearall">clear</a>' : "") + '</div>';
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
            return '<div class="azrow" data-open="' + esc(r.id) + '"><div class="t">' + esc(r.title) + '</div><div class="m">' + esc([r.category, groups(r).cuisine.join(" / ")].filter(Boolean).join(" · ")) + '</div></div>';
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

  function getMult(r) { return ui.mult[r.id] || 1; }
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
        var k = r.id + ":" + gi + ":" + ii, on = !!ui.checked[k], qty = scaleQty(it.quantity, m), qu = [qty, it.unit].filter(Boolean).join(" ");
        h += '<div class="ing' + (on ? " on" : "") + '" data-tick="' + esc(k) + '" role="checkbox" aria-checked="' + on + '"><div class="box">' + (on ? "✓" : "") + '</div><div class="txt">' +
          (qu ? '<span class="q">' + esc(qu) + '</span> ' : "") + esc(it.name) + (it.note ? '<span class="n">, ' + esc(it.note) + '</span>' : "") + '</div></div>';
      });
    });
    return h;
  }
  function tickCap(r) {
    var c = ingCounts(r);
    return '<div class="tickcap"><span>' + c.done + ' of ' + c.total + ' ticked</span>' + (c.done ? '<button class="linkbtn" data-act="clearticks">Clear ticks</button>' : "") + '</div>';
  }
  function scaler(r) {
    var m = getMult(r), base = baseServings(r), h = '<div class="scaler">';
    if (base !== null) {
      var st = Math.max(1, Math.round(base * m));
      h += '<span class="slbl">Servings</span><button class="btn round" data-act="minus" aria-label="Fewer servings"' + (st <= 1 ? " disabled" : "") + '>−</button><div class="val">' + esc(scaleQty(r.servings.amount, m)) + '</div><button class="btn round" data-act="plus" aria-label="More servings">+</button>';
    } else {
      h += '<span class="slbl">Batch</span><button class="btn round" data-act="pminus" aria-label="Smaller batch"' + (m <= 0.5 ? " disabled" : "") + '>−</button><div class="val">×' + multLabel(m) + '</div><button class="btn round" data-act="pplus" aria-label="Bigger batch"' + (m >= 3 ? " disabled" : "") + '>+</button>';
    }
    if (m !== 1) h += '<button class="linkbtn" data-act="resetmult">Reset</button>';
    h += '</div>';
    if (m !== 1) h += '<div class="scap">Scaled from ' + esc(servLabel(r)) + '. Amounts are rounded.</div>';
    return h;
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
      (r.steps || []).map(function (s, i) { return '<div class="step" data-act="cook" data-step="' + i + '"><div class="num">' + (i + 1) + '</div><div>' + stepHtml(r, i, getMult(r)) + '</div></div>'; }).join("") + '</div>';
    if (rel.length) h += '<div class="block"><h2>Goes with / see also</h2>' + rel.map(function (x) {
      var o = BY_ID[x.id]; return '<button class="relbtn" data-open="' + esc(o.id) + '"><small>' + esc(x.relation) + ' · ' + esc(o.category) + '</small>' + esc(o.title) + ' →</button>';
    }).join("") + '</div>';
    if (r.tips && r.tips.length) h += '<div class="block"><h2>Tips &amp; variations</h2>' + r.tips.map(function (t) { return '<div class="tip">' + esc(t) + '</div>'; }).join("") + '</div>';
    h += '</div>';
    app.innerHTML = h;
    document.title = r.title + " · Recipes";
    window.scrollTo(0, keepScroll ? y : 0);
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
  function rerender(r) {
    var st = cookStep();
    if (st >= 0) { var sb = document.getElementById("sheetbody"); ui.sheetScroll = sb ? sb.scrollTop : 0; return renderCook(r, st); }
    return renderDetail(r, true);
  }
  function renderCook(r, i) {
    var n = (r.steps || []).length; if (!n) return renderDetail(r);
    i = Math.max(0, Math.min(n - 1, i));
    app.innerHTML = '<div class="cook"><div class="cook-top"><div class="cook-title">' + esc(r.title) + '</div><div class="cook-btns"><button class="btn" data-act="sheet">☰ Ingredients</button><button class="btn" data-act="exitcook">✕ Exit</button></div></div>' +
      '<div class="bar"><div style="width:' + ((i + 1) / n * 100) + '%"></div></div>' +
      '<div class="cook-body"><div class="cook-step-lbl">STEP ' + (i + 1) + ' / ' + n + '</div><div class="cook-text">' + stepHtml(r, i, getMult(r)) + '</div>' +
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
      if (parts[2] === "cook") return renderCook(r, parseInt(parts[3] || "0", 10) || 0);
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
    if (t.dataset.open) { if (!cur) ui.homeScroll = window.scrollY; return go("#/r/" + encodeURIComponent(t.dataset.open)); }
    if (t.dataset.view) { ui.view = t.dataset.view; LS.set("view", ui.view); return renderHome(); }
    if (t.dataset.tag) { var tg = t.dataset.tag, i = ui.selTags.indexOf(tg); if (i >= 0) ui.selTags.splice(i, 1); else ui.selTags.push(tg); LS.set("selTags", ui.selTags); var y = scrollY; renderHome(); scrollTo(0, y); return; }
    if (t.dataset.jump) { e.preventDefault(); var el = document.getElementById(t.dataset.jump); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (t.dataset.tick) { var k = t.dataset.tick; if (ui.checked[k]) delete ui.checked[k]; else ui.checked[k] = true; LS.set("checked", ui.checked); return rerender(cur); }
    if (t.dataset.mult) return setMult(cur, parseFloat(t.dataset.mult));
    var a = t.dataset.act;
    if (a === "filters") { ui.showFilters = !ui.showFilters; return renderHome(); }
    if (a === "clearq") { ui.query = ""; return renderHome(); }
    if (a === "clearall") { ui.query = ""; ui.selTags = []; LS.set("selTags", []); return renderHome(); }
    if (a === "back") return go("#/");
    if (a === "cook") { var s = parseInt(t.dataset.step, 10); if (s < 0) return; requestWake(); return go("#/r/" + encodeURIComponent(cur.id) + "/cook/" + s); }
    if (a === "exitcook") { releaseWake(); ui.sheet = false; return go("#/r/" + encodeURIComponent(cur.id)); }
    if (a === "clearticks") { Object.keys(ui.checked).forEach(function (k) { if (k.indexOf(cur.id + ":") === 0) delete ui.checked[k]; }); LS.set("checked", ui.checked); return rerender(cur); }
    if (a === "sheet" && cur) { ui.sheet = true; ui.sheetScroll = 0; return renderCook(cur, cookStep()); }
    if (a === "closesheet" && cur) { ui.sheet = false; return renderCook(cur, cookStep()); }
    if (a === "resetmult" && cur) return setMult(cur, 1);
    if (cur) {
      var base = baseServings(cur), m = getMult(cur);
      if (a === "plus" || a === "minus") { var st = Math.max(1, Math.round(base * m)) + (a === "plus" ? 1 : -1); return setMult(cur, Math.max(1, st) / base); }
      var P = [0.5, 2 / 3, 1, 1.5, 2, 3], idx = 0;
      P.forEach(function (p, j) { if (Math.abs(p - m) < Math.abs(P[idx] - m)) idx = j; });
      if (a === "pplus") return setMult(cur, P[Math.min(P.length - 1, idx + 1)]);
      if (a === "pminus") return setMult(cur, P[Math.max(0, idx - 1)]);
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
  window.addEventListener("hashchange", route);

  // ---------- test hook ----------
  // tests/load-app.js runs this file in a Node vm sandbox with window.__RECIPES_TEST__ set, and reads
  // helpers by name, so tests don't break when code moves. Never set in the browser, so this is inert there.
  if (window.__RECIPES_TEST__) window.__RECIPES_TEST__.get = function (name) { return eval(name); };

  // ---------- boot ----------
  load().then(function (d) {
    setData(d); route();
  }).catch(function () {
    app.innerHTML = '<div class="loading">Couldn\'t load recipes. Check your connection and <a href="" onclick="location.reload();return false">try again</a>.</div>';
  });

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
