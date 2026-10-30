/* LocalBoost dashboard UI helpers: DOM builder, states, tables, charts, toast, modal, CSV. */
(function () {
  "use strict";
  var LB = (window.LB = window.LB || {});
  var t = LB.t;
  var UI = (LB.ui = {});

  /* ---------- DOM builder (text only, never innerHTML) ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var i = 2;
    if (attrs && (typeof attrs !== "object" || attrs.nodeType || Array.isArray(attrs))) { i = 1; attrs = null; }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "value") el.value = v;
        else if (k === "checked" || k === "disabled" || k === "selected" || k === "hidden" || k === "required" || k === "open") { if (v) el.setAttribute(k, ""); }
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    for (; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  UI.h = h;
  UI.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  UI.mount = function (el, content) { UI.clear(el); add(el, content); return el; };

  /* ---------- formatting ---------- */
  var F = (LB.fmt = {});
  F.ms = function (v) { if (v === null || v === undefined || v === "") return null; if (typeof v === "number") return v < 1e11 ? v * 1000 : v; var d = Date.parse(v); return isNaN(d) ? null : d; };
  F.date = function (v, withTime) {
    var ms = F.ms(v); if (ms === null) return "—";
    return new Date(ms).toLocaleString(LB.locale, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
  };
  F.num = function (v, d) { return typeof v === "number" && isFinite(v) ? v.toLocaleString(LB.locale, { maximumFractionDigits: d === undefined ? 1 : d }) : "—"; };
  F.pct = function (v, d) { return typeof v === "number" && isFinite(v) ? (v * 100).toLocaleString(LB.locale, { maximumFractionDigits: d === undefined ? 1 : d }) + "%" : "—"; };
  F.money = function (minor, cur) {
    if (typeof minor !== "number") return "—";
    try { return new Intl.NumberFormat(LB.locale, { style: "currency", currency: cur || "INR", maximumFractionDigits: 0 }).format(minor / 100); } catch (_) { return (minor / 100) + " " + cur; }
  };
  F.ago = function (v) {
    var ms = F.ms(v); if (ms === null) return "—";
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 3600) return t("{n} min ago", { n: Math.max(1, Math.round(s / 60)) });
    if (s < 86400) return t("{n} h ago", { n: Math.round(s / 3600) });
    return t("{n} days ago", { n: Math.round(s / 86400) });
  };
  F.day = function (v) { var ms = F.ms(v); return ms === null ? "" : new Date(ms).toISOString().slice(0, 10); };

  /* ---------- badges / buttons / cards ---------- */
  var ICON = { ok: "✓", warn: "!", bad: "✕", info: "i", neutral: "•" };
  UI.badge = function (text, tone) { tone = tone || "neutral"; return h("span", { class: "app-badge app-badge-" + tone }, h("span", { "aria-hidden": "true", class: "app-badge-i" }, ICON[tone] || "•"), " ", text); };
  UI.btn = function (label, opts) {
    opts = opts || {};
    var tag = opts.href ? "a" : "button";
    var a = { class: "app-btn" + (opts.kind ? " app-btn-" + opts.kind : "") + (opts.small ? " app-btn-sm" : ""), onclick: opts.onClick, title: opts.title, "aria-label": opts.aria };
    if (opts.href) a.href = opts.href; else { a.type = opts.type || "button"; a.disabled = opts.disabled; }
    if (opts.target) { a.target = opts.target; a.rel = "noopener"; }
    return h(tag, a, label);
  };
  UI.card = function (title, content, opts) {
    opts = opts || {};
    var hd = title || opts.actions ? h("div", { class: "app-card-h" }, title ? h("h2", { class: "app-h2" }, title) : null, opts.actions || null) : null;
    return h("section", { class: "app-card" + (opts.class ? " " + opts.class : ""), "aria-label": !title ? opts.label : null }, hd, content);
  };
  UI.pageHead = function (title, lead, actions) {
    return h("div", { class: "app-pagehead" }, h("div", null, h("h1", { class: "app-h1" }, title), lead ? h("p", { class: "app-lead" }, lead) : null), actions ? h("div", { class: "app-actions no-print" }, actions) : null);
  };
  UI.tile = function (o) {
    var v = o.value === null || o.value === undefined ? "—" : o.value;
    var inner = [h("span", { class: "app-tile-l" }, o.label), h("strong", { class: "app-tile-v" }, v), o.note ? h("small", { class: "app-tile-n" }, o.note) : null];
    return o.href ? h("a", { class: "app-tile", href: o.href }, inner) : h("div", { class: "app-tile" }, inner);
  };
  UI.field = function (label, input, hint, id) {
    id = id || input.id || (input.id = "f" + Math.random().toString(36).slice(2, 8));
    input.id = id;
    var hid = hint ? id + "-h" : null;
    if (hid) input.setAttribute("aria-describedby", hid);
    return h("div", { class: "app-field" }, h("label", { for: id }, label), input, hint ? h("small", { id: hid, class: "app-hint" }, hint) : null, h("small", { class: "app-err", id: id + "-e", role: "alert" }));
  };
  UI.setFieldError = function (input, msg) {
    var e = document.getElementById(input.id + "-e");
    if (e) e.textContent = msg || "";
    if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  };
  UI.select = function (options, value, attrs) {
    var s = h("select", attrs || {});
    options.forEach(function (o) { var op = h("option", { value: o[0] }, o[1]); if (String(o[0]) === String(value)) op.selected = true; s.appendChild(op); });
    return s;
  };

  /* ---------- states ---------- */
  var SK = ["Signed out", "Not signed in"];
  UI.skeleton = function (rows) {
    var w = h("div", { class: "app-skel", role: "status", "aria-label": t("Loading…") });
    for (var i = 0; i < (rows || 3); i++) w.appendChild(h("div", { class: "app-skel-line", style: "width:" + (92 - i * 14) + "%" }));
    w.appendChild(h("span", { class: "app-sr" }, t("Loading…")));
    return w;
  };
  UI.state = function (kind, o) {
    o = o || {};
    var tone = { error: "bad", upgrade: "info", noapi: "warn", provider: "warn", syncing: "info", signedout: "info" }[kind] || "neutral";
    var acts = (o.actions || []).filter(Boolean);
    return h("div", { class: "app-state app-state-" + kind, role: kind === "error" ? "alert" : "status" },
      h("div", { class: "app-state-i", "aria-hidden": "true" }, ICON[tone]),
      h("div", null, h("h2", { class: "app-h3" }, o.title), o.body ? h("p", null, o.body) : null,
        o.detail ? h("p", { class: "app-hint" }, o.detail) : null,
        acts.length ? h("div", { class: "app-actions" }, acts) : null));
  };
  var S = {
    noapi: function () { return UI.state("noapi", { title: t("Production API not connected yet"), body: t("The LocalBoost API is not switched on for this site yet, so no live data can be shown. Nothing on this page is sample data. Your account and business details will appear here once the connection is live."), actions: [UI.btn(t("Back to website"), { href: LB.lang === "hi" ? "/hi/" : "/" })] }); },
    signedout: function () { return UI.state("signedout", { title: t("Sign in to continue"), body: t("Your session has ended or you are not signed in. Sign in with Google to see your businesses and reports."), actions: [UI.btn(t("Sign in with Google"), { kind: "primary", href: LB.api.signInUrl({ return: location.pathname }) })] }); },
    nobusiness: function () { return UI.state("empty", { title: t("Add your business first"), body: t("This page needs a business. Add one (it takes about two minutes) and come back."), actions: [UI.btn(t("Start setup"), { kind: "primary", href: LB.href("onboarding/") }), UI.btn(t("Add a business"), { href: LB.href("business.html") })] }); },
    google: function (o) { o = o || {}; return UI.state("google", { title: o.title || t("Google Business Profile is not connected"), body: o.body || t("Connect your Google Business Profile and choose a location to see real data here."), actions: [UI.btn(t("Open Google connection"), { kind: "primary", href: LB.href("google-profile.html") })] }); },
    provider: function (o) { o = o || {}; return UI.state("provider", { title: o.title || t("Data provider unavailable"), body: o.body || t("The data provider for this feature is not available right now. No numbers are shown rather than guessed ones."), detail: o.detail, actions: [o.retry ? UI.btn(t("Try again"), { onClick: o.retry }) : null] }); },
    empty: function (o) { return UI.state("empty", o); },
    upgrade: function (e) {
      var d = (e && e.data) || {};
      return UI.state("upgrade", { title: t("Upgrade your plan to use this feature"), body: t("This feature is not included in your current plan ({plan}). {need} required.", { plan: d.plan || "free", need: d.required ? String(d.required).replace(/^./, function (c) { return c.toUpperCase(); }) : t("A paid plan") }),
        actions: [UI.btn(t("See plans"), { kind: "primary", href: LB.href("plans.html") })] });
    }
  };
  UI.S = S;
  /* Map a string state from a 200 response to a state node (or null when it is real data). */
  UI.stateFor = function (state, o) {
    o = o || {};
    if (!state || state === "verified_data" || state === "completed" || state === "connected" || state === "configured") return null;
    if (/^awaiting_google/.test(state) || state === "google_location_required") return S.google(o.google);
    if (state === "awaiting_rank_provider") return S.provider({ title: t("Waiting for a rank-data provider"), body: t("Real rank measurements come from a licensed rank-data provider, which is not configured yet. No positions are shown until it is."), retry: o.retry });
    if (state === "awaiting_search_console_connection") return UI.state("empty", { title: t("Search Console is not connected"), body: t("Connect Search Console to see real queries and clicks."), actions: [UI.btn(t("Open Search Console"), { href: LB.href("search-console.html") })] });
    if (/^awaiting_/.test(state)) return UI.state("empty", o.empty || { title: t("No data yet"), body: t("There is nothing to show yet. It appears here once real data has been collected.") });
    if (state === "syncing" || state === "pending") return UI.state("syncing", { title: t("Syncing"), body: t("We are fetching your data. This can take a few minutes. Check back shortly."), actions: [o.retry ? UI.btn(t("Refresh"), { onClick: o.retry }) : null] });
    if (/provider|error/.test(state)) return S.provider({ retry: o.retry, detail: state });
    return null;
  };
  UI.fromError = function (e, o) {
    o = o || {};
    var retry = o.retry ? UI.btn(t("Try again"), { onClick: o.retry }) : null;
    if (!e || !e.__lb) { e = { code: "error", message: (e && e.message) || "", status: 0 }; }
    if (e.code === "api_disabled") return S.noapi();
    if (e.status === 401) return S.signedout();
    if (LB.api.isUpgrade(e)) return S.upgrade(e);
    if (e.code === "google_location_required" || e.code === "google_not_connected" || (e.data && /^awaiting_google/.test(e.data.state || ""))) return S.google();
    if (e.status === 403) return UI.state("error", { title: t("Permission required"), body: t("You do not have permission for this action, or Google has not granted LocalBoost the access it needs. Reconnect Google and accept the requested permissions."), detail: e.message, actions: [UI.btn(t("Open Google connection"), { href: LB.href("google-profile.html") }), retry] });
    if (e.data && /provider|awaiting_rank/.test((e.data.state || "") + (e.code || ""))) return S.provider({ detail: e.message, retry: o.retry });
    if (e.status === 503 || e.status === 502) return S.provider({ detail: e.message, retry: o.retry });
    var msg = e.code === "network" ? t("We could not reach the LocalBoost API. Check your connection and try again.") : e.code === "timeout" ? t("The request took too long. Please try again.") : (e.message || t("Something went wrong."));
    return UI.state("error", { title: t("This could not be loaded"), body: msg, detail: e.code && e.code !== "error" ? t("Error code: {c}", { c: e.code }) : "", actions: [retry] });
  };
  /* Load data into a container with skeleton/error/retry handling. render(data) returns node/array. */
  UI.load = function (el, fetcher, render) {
    el.setAttribute("aria-busy", "true");
    UI.mount(el, UI.skeleton());
    return Promise.resolve().then(fetcher).then(function (d) {
      var out = render(d);
      UI.mount(el, out);
    }).catch(function (e) {
      UI.mount(el, UI.fromError(e, { retry: function () { UI.load(el, fetcher, render); } }));
    }).then(function () { el.removeAttribute("aria-busy"); });
  };

  /* ---------- table ---------- */
  UI.table = function (o) {
    var cols = o.cols;
    var head = h("tr", null, cols.map(function (c) { return h("th", { scope: "col", class: c.num ? "num" : null }, c.label); }));
    var body = h("tbody");
    (o.rows || []).forEach(function (r) {
      body.appendChild(h("tr", null, cols.map(function (c) {
        var v = c.render ? c.render(r) : r[c.key];
        return h(c.rowHeader ? "th" : "td", { class: c.num ? "num" : null, scope: c.rowHeader ? "row" : null, "data-label": c.label }, v === null || v === undefined || v === "" ? "—" : v);
      })));
    });
    return h("div", { class: "app-tablewrap", tabindex: "0", role: "region", "aria-label": o.caption }, h("table", { class: "app-table" },
      h("caption", { class: o.hideCaption === false ? null : "app-sr" }, o.caption), h("thead", null, head), body));
  };

  /* ---------- charts (real values only) ---------- */
  var NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, text) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text !== undefined) e.textContent = text; return e; }
  UI.lineChart = function (o) {
    /* o: {title, points:[{x,y}], invert, unit, yLabel}; y may be null (gap). Needs >= 2 real points else caller shows an empty state. */
    var pts = o.points, real = pts.filter(function (p) { return typeof p.y === "number"; });
    var W = 640, H = 230, L = 46, R = 14, T = 14, B = 34;
    var min = Math.min.apply(null, real.map(function (p) { return p.y; })), max = Math.max.apply(null, real.map(function (p) { return p.y; }));
    if (min === max) { min -= 1; max += 1; }
    var pad = (max - min) * 0.1; min -= pad; max += pad;
    var X = function (i) { return L + (pts.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (pts.length - 1)); };
    var Y = function (v) { var r = (v - min) / (max - min); return T + (o.invert ? r : 1 - r) * (H - T - B); };
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-labelledby": "ch-t", class: "app-chart", preserveAspectRatio: "xMidYMid meet" });
    var id = "ch" + Math.random().toString(36).slice(2, 7);
    svg.setAttribute("aria-labelledby", id);
    svg.appendChild(s("title", { id: id }, o.title + ": " + t("{n} data points, from {a} to {b}.", { n: real.length, a: F.num(real[0].y), b: F.num(real[real.length - 1].y) })));
    for (var g = 0; g <= 3; g++) {
      var v = min + ((max - min) * g) / 3, y = Y(v);
      svg.appendChild(s("line", { x1: L, x2: W - R, y1: y, y2: y, class: "ch-grid" }));
      svg.appendChild(s("text", { x: L - 6, y: y + 4, "text-anchor": "end", class: "ch-axis" }, F.num(v, max - min < 10 ? 1 : 0)));
    }
    var d = "", pen = false;
    pts.forEach(function (p, i) { if (typeof p.y !== "number") { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.y).toFixed(1); pen = true; });
    svg.appendChild(s("path", { d: d, class: "ch-line", fill: "none" }));
    pts.forEach(function (p, i) { if (typeof p.y === "number") svg.appendChild(s("circle", { cx: X(i), cy: Y(p.y), r: 3.5, class: "ch-dot" }, undefined)).appendChild(s("title", {}, p.x + ": " + F.num(p.y) + (o.unit || ""))); });
    svg.appendChild(s("text", { x: L, y: H - 10, class: "ch-axis" }, String(pts[0].x)));
    svg.appendChild(s("text", { x: W - R, y: H - 10, "text-anchor": "end", class: "ch-axis" }, String(pts[pts.length - 1].x)));
    var tbl = UI.table({ caption: o.title, cols: [{ label: o.xLabel || t("Date"), key: "x" }, { label: o.yLabel || t("Value"), num: true, render: function (p) { return typeof p.y === "number" ? F.num(p.y) + (o.unit || "") : t("No data"); } }], rows: pts });
    return h("figure", { class: "app-figure" }, h("figcaption", { class: "app-h3" }, o.title), o.invert ? h("p", { class: "app-hint" }, t("Lower is better: position 1 is the top result.")) : null, svg,
      h("details", { class: "app-details" }, h("summary", null, t("View data as a table")), tbl));
  };
  UI.barChart = function (o) {
    /* o: {title, bars:[{label,value}], unit} */
    var bars = o.bars.filter(function (b) { return typeof b.value === "number"; });
    var max = Math.max.apply(null, bars.map(function (b) { return b.value; })) || 1;
    var list = h("div", { class: "app-bars", role: "img", "aria-label": o.title + ": " + bars.map(function (b) { return b.label + " " + F.num(b.value); }).join(", ") });
    bars.forEach(function (b) {
      list.appendChild(h("div", { class: "app-bar", "aria-hidden": "true" }, h("span", { class: "app-bar-l" }, b.label), h("span", { class: "app-bar-t" }, h("span", { class: "app-bar-f", style: "width:" + Math.max(2, (b.value / max) * 100) + "%" })), h("span", { class: "app-bar-v" }, F.num(b.value) + (o.unit || ""))));
    });
    return h("figure", { class: "app-figure" }, h("figcaption", { class: "app-h3" }, o.title), list);
  };
  /* Rank grid: points [{row,col,position}] in size x size. null position = not found. */
  UI.rankGrid = function (points, size, caption) {
    var cell = {};
    points.forEach(function (p) { cell[p.row + ":" + p.col] = p; });
    var tb = h("tbody");
    for (var r = 0; r < size; r++) {
      var tr = h("tr");
      for (var c = 0; c < size; c++) {
        var p = cell[r + ":" + c], txt, cls, lab;
        if (!p) { txt = "·"; cls = "g-none"; lab = t("No measurement"); }
        else if (typeof p.position === "number") { txt = String(p.position); cls = p.position <= 3 ? "g-top" : p.position <= 10 ? "g-mid" : p.position <= 20 ? "g-low" : "g-bad"; lab = t("Position {n}", { n: p.position }); }
        else { txt = p.error ? "!" : "NF"; cls = p.error ? "g-err" : "g-nf"; lab = p.error ? t("Error for this point") : t("Not found in results"); }
        tr.appendChild(h("td", { class: "g-cell " + cls, title: lab }, h("span", { "aria-hidden": "true" }, txt), h("span", { class: "app-sr" }, t("Row {r}, column {c}: {l}", { r: r + 1, c: c + 1, l: lab }))));
      }
      tb.appendChild(tr);
    }
    return h("div", null, h("table", { class: "app-grid" }, h("caption", { class: "app-sr" }, caption), tb),
      h("p", { class: "app-hint app-legend" }, h("span", { class: "g-cell g-top lg" }, "1-3"), " ", h("span", { class: "g-cell g-mid lg" }, "4-10"), " ", h("span", { class: "g-cell g-low lg" }, "11-20"), " ", h("span", { class: "g-cell g-bad lg" }, "21+"), " ", h("span", { class: "g-cell g-nf lg" }, "NF"), " ", t("NF = not found in the results checked. ! = error for that point.")));
  };

  /* ---------- toast ---------- */
  var toastBox;
  UI.toast = function (msg, tone) {
    if (!toastBox) { toastBox = h("div", { class: "app-toasts", role: "status", "aria-live": "polite" }); document.body.appendChild(toastBox); }
    var el = h("div", { class: "app-toast app-toast-" + (tone || "info") }, UI.badge(msg, tone === "bad" ? "bad" : tone === "ok" ? "ok" : "info"));
    toastBox.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, tone === "bad" ? 9000 : 5000);
  };

  /* ---------- modal with focus trap ---------- */
  UI.modal = function (o) {
    return new Promise(function (resolve) {
      var prev = document.activeElement;
      var tid = "m" + Math.random().toString(36).slice(2, 7);
      var body = h("div", { class: "app-modal-b" }, o.body);
      var err = h("p", { class: "app-err", role: "alert" });
      var actions = h("div", { class: "app-actions" });
      var dlg = h("div", { class: "app-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": tid }, h("h2", { class: "app-h2", id: tid }, o.title), body, err, actions);
      var back = h("div", { class: "app-backdrop" }, dlg);
      function close(val) { document.removeEventListener("keydown", onKey, true); if (back.parentNode) back.parentNode.removeChild(back); document.body.classList.remove("app-noscroll"); if (prev && prev.focus) prev.focus(); resolve(val); }
      function onKey(e) {
        if (e.key === "Escape") { e.stopPropagation(); close(false); }
        if (e.key === "Tab") {
          var f = dlg.querySelectorAll("a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex='-1'])");
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      (o.actions || [{ label: t("Close"), value: false }]).forEach(function (a) {
        var b = UI.btn(a.label, { kind: a.kind, onClick: function () {
          if (!a.run) return close(a.value);
          b.disabled = true; err.textContent = "";
          Promise.resolve(a.run()).then(function (v) { close(v === undefined ? true : v); }, function (e) { err.textContent = (e && e.message) || t("Something went wrong."); b.disabled = false; });
        } });
        actions.appendChild(b);
      });
      document.body.appendChild(back); document.body.classList.add("app-noscroll");
      document.addEventListener("keydown", onKey, true);
      var focusEl = dlg.querySelector("input,select,textarea") || actions.querySelector("button");
      (focusEl || dlg).focus();
    });
  };
  UI.confirm = function (title, text, label, kind) {
    return UI.modal({ title: title, body: h("p", null, text), actions: [{ label: t("Cancel"), value: false }, { label: label, kind: kind || "primary", value: true }] });
  };

  /* ---------- CSV ---------- */
  function cell(v) {
    if (v === null || v === undefined) return "";
    var s2 = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s2)) s2 = "'" + s2; /* neutralise spreadsheet formulas */
    return /[",\n\r]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2;
  }
  UI.saveBlob = function (name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type || "text/csv;charset=utf-8" }));
    var a = h("a", { href: url, download: name }); document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  };
  UI.csv = function (name, rows) { UI.saveBlob(name, "﻿" + rows.map(function (r) { return r.map(cell).join(","); }).join("\r\n"), "text/csv;charset=utf-8"); };
  UI.serverCsv = function (path, params, name) {
    return LB.api.getText(path, params).then(function (txt) { UI.saveBlob(name, txt); UI.toast(t("Download started"), "ok"); }, function (e) { UI.toast(UI.errText(e), "bad"); });
  };
  UI.errText = function (e) {
    if (!e) return t("Something went wrong.");
    if (LB.api.isUpgrade(e)) return t("Your plan does not include this feature.");
    return e.message || t("Something went wrong.");
  };
  /* Run an async action on a button: disable, toast success/failure. */
  UI.act = function (btn, fn, okMsg) {
    var old = btn.textContent; btn.disabled = true; btn.setAttribute("aria-busy", "true"); btn.textContent = t("Working…");
    return Promise.resolve().then(fn).then(function (r) { if (okMsg) UI.toast(okMsg, "ok"); return r; }, function (e) { UI.toast(UI.errText(e), "bad"); return undefined; })
      .then(function (r) { btn.disabled = false; btn.removeAttribute("aria-busy"); btn.textContent = old; return r; });
  };
  UI.sevTone = function (sv) { return sv === "high" || sv === "critical" ? "bad" : sv === "medium" ? "warn" : "info"; };
  UI.sevLabel = function (sv) { return { high: t("High"), medium: t("Medium"), low: t("Low"), critical: t("Critical") }[sv] || sv; };
})();
