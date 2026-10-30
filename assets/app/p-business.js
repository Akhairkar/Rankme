/* Businesses, Google connection, account. */
(function () {
  "use strict";
  var LB = window.LB, t = LB.t, UI = LB.ui, h = UI.h, F = LB.fmt, api = LB.api;
  var P = {};

  function download(name, text, type) { UI.saveBlob(name, text, type || "application/json"); }

  /* ================= businesses ================= */
  P.business = function () {
    LB.boot({ title: t("Businesses"), lead: t("Add, edit, archive and switch between the businesses on your account."), needsBusiness: false, noHead: true, render: function (body, ctx) {
      var box = h("div"), formBox = h("div"), limit = ctx.ent ? ctx.ent.max_businesses : null;
      var addBtn = UI.btn(t("Add a business"), { kind: "primary", onClick: function () { form(null); } });
      body.appendChild(UI.pageHead(t("Businesses"), t("Add, edit, archive and switch between the businesses on your account."), addBtn));
      body.appendChild(formBox); body.appendChild(box);
      function list() {
        UI.load(box, function () { return api.get("/api/businesses"); }, function (d) {
          ctx.businesses = d.businesses || [];
          var rows = ctx.businesses; if (!rows.length) return UI.S.empty({ title: t("No businesses yet"), body: t("Add your first business to start measuring its local visibility."), actions: [addBtn] });
          var active = rows.filter(function (b) { return b.status !== "archived"; }).length;
          return [limit ? h("p", { class: "app-hint" }, t("{a} of {m} business slot(s) used on your {p} plan.", { a: active, m: limit, p: ctx.ent.plan_code })) : null,
            UI.table({ caption: t("Your businesses"), cols: [
              { label: t("Business"), rowHeader: true, render: function (b) { return [h("strong", null, b.name), b.id === ctx.bid ? [" ", UI.badge(t("Selected"), "info")] : null]; } },
              { label: t("Category"), key: "category" }, { label: t("City"), key: "city" },
              { label: t("Status"), render: function (b) { return b.status === "archived" ? UI.badge(t("Archived"), "neutral") : UI.badge(t("Active"), "ok"); } },
              { label: t("Actions"), render: function (b) { return h("div", { class: "app-actions" },
                b.status !== "archived" && b.id !== ctx.bid ? UI.btn(t("Switch to this"), { small: true, onClick: function () { LB.storeBusiness(b.id); location.reload(); }, aria: t("Switch to {n}", { n: b.name }) }) : null,
                UI.btn(t("Edit"), { small: true, onClick: function () { form(b); }, aria: t("Edit {n}", { n: b.name }) }),
                UI.btn(b.status === "archived" ? t("Restore") : t("Archive"), { small: true, onClick: function () { archive(b); }, aria: (b.status === "archived" ? t("Restore") : t("Archive")) + " " + b.name }),
                UI.btn(t("Export CSV"), { small: true, onClick: function () { UI.csv("localboost-" + b.id + ".csv", [["id", "name", "category", "city", "phone", "website", "status", "created"], [b.id, b.name, b.category, b.city, b.phone, b.website_url, b.status, F.day(b.created_at)]]); }, aria: t("Export {n} as CSV", { n: b.name }) })); } }
            ], rows: rows }), h("p", { class: "app-hint" }, t("To export everything stored about your account, use “Export my data” on the Account page."))];
        });
      }
      function archive(b) {
        var arch = b.status !== "archived";
        UI.confirm(arch ? t("Archive this business?") : t("Restore this business?"), arch ? t("It stops counting towards your plan limit and is hidden from the selector. Stored data is kept and you can restore it later.") : t("It will count towards your plan limit again."), arch ? t("Archive") : t("Restore"), arch ? "danger" : "primary").then(function (ok) {
          if (!ok) return;
          api.post("/api/businesses/archive", { id: b.id, archived: arch }).then(function () { UI.toast(arch ? t("Business archived") : t("Business restored"), "ok"); if (arch && b.id === ctx.bid) { location.reload(); } else list(); }, function (e) { UI.toast(UI.errText(e), "bad"); });
        });
      }
      function form(b) {
        var f = LB.forms.business(b || {}), err = h("p", { class: "app-err", role: "alert" }), save = UI.btn(b ? t("Save changes") : t("Add business"), { kind: "primary", type: "submit" });
        var el = h("form", { novalidate: true, onsubmit: function (e) {
          e.preventDefault(); err.textContent = ""; if (!f.validate()) return;
          UI.act(save, function () {
            var data = f.get();
            return (b ? api.post("/api/businesses/update", Object.assign({ id: b.id }, data)) : api.post("/api/businesses", data)).then(function (r) {
              UI.clear(formBox); if (!b && r.business) { LB.storeBusiness(r.business.id); location.reload(); } else list();
            }, function (e2) { if (api.isUpgrade(e2)) { UI.mount(formBox, UI.card(null, UI.S.upgrade(e2))); } err.textContent = api.isUpgrade(e2) ? "" : e2.message; throw e2; });
          }, b ? t("Business updated") : t("Business added"));
        } }, f.el, err, h("div", { class: "app-actions", style: "margin-top:14px" }, save, UI.btn(t("Cancel"), { onClick: function () { UI.clear(formBox); } })));
        UI.mount(formBox, UI.card(b ? t("Edit {n}", { n: b.name }) : t("Add a business"), el)); el.querySelector("input").focus();
      }
      list();
    } });
  };

  /* ================= Google connection ================= */
  var GERR = { access_denied: "You declined the Google permission request.", invalid_state: "The sign-in link expired. Please try again.", token_exchange_failed: "Google did not return access. Please try again." };
  P.google = function () {
    LB.boot({ title: t("Google connection"), lead: t("Connect the Google account that manages your Business Profile, and choose the location LocalBoost should read."), render: function (body, ctx) {
      var q = new URLSearchParams(location.search), ge = q.get("google_error");
      if (ge) body.appendChild(UI.state("error", { title: t("Google connection failed"), body: t(GERR[ge] || "Google could not complete the connection."), detail: ge }));
      var st = h("div"), pick = h("div");
      function status() {
        UI.load(st, function () { return api.get("/api/google/status"); }, function (g) {
          var back = api.signInUrl({ return: LB.href("google-profile.html") });
          var perm = g.connected && !(g.scopes || []).some(function (s) { return /business\.manage/.test(s); });
          return UI.card(t("Connection status"), [
            g.connected ? h("p", null, UI.badge(t("Connected"), "ok"), " ", g.email || "") : h("p", null, UI.badge(t("Not connected"), "warn"), " ", t("No Google account is connected. Nothing below is shown as connected until Google confirms it.")),
            perm ? UI.state("error", { title: t("Permission required"), body: t("Google did not grant access to your Business Profile, so LocalBoost cannot read your locations. Reconnect and accept the Business Profile permission.") }) : null,
            g.connected ? h("dl", { class: "app-kv" }, h("dt", null, t("Last sync")), h("dd", null, g.last_sync_at ? F.date(g.last_sync_at, true) : t("Not synced yet")), h("dt", null, t("Locations found")), h("dd", null, String(g.locations || 0)), h("dt", null, t("Permissions granted")), h("dd", null, (g.scopes || []).length ? (g.scopes || []).map(function (s) { return s.replace("https://www.googleapis.com/auth/", ""); }).join(", ") : "—")) : null,
            g.state && g.state !== "connected" && g.state !== "verified_data" ? h("p", { class: "app-hint" }, t("Status: {s}", { s: g.state })) : null,
            h("div", { class: "app-actions", style: "margin-top:12px" }, UI.btn(g.connected ? t("Reconnect Google") : t("Connect Google"), { kind: g.connected ? null : "primary", href: back }),
              g.connected ? (function () { var b = UI.btn(t("Sync locations"), { onClick: function () { UI.act(b, function () { return api.post("/api/google/sync", {}).then(function () { status(); locations(); }); }, t("Sync finished")); } }); return b; })() : null,
              g.connected ? UI.btn(t("Disconnect"), { kind: "danger", onClick: function () { disconnect(); } }) : null)]);
        });
      }
      function disconnect() {
        UI.confirm(t("Disconnect Google?"), t("LocalBoost will revoke its access at Google and delete the stored connection. Your businesses and saved reports are kept. You can reconnect at any time."), t("Disconnect"), "danger").then(function (ok) {
          if (ok) api.post("/api/google/disconnect", {}).then(function () { UI.toast(t("Google disconnected"), "ok"); status(); locations(); }, function (e) { UI.toast(UI.errText(e), "bad"); });
        });
      }
      function locations() {
        UI.load(pick, function () { return Promise.all([api.get("/api/google/locations"), api.get("/api/overview", { business_id: ctx.bid }).catch(function () { return {}; }), api.get("/api/google/accounts").catch(function () { return { accounts: [] }; })]); }, function (r) {
          var d = r[0], ov = r[1], linked = ov.connection && ov.connection.state === "verified_data" ? ov.connection.location : null;
          var head = linked ? h("p", null, UI.badge(t("Linked"), "ok"), " ", t("{b} is linked to {l}", { b: ctx.business.name, l: linked })) : h("p", null, UI.badge(t("No location linked"), "warn"), " ", t("{b} is not linked to a Google location yet.", { b: ctx.business.name }));
          var all = d.locations || [];
          if (!all.length) return UI.card(t("Choose your location"), [head, UI.stateFor(d.state === "verified_data" ? "" : d.state) || UI.S.empty({ title: t("No locations found"), body: t("Sync locations after connecting Google. If none appear, the Google account may not manage a Business Profile.") })]);
          var accSel = UI.select([["", t("All accounts")]].concat((r[2].accounts || []).map(function (a) { return [a.account_name, a.account_name]; })), "", { "aria-label": t("Google account") }), grp = h("div");
          function draw() {
            UI.clear(grp);
            var fs = h("fieldset", null, h("legend", null, t("Locations")));
            all.filter(function (l) { return !accSel.value || l.account_name === accSel.value; }).forEach(function (l, i) {
              var x = LB.locTitle(l); fs.appendChild(h("div", { class: "app-check" }, h("input", { type: "radio", name: "loc", id: "gl" + i, value: l.resource_name, checked: linked === x.title }), h("label", { for: "gl" + i }, h("strong", null, x.title), x.address ? h("div", { class: "app-hint" }, x.address) : null, l.synced_at ? h("div", { class: "app-hint" }, t("Synced {d}", { d: F.ago(l.synced_at) })) : null)));
            });
            var b = UI.btn(t("Link selected location"), { kind: "primary", onClick: function () { var c = fs.querySelector("input:checked"); if (!c) return UI.toast(t("Choose a location first."), "bad"); UI.act(b, function () { return api.post("/api/google/select-location", { business_id: ctx.bid, resource_name: c.value }).then(locations); }, t("Location linked")); } });
            grp.appendChild(fs); grp.appendChild(h("p", { style: "margin-top:12px" }, b));
          }
          accSel.addEventListener("change", draw); draw();
          return UI.card(t("Choose your location"), [head, (r[2].accounts || []).length > 1 ? UI.field(t("Google account"), accSel) : null, grp]);
        });
      }
      body.appendChild(st); body.appendChild(pick);
      body.appendChild(UI.card(t("What LocalBoost can and cannot do"), h("ul", { class: "app-list" },
        h("li", null, h("strong", null, t("Reads: ")), t("your Business Profile details, locations, reviews and performance numbers, so we can audit and report on them.")),
        h("li", null, h("strong", null, t("Writes: ")), t("nothing, unless you press a clearly labelled confirm button. For example, a review reply is only posted to Google after you confirm it in a dialog.")),
        h("li", null, h("strong", null, t("Search Console: ")), t("requested separately, only if you choose to connect it, with read-only access.")),
        h("li", null, h("strong", null, t("Your control: ")), t("disconnect at any time here. We revoke the token at Google and delete the stored connection.")))));
      status(); locations();
    } });
  };

  /* ================= account ================= */
  P.account = function () {
    LB.boot({ title: t("Account"), lead: t("Your profile, your data, and account deletion."), needsBusiness: false, render: function (body, ctx) {
      var u = ctx.me.user || {}, e = ctx.ent || {};
      body.appendChild(UI.card(t("Profile"), h("dl", { class: "app-kv" }, h("dt", null, t("Name")), h("dd", null, u.name || "—"), h("dt", null, t("Email")), h("dd", null, u.email || "—"), h("dt", null, t("Plan")), h("dd", null, e.plan_code || "—", " ", h("a", { href: LB.href("billing.html") }, t("Manage billing"))))));
      var gb = h("div");
      body.appendChild(UI.card(t("Google"), gb));
      UI.load(gb, function () { return api.get("/api/google/status"); }, function (g) {
        var b = UI.btn(t("Disconnect Google"), { kind: "danger", onClick: function () { UI.confirm(t("Disconnect Google?"), t("LocalBoost will revoke its access at Google and delete the stored connection. Your businesses and saved reports are kept. You can reconnect at any time."), t("Disconnect"), "danger").then(function (ok) { if (ok) UI.act(b, function () { return api.post("/api/google/disconnect", {}).then(function () { location.reload(); }); }, t("Google disconnected")); }); } });
        return g.connected ? [h("p", null, UI.badge(t("Connected"), "ok"), " ", g.email || ""), b] : [h("p", null, UI.badge(t("Not connected"), "neutral"), " ", t("No Google account is connected.")), UI.btn(t("Connect Google"), { href: LB.href("google-profile.html") })];
      });
      var ex = UI.btn(t("Export my data (JSON)"), { onClick: function () { UI.act(ex, function () { return api.getText("/api/account/export").then(function (txt) { download("localboost-export-" + F.day(Date.now()) + ".json", txt, "application/json"); }); }, t("Download started")); } });
      body.appendChild(UI.card(t("Your data"), [h("p", null, t("Download a copy of everything LocalBoost stores about your account.")), ex]));
      var inp = h("input", { id: "del-confirm", autocomplete: "off", "aria-describedby": "del-h" }), del = UI.btn(t("Delete my account"), { kind: "danger", disabled: true });
      inp.addEventListener("input", function () { del.disabled = inp.value.trim() !== "DELETE"; });
      del.addEventListener("click", function () {
        UI.confirm(t("Delete your account permanently?"), t("This removes your account, businesses, keywords, reviews and reports and cannot be undone. Any active subscription should be cancelled first on the Billing page."), t("Delete everything"), "danger").then(function (ok) {
          if (ok) UI.act(del, function () { return api.post("/api/account/delete", {}).then(function () { location.href = LB.lang === "hi" ? "/hi/" : "/"; }); });
        });
      });
      body.appendChild(UI.card(t("Delete account"), [h("p", null, t("Deleting your account is permanent. Export your data first if you need it.")), UI.field(t("Type DELETE to enable the button"), inp, null, "del-confirm"), h("p", { id: "del-h", class: "app-hint" }, t("Case-sensitive.")), h("p", { style: "margin-top:10px" }, del)]));
      body.appendChild(h("p", { class: "app-hint" }, h("a", { href: "/privacy/" }, t("Privacy policy")), " · ", h("a", { href: "/terms/" }, t("Terms"))));
    } });
  };
  LB.start(P);
})();
