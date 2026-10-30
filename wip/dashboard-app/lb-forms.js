/* Shared validators and form builders (business details, keywords). */
(function () {
  "use strict";
  var LB = window.LB, t = LB.t, UI = LB.ui, h = UI.h;
  var V = (LB.val = {});
  V.phone = function (v) {
    v = String(v || "").replace(/[\s().-]/g, ""); if (!v) return "";
    var m = v.replace(/^(\+91|0091|91)(?=\d{10}$)/, "");
    if (/^[6-9]\d{9}$/.test(m) || /^0\d{9,11}$/.test(m)) return "";
    return t("Enter a valid Indian phone number: 10 digits starting with 6-9, or a landline with the STD code.");
  };
  V.pin = function (v) { v = String(v || "").trim(); if (!v) return ""; return /^[1-9]\d{5}$/.test(v) ? "" : t("PIN code must be 6 digits and cannot start with 0."); };
  V.url = function (v) {
    v = String(v || "").trim(); if (!v) return "";
    try { var u = new URL(/^https?:\/\//i.test(v) ? v : "https://" + v); if (!/\.[a-z]{2,}$/i.test(u.hostname) && u.hostname !== "localhost") throw 0; return ""; } catch (_) { return t("Enter a valid website address, for example https://example.com"); }
  };
  V.normUrl = function (v) { v = String(v || "").trim(); return !v ? "" : /^https?:\/\//i.test(v) ? v : "https://" + v; };
  V.required = function (v, min) { return String(v || "").trim().length >= (min || 1) ? "" : t("This field is required."); };

  var CATS = ["Restaurant", "Cafe", "Bakery", "Dental clinic", "Doctor", "Hospital", "Pharmacy", "Beauty salon", "Hair salon", "Gym", "Yoga studio", "Coaching centre", "School", "Hotel", "Real estate agency", "Lawyer", "Chartered accountant", "Car repair", "Electronics store", "Clothing store", "Grocery store", "Plumber", "Electrician", "Photographer", "Travel agency"];

  /* fields: array of names to show. Returns {el, get(), validate(), set(obj)} */
  LB.forms = {
    business: function (init, fields) {
      init = init || {}; fields = fields || ["name", "category", "city", "area", "pin_code", "phone", "website_url"];
      var defs = {
        name: [t("Business name"), "text", "organization", t("As it appears on Google"), function (v) { return V.required(v, 2); }],
        category: [t("Business category"), "text", "off", t("For example: Dental clinic, Restaurant"), function (v) { return V.required(v, 2); }],
        city: [t("City"), "text", "address-level2", "", function (v) { return V.required(v, 2); }],
        area: [t("Area or locality"), "text", "address-line2", t("Neighbourhood your customers search from"), null],
        pin_code: [t("PIN code"), "text", "postal-code", t("6 digits"), V.pin],
        phone: [t("Phone"), "tel", "tel", t("Mobile or landline with STD code"), V.phone],
        website_url: [t("Website"), "url", "url", t("Optional. Needed to check your website in the audit."), V.url]
      };
      var inputs = {}, wrap = h("div", { class: "app-row" });
      fields.forEach(function (k) {
        var d = defs[k], inp = h("input", { type: d[1] === "url" ? "text" : d[1], name: k, autocomplete: d[2], inputmode: k === "pin_code" ? "numeric" : k === "phone" ? "tel" : null, maxlength: k === "pin_code" ? 6 : 200, value: init[k] || "", list: k === "category" ? "app-cats" : null, required: d[4] === V.pin || d[4] === V.phone || d[4] === V.url || !d[4] ? null : true });
        inputs[k] = inp;
        wrap.appendChild(UI.field(d[0] + (d[4] && d[4] !== V.pin && d[4] !== V.phone && d[4] !== V.url ? " *" : ""), inp, d[3]));
      });
      if (inputs.category) wrap.appendChild(h("datalist", { id: "app-cats" }, CATS.map(function (c) { return h("option", { value: c }); })));
      function validate() {
        var ok = true, first = null;
        fields.forEach(function (k) {
          var f = defs[k][4], msg = f ? f(inputs[k].value) : "";
          UI.setFieldError(inputs[k], msg);
          if (msg) { ok = false; first = first || inputs[k]; }
        });
        if (first) first.focus();
        return ok;
      }
      function get() {
        var o = {};
        fields.forEach(function (k) { var v = inputs[k].value.trim(); if (k === "website_url") v = V.normUrl(v); o[k] = v; });
        if (o.area) o.address = o.area;
        return o;
      }
      return { el: wrap, get: get, validate: validate };
    },
    keyword: function (onAdd, ent) {
      var kw = h("input", { name: "keyword", maxlength: 120, autocomplete: "off", required: true }), loc = h("input", { name: "location", maxlength: 120, autocomplete: "off", required: true }),
        dev = UI.select([["mobile", t("Mobile")], ["desktop", t("Desktop")]], "mobile", { name: "device" });
      var btn = h("button", { class: "app-btn app-btn-primary", type: "submit" }, t("Add keyword"));
      var form = h("form", { class: "app-row", novalidate: true, onsubmit: function (e) {
        e.preventDefault();
        var a = V.required(kw.value, 3), b = V.required(loc.value, 2);
        UI.setFieldError(kw, a ? t("Enter a keyword of at least 3 characters.") : ""); UI.setFieldError(loc, b ? t("Enter the area to track, for example Andheri West, Mumbai.") : "");
        if (a || b) return (a ? kw : loc).focus();
        UI.act(btn, function () { return onAdd({ keyword: kw.value.trim(), location_name: loc.value.trim(), device: dev.value }).then(function () { kw.value = ""; kw.focus(); }); }, t("Keyword added"));
      } }, UI.field(t("Keyword"), kw, t("What customers search, e.g. dentist near me")), UI.field(t("Target area"), loc, t("Neighbourhood and city")), UI.field(t("Device"), dev), h("div", { class: "app-field", style: "flex:0 0 auto" }, btn));
      return form;
    }
  };
})();
(function () {
  var LB = window.LB;
  /* Normalise a 30-day plan response: {plan|days|items:[{day,title,description|instructions,category,status}]}. */
  LB.planItems = function (d) {
    var a = (d && (d.plan || d.days || d.items || d.tasks)) || [];
    if (!Array.isArray(a)) return [];
    return a.map(function (x, i) { return { day: x.day || x.day_number || i + 1, title: x.title || x.task || "", description: x.description || x.instructions || x.detail || "", category: x.category || "", status: x.status || "open", finding_id: x.finding_id || null, id: x.id || null }; });
  };
  LB.latest = function (arr) { return (arr || []).slice().sort(function (a, b) { return (LB.fmt.ms(b.created_at) || 0) - (LB.fmt.ms(a.created_at) || 0); })[0] || null; };
  LB.locTitle = function (l) {
    var raw = {}; try { raw = typeof l.raw_json === "string" ? JSON.parse(l.raw_json) : (l.raw_json || {}); } catch (_) {}
    var addr = raw.storefrontAddress || {}; var a = [].concat(addr.addressLines || [], addr.locality || []).filter(Boolean).join(", ");
    return { title: l.location_name || l.name || raw.title || l.resource_name, address: a };
  };
})();
