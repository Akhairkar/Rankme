/* Audit list/detail, 30-day plan, action centre, visibility score. */
(function () {
  "use strict";
  var LB = window.LB, t = LB.t, UI = LB.ui, h = UI.h, F = LB.fmt, api = LB.api;
  var P = {};
  var VER = { verified: ["ok", "Verified"], user_provided: ["info", "Provided by you"], unavailable: ["neutral", "Could not be verified"] };
  function verBadge(v) { var x = VER[v] || ["neutral", v || "Unknown"]; return UI.badge(t(x[1]), x[0]); }
  function statusBadge(s) { return s === "fixed" ? UI.badge(t("Fixed"), "ok") : s === "ignored" ? UI.badge(t("Ignored"), "neutral") : UI.badge(t("Open"), "warn"); }
  function auditState(s) { return s === "completed" ? UI.badge(t("Completed"), "ok") : s === "partial" ? UI.badge(t("Partial: some checks unavailable"), "warn") : UI.badge(s || "—", "neutral"); }
  var HOW = function () { return UI.card(t("How this score is calculated"), h("div", null,
    h("p", null, t("The score is built only from checks that could be verified. Each section has a weight. A section that could not be checked (for example, no website was provided or Google is not connected) is marked unavailable and left out, instead of being counted as zero or guessed.")),
    h("p", { class: "app-hint" }, t("Points earned divided by points available in the sections that were checked gives your score out of 100. If nothing could be verified, no score is shown."))), { class: "print-keep" }); };

  function runAudit(ctx, website, btn, done) {
    return UI.act(btn, function () {
      return api.post("/api/audits/run", { business_id: ctx.bid, website_url: website || undefined }, null, { timeout: 90000 }).then(function (r) {
        UI.toast(r.score == null ? t("Audit finished without a score: not enough verified data.") : t("Audit finished: score {s}/100", { s: r.score }), r.score == null ? "info" : "ok"); return done && done(r);
      });
    });
  }

  P.auditList = function () {
    LB.boot({ title: t("Profile audit"), noHead: true, render: function (body, ctx) {
      var web = h("input", { type: "text", value: ctx.business.website_url || "", autocomplete: "url", placeholder: "https://" }), run = UI.btn(t("Run audit"), { kind: "primary" });
      body.appendChild(UI.pageHead(t("Profile audit"), t("Check your Google profile and website for local SEO problems. Every finding shows its evidence and source."), null));
      var errw = h("p", { class: "app-err", role: "alert" }), f = UI.field(t("Website to check (optional)"), web, t("Leave empty to audit the Google profile only.")), cmp = h("div"), hist = h("div");
      run.addEventListener("click", function () { var m = LB.val.url(web.value); UI.setFieldError(web, m); if (m) return web.focus(); runAudit(ctx, LB.val.normUrl(web.value), run, function (r) { location.href = LB.href("audit/detail.html?id=" + encodeURIComponent(r.audit_id)); }); });
      body.appendChild(UI.card(t("Run a new audit"), h("div", { class: "app-row" }, f, h("div", { class: "app-field", style: "flex:0 0 auto" }, run))));
      body.appendChild(HOW()); body.appendChild(cmp); body.appendChild(hist);
      UI.load(hist, function () { return api.get("/api/audits", { business_id: ctx.bid }); }, function (d) {
        var rows = (d.audits || []).slice().sort(function (a, b) { return F.ms(b.created_at) - F.ms(a.created_at); });
        if (!rows.length) return UI.card(t("Audit history"), UI.S.empty({ title: t("No audits yet"), body: t("Run your first audit above. Results and history are saved here.") }));
        var sel = {};
        var pts = rows.slice().reverse().map(function (a) { return { x: F.day(a.created_at), y: typeof a.score === "number" ? a.score : null }; });
        var chart = pts.filter(function (p) { return p.y !== null; }).length >= 2 ? UI.card(t("Score over time"), UI.lineChart({ title: t("Audit score"), points: pts, yLabel: t("Score") })) : null;
        var cmpBtn = UI.btn(t("Compare selected"), { disabled: true, onClick: function () { compare(); } });
        function upd() { var ids = Object.keys(sel).filter(function (k) { return sel[k]; }); cmpBtn.disabled = ids.length !== 2; cmpBtn.title = ids.length === 2 ? "" : t("Tick exactly two audits"); }
        function compare() {
          var ids = Object.keys(sel).filter(function (k) { return sel[k]; }).sort(function (x, y) { var A = rows.filter(function (r) { return r.id === x; })[0], B = rows.filter(function (r) { return r.id === y; })[0]; return F.ms(A.created_at) - F.ms(B.created_at); });
          UI.load(cmp, function () { return api.get("/api/audits/compare", { a: ids[0], b: ids[1] }); }, function (c) {
            var fl = function (arr) { return arr.length ? h("ul", { class: "app-list" }, arr.map(function (x) { return h("li", { class: "app-item" }, UI.badge(UI.sevLabel(x.severity), UI.sevTone(x.severity)), " ", x.title); })) : h("p", { class: "app-hint" }, t("None")); };
            return UI.card(t("Comparison"), [h("p", null, c.score_delta == null ? t("Score change: not available (one audit had no score).") : t("Score change: {d}", { d: (c.score_delta > 0 ? "+" : "") + c.score_delta })), h("p", null, t("{n} finding(s) unchanged.", { n: c.unchanged })), h("div", { class: "app-grid2" }, h("div", null, h("h3", { class: "app-h3" }, t("New since the earlier audit")), fl(c.new || [])), h("div", null, h("h3", { class: "app-h3" }, t("Fixed since the earlier audit")), fl(c.fixed || [])))]);
          });
        }
        return [chart, UI.card(t("Audit history"), [UI.table({ caption: t("Audit history"), cols: [
          { label: t("Compare"), render: function (a) { return h("input", { type: "checkbox", "aria-label": t("Select audit from {d}", { d: F.date(a.created_at) }), onchange: function (e) { sel[a.id] = e.target.checked; upd(); } }); } },
          { label: t("Date"), rowHeader: true, render: function (a) { return F.date(a.created_at, true); } }, { label: t("Score"), num: true, render: function (a) { return typeof a.score === "number" ? a.score + "/100" : t("No score"); } },
          { label: t("State"), render: function (a) { return auditState(a.state); } },
          { label: t("High"), num: true, render: function (a) { return a.summary && a.summary.high; } }, { label: t("Medium"), num: true, render: function (a) { return a.summary && a.summary.medium; } }, { label: t("Low"), num: true, render: function (a) { return a.summary && a.summary.low; } }, { label: t("Fixed"), num: true, render: function (a) { return a.summary && a.summary.fixed; } },
          { label: "", render: function (a) { return UI.btn(t("View"), { small: true, href: LB.href("audit/detail.html?id=" + encodeURIComponent(a.id)), aria: t("View audit from {d}", { d: F.date(a.created_at) }) }); } }], rows: rows }), h("p", { style: "margin-top:12px" }, cmpBtn)])];
      });
    } });
  };

  P.auditDetail = function () {
    LB.boot({ title: t("Audit details"), crumbs: [[t("Profile audit"), LB.href("audit/")], [t("Audit details")]], noHead: true, render: function (body, ctx) {
      var id = new URLSearchParams(location.search).get("id"), wrap = h("div");
      body.appendChild(wrap);
      function load(aid) {
        UI.load(wrap, function () { return api.get("/api/audits/detail", { id: aid }); }, function (d) { return view(d); });
      }
      function view(d) {
        var a = d.audit || {}, fs = d.findings || [], bd = d.score_breakdown || [];
        var fil = { sev: "", cat: "", st: "", q: "" }, tbody = h("div");
        var cats = Object.keys(fs.reduce(function (m, f) { m[f.category] = 1; return m; }, {})).sort();
        function sel(label, key, opts) { var s = UI.select([["", t("All")]].concat(opts), "", {}); s.addEventListener("change", function () { fil[key] = s.value; draw(); }); return UI.field(label, s); }
        var q = h("input", { type: "search", "aria-label": t("Search findings") }); q.addEventListener("input", function () { fil.q = q.value.toLowerCase(); draw(); });
        var count = h("p", { class: "app-hint", "aria-live": "polite" });
        function setStatus(f, s, btn) {
          UI.act(btn, function () { return api.post("/api/audits/finding-status", { finding_id: f.id, status: s }).then(function () { f.status = s; draw(); }); }, s === "fixed" ? t("Marked as fixed") : s === "ignored" ? t("Ignored") : t("Reopened"));
        }
        function draw() {
          var rows = fs.filter(function (f) { return (!fil.sev || f.severity === fil.sev) && (!fil.cat || f.category === fil.cat) && (!fil.st || (f.status || "open") === fil.st) && (!fil.q || (f.title + " " + (f.evidence || "")).toLowerCase().indexOf(fil.q) >= 0); });
          count.textContent = t("Showing {n} of {m} findings", { n: rows.length, m: fs.length });
          UI.mount(tbody, rows.length ? UI.table({ caption: t("Findings"), cols: [
            { label: t("Severity"), render: function (f) { return UI.badge(UI.sevLabel(f.severity), UI.sevTone(f.severity)); } },
            { label: t("Finding"), rowHeader: true, render: function (f) { return h("details", { class: "app-details" }, h("summary", null, f.title), h("dl", { class: "app-kv", style: "margin-top:8px" },
              h("dt", null, t("Evidence")), h("dd", null, f.evidence || "—"), h("dt", null, t("Source")), h("dd", null, f.source || "—"), h("dt", null, t("Verification")), h("dd", null, verBadge(f.verification)),
              h("dt", null, t("Why it matters")), h("dd", null, f.why_it_matters || "—"), h("dt", null, t("Recommended action")), h("dd", null, f.recommended_action || "—"), h("dt", null, t("How to fix")), h("dd", null, f.instructions || "—"), h("dt", null, t("Checked")), h("dd", null, F.date(f.checked_at, true)))); } },
            { label: t("Category"), key: "category" }, { label: t("Verification"), render: function (f) { return verBadge(f.verification); } },
            { label: t("Status"), render: function (f) { return statusBadge(f.status); } },
            { label: t("Actions"), render: function (f) { var x = f.status || "open"; var bs = []; if (x !== "fixed") { var b1 = UI.btn(t("Mark fixed"), { small: true, aria: t("Mark fixed: {t}", { t: f.title }) }); b1.addEventListener("click", function () { setStatus(f, "fixed", b1); }); bs.push(b1); } if (x === "open") { var b2 = UI.btn(t("Ignore"), { small: true, aria: t("Ignore: {t}", { t: f.title }) }); b2.addEventListener("click", function () { setStatus(f, "ignored", b2); }); bs.push(b2); } if (x !== "open") { var b3 = UI.btn(t("Reopen"), { small: true, aria: t("Reopen: {t}", { t: f.title }) }); b3.addEventListener("click", function () { setStatus(f, "open", b3); }); bs.push(b3); } return h("div", { class: "app-actions" }, bs); } }], rows: rows }) : UI.S.empty({ title: fs.length ? t("No findings match these filters") : t("No findings recorded"), body: fs.length ? t("Clear a filter to see more.") : t("This audit recorded no findings.") }));
        }
        var cnt = function (s) { return fs.filter(function (f) { return f.severity === s && f.status !== "fixed"; }).length; };
        var out = [
          h("div", { class: "print-only" }, h("h1", null, "LocalBoost · " + ctx.business.name), h("p", null, t("Audit of {d}", { d: F.date(a.created_at, true) }))),
          UI.pageHead(t("Audit of {d}", { d: F.date(a.created_at, true) }), a.website_url ? t("Website checked: {u}", { u: a.website_url }) : t("Google profile only"), [UI.btn(t("Print or save as PDF"), { onClick: function () { window.print(); } }), UI.btn(t("Export CSV"), { onClick: function () { UI.serverCsv("/api/audits/export.csv", { id: a.id }, "localboost-audit-" + F.day(a.created_at) + ".csv"); } })]),
          h("div", { class: "app-grid4" }, UI.tile({ label: t("Score"), value: typeof a.score === "number" ? a.score + "/100" : null, note: typeof a.score === "number" ? "" : t("Not enough verified data for a score") }), UI.tile({ label: t("High"), value: cnt("high"), note: t("open findings") }), UI.tile({ label: t("Medium"), value: cnt("medium"), note: t("open findings") }), UI.tile({ label: t("Low"), value: cnt("low"), note: t("open findings") })),
          a.state === "partial" ? h("div", { class: "app-banner" }, UI.badge(t("Partial audit"), "warn"), " ", t("Some checks could not run (for example no website or Google not connected). They are listed as unavailable and not scored.")) : null,
          UI.card(t("Score breakdown"), bd.length ? UI.table({ caption: t("Score breakdown"), cols: [{ label: t("Section"), key: "section", rowHeader: true }, { label: t("Weight"), num: true, render: function (r) { return F.num(r.weight, 2); } }, { label: t("Points"), num: true, render: function (r) { return r.available ? F.num(r.points) + " / " + F.num(r.max) : "—"; } }, { label: t("Checked?"), render: function (r) { return r.available ? UI.badge(t("Checked"), "ok") : UI.badge(t("Unavailable: not scored"), "neutral"); } }], rows: bd }) : UI.S.empty({ title: t("No breakdown available"), body: t("This audit did not store a section breakdown.") })),
          HOW(),
          UI.card(t("Findings"), [h("div", { class: "app-filters no-print" }, sel(t("Severity"), "sev", [["high", t("High")], ["medium", t("Medium")], ["low", t("Low")]]), sel(t("Category"), "cat", cats.map(function (c) { return [c, c]; })), sel(t("Status"), "st", [["open", t("Open")], ["fixed", t("Fixed")], ["ignored", t("Ignored")]]), UI.field(t("Search"), q)), count, tbody]),
          UI.card(t("30-day plan"), (function () { var pb = h("div"); UI.load(pb, function () { return api.get("/api/audits/plan", { audit_id: a.id, business_id: ctx.bid }); }, function (p) { var it = LB.planItems(p); return it.length ? [h("ol", { class: "app-list" }, it.slice(0, 10).map(function (x) { return h("li", { class: "app-item" }, h("strong", null, t("Day {n}", { n: x.day }) + ": " + x.title)); })), h("p", null, UI.btn(t("Open full plan"), { href: LB.href("growth-plan/") }))] : UI.S.empty({ title: t("No plan yet"), body: t("The plan is generated from the findings of this audit.") }); }); return pb; })())
        ];
        setTimeout(draw, 0);
        return out;
      }
      if (id) load(id);
      else UI.load(wrap, function () { return api.get("/api/audits", { business_id: ctx.bid }); }, function (d) { var a = LB.latest(d.audits); if (!a) return UI.S.empty({ title: t("No audits yet"), body: t("Run an audit first."), actions: [UI.btn(t("Go to audits"), { kind: "primary", href: LB.href("audit/") })] }); load(a.id); return UI.skeleton(3); });
    } });
  };

  P.plan = function () {
    LB.boot({ title: t("30-day plan"), noHead: true, render: function (body, ctx) {
      body.appendChild(UI.pageHead(t("30-day plan"), t("A day-by-day list built from the findings of your latest audit."), UI.btn(t("Print or save as PDF"), { onClick: function () { window.print(); } })));
      var box = h("div"); body.appendChild(box);
      UI.load(box, function () { return api.get("/api/audits", { business_id: ctx.bid }).then(function (d) { var a = LB.latest(d.audits); if (!a) return { none: true }; return api.get("/api/audits/plan", { audit_id: a.id, business_id: ctx.bid }).then(function (p) { return { a: a, p: p }; }); }); }, function (r) {
        if (r.none) return UI.S.empty({ title: t("No audit yet"), body: t("Your plan is created from an audit. Run your first audit to get one."), actions: [UI.btn(t("Run an audit"), { kind: "primary", href: LB.href("audit/") })] });
        var items = LB.planItems(r.p); if (!items.length) return UI.S.empty({ title: t("The plan is empty"), body: t("The latest audit did not produce any tasks. Run a new audit after changing your profile.") });
        var weeks = {}; items.forEach(function (x) { var w = Math.min(5, Math.ceil(x.day / 7)); (weeks[w] = weeks[w] || []).push(x); });
        return Object.keys(weeks).map(function (w) { return UI.card(t("Week {n}", { n: w }), h("ol", { class: "app-list" }, weeks[w].map(function (x) {
          var li = h("li", { class: "app-item" }, h("h3", { class: "app-h3" }, t("Day {n}", { n: x.day }) + ": " + x.title), x.category ? UI.badge(x.category, "info") : null, " ", x.status === "fixed" || x.status === "done" ? UI.badge(t("Done"), "ok") : null, x.description ? h("p", null, x.description) : null);
          if (x.finding_id && x.status !== "fixed" && x.status !== "done") { var b = UI.btn(t("Mark done"), { small: true, aria: t("Mark done: {t}", { t: x.title }) }); b.className += " no-print"; b.addEventListener("click", function () { UI.act(b, function () { return api.post("/api/audits/finding-status", { finding_id: x.finding_id, status: "fixed" }).then(function () { b.replaceWith(UI.badge(t("Done"), "ok")); }); }, t("Marked as fixed")); }); li.appendChild(b); }
          return li; }))); });
      });
    } });
  };

  P.actions = function () {
    LB.boot({ title: t("Action centre"), lead: t("Things to fix, in priority order. Items are created from your audits."), render: function (body, ctx) {
      var box = h("div"); body.appendChild(box);
      UI.load(box, function () { return api.get("/api/action-center", { business_id: ctx.bid }); }, function (d) {
        var a = d.actions || []; if (!a.length) return UI.S.empty({ title: t("No actions yet"), body: t("Actions are created when you run a profile audit."), actions: [UI.btn(t("Run an audit"), { kind: "primary", href: LB.href("audit/") })] });
        return ["high", "medium", "low"].map(function (p) { var l = a.filter(function (x) { return x.priority === p; }); return l.length ? UI.card(UI.sevLabel(p) + " " + t("priority"), h("ul", { class: "app-list" }, l.map(function (x) { return h("li", { class: "app-item" }, UI.badge(UI.sevLabel(p), UI.sevTone(p)), " ", h("strong", null, x.title), " ", statusBadge(x.status === "pending" ? "open" : x.status === "completed" ? "fixed" : x.status), x.instructions ? h("p", { class: "app-hint" }, x.instructions) : null); }))) : null; });
      });
    } });
  };

  P.score = function () {
    LB.boot({ title: t("Visibility score"), lead: t("One number built from the parts that could be verified. Missing parts are left out, never filled with guesses."), render: function (body, ctx) {
      var box = h("div"); body.appendChild(box);
      UI.load(box, function () { return api.get("/api/score", { business_id: ctx.bid }); }, function (d) {
        if (d.score == null) return UI.stateFor(d.state, { google: {} }) || UI.S.empty({ title: t("No score yet"), body: t("A score needs verified data: a linked Google location, scans or reviews. Complete the setup guide to get one."), actions: [UI.btn(t("Open setup guide"), { kind: "primary", href: LB.href("onboarding/") })] });
        var checks = (d.profile_signals && d.profile_signals.checks) || [];
        return [UI.card(t("Your score"), h("div", { class: "app-row" }, h("div", null, h("div", { class: "app-score" }, d.score, h("small", { class: "app-hint" }, " / 100")), h("p", { class: "app-hint" }, t("Average of {n} verified component(s).", { n: (d.components || []).length }))), h("div", { style: "flex:1 1 280px" }, UI.barChart({ title: t("Components"), bars: (d.components || []).map(function (c) { return { label: c.name, value: c.value }; }) })))),
          checks.length ? UI.card(t("Profile checks"), UI.table({ caption: t("Profile checks"), cols: [{ label: t("Check"), key: "label", rowHeader: true }, { label: t("Severity"), render: function (c) { return UI.badge(UI.sevLabel(c.severity), UI.sevTone(c.severity)); } }, { label: t("Result"), render: function (c) { return c.present ? UI.badge(t("Present"), "ok") : UI.badge(t("Missing"), "bad"); } }], rows: checks })) : null,
          HOW()];
      });
    } });
  };
  LB.start(P);
})();
