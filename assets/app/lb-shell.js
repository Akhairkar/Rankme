/* LocalBoost dashboard shell: sidebar, topbar, business selector, boot sequence. */
(function () {
  "use strict";
  var LB = (window.LB = window.LB || {});
  var t = LB.t, UI = LB.ui, h = UI.h;
  var KEY = "localboost_business_id";

  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k) || localStorage.getItem(k); sessionStorage.setItem(k, v); localStorage.setItem(k, v); } catch (_) { return null; } }
  LB.storeBusiness = function (id) { store(KEY, id); };

  var NAV = [
    [t("Overview"), [["index.html", t("Overview")]]],
    [t("Setup"), [["onboarding/", t("Setup guide")], ["business.html", t("Businesses")], ["google-profile.html", t("Google connection")]]],
    [t("Insights"), [["audit/", t("Profile audit")], ["rank-tracking.html", t("Rank tracking")], ["search-console.html", t("Search Console")], ["competitors.html", t("Competitors")], ["visibility.html", t("Google performance")], ["score.html", t("Visibility score")]]],
    [t("Reputation"), [["reviews/", t("Reviews")], ["auto-reply/", t("Reply suggestions")]]],
    [t("Growth"), [["growth-plan/", t("30-day plan")], ["action-center.html", t("Action centre")], ["reports/", t("Reports")], ["monitoring.html", t("Monitoring")]]],
    [t("Account"), [["plans.html", t("Plans")], ["billing.html", t("Billing")], ["account.html", t("Account")]]]
  ];
  function flat() { var a = []; NAV.forEach(function (g) { g[1].forEach(function (i) { a.push(i); }); }); return a; }
  function here() {
    var p = location.pathname.replace(/^\/hi\//, "/").replace(/index\.html$/, "");
    return p.replace(/^\/dashboard\//, "") || "index.html";
  }
  function isCurrent(rel) {
    var cur = here(), r = rel.replace(/index\.html$/, "");
    if (r === "") return cur === "" || cur === "index.html";
    if (cur === "") cur = "index.html";
    if (rel === "index.html") return cur === "index.html";
    return cur === r || cur.indexOf(r) === 0 && r.slice(-1) === "/";
  }

  function theme() {
    var cur;
    try { cur = localStorage.getItem("lb_theme"); } catch (_) {}
    return cur;
  }
  function applyTheme(v) { if (v === "dark" || v === "light") document.documentElement.setAttribute("data-theme", v); else document.documentElement.removeAttribute("data-theme"); }
  applyTheme(theme());

  function buildShell(opts) {
    var navEl = h("nav", { id: "app-nav", class: "app-nav", "aria-label": t("Dashboard") });
    NAV.forEach(function (g) {
      var ul = h("ul");
      g[1].forEach(function (i) {
        var a = h("a", { href: LB.href(i[0]) }, i[1]);
        if (isCurrent(i[0])) a.setAttribute("aria-current", "page");
        ul.appendChild(h("li", null, a));
      });
      navEl.appendChild(h("div", { class: "app-navg" }, h("p", { class: "app-navh" }, g[0]), ul));
    });
    var side = h("aside", { class: "app-side", id: "app-side" },
      h("a", { class: "app-brand", href: LB.lang === "hi" ? "/hi/" : "/" }, h("span", { class: "app-logo", "aria-hidden": "true" }, "LB"), "LocalBoost"), navEl,
      h("a", { class: "app-navback", href: "/contact/" }, t("Help and contact")));
    var menuBtn = h("button", { class: "app-iconbtn app-menu", type: "button", "aria-controls": "app-side", "aria-expanded": "false", "aria-label": t("Open menu") }, "☰");
    var biz = h("div", { class: "app-biz", id: "app-biz" });
    var plan = h("a", { class: "app-pill", id: "app-plan", href: LB.href("plans.html"), hidden: true });
    var altPath = LB.lang === "hi" ? location.pathname.replace(/^\/hi\//, "/") : "/hi" + location.pathname;
    var lang = h("a", { class: "app-iconbtn", href: altPath, hreflang: LB.lang === "hi" ? "en" : "hi", lang: LB.lang === "hi" ? "en" : "hi", "aria-label": LB.lang === "hi" ? "Switch to English" : "हिन्दी में देखें" }, LB.lang === "hi" ? "EN" : "हि");
    var th = h("button", { class: "app-iconbtn", type: "button", "aria-label": t("Toggle dark mode"), onclick: function () {
      var dark = document.documentElement.getAttribute("data-theme") === "dark" || (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
      var nv = dark ? "light" : "dark"; applyTheme(nv); try { localStorage.setItem("lb_theme", nv); } catch (_) {}
    } }, "◐");
    var acct = h("div", { class: "app-acct", id: "app-acct" });
    var crumbs = h("nav", { class: "app-crumbs", "aria-label": t("Breadcrumb") }, h("ol", null,
      h("li", null, h("a", { href: LB.href("index.html") }, t("Dashboard"))), opts.crumbs ? opts.crumbs.map(function (c) { return h("li", null, c[1] ? h("a", { href: c[1] }, c[0]) : h("span", { "aria-current": "page" }, c[0])); }) : (opts.title ? h("li", null, h("span", { "aria-current": "page" }, opts.title)) : null)));
    var top = h("header", { class: "app-top" }, menuBtn, crumbs, h("div", { class: "app-topr" }, biz, plan, lang, th, h("a", { class: "app-iconbtn", href: "/contact/", "aria-label": t("Help and contact") }, "?"), acct));
    var main = h("main", { id: "app-main", class: "app-main", tabindex: "-1" });
    var live = h("div", { class: "app-sr", "aria-live": "polite", id: "app-live" });
    var scrim = h("div", { class: "app-scrim", hidden: true });
    var shell = h("div", { class: "app-shell" }, h("a", { class: "app-skip", href: "#app-main" }, t("Skip to content")), side, scrim, h("div", { class: "app-body" }, top, main, live));
    var root = document.getElementById("app") || document.body;
    UI.mount(root, shell);

    function setDrawer(open) {
      document.body.classList.toggle("app-drawer", open);
      menuBtn.setAttribute("aria-expanded", String(open)); scrim.hidden = !open;
      menuBtn.setAttribute("aria-label", open ? t("Close menu") : t("Open menu"));
      if (open) { var f = side.querySelector("a"); f && f.focus(); } else menuBtn.focus();
    }
    menuBtn.addEventListener("click", function () { setDrawer(!document.body.classList.contains("app-drawer")); });
    scrim.addEventListener("click", function () { setDrawer(false); });
    document.addEventListener("keydown", function (e) {
      if (!document.body.classList.contains("app-drawer")) return;
      if (e.key === "Escape") setDrawer(false);
      if (e.key === "Tab") { var f = side.querySelectorAll("a[href]"), first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
    return { main: main, biz: biz, plan: plan, acct: acct };
  }

  function fillAccount(el, me) {
    var name = (me && me.user && (me.user.name || me.user.email)) || "";
    if (!name) { UI.mount(el, h("a", { class: "app-btn app-btn-sm", href: LB.api.signInUrl({ return: location.pathname }) }, t("Sign in"))); return; }
    var det = h("details", { class: "app-menu-d" }, h("summary", { class: "app-iconbtn app-avatar", "aria-label": t("Account menu") + ": " + name }, name.trim().charAt(0).toUpperCase()),
      h("div", { class: "app-pop" }, h("p", { class: "app-hint" }, me.user.email || name), h("a", { href: LB.href("account.html") }, t("Account")), h("a", { href: LB.href("billing.html") }, t("Billing")),
        h("button", { type: "button", onclick: function () { LB.api.post("/auth/logout", {}).catch(function () {}).then(function () { location.href = LB.href("index.html"); }); } }, t("Sign out"))));
    det.addEventListener("keydown", function (e) { if (e.key === "Escape") { det.open = false; det.querySelector("summary").focus(); } });
    document.addEventListener("click", function (e) { if (!det.contains(e.target)) det.open = false; });
    UI.mount(el, det);
  }

  function fillBusiness(el, ctx) {
    var act = ctx.businesses.filter(function (b) { return b.status !== "archived"; });
    if (!act.length) { UI.mount(el, null); return; }
    var sel = h("select", { id: "app-bizsel", "aria-label": t("Business") }, act.map(function (b) { var o = h("option", { value: b.id }, b.name + (b.city ? " · " + b.city : "")); if (b.id === ctx.bid) o.selected = true; return o; }));
    sel.addEventListener("change", function () { store(KEY, sel.value); location.reload(); });
    UI.mount(el, sel);
  }
  function fillPlan(el, ctx) {
    var e = ctx.ent; if (!e || !e.plan_code) return;
    var n = ctx.businesses.filter(function (b) { return b.status !== "archived"; }).length;
    el.hidden = false;
    el.textContent = t("{plan} plan", { plan: String(e.plan_code).replace(/^./, function (c) { return c.toUpperCase(); }) }) + (e.max_businesses ? " · " + n + "/" + e.max_businesses : "");
    el.title = t("Limits: {b} business(es), {k} keywords per business, {l} Google locations.", { b: e.max_businesses, k: e.max_keywords, l: e.max_locations });
  }

  /* opts: {title, crumbs, needsBusiness, allowAnon, render(main, ctx), head} */
  LB.boot = function (opts) {
    document.title = opts.title + " | LocalBoost";
    var sh = buildShell(opts);
    var main = sh.main;
    var ctx = (LB.ctx = { me: null, businesses: [], business: null, bid: null, ent: null, lang: LB.lang, main: main, shell: sh });
    if (!opts.noHead) main.appendChild(UI.pageHead(opts.title, opts.lead));
    var body = h("div", { id: "app-content" });
    main.appendChild(body);
    ctx.body = body;
    if (!LB.api.enabled) { UI.mount(body, UI.S.noapi()); fillAccount(sh.acct, null); document.documentElement.setAttribute("data-app-ready", "1"); return Promise.resolve(); }
    UI.mount(body, UI.skeleton(4));
    document.addEventListener("lb:signedout", function () { if (!ctx.__out) { ctx.__out = true; UI.mount(body, UI.S.signedout()); } });
    return LB.api.retry(function () { return LB.api.get("/api/me"); }).then(function (me) {
      ctx.me = me; fillAccount(sh.acct, me);
      if (!me.authenticated) { if (opts.allowAnon) return opts.render(body, ctx); UI.mount(body, UI.S.signedout()); return; }
      return Promise.all([LB.api.get("/api/businesses"), LB.api.get("/api/entitlements").catch(function () { return null; })]).then(function (r) {
        ctx.businesses = (r[0] && r[0].businesses) || []; ctx.ent = r[1];
        var act = ctx.businesses.filter(function (b) { return b.status !== "archived"; });
        var saved = store(KEY);
        ctx.business = act.filter(function (b) { return b.id === saved; })[0] || act[0] || null;
        ctx.bid = ctx.business ? ctx.business.id : null;
        if (ctx.bid) store(KEY, ctx.bid);
        fillBusiness(sh.biz, ctx); fillPlan(sh.plan, ctx);
        if (opts.needsBusiness !== false && !ctx.bid) { UI.mount(body, UI.S.nobusiness()); return; }
        UI.clear(body);
        return opts.render(body, ctx);
      });
    }).catch(function (e) { UI.mount(body, UI.fromError(e, { retry: function () { location.reload(); } })); })
      .then(function () { if (window.LB_TEST) window.LB_TEST.ready = true; document.documentElement.setAttribute("data-app-ready", "1"); });
  };
})();
(function () {
  /* Page registry: each p-*.js registers pages by name; <body data-page="name"> selects one. */
  window.LB.start = function (pages) { var n = document.body.getAttribute("data-page"); if (pages[n]) pages[n](); };
})();
