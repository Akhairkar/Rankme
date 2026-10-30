/* Reviews and reply suggestions. Replies are never posted without an explicit confirmation. */
(function () {
  "use strict";
  var LB = window.LB, t = LB.t, UI = LB.ui, h = UI.h, F = LB.fmt, api = LB.api;
  var P = {};

  /* Client-side reply templates (suggestions only; the owner edits and confirms). */
  var TPL = {
    en: {
      warm: { pos: "Thank you so much, {name}! We are delighted you had a great experience at {biz}. Your kind words mean a lot to our team, and we look forward to welcoming you again soon.", neu: "Thank you for your feedback, {name}. We appreciate you visiting {biz} and are always looking for ways to do better. If there is anything we can improve, please tell us.", neg: "Dear {name}, we are sorry that your experience at {biz} fell short. We would like to make this right. Please contact us directly so we can understand what happened and help." },
      short: { pos: "Thank you, {name}! We are glad you enjoyed {biz}.", neu: "Thanks for your feedback, {name}. We are always working to improve.", neg: "Sorry about your experience, {name}. Please contact us so we can put it right." }
    },
    hi: {
      warm: { pos: "{name}, बहुत-बहुत धन्यवाद! हमें खुशी है कि {biz} में आपका अनुभव अच्छा रहा। आपके शब्द हमारी टीम के लिए बहुत मायने रखते हैं। हम जल्द ही आपका फिर स्वागत करेंगे।", neu: "{name}, आपकी प्रतिक्रिया के लिए धन्यवाद। {biz} आने के लिए आभार। हम हमेशा बेहतर होने की कोशिश करते हैं। कुछ सुधार सुझाना चाहें तो ज़रूर बताइए।", neg: "प्रिय {name}, हमें खेद है कि {biz} में आपका अनुभव अच्छा नहीं रहा। हम इसे ठीक करना चाहते हैं। कृपया हमसे सीधे संपर्क करें ताकि हम समझ सकें कि क्या हुआ और आपकी मदद कर सकें।" },
      short: { pos: "धन्यवाद, {name}! हमें खुशी है कि आपको {biz} पसंद आया।", neu: "प्रतिक्रिया के लिए धन्यवाद, {name}। हम लगातार सुधार कर रहे हैं।", neg: "{name}, आपके अनुभव के लिए खेद है। कृपया हमसे संपर्क करें, हम इसे ठीक करेंगे।" }
    }
  };
  function suggest(r, biz, tone) {
    var k = r.rating >= 4 ? "pos" : r.rating === 3 ? "neu" : "neg";
    return TPL[LB.lang][tone][k].replace(/\{name\}/g, r.reviewer_display_name || t("there")).replace(/\{biz\}/g, biz);
  }
  function stars(n) { return h("span", null, h("span", { class: "app-stars", "aria-hidden": "true" }, "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n))), h("span", { class: "app-sr" }, t("{n} out of 5 stars", { n: n }))); }
  var answered = function (r) { return r.reply_status && r.reply_status !== "unanswered" && r.reply_status !== "unknown"; };

  function postReply(ctx, r, text) {
    return UI.modal({ title: t("Post this reply publicly on Google?"), body: h("div", null, h("p", null, t("This reply will be posted to Google as {b}, visible to everyone. It cannot be unsent from LocalBoost.", { b: ctx.business.name })), h("blockquote", { class: "app-pre" }, text)),
      actions: [{ label: t("Cancel"), value: false }, { label: t("Post to Google"), kind: "primary", run: function () { return api.post("/api/reviews/reply", { business_id: ctx.bid, review_id: r.id, reply: text, confirm: true }).then(function (res) {
        if (res.ok === true && (res.state === "posted" || res.reply_status === "answered")) { r.reply_status = "answered"; UI.toast(t("Reply posted to Google"), "ok"); return true; }
        UI.toast(t("Google has not confirmed the reply yet (state: {s}). It was not marked as posted.", { s: res.state || res.reply_status || "unknown" }), "info"); return false;
      }); } }] });
  }

  P.reviews = function () {
    LB.boot({ title: t("Reviews"), noHead: true, render: function (body, ctx) {
      var B = { business_id: ctx.bid }, box = h("div"), fetchBtn = UI.btn(t("Fetch from Google"));
      body.appendChild(UI.pageHead(t("Reviews"), t("Read your Google reviews and prepare replies. Nothing is posted until you confirm."), fetchBtn));
      body.appendChild(box);
      fetchBtn.addEventListener("click", function () { UI.act(fetchBtn, function () { return api.post("/api/reviews/google-fetch", { business_id: ctx.bid }).then(function (r) { if (r.state !== "verified_data") { UI.toast(t("Fetch state: {s}", { s: r.state }), "info"); } else UI.toast(t("{n} review(s) fetched", { n: r.fetched }), "ok"); load(); }); }); });
      function load() {
        UI.load(box, function () { return api.get("/api/reviews", B); }, function (d) {
          var rows = d.reviews || [], s = d.summary || {};
          if (!rows.length) return UI.stateFor(d.state === "awaiting_verified_data" ? "" : d.state, { google: {} }) || UI.S.empty({ title: t("No reviews stored yet"), body: t("Link your Google location, then press “Fetch from Google”. Reviews appear here once Google returns them."), actions: [UI.btn(t("Open Google connection"), { href: LB.href("google-profile.html") })] });
          var fil = { rating: "", st: "", q: "" }, list = h("div", { class: "app-list" }), cnt = h("p", { class: "app-hint", "aria-live": "polite" });
          function sel(label, key, opts) { var x = UI.select([["", t("All")]].concat(opts), "", {}); x.addEventListener("change", function () { fil[key] = x.value; draw(); }); return UI.field(label, x); }
          var q = h("input", { type: "search" }); q.addEventListener("input", function () { fil.q = q.value.toLowerCase(); draw(); });
          function draw() {
            var f = rows.filter(function (r) { return (!fil.rating || String(r.rating) === fil.rating) && (!fil.st || (fil.st === "un" ? !answered(r) : answered(r))) && (!fil.q || ((r.review_text || "") + (r.reviewer_display_name || "")).toLowerCase().indexOf(fil.q) >= 0); });
            cnt.textContent = t("Showing {n} of {m} reviews", { n: f.length, m: rows.length });
            UI.mount(list, f.length ? f.map(card) : UI.S.empty({ title: t("No reviews match these filters"), body: t("Clear a filter to see more.") }));
          }
          function card(r) {
            var ed = h("div", { hidden: true }), item = h("article", { class: "app-item" });
            function head() { UI.mount(item, [h("div", { class: "app-row", style: "align-items:center" }, stars(r.rating), h("strong", null, r.reviewer_display_name || t("Anonymous")), h("span", { class: "app-hint" }, F.date(r.review_time)), answered(r) ? UI.badge(t("Answered"), "ok") : UI.badge(t("Unanswered"), "warn")), h("p", null, r.review_text || h("em", null, t("(No text, rating only)"))), r.reply_status === "answered" ? null : UI.btn(answered(r) ? t("Edit reply") : t("Draft reply"), { small: true, onClick: function () { ed.hidden = !ed.hidden; if (!ed.hidden) build(); } }), ed]); }
            function build() {
              var ta = h("textarea", { "aria-label": t("Reply text"), maxlength: 4000 }), tone = UI.select([["warm", t("Warm")], ["short", t("Short")]], "warm", { "aria-label": t("Tone") });
              function fill() { ta.value = suggest(r, ctx.business.name, tone.value); } fill(); tone.addEventListener("change", fill);
              var cp = UI.btn(t("Copy"), { small: true, onClick: function () { try { navigator.clipboard.writeText(ta.value).then(function () { UI.toast(t("Copied"), "ok"); }); } catch (_) { ta.select(); } } });
              var post = UI.btn(t("Post to Google…"), { small: true, kind: "primary", onClick: function () { var txt = ta.value.trim(); if (txt.length < 5) return UI.toast(t("Write a reply first."), "bad"); postReply(ctx, r, txt).then(function (ok) { if (ok) head(); }); } });
              UI.mount(ed, [h("p", { class: "app-hint" }, t("This is a suggestion from a template. Edit it so it sounds like you.")), UI.field(t("Tone"), tone), ta, h("div", { class: "app-actions", style: "margin-top:8px" }, cp, post)]);
            }
            head(); return item;
          }
          var out = [h("div", { class: "app-grid3" }, UI.tile({ label: t("Reviews stored"), value: s.count }), UI.tile({ label: t("Average rating"), value: s.average_rating ? F.num(Number(s.average_rating), 2) : null }), UI.tile({ label: t("Unanswered"), value: s.unanswered }))];
          out.push(UI.card(t("All reviews"), [h("div", { class: "app-filters" }, sel(t("Rating"), "rating", [5, 4, 3, 2, 1].map(function (n) { return [String(n), n + " ★"]; })), sel(t("Reply status"), "st", [["un", t("Unanswered")], ["an", t("Answered")]]), UI.field(t("Search"), q)), cnt, list])); setTimeout(draw, 0); return out;
        });
      }
      load();
    } });
  };

  P.autoreply = function () {
    LB.boot({ title: t("Reply suggestions"), lead: t("LocalBoost drafts review replies for you. These are draft suggestions only. Nothing is posted without your confirmation."), render: function (body, ctx) {
      body.appendChild(UI.state("noapi", { title: t("Automatic reply rules are not available"), body: t("There is no server feature for saving automatic reply rules, so none can be stored. This page will not pretend otherwise. Use the Reviews page to draft a reply and post it yourself after confirming."), actions: [UI.btn(t("Go to reviews"), { kind: "primary", href: LB.href("reviews/") })] }));
      body.appendChild(UI.card(t("Preview of the draft templates"), h("div", { class: "app-list" }, [["pos", 5], ["neu", 3], ["neg", 1]].map(function (x) { return h("div", { class: "app-item" }, stars(x[1]), h("p", { class: "app-pre" }, suggest({ rating: x[1], reviewer_display_name: t("Customer") }, ctx.business.name, "warm"))); }))));
    } });
  };
  LB.start(P);
})();
