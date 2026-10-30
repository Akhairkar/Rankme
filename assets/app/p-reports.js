/* Reports and monitoring. */
(function () {
  "use strict";
  var LB = window.LB, t = LB.t, UI = LB.ui, h = UI.h, F = LB.fmt, api = LB.api;
  var P = {};

  P.reports = function () {
    LB.boot({ title: t("Reports"), noHead: true, render: function (body, ctx) {
      var box = h("div"), days = UI.select([[7, t("Last 7 days (weekly)")], [30, t("Last 30 days (monthly)")], [90, t("Last 90 days")]], 30, { "aria-label": t("Period") });
      body.appendChild(UI.pageHead(t("Reports"), t("A summary of your stored data for the period. Only real, stored measurements are included."), h("div", { class: "app-actions" }, days, UI.btn(t("Print or save as PDF"), { onClick: function () { window.print(); } }))));
      body.appendChild(box);
      var data = null;
      function render() {
        var d = data, since = Date.now() - days.value * 86400000, inP = function (v) { return (F.ms(v) || 0) >= since; };
        var snaps = (d.rank_snapshots || []).filter(function (s) { return inP(s.checked_at); }), perf = (d.performance_history || []).filter(function (p) { return inP(p.checked_at); }), rv = d.reviews || {};
        var sum = function (k) { var v = perf.filter(function (p) { return typeof p[k] === "number"; }); return v.length ? v.reduce(function (a, p) { return a + p[k]; }, 0) : null; };
        var found = snaps.filter(function (s) { return typeof s.position === "number"; });
        var out = [h("div", { class: "print-only" }, h("h1", null, "LocalBoost · " + ctx.business.name), h("p", null, t("Report for the last {n} days, created {d}", { n: days.value, d: F.date(Date.now()) }))),
          h("div", { class: "app-grid4" }, UI.tile({ label: t("Audit score"), value: d.audit && typeof d.audit.score === "number" ? d.audit.score + "/100" : null, note: d.audit ? F.date(d.audit.created_at) : t("No audit yet") }), UI.tile({ label: t("Reviews stored"), value: rv.count || null, note: rv.average_rating ? t("Average {r}", { r: F.num(Number(rv.average_rating), 2) }) : "" }), UI.tile({ label: t("Rank measurements"), value: snaps.length || null, note: snaps.length ? t("{n} with a found position", { n: found.length }) : t("None in this period") }), UI.tile({ label: t("Profile impressions"), value: sum("impressions") === null ? null : F.num(sum("impressions"), 0), note: t("Sum for the period") }))];
        out.push(UI.card(t("Google profile activity"), perf.length ? UI.table({ caption: t("Profile activity"), cols: [{ label: t("Date"), rowHeader: true, render: function (p) { return F.date(p.checked_at); } }, { label: t("Impressions"), num: true, render: function (p) { return F.num(p.impressions, 0); } }, { label: t("Website clicks"), num: true, render: function (p) { return F.num(p.website_clicks, 0); } }, { label: t("Calls"), num: true, render: function (p) { return F.num(p.call_clicks, 0); } }, { label: t("Directions"), num: true, render: function (p) { return F.num(p.direction_requests, 0); } }], rows: perf }) : UI.S.empty({ title: t("No profile activity in this period"), body: t("Sync Google performance data to include it here."), actions: [UI.btn(t("Open Google performance"), { href: LB.href("visibility.html") })] })));
        out.push(UI.card(t("Rank measurements"), snaps.length ? UI.table({ caption: t("Rank measurements"), cols: [{ label: t("Keyword"), key: "keyword", rowHeader: true }, { label: t("Area"), key: "location_name" }, { label: t("Date"), render: function (s) { return F.date(s.checked_at); } }, { label: t("Position"), num: true, render: function (s) { return typeof s.position === "number" ? s.position : t("Not found"); } }], rows: snaps.slice(0, 100) }) : UI.S.empty({ title: t("No rank measurements in this period"), body: t("Run a rank scan to add measurements."), actions: [UI.btn(t("Open rank tracking"), { href: LB.href("rank-tracking.html") })] })));
        var iss = (d.issues || []).filter(function (i) { return i.status !== "fixed"; });
        out.push(UI.card(t("Open audit issues"), iss.length ? UI.table({ caption: t("Open audit issues"), cols: [{ label: t("Severity"), render: function (i) { return UI.badge(UI.sevLabel(i.severity), UI.sevTone(i.severity)); } }, { label: t("Issue"), rowHeader: true, render: function (i) { return i.title || i.message || i.code; } }], rows: iss.slice(0, 50) }) : UI.S.empty({ title: t("No open issues recorded"), body: t("Issues come from your latest audit.") })));
        out.push(h("p", { class: "app-actions no-print" }, UI.btn(t("Export CSV"), { onClick: function () { UI.csv("localboost-report-" + F.day(Date.now()) + ".csv", [["type", "date", "keyword", "value"]].concat(snaps.map(function (s) { return ["rank", F.day(s.checked_at), s.keyword, typeof s.position === "number" ? s.position : "not found"]; }), perf.map(function (p) { return ["impressions", F.day(p.checked_at), "", p.impressions]; }))); } })));
        UI.mount(box, out);
      }
      days.addEventListener("change", function () { if (data) render(); });
      UI.load(box, function () { return api.get("/api/reports/overview", { business_id: ctx.bid }); }, function (d) { data = d; setTimeout(render, 0); return UI.skeleton(2); });
    } });
  };

  P.monitoring = function () {
    LB.boot({ title: t("Monitoring"), lead: t("Changes and events detected for your business."), render: function (body, ctx) {
      var box = h("div"); body.appendChild(box);
      UI.load(box, function () { return api.get("/api/monitoring", { business_id: ctx.bid }); }, function (d) {
        var ev = d.events || []; if (!ev.length) return UI.S.empty({ title: t("No events yet"), body: t("Events such as rating changes or profile edits appear here when they are detected.") });
        return UI.card(t("Events"), UI.table({ caption: t("Monitoring events"), cols: [{ label: t("Detected"), rowHeader: true, render: function (e) { return F.date(e.detected_at, true); } }, { label: t("Severity"), render: function (e) { return UI.badge(UI.sevLabel(e.severity) || e.severity, UI.sevTone(e.severity)); } }, { label: t("Event"), render: function (e) { return [h("strong", null, e.title), e.detail ? h("div", { class: "app-hint" }, e.detail) : null]; } }, { label: t("Status"), key: "status" }], rows: ev }));
      });
    } });
  };
  LB.start(P);
})();
