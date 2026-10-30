/* Overview and onboarding wizard. */
(function () {
  "use strict";
  var LB = window.LB, t = LB.t, UI = LB.ui, h = UI.h, F = LB.fmt, api = LB.api;
  var P = {};

  function liveTile(label, href, promise, fmt) {
    var holder = h("div");
    UI.mount(holder, h("div", { class: "app-tile" }, h("span", { class: "app-tile-l" }, label), UI.skeleton(1)));
    promise.then(function (d) { var r = fmt(d); UI.mount(holder, UI.tile({ label: label, value: r.value, note: r.note, href: href })); }, function (e) {
      var note = api.isUpgrade(e) ? t("Upgrade your plan to see this") : e.status === 401 ? t("Sign in again") : e.code === "api_disabled" ? t("API not connected") : t("Could not load. Open the page to retry.");
      UI.mount(holder, UI.tile({ label: label, value: null, note: note, href: href }));
    });
    return holder;
  }

  P.overview = function () {
    LB.boot({ title: t("Overview"), lead: t("Your local visibility at a glance. Every figure comes from your connected accounts and stored scans; nothing is estimated."), render: function (body, ctx) {
      var bid = ctx.bid, B = { business_id: bid };
      var pStatus = api.get("/api/google/status"), pAud = api.get("/api/audits", B), pAct = api.get("/api/action-center", B), pKw = api.get("/api/keywords", B), pRev = api.get("/api/reviews", B);
      var b = ctx.business;
      body.appendChild(h("div", { class: "app-banner" }, h("strong", null, b.name), " · ", [b.category, b.city].filter(Boolean).join(", "), " ", h("a", { href: LB.href("business.html") }, t("Edit business"))));
      body.appendChild(h("div", { class: "app-grid4" },
        liveTile(t("Google connection"), LB.href("google-profile.html"), pStatus, function (d) { return { value: d.connected ? t("Connected") : t("Not connected"), note: d.connected ? (d.last_sync_at ? t("Last sync {when}", { when: F.ago(d.last_sync_at) }) : t("Not synced yet")) : t("Connect to see real Google data") }; }),
        liveTile(t("Audit score"), LB.href("audit/"), pAud, function (d) { var a = LB.latest(d.audits); return !a ? { value: null, note: t("No audit yet. Run your first audit.") } : { value: a.score === null || a.score === undefined ? null : a.score + "/100", note: a.score == null ? t("Not enough verified data for a score") : t("Audit on {d}", { d: F.date(a.created_at) }) }; }),
        liveTile(t("Pending actions"), LB.href("action-center.html"), pAct, function (d) { var n = (d.actions || []).filter(function (x) { return x.status !== "completed" && x.status !== "done" && x.status !== "ignored"; }).length; return { value: (d.actions || []).length ? n : null, note: (d.actions || []).length ? t("Open items to fix") : t("No actions yet. Run an audit to create them.") }; }),
        liveTile(t("Tracked keywords"), LB.href("rank-tracking.html"), pKw, function (d) { var n = (d.keywords || []).filter(function (k) { return k.active !== 0; }).length; return { value: n || null, note: n ? t("Keywords being tracked") : t("Add keywords to start tracking") }; })));
      var two = h("div", { class: "app-grid2" });
      var revCard = h("div"), trend = h("div");
      pRev.then(function (d) {
        var s = d.summary || {}, st = UI.stateFor(d.state === "awaiting_verified_data" ? "" : d.state);
        UI.mount(revCard, UI.card(t("Reviews"), (d.reviews || []).length || s.count ? h("div", null, h("div", { class: "app-grid2" }, UI.tile({ label: t("Reviews stored"), value: s.count }), UI.tile({ label: t("Average rating"), value: s.average_rating ? F.num(Number(s.average_rating), 2) : null, note: s.unanswered ? t("{n} unanswered", { n: s.unanswered }) : "" })), h("p", null, UI.btn(t("Open reviews"), { href: LB.href("reviews/") }))) : (st || UI.S.empty({ title: t("No reviews stored yet"), body: t("Once your Google location is linked and reviews are fetched, a rating summary and unanswered count appear here."), actions: [UI.btn(t("Open reviews"), { href: LB.href("reviews/") })] }))));
      }, function (e) { UI.mount(revCard, UI.card(t("Reviews"), UI.fromError(e, { retry: function () { location.reload(); } }))); });
      UI.mount(revCard, UI.card(t("Reviews"), UI.skeleton(2)));
      var trendBody = h("div"); UI.mount(trend, UI.card(t("Rank trend"), trendBody, { class: "" }));
      UI.mount(trendBody, UI.skeleton(2));
      pKw.then(function (d) {
        var kws = (d.keywords || []).filter(function (k) { return k.active !== 0; });
        if (!kws.length) return UI.mount(trendBody, UI.S.empty({ title: t("No keywords tracked yet"), body: t("Add the searches your customers use, then run a scan. The trend appears after at least two real scans."), actions: [UI.btn(t("Add keywords"), { href: LB.href("rank-tracking.html"), kind: "primary" })] }));
        var sel = UI.select(kws.map(function (k) { return [k.id, k.keyword + " · " + k.location_name]; }), kws[0].id, { "aria-label": t("Keyword") });
        var chart = h("div");
        function draw() {
          UI.load(chart, function () { return api.get("/api/rank/history", { business_id: bid, keyword_id: sel.value }); }, function (r) {
            var pts = (r.history || []).map(function (x) { return { x: F.day(x.date), y: typeof x.avg_position === "number" ? x.avg_position : null }; });
            if (pts.filter(function (p) { return p.y !== null; }).length < 2) return UI.S.empty({ title: t("Not enough scans for a trend"), body: t("A trend needs at least two completed scans with a measured position."), actions: [UI.btn(t("Open rank tracking"), { href: LB.href("rank-tracking.html") })] });
            return UI.lineChart({ title: t("Average position over time"), points: pts, invert: true, yLabel: t("Average position") });
          });
        }
        sel.addEventListener("change", draw); UI.mount(trendBody, [sel, chart]); draw();
      }, function (e) { UI.mount(trendBody, UI.fromError(e, { retry: function () { location.reload(); } })); });
      two.appendChild(trend); two.appendChild(revCard); body.appendChild(two);
      var steps = h("div"); body.appendChild(UI.card(t("Next steps"), steps));
      Promise.allSettled([pStatus, pAud, pKw]).then(function (r) {
        var st = r[0].value, au = r[1].value, kw = r[2].value, items = [];
        items.push([st && st.connected, t("Connect Google Business Profile"), LB.href("google-profile.html")]);
        items.push([kw && (kw.keywords || []).length > 0, t("Add the keywords you want to rank for"), LB.href("rank-tracking.html")]);
        items.push([au && LB.latest(au.audits), t("Run your first profile audit"), LB.href("audit/")]);
        var allDone = items.every(function (i) { return i[0]; });
        UI.mount(steps, allDone ? h("p", null, UI.badge(t("Setup complete"), "ok"), " ", t("Keep an eye on the audit, reviews and rank pages.")) : h("ul", { class: "app-list" }, items.map(function (i) { return h("li", { class: "app-item" }, i[0] ? UI.badge(t("Done"), "ok") : UI.badge(t("To do"), "warn"), " ", h("a", { href: i[2] }, i[1])); }).concat([h("li", null, UI.btn(t("Open the setup guide"), { href: LB.href("onboarding/") }))])));
      });
    } });
  };

  /* ================= onboarding ================= */
  P.onboarding = function () {
    LB.boot({ title: t("Setup guide"), lead: t("Nine short steps from sign-in to your first audit. Your progress is read from your account, so you can leave and come back at any time."), needsBusiness: false, allowAnon: true, render: function (body, ctx) {
      var NAMES = [t("Sign in"), t("Business details"), t("Category and location"), t("Connect Google"), t("Choose location"), t("Keywords"), t("First audit"), t("Findings and plan"), t("Plan limits")];
      var S = { google: null, overview: null, keywords: [], audits: [], step: 1, auditResult: null }, wrap = h("div"), live = h("div", { class: "app-sr", "aria-live": "polite" });
      body.appendChild(wrap); body.appendChild(live);
      var DK = "lb_onboard_draft";
      function draft(v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(DK) || "{}"); localStorage.setItem(DK, JSON.stringify(v)); } catch (_) { return {}; } }
      function done() {
        var b = ctx.business, o = {};
        o[1] = !!(ctx.me && ctx.me.authenticated); o[2] = !!b; o[3] = !!(b && b.category && b.city);
        o[4] = !!(S.google && S.google.connected); o[5] = !!(S.overview && S.overview.connection && S.overview.connection.state === "verified_data");
        o[6] = S.keywords.length > 0; o[7] = S.audits.length > 0; o[8] = S.audits.length > 0; o[9] = false;
        return o;
      }
      function refresh() {
        if (!ctx.me || !ctx.me.authenticated) return Promise.resolve();
        var B = ctx.bid ? { business_id: ctx.bid } : null;
        return Promise.allSettled([api.get("/api/google/status"), ctx.bid ? api.get("/api/overview", B) : Promise.reject(0), ctx.bid ? api.get("/api/keywords", B) : Promise.reject(0), ctx.bid ? api.get("/api/audits", B) : Promise.reject(0)]).then(function (r) {
          S.google = r[0].value || null; S.overview = r[1].value || null; S.keywords = (r[2].value && r[2].value.keywords) || []; S.audits = (r[3].value && r[3].value.audits) || [];
          S.errs = r.map(function (x) { return x.status === "rejected" && x.reason && x.reason.__lb ? x.reason : null; });
        });
      }
      function reloadBusinesses() { return api.get("/api/businesses").then(function (r) { ctx.businesses = r.businesses || []; var act = ctx.businesses.filter(function (b) { return b.status !== "archived"; }); ctx.business = act.filter(function (b) { return b.id === ctx.bid; })[0] || act[0] || null; ctx.bid = ctx.business ? ctx.business.id : null; if (ctx.bid) LB.storeBusiness(ctx.bid); }); }
      function go(n) { S.step = n; try { history.replaceState(null, "", "#step-" + n); } catch (_) {} draw(true); }
      function first() { var d = done(); for (var i = 1; i <= 8; i++) if (!d[i]) return i; return 9; }

      function nav(n, canNext, opts) {
        opts = opts || {};
        return h("div", { class: "app-actions", style: "margin-top:18px" },
          n > 1 ? UI.btn(t("Back"), { onClick: function () { go(n - 1); } }) : null,
          opts.skip ? UI.btn(t("Skip for now"), { onClick: function () { go(n + 1); } }) : null,
          n < 9 ? UI.btn(t("Continue"), { kind: "primary", disabled: !canNext, onClick: function () { go(n + 1); } }) : UI.btn(t("Go to dashboard"), { kind: "primary", href: LB.href("index.html") }));
      }
      function yes(msg) { return h("p", null, UI.badge(msg, "ok")); }

      var V = {};
      V[1] = function () {
        var ok = ctx.me && ctx.me.authenticated;
        return [h("p", null, t("LocalBoost uses Google sign-in. We ask only for your name and email, and for permission to read your Business Profile data. We never post, reply or change anything on Google without your explicit confirmation each time.")),
          ok ? yes(t("Signed in as {e}", { e: ctx.me.user.email || ctx.me.user.name })) : UI.btn(t("Sign in with Google"), { kind: "primary", href: api.signInUrl({ return: LB.href("onboarding/") }) }), nav(1, ok)];
      };
      function bizStep(n, fields, title) {
        var b = ctx.business, d = draft(), init = Object.assign({}, d, b ? { name: b.name, category: b.category, city: b.city, phone: b.phone, website_url: b.website_url, pin_code: b.pin_code, area: b.address } : {});
        var f = LB.forms.business(init, fields), err = h("p", { class: "app-err", role: "alert" });
        var save = UI.btn(b ? t("Save and continue") : n === 2 ? t("Save and continue") : t("Create business"), { kind: "primary", type: "submit" });
        var form = h("form", { novalidate: true, onsubmit: function (e) {
          e.preventDefault(); err.textContent = ""; if (!f.validate()) return;
          var data = f.get(), merged = Object.assign({}, d, data); draft(merged);
          if (n === 2 && !b) return go(3);
          UI.act(save, function () {
            var p = b ? api.post("/api/businesses/update", Object.assign({ id: b.id }, data)) : api.post("/api/businesses", merged);
            return p.then(function (r) { if (r.business) { ctx.bid = r.business.id; LB.storeBusiness(ctx.bid); } return reloadBusinesses(); }).then(function () { return refresh(); }).then(function () { go(n + 1); }, function (e2) { if (api.isUpgrade(e2)) { err.textContent = t("Your plan allows only {n} business(es). Archive one or upgrade to add another.", { n: ctx.ent ? ctx.ent.max_businesses : 1 }); throw e2; } err.textContent = e2.message; throw e2; });
          });
        } }, f.el, err, h("div", { class: "app-actions", style: "margin-top:16px" }, UI.btn(t("Back"), { onClick: function () { go(n - 1); } }), save));
        return [h("p", { class: "app-hint" }, title), form];
      }
      V[2] = function () { return bizStep(2, ["name", "pin_code", "phone", "website_url"], t("Fields marked * are required. Phone, PIN code and website are checked before saving.")); };
      V[3] = function () { return bizStep(3, ["category", "city", "area"], t("Tell us what you do and where your customers are. This is used for audits and for the areas you track.")); };
      V[4] = function () {
        var g = S.google, box = h("div");
        if (S.errs && S.errs[0] && S.errs[0].code !== "api_disabled" && !g) box.appendChild(UI.fromError(S.errs[0], { retry: function () { refresh().then(function () { draw(); }); } }));
        else if (!g || !g.connected) box.appendChild(UI.state("google", { title: t("Google Business Profile is not connected"), body: t("Connect the Google account that manages your Business Profile. LocalBoost reads your locations, reviews and performance. It does not post or change anything without a separate confirmation."), actions: [UI.btn(t("Connect Google Business Profile"), { kind: "primary", href: api.signInUrl({ return: LB.href("onboarding/") }) })] }));
        else {
          var hasBiz = (g.scopes || []).some(function (s) { return /business\.manage/.test(s); });
          box.appendChild(h("div", null, yes(t("Connected as {e}", { e: g.email || "" })), !hasBiz ? UI.state("error", { title: t("Permission required"), body: t("Google did not grant access to your Business Profile. Reconnect and tick the Business Profile permission."), actions: [UI.btn(t("Reconnect Google"), { href: api.signInUrl({ return: LB.href("onboarding/") }) })] }) : null,
            h("p", { class: "app-hint" }, t("{n} location(s) found. Last sync: {d}", { n: g.locations || 0, d: g.last_sync_at ? F.date(g.last_sync_at, true) : t("never") })),
            (function () { var b2 = UI.btn(t("Find my locations"), { onClick: function () { UI.act(b2, function () { return api.post("/api/google/sync", {}).then(refresh).then(function () { draw(); }); }, t("Locations refreshed")); } }); return b2; })()));
        }
        return [box, nav(4, !!(g && g.connected), { skip: true })];
      };
      V[5] = function () {
        var box = h("div"), ov = S.overview;
        if (!ctx.bid) return [UI.S.nobusiness(), nav(5, false)];
        if (ov && ov.connection && ov.connection.state === "verified_data") box.appendChild(yes(t("Linked to {n}", { n: ov.connection.location || "" })));
        UI.load(box, function () { return api.get("/api/google/locations"); }, function (d) {
          var st = UI.stateFor(d.state === "verified_data" ? "" : d.state, { google: { body: t("No Google locations found yet. Connect Google and use “Find my locations”.") } });
          if (st && !(d.locations || []).length) return st;
          var name = "loc", list = h("fieldset", null, h("legend", null, t("Choose the location for this business")));
          (d.locations || []).forEach(function (l, i) { var x = LB.locTitle(l); var id = "loc" + i; list.appendChild(h("div", { class: "app-check" }, h("input", { type: "radio", name: name, id: id, value: l.resource_name, checked: ov && ov.connection && ov.connection.location === x.title }), h("label", { for: id }, h("strong", null, x.title), x.address ? h("div", { class: "app-hint" }, x.address) : null))); });
          var btn = UI.btn(t("Link this location"), { kind: "primary", onClick: function () { var c = list.querySelector("input:checked"); if (!c) return UI.toast(t("Choose a location first."), "bad"); UI.act(btn, function () { return api.post("/api/google/select-location", { business_id: ctx.bid, resource_name: c.value }).then(refresh).then(function () { draw(); }); }, t("Location linked")); } });
          return [list, h("p", null, btn)];
        });
        return [box, nav(5, !!(ov && ov.connection && ov.connection.state === "verified_data"), { skip: true })];
      };
      V[6] = function () {
        var box = h("div"), ent = ctx.ent, list = h("div"), formBox = h("div");
        function draw6() {
          UI.mount(list, S.keywords.length ? UI.table({ caption: t("Tracked keywords"), cols: [{ label: t("Keyword"), key: "keyword" }, { label: t("Target area"), key: "location_name" }, { label: t("Device"), key: "device" }], rows: S.keywords }) : UI.S.empty({ title: t("No keywords yet"), body: t("Add 3 to 5 searches your customers use, together with the neighbourhood you want to be found in.") }));
        }
        UI.mount(formBox, LB.forms.keyword(function (k) { return api.post("/api/keywords", Object.assign({ business_id: ctx.bid }, k)).then(refresh).then(function () { draw(); }, function (e) { if (api.isUpgrade(e)) { UI.mount(formBox, UI.S.upgrade(e)); } throw e; }); }));
        draw6();
        return [h("p", { class: "app-hint" }, ent ? t("Your plan allows up to {n} keywords per business.", { n: ent.max_keywords }) : ""), formBox, list, nav(6, S.keywords.length > 0, { skip: true })];
      };
      V[7] = function () {
        var b = ctx.business, out = h("div"), btn;
        function showRes(r) { UI.mount(out, r.score == null ? UI.state("empty", { title: t("Audit finished without a score"), body: t("There was not enough verified data to calculate a score honestly. The findings list shows what could and could not be checked."), detail: r.state }) : h("p", null, UI.badge(t("Audit {s}", { s: r.state }), "ok"), " ", t("Score: {s}/100 with {n} finding(s).", { s: r.score, n: r.findings_count }))); }
        if (S.auditResult) showRes(S.auditResult);
        else if (S.audits.length) { var a = LB.latest(S.audits); UI.mount(out, h("p", null, UI.badge(t("Audit done"), "ok"), " ", t("Latest audit on {d}", { d: F.date(a.created_at) }))); }
        btn = UI.btn(S.audits.length ? t("Run audit again") : t("Run first audit"), { kind: "primary", onClick: function () {
          UI.act(btn, function () { return api.post("/api/audits/run", { business_id: ctx.bid, website_url: b.website_url || undefined }, null, { timeout: 90000 }).then(function (r) { S.auditResult = r; showRes(r); return refresh(); }).then(function () { live.textContent = t("Audit finished"); }); }, t("Audit finished"));
        } });
        return [h("p", null, t("The audit checks your Google profile and your website. Anything that cannot be verified is marked as unavailable rather than guessed.")), b.website_url ? h("p", { class: "app-hint" }, t("Website to check: {u}", { u: b.website_url })) : UI.state("empty", { title: t("No website on file"), body: t("You can still run the audit. Website checks will be marked as unavailable. Add a website on the business page to include them.") }), h("p", null, btn), out, nav(7, S.audits.length > 0)];
      };
      V[8] = function () {
        var box = h("div"), a = LB.latest(S.audits);
        if (!a) return [UI.S.empty({ title: t("Run an audit first"), body: t("Findings and your 30-day plan appear after the first audit.") }), nav(8, false)];
        UI.load(box, function () { return Promise.all([api.get("/api/audits/detail", { id: a.id }), api.get("/api/audits/plan", { id: a.id }).catch(function (e) { return { __err: e }; })]); }, function (r) {
          var fs = (r[0].findings || []).filter(function (f) { return f.status !== "fixed"; }).sort(function (x, y) { return ["high", "medium", "low"].indexOf(x.severity) - ["high", "medium", "low"].indexOf(y.severity); }).slice(0, 5);
          var plan = r[1].__err ? null : LB.planItems(r[1]).slice(0, 7);
          return [UI.card(t("Top findings"), fs.length ? h("ul", { class: "app-list" }, fs.map(function (f) { return h("li", { class: "app-item" }, UI.badge(UI.sevLabel(f.severity), UI.sevTone(f.severity)), " ", h("strong", null, f.title), f.recommended_action ? h("p", { class: "app-hint" }, f.recommended_action) : null); })) : UI.S.empty({ title: t("No open findings"), body: t("Nothing to fix from this audit.") }), { actions: UI.btn(t("All findings"), { href: LB.href("audit/detail.html?id=" + encodeURIComponent(a.id)) }) }),
            UI.card(t("Your 30-day plan"), plan && plan.length ? h("ol", { class: "app-list" }, plan.map(function (p) { return h("li", { class: "app-item" }, h("strong", null, p.title)); })) : r[1].__err ? UI.fromError(r[1].__err) : UI.S.empty({ title: t("Plan not ready yet"), body: t("The 30-day plan is built from the audit findings.") }), { actions: UI.btn(t("Open full plan"), { href: LB.href("growth-plan/") }) })];
        });
        return [box, nav(8, true)];
      };
      V[9] = function () {
        var box = h("div");
        UI.load(box, function () { return api.get("/api/billing/plans").catch(function () { return { plans: [] }; }); }, function (d) {
          var e = ctx.ent || {};
          return [h("p", null, t("You are on the {p} plan.", { p: e.plan_code || "free" })), (d.plans || []).length ? UI.table({ caption: t("Plan limits"), cols: [{ label: t("Plan"), render: function (p) { return p.name || p.code; }, rowHeader: true }, { label: t("Businesses"), num: true, render: function (p) { return p.limits && p.limits.businesses; } }, { label: t("Keywords"), num: true, render: function (p) { return p.limits && p.limits.keywords; } }, { label: t("Price"), render: function (p) { return p.price_minor ? F.money(p.price_minor, p.currency) + "/" + (p.interval === "year" ? t("year") : t("month")) : t("Free"); } }], rows: d.plans }) : h("dl", { class: "app-kv" }, [[t("Businesses"), e.max_businesses], [t("Google locations"), e.max_locations], [t("Keywords per business"), e.max_keywords], [t("Rank tracking"), e.rank_tracking_enabled ? t("Included") : t("Paid plans")], [t("Review monitoring"), e.review_monitoring_enabled ? t("Included") : t("Paid plans")], [t("Reports"), e.reports_enabled ? t("Included") : t("Paid plans")]].map(function (r) { return [h("dt", null, r[0]), h("dd", null, r[1] == null ? "—" : String(r[1]))]; })),
            h("p", { class: "app-hint" }, t("Paid features show an upgrade prompt when your plan does not include them. Nothing is charged without your confirmation.")), h("p", null, UI.btn(t("Compare plans"), { href: LB.href("plans.html"), kind: "primary" }))];
        });
        return [box, nav(9, true)];
      };

      function draw(focus) {
        var d = done();
        var steps = h("ol", { class: "app-steps", "aria-label": t("Setup progress") }, NAMES.map(function (nm, i) {
          var n = i + 1, li = h("li", { class: "app-step", "data-done": d[n] ? "1" : null }, h("b", null, d[n] ? "✓" : String(n)), h("a", { href: "#step-" + n, onclick: function (e) { e.preventDefault(); if (n === 1 || d[1]) go(n); }, "aria-current": n === S.step ? "step" : null }, nm));
          if (n === S.step) li.setAttribute("aria-current", "step"); return li;
        }));
        var anon = !(ctx.me && ctx.me.authenticated);
        if (anon && S.step > 1) S.step = 1;
        var card = UI.card(t("Step {n} of 9", { n: S.step }) + ": " + NAMES[S.step - 1], V[S.step]());
        UI.mount(wrap, [steps, card]);
        if (focus) { var hd = card.querySelector("h2"); hd.setAttribute("tabindex", "-1"); hd.focus(); live.textContent = NAMES[S.step - 1]; }
      }
      var m = /step-(\d)/.exec(location.hash);
      UI.mount(wrap, UI.skeleton(4));
      return refresh().then(function () { S.step = m ? Math.min(9, +m[1]) : first(); draw(false); });
    } });
  };

  LB.start(P);
})();
