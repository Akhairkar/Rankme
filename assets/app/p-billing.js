/* Plans, checkout (Razorpay), billing, invoices. */
(function () {
  "use strict";
  var LB = window.LB, t = LB.t, UI = LB.ui, h = UI.h, F = LB.fmt, api = LB.api;
  var P = {};
  var RZP = "https://checkout.razorpay.com/v1/checkout.js";
  function loadRzp() {
    return new Promise(function (res, rej) {
      if (window.Razorpay) return res();
      var s = h("script", { src: RZP }); s.onload = res; s.onerror = function () { rej({ message: t("Could not load the payment window. Check your connection or ad blocker and try again.") }); }; document.head.appendChild(s);
    });
  }
  var LIM = function (l) { return [[t("Businesses"), l.businesses], [t("Google locations"), l.locations], [t("Keywords per business"), l.keywords], [t("Audits per month"), l.audits_per_month], [t("Rank scans per month"), l.rank_scans_per_month], [t("Competitors"), l.competitors]]; };

  function checkout(ctx, plan, interval) {
    var name = h("input", { autocomplete: "organization", maxlength: 120 }), gst = h("input", { maxlength: 15, autocomplete: "off" }), pr = plan.prices[interval];
    var body = h("div", null, h("p", null, t("{p} plan, billed every {i}.", { p: plan.name, i: interval === "year" ? t("year") : t("month") })),
      h("p", null, t("Total {a} including 18% GST ({b} + {g}).", { a: F.money(pr.total_minor), b: F.money(pr.taxable_minor), g: F.money(pr.cgst_minor + pr.sgst_minor) })), UI.field(t("Name for invoice (optional)"), name), UI.field(t("GSTIN (optional)"), gst, t("15 characters, for a GST invoice")));
    return UI.modal({ title: t("Confirm upgrade"), body: body, actions: [{ label: t("Cancel"), value: false }, { label: t("Continue to payment"), kind: "primary", run: function () {
      var g = gst.value.trim().toUpperCase();
      if (g && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) throw { message: t("Enter a valid 15-character GSTIN or leave it empty.") };
      return api.post("/api/billing/checkout", { plan_code: plan.code, interval: interval, billing_name: name.value.trim() || undefined, gstin: g || undefined }).then(function (r) {
        return loadRzp().then(function () { return new Promise(function (resolve, reject) {
          var rz = new window.Razorpay({ key: r.order.key_id, amount: r.order.amount, currency: r.order.currency, order_id: r.order.id, name: "LocalBoost", description: plan.name + " (" + interval + ")",
            handler: function (resp) { api.post("/api/billing/verify", { razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature }).then(function (v) { v && v.ok === true ? resolve("paid") : reject({ message: t("Payment could not be verified.") }); }, function (e) { reject({ message: t("Payment was made but could not be verified yet: {m}. It is not counted until verified. Contact support if it persists.", { m: e.message }) }); }); },
            modal: { ondismiss: function () { reject({ message: t("Payment window closed. You have not been charged.") }); } } });
          rz.on && rz.on("payment.failed", function (x) { reject({ message: (x && x.error && x.error.description) || t("Payment failed.") }); });
          rz.open();
        }); });
      }, function (e) { if (e.code === "provider_not_configured") throw { message: t("Payments are not switched on yet. You have not been charged.") }; throw e; });
    } }] });
  }

  P.plans = function () {
    LB.boot({ title: t("Plans"), lead: t("Prices are in Indian rupees and exclude 18% GST, which is added at checkout."), needsBusiness: false, render: function (body, ctx) {
      var box = h("div"), iv = "month", cur = (ctx.ent && ctx.ent.plan_code) || "free";
      body.appendChild(box);
      UI.load(box, function () { return api.get("/api/billing/plans"); }, function (d) {
        var grid = h("div", { class: "app-grid3" }), tg = UI.select([["month", t("Monthly")], ["year", t("Yearly")]], iv, { "aria-label": t("Billing period") });
        function draw() {
          UI.mount(grid, d.plans.map(function (p) {
            var pr = p.prices && p.prices[iv], paid = p.code !== "free", b = UI.btn(p.code === cur ? t("Current plan") : paid ? t("Upgrade to {p}", { p: p.name }) : t("Free"), { kind: paid && p.code !== cur ? "primary" : null, disabled: p.code === cur || !paid || !d.provider_enabled });
            b.addEventListener("click", function () { checkout(ctx, p, iv).then(function (ok) { if (ok === "paid") { UI.toast(t("Payment verified. Your plan is now {p}.", { p: p.name }), "ok"); setTimeout(function () { location.href = LB.href("billing.html"); }, 1200); } }); });
            return h("div", { class: "app-card app-plan-card" }, h("h2", { class: "app-h2" }, p.name), h("div", { class: "app-price" }, paid ? F.money(pr ? pr.taxable_minor : p.price_minor) : t("Free"), paid ? h("small", { class: "app-hint" }, " /" + (iv === "year" ? t("year") : t("month"))) : null), paid && pr ? h("p", { class: "app-hint" }, t("{a} with GST", { a: F.money(pr.total_minor) })) : null,
              h("ul", null, LIM(p.limits || {}).map(function (r) { return h("li", null, "• " + r[0] + ": " + (r[1] == null ? "—" : r[1])); })), b);
          }));
        }
        tg.addEventListener("change", function () { iv = tg.value; draw(); }); draw();
        return [d.provider_enabled ? null : UI.S.provider({ title: t("Payments are not switched on yet"), body: t("You can compare plans, but upgrading is disabled until the payment provider is configured. Nothing will be charged.") }), h("div", { class: "app-filters", style: "margin-top:12px" }, UI.field(t("Billing period"), tg)), grid, h("p", { class: "app-hint" }, d.gst && d.gst.note || "")];
      });
    } });
  };

  P.billing = function () {
    LB.boot({ title: t("Billing"), lead: t("Your subscription and invoices."), needsBusiness: false, render: function (body, ctx) {
      var sub = h("div"), inv = h("div");
      body.appendChild(sub); body.appendChild(inv);
      UI.load(sub, function () { return api.get("/api/billing/status"); }, function (s) {
        var p = s.plan || ctx.ent || {}, paid = p.plan_code && p.plan_code !== "free";
        var cancel = UI.btn(t("Cancel subscription"), { kind: "danger", onClick: function () { UI.confirm(t("Cancel your subscription?"), t("You keep paid features until the end of the current period, then move to the Free plan."), t("Cancel subscription"), "danger").then(function (ok) { if (ok) UI.act(cancel, function () { return api.post("/api/billing/cancel", {}).then(function (r) { UI.toast(t("Subscription will end on {d}", { d: F.date(r.ends_at) }), "ok"); }); }); }); } });
        return UI.card(t("Current plan"), [h("p", null, h("strong", null, String(p.plan_code || "free").toUpperCase()), " ", UI.badge(p.status || "free", p.status === "active" ? "ok" : "neutral")), p.current_period_end ? h("p", { class: "app-hint" }, t("Current period ends {d}", { d: F.date(p.current_period_end) })) : null, h("div", { class: "app-actions" }, UI.btn(paid ? t("Change plan") : t("See plans"), { kind: "primary", href: LB.href("plans.html") }), paid ? cancel : null)]);
      });
      UI.load(inv, function () { return api.get("/api/billing/invoices"); }, function (d) {
        var rows = d.invoices || [];
        return UI.card(t("Invoices"), rows.length ? UI.table({ caption: t("Invoices"), cols: [{ label: t("Number"), key: "number", rowHeader: true }, { label: t("Date"), render: function (i) { return F.date(i.issued_at); } }, { label: t("Plan"), render: function (i) { return i.plan_code + (i.interval ? " / " + i.interval : ""); } }, { label: t("Total (incl. GST)"), num: true, render: function (i) { return F.money(i.amount_minor, i.currency); } }, { label: t("Status"), render: function (i) { return UI.badge(i.status, i.status === "paid" ? "ok" : "neutral"); } }, { label: t("Download"), render: function (i) { return i.pdf_url ? h("a", { href: i.pdf_url }, "PDF") : UI.btn(t("CSV"), { small: true, onClick: function () { UI.csv("invoice-" + i.number + ".csv", [["number", "date", "plan", "taxable", "cgst", "sgst", "total", "currency", "gstin"], [i.number, F.day(i.issued_at), i.plan_code, i.taxable_minor / 100, i.cgst_minor / 100, i.sgst_minor / 100, i.amount_minor / 100, i.currency, i.customer_gstin]]); } }); } }], rows: rows }) : UI.S.empty({ title: t("No invoices yet"), body: t("Invoices appear after your first verified payment.") }));
      });
    } });
  };
  LB.start(P);
})();
