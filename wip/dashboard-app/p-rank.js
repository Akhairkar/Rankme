/* Rank tracking, Search Console, competitors, Google performance. */
(function () {
  "use strict";
  var LB = window.LB, t = LB.t, UI = LB.ui, h = UI.h, F = LB.fmt, api = LB.api;
  var P = {};

  /* ================= rank tracking ================= */
  P.rank = function () {
    LB.boot({ title: t("Rank tracking"), noHead: true, render: function (body, ctx) {
      var B = { business_id: ctx.bid }, kwBox = h("div"), scanBox = h("div"), histBox = h("div"), detailBox = h("div"), trendBox = h("div"), cur = { kw: null, kws: [] };
      body.appendChild(UI.pageHead(t("Rank tracking"), t("See where your business appears on Google Maps around your location, keyword by keyword.")));
      body.appendChild(h("div", { class: "app-banner", role: "note" }, h("strong", null, t("About these numbers: ")), t("Real measurements come from a licensed rank-data provider. Search Console position is a different metric (an average across searches) and is shown separately. No position is ever estimated or filled in.")));
      body.appendChild(kwBox); body.appendChild(scanBox); body.appendChild(detailBox); body.appendChild(trendBox); body.appendChild(histBox);

      function loadKeywords() {
        UI.load(kwBox, function () { return api.get("/api/keywords", B); }, function (d) {
          cur.kws = (d.keywords || []).filter(function (k) { return k.active !== 0; });
          if (!cur.kw || !cur.kws.some(function (k) { return k.id === cur.kw; })) cur.kw = cur.kws[0] ? cur.kws[0].id : null;
          var addBox = h("div"), lim = ctx.ent ? ctx.ent.max_keywords : null;
          UI.mount(addBox, LB.forms.keyword(function (k) { return api.post("/api/keywords", Object.assign({ business_id: ctx.bid }, k)).then(loadKeywords, function (e) { if (api.isUpgrade(e)) UI.mount(addBox, UI.S.upgrade(e)); throw e; }); }));
          var table = cur.kws.length ? UI.table({ caption: t("Tracked keywords"), cols: [
            { label: t("Selected"), render: function (k) { return h("input", { type: "radio", name: "kwsel", checked: k.id === cur.kw, "aria-label": t("Select keyword {k}", { k: k.keyword }), onchange: function () { cur.kw = k.id; drawScan(); loadHistory(); } }); } },
            { label: t("Keyword"), key: "keyword", rowHeader: true }, { label: t("Target area"), key: "location_name" }, { label: t("Device"), key: "device" }, { label: t("Added"), render: function (k) { return F.date(k.created_at); } }], rows: cur.kws }) : UI.S.empty({ title: t("No keywords yet"), body: t("Add a keyword and target area to start. Then run a grid scan to see where you appear on the map."), });
          setTimeout(function () { drawScan(); loadHistory(); }, 0);
          return UI.card(t("Keywords"), [lim ? h("p", { class: "app-hint" }, t("{n} of {m} keywords used.", { n: cur.kws.length, m: lim })) : null, table, h("h3", { class: "app-h3", style: "margin-top:16px" }, t("Add a keyword")), addBox, h("p", { class: "app-hint" }, t("Removing keywords is not available yet."))]);
        });
      }
      function drawScan() {
        if (!cur.kw) { UI.mount(scanBox, null); return; }
        var kw = cur.kws.filter(function (k) { return k.id === cur.kw; })[0];
        var grid = UI.select([[3, "3 × 3"], [5, "5 × 5"], [7, "7 × 7"]], 3, { name: "grid" }), rad = UI.select([[1000, "1 km"], [2000, "2 km"], [3000, "3 km"], [5000, "5 km"], [10000, "10 km"]], 3000, { name: "radius" }), out = h("div", { "aria-live": "polite" });
        var go = UI.btn(t("Start grid scan"), { kind: "primary" });
        go.addEventListener("click", function () {
          UI.mount(out, null);
          UI.act(go, function () { return api.post("/api/rank/scans", { business_id: ctx.bid, keyword_id: cur.kw, grid_size: +grid.value, radius_m: +rad.value }, null, { timeout: 120000 }).then(function (r) {
            if (r.state === "awaiting_rank_provider") { UI.mount(out, UI.stateFor("awaiting_rank_provider")); return; }
            if (r.state === "provider_error") { UI.mount(out, UI.S.provider({ title: t("The rank provider returned an error"), body: t("No positions were stored for this scan. Try again later."), retry: function () { go.click(); } })); return; }
            UI.mount(out, h("p", null, UI.badge(r.state === "partial" ? t("Partial scan: some points failed") : t("Scan complete"), r.state === "partial" ? "warn" : "ok"), " ", t("{n} point(s) measured.", { n: r.points })));
            loadHistory(); showScan(r.scan_id);
          }, function (e) { UI.mount(out, UI.fromError(e, { retry: function () { go.click(); } })); throw e; }); });
        });
        UI.mount(scanBox, UI.card(t("Run a grid scan for “{k}”", { k: kw ? kw.keyword : "" }), [h("div", { class: "app-row" }, UI.field(t("Grid size"), grid, t("More points, more detail")), UI.field(t("Radius"), rad, t("Distance from the centre to the edge")), h("div", { class: "app-field", style: "flex:0 0 auto" }, go)), out,
          h("p", { class: "app-hint" }, t("Scheduled scans are not available yet. Run a scan manually whenever you want a new measurement."))]));
      }
      function showScan(id) {
        UI.load(detailBox, function () { return api.get("/api/rank/scans/detail", { id: id }); }, function (d) {
          var pts = d.points || [], size = d.scan && d.scan.grid_size || Math.round(Math.sqrt(pts.length)) || 3, found = pts.filter(function (p) { return typeof p.position === "number"; }).length;
          return UI.card(t("Scan from {d}", { d: F.date(d.scan && d.scan.created_at, true) }), [
            h("div", { class: "app-grid3" }, UI.tile({ label: t("Average position"), value: d.avg_position == null ? null : F.num(d.avg_position), note: d.avg_position == null ? t("Not found at any point") : t("Lower is better") }), UI.tile({ label: t("Visibility"), value: d.visibility == null ? null : (d.visibility <= 1 ? F.pct(d.visibility, 0) : F.num(d.visibility) + "%"), note: t("{n} of {m} points found you", { n: found, m: pts.length }) }), UI.tile({ label: t("State"), value: d.scan && d.scan.state || "—", note: pts[0] && pts[0].provider ? t("Provider: {p}", { p: pts[0].provider }) : "" })),
            pts.length ? UI.rankGrid(pts, size, t("Rank grid, {s} by {s} points", { s: size })) : UI.S.empty({ title: t("No points stored"), body: t("This scan has no measured points.") }),
            h("p", { class: "app-actions" }, UI.btn(t("Export CSV"), { onClick: function () { UI.serverCsv("/api/rank/export.csv", { scan_id: id }, "localboost-rank-scan-" + id + ".csv"); } }))]);
        });
        detailBox.scrollIntoView({ block: "nearest" });
      }
      function loadHistory() {
        if (!cur.kw) { UI.mount(histBox, null); UI.mount(trendBox, null); return; }
        var q = { business_id: ctx.bid, keyword_id: cur.kw };
        UI.load(trendBox, function () { return api.get("/api/rank/history", q); }, function (d) {
          var hs = (d.history || []), pos = hs.map(function (x) { return { x: F.day(x.date), y: typeof x.avg_position === "number" ? x.avg_position : null }; });
          if (pos.filter(function (p) { return p.y !== null; }).length < 2) return UI.card(t("Trend"), UI.S.empty({ title: t("Not enough scans for a trend"), body: t("A trend needs at least two completed scans with a measured position.") }));
          return UI.card(t("Trend"), UI.lineChart({ title: t("Average position over time"), points: pos, invert: true, yLabel: t("Average position") }));
        });
        UI.load(histBox, function () { return api.get("/api/rank/scans", q); }, function (d) {
          var sc = d.scans || [];
          return UI.card(t("Scan history"), sc.length ? UI.table({ caption: t("Scan history"), cols: [{ label: t("Date"), rowHeader: true, render: function (s) { return F.date(s.created_at, true); } }, { label: t("Grid"), render: function (s) { return s.grid_size + "×" + s.grid_size; } }, { label: t("Radius"), render: function (s) { return F.num(s.radius_m / 1000) + " km"; } }, { label: t("Avg position"), num: true, render: function (s) { return s.avg_position == null ? t("Not found") : F.num(s.avg_position); } }, { label: t("State"), render: function (s) { return s.state === "completed" ? UI.badge(t("Completed"), "ok") : s.state === "partial" ? UI.badge(t("Partial"), "warn") : UI.badge(s.state, "neutral"); } }, { label: "", render: function (s) { return UI.btn(t("View"), { small: true, onClick: function () { showScan(s.id); }, aria: t("View scan from {d}", { d: F.date(s.created_at) }) }); } }], rows: sc }) : UI.S.empty({ title: t("No scans yet"), body: t("Run your first grid scan above. Results are saved here.") }));
        });
      }
      loadKeywords();
    } });
  };

  /* ================= Search Console ================= */
  function aggregate(rows, key) {
    var m = {};
    rows.forEach(function (r) {
      var k = r[key]; if (!k) return; var o = m[k] || (m[k] = { key: k, clicks: 0, impressions: 0, pw: 0, first: { c: 0, i: 0, has: false }, second: { c: 0, i: 0, has: false } });
      o.clicks += r.clicks || 0; o.impressions += r.impressions || 0; o.pw += (r.position || 0) * (r.impressions || 0); r.__a = o;
    });
    return Object.keys(m).map(function (k) { var o = m[k]; o.ctr = o.impressions ? o.clicks / o.impressions : null; o.position = o.impressions ? o.pw / o.impressions : null; return o; });
  }
  P.gsc = function () {
    LB.boot({ title: t("Search Console"), lead: t("Real queries and pages from Google Search Console. Opportunities are calculated in your browser from the rows shown."), render: function (body, ctx) {
      var B = { business_id: ctx.bid }, top = h("div"), data = h("div");
      body.appendChild(h("div", { class: "app-banner", role: "note" }, t("Search Console “position” is the average rank across all searches and places. It is not the same as a Google Maps grid rank, so the two are never mixed.")));
      body.appendChild(top); body.appendChild(data);
      function load() {
        UI.load(data, function () { return api.get("/api/search-console", B); }, function (d) {
          var props = d.properties || [], rows = d.metrics || [];
          var head = UI.card(t("Property"), [props.length ? h("p", null, UI.badge(t("Property selected"), "ok"), " ", props[0].property_url, props[0].last_synced_at ? " · " + t("synced {d}", { d: F.ago(props[0].last_synced_at) }) : "") : h("p", null, UI.badge(t("No property selected"), "warn")),
            h("div", { class: "app-actions" }, UI.btn(props.length ? t("Change property") : t("Choose property"), { onClick: function () { picker(); } }), UI.btn(t("Connect Search Console"), { href: api.signInUrl({ scope: "search_console", return: LB.href("search-console.html") }) }), props.length ? (function () { var b = UI.btn(t("Sync now"), { onClick: function () { UI.act(b, function () { return api.post("/api/search-console/sync", {}, B).then(function (r) { if (r.state && r.state !== "verified_data" && r.state !== "completed") UI.toast(t("Sync state: {s}", { s: r.state }), "info"); load(); }); }, t("Sync finished")); } }); return b; })() : null)]);
          if (!rows.length) return [head, UI.stateFor(d.state === "connected" ? "" : d.state, { empty: { title: t("No Search Console data yet"), body: t("Choose a property and sync. Data appears after Google returns rows for your site.") } }) || UI.S.empty({ title: t("No Search Console data yet"), body: t("Choose a property and sync. Data appears after Google returns rows for your site.") })];
          return [head].concat(view(rows));
        });
      }
      function picker() {
        UI.load(top, function () { return api.get("/api/search-console/properties", B); }, function (d) {
          var st = UI.stateFor(d.state === "verified_data" || d.state === "connected" ? "" : d.state);
          if (st && !(d.properties || []).length) return UI.card(t("Choose a property"), st);
          var sel = UI.select((d.properties || []).map(function (p) { return [p.site_url, p.site_url + " (" + p.permission_level + ")"]; }), "", { name: "prop" }), b = UI.btn(t("Use this property"), { kind: "primary" });
          b.addEventListener("click", function () { UI.act(b, function () { return api.post("/api/search-console/select", { business_id: ctx.bid, site_url: sel.value }).then(function () { UI.clear(top); load(); }); }, t("Property saved")); });
          return UI.card(t("Choose a property"), [UI.field(t("Verified sites in your Google account"), sel), h("p", null, b, " ", UI.btn(t("Cancel"), { onClick: function () { UI.clear(top); } }))]);
        });
      }
      function view(rows) {
        var dateOnly = rows.filter(function (r) { return !r.query_text && !r.page_url; }), qRows = rows.filter(function (r) { return r.query_text; }), pRows = rows.filter(function (r) { return r.page_url && !r.query_text; });
        var trendRows = dateOnly.length ? dateOnly : qRows.length ? qRows : pRows, byDate = {};
        trendRows.forEach(function (r) { var d = F.day(r.date); var o = byDate[d] || (byDate[d] = { c: 0, i: 0 }); o.c += r.clicks || 0; o.i += r.impressions || 0; });
        var days = Object.keys(byDate).sort();
        var out = [];
        if (days.length >= 2) out.push(UI.card(t("Clicks and impressions"), [UI.lineChart({ title: t("Clicks per day"), points: days.map(function (d) { return { x: d, y: byDate[d].c }; }), yLabel: t("Clicks") }), UI.lineChart({ title: t("Impressions per day"), points: days.map(function (d) { return { x: d, y: byDate[d].i }; }), yLabel: t("Impressions") })]));
        else out.push(UI.card(t("Trend"), UI.S.empty({ title: t("Not enough days for a trend"), body: t("A trend needs data for at least two days.") })));
        var tot = trendRows.reduce(function (a, r) { a.c += r.clicks || 0; a.i += r.impressions || 0; return a; }, { c: 0, i: 0 });
        out.unshift(h("div", { class: "app-grid3" }, UI.tile({ label: t("Clicks"), value: F.num(tot.c, 0) }), UI.tile({ label: t("Impressions"), value: F.num(tot.i, 0) }), UI.tile({ label: t("Click-through rate"), value: tot.i ? F.pct(tot.c / tot.i) : null })));
        if (qRows.length) {
          var dates = qRows.map(function (r) { return F.ms(r.date); }).filter(Boolean).sort(), mid = dates.length ? dates[Math.floor(dates.length / 2)] : null;
          var qs = aggregate(qRows, "query_text");
          qRows.forEach(function (r) { var o = r.__a, half = F.ms(r.date) < mid ? o.first : o.second; half.c += r.clicks || 0; half.i += r.impressions || 0; half.has = true; });
          var sortedI = qs.map(function (q) { return q.impressions; }).sort(function (a, b) { return a - b; }), p75 = sortedI[Math.floor(sortedI.length * 0.75)] || 0, med = sortedI[Math.floor(sortedI.length / 2)] || 0, overall = tot.i ? tot.c / tot.i : 0;
          var low = qs.filter(function (q) { return q.impressions >= p75 && q.impressions > 0 && q.ctr !== null && q.ctr < overall * 0.7; }).sort(function (a, b) { return b.impressions - a.impressions; }).slice(0, 10);
          var near = qs.filter(function (q) { return q.position >= 4 && q.position <= 20 && q.impressions >= med; }).sort(function (a, b) { return b.impressions - a.impressions; }).slice(0, 10);
          var dec = qs.filter(function (q) { return q.first.has && q.second.has && q.first.c >= 5 && q.second.c < q.first.c * 0.7; }).sort(function (a, b) { return (b.first.c - b.second.c) - (a.first.c - a.second.c); }).slice(0, 10);
          var cols = [{ label: t("Query"), key: "key", rowHeader: true }, { label: t("Clicks"), num: true, render: function (q) { return F.num(q.clicks, 0); } }, { label: t("Impressions"), num: true, render: function (q) { return F.num(q.impressions, 0); } }, { label: "CTR", num: true, render: function (q) { return F.pct(q.ctr); } }, { label: t("Avg position"), num: true, render: function (q) { return F.num(q.position); } }];
          var opp = function (title, why, list, extra) { return h("div", null, h("h3", { class: "app-h3" }, title), h("p", { class: "app-hint" }, why), list.length ? UI.table({ caption: title, cols: extra || cols, rows: list }) : h("p", { class: "app-hint" }, t("None found in the rows returned."))); };
          out.push(UI.card(t("Opportunities"), h("div", { class: "app-stack" }, opp(t("High impressions, low click-through"), t("Queries in the top quarter by impressions whose CTR is under 70% of your overall CTR. Improve titles, descriptions and your Business Profile for these."), low), opp(t("Close to the top"), t("Queries averaging position 4-20 with above-median impressions. Small improvements can move them onto page one."), near), opp(t("Declining queries"), t("Queries whose clicks in the later half of the period fell by 30% or more versus the earlier half (minimum 5 earlier clicks)."), dec, cols.concat([{ label: t("Clicks before → after"), render: function (q) { return q.first.c + " → " + q.second.c; } }])))));
          var sorted = qs.slice().sort(function (a, b) { return b.clicks - a.clicks || b.impressions - a.impressions; });
          out.push(UI.card(t("Queries"), [UI.table({ caption: t("Top queries"), cols: cols, rows: sorted.slice(0, 50) }), h("p", { class: "app-actions" }, UI.btn(t("Export CSV"), { onClick: function () { UI.csv("search-console-queries.csv", [["query", "clicks", "impressions", "ctr", "position"]].concat(sorted.map(function (q) { return [q.key, q.clicks, q.impressions, q.ctr, q.position]; }))); } }))]));
        } else out.push(UI.card(t("Queries"), UI.S.empty({ title: t("No query-level rows"), body: t("The stored data has no query breakdown yet.") })));
        if (pRows.length) { var ps = aggregate(pRows, "page_url").sort(function (a, b) { return b.clicks - a.clicks; }); out.push(UI.card(t("Pages"), [UI.table({ caption: t("Top pages"), cols: [{ label: t("Page"), key: "key", rowHeader: true }, { label: t("Clicks"), num: true, render: function (q) { return F.num(q.clicks, 0); } }, { label: t("Impressions"), num: true, render: function (q) { return F.num(q.impressions, 0); } }, { label: "CTR", num: true, render: function (q) { return F.pct(q.ctr); } }, { label: t("Avg position"), num: true, render: function (q) { return F.num(q.position); } }], rows: ps.slice(0, 50) }), h("p", { class: "app-actions" }, UI.btn(t("Export CSV"), { onClick: function () { UI.csv("search-console-pages.csv", [["page", "clicks", "impressions", "ctr", "position"]].concat(ps.map(function (q) { return [q.key, q.clicks, q.impressions, q.ctr, q.position]; }))); } }))])); }
        return out;
      }
      load();
    } });
  };

  /* ================= competitors ================= */
  P.competitors = function () {
    LB.boot({ title: t("Competitors"), lead: t("Track nearby businesses you compete with. Their position appears only when a rank provider has measured it."), render: function (body, ctx) {
      var B = { business_id: ctx.bid }, box = h("div"), addBox = h("div");
      body.appendChild(addBox); body.appendChild(box);
      function load() {
        UI.load(box, function () { return api.get("/api/competitors/ranks", B).catch(function (e) { if (api.isUpgrade(e) || e.status === 401) throw e; return api.get("/api/competitors", B); }); }, function (d) {
          var rows = d.competitors || [];
          var name = h("input", { name: "name", maxlength: 160, required: true }), site = h("input", { name: "website", maxlength: 500, placeholder: "https://" }), b = UI.btn(t("Add competitor"), { kind: "primary", type: "submit" });
          var f = h("form", { class: "app-row", novalidate: true, onsubmit: function (e) {
            e.preventDefault(); var m = LB.val.required(name.value, 2), u = LB.val.url(site.value); UI.setFieldError(name, m ? t("Enter the competitor's business name.") : ""); UI.setFieldError(site, u); if (m || u) return (m ? name : site).focus();
            UI.act(b, function () { return api.post("/api/competitors", { business_id: ctx.bid, name: name.value.trim(), website_url: LB.val.normUrl(site.value) || undefined }).then(load); }, t("Competitor added"));
          } }, UI.field(t("Business name"), name), UI.field(t("Website (optional)"), site), h("div", { class: "app-field", style: "flex:0 0 auto" }, b));
          UI.mount(addBox, UI.card(t("Add a competitor"), f));
          if (!rows.length) return UI.S.empty({ title: t("No competitors yet"), body: t("Add the businesses that show up above you in local search.") });
          return UI.card(t("Competitors"), UI.table({ caption: t("Competitors"), cols: [{ label: t("Name"), key: "name", rowHeader: true }, { label: t("Website"), render: function (c) { return c.website_url ? h("a", { href: c.website_url, rel: "noopener nofollow", target: "_blank" }, c.website_url) : "—"; } }, { label: t("Average position"), num: true, render: function (c) { return c.average_position == null ? t("Not measured") : F.num(c.average_position); } }, { label: t("Measurements"), num: true, render: function (c) { return c.measurements == null ? "—" : c.measurements; } }, { label: t("Last checked"), render: function (c) { return c.last_checked_at ? F.date(c.last_checked_at) : "—"; } }], rows: rows }));
        });
      }
      load();
    } });
  };

  /* ================= Google performance ================= */
  P.performance = function () {
    LB.boot({ title: t("Google performance"), lead: t("How people interact with your Business Profile: impressions, website clicks, calls and direction requests, from Google."), render: function (body, ctx) {
      var B = { business_id: ctx.bid }, box = h("div"), sync = UI.btn(t("Sync from Google"));
      sync.addEventListener("click", function () { UI.act(sync, function () { return api.post("/api/performance/sync", {}, B).then(function (r) { if (r.state && r.state !== "verified_data") UI.toast(t("Sync state: {s}", { s: r.state }), "info"); load(); }); }, t("Sync finished")); });
      body.appendChild(h("p", { class: "app-actions" }, sync)); body.appendChild(box);
      var F2 = [["impressions", t("Impressions")], ["website_clicks", t("Website clicks")], ["call_clicks", t("Calls")], ["direction_requests", t("Direction requests")], ["search_keyword_impressions", t("Search keyword impressions")]];
      function load() {
        UI.load(box, function () { return Promise.all([api.get("/api/performance", B), api.get("/api/performance/history", B)]); }, function (r) {
          var d = r[0], hist = r[1], st = UI.stateFor(d.state === "verified_data" ? "" : d.state);
          if (st) return st;
          var m = d.metrics || {}, rows = (hist.metrics || []).slice().sort(function (a, b) { return F.ms(a.checked_at) - F.ms(b.checked_at); });
          return [h("div", { class: "app-grid4" }, F2.slice(0, 4).map(function (f) { return UI.tile({ label: f[1], value: m[f[0]] == null ? null : F.num(m[f[0]], 0), note: d.checked_at ? t("As of {d}", { d: F.date(d.checked_at) }) : "" }); })),
            rows.length >= 2 ? F2.slice(0, 4).map(function (f) { var pts = rows.map(function (x) { return { x: F.day(x.checked_at), y: typeof x[f[0]] === "number" ? x[f[0]] : null }; }); return pts.filter(function (p) { return p.y !== null; }).length >= 2 ? UI.card(f[1], UI.lineChart({ title: f[1], points: pts, yLabel: f[1] })) : null; }) : UI.card(t("Trend"), UI.S.empty({ title: t("Not enough history for a trend"), body: t("Trends need at least two synced snapshots.") }))];
        });
      }
      load();
    } });
  };
  LB.start(P);
})();
