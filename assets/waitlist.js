// LocalBoost waitlist form. Renders into <div data-lb-waitlist data-source="..."></div>.
// Posts to the LocalBoost API when it is enabled; otherwise offers an honest email fallback.
(function () {
  var hi = document.documentElement.lang === 'hi';
  var T = hi ? {
    title: 'लाइव Google ऑडिट और 30-दिन की योजना पाएँ',
    sub: 'Pro शुरू होते ही हम आपको बताएँगे। कोई स्पैम नहीं, कोई क्रेडिट कार्ड नहीं।',
    biz: 'व्यवसाय का नाम', city: 'शहर / इलाका', email: 'ईमेल', phone: 'मोबाइल (वैकल्पिक)',
    consent: 'मैं LocalBoost से अपडेट पाने के लिए सहमत हूँ। प्राइवेसी पॉलिसी देखें।',
    btn: 'वेटलिस्ट में जुड़ें', sending: 'भेजा जा रहा है…',
    ok: 'धन्यवाद! आप वेटलिस्ट में हैं। लॉन्च पर हम आपसे संपर्क करेंगे।',
    err: 'कुछ गड़बड़ हुई। कृपया दोबारा कोशिश करें।', need: 'ईमेल या मोबाइल नंबर ज़रूरी है और सहमति देनी होगी।',
    fbTitle: 'वेटलिस्ट अभी खुल रही है', fbText: 'कृपया हमें ईमेल करें और हम आपको जोड़ देंगे:', fbBtn: 'ईमेल भेजें', priv: '/hi/privacy/'
  } : {
    title: 'Get a live Google audit and a 30-day plan',
    sub: "We'll tell you the moment Pro opens. No spam, no credit card.",
    biz: 'Business name', city: 'City / locality', email: 'Email', phone: 'Mobile (optional)',
    consent: 'I agree to receive updates from LocalBoost. See the Privacy Policy.',
    btn: 'Join the waitlist', sending: 'Sending…',
    ok: "Thanks! You're on the waitlist. We'll contact you at launch.",
    err: 'Something went wrong. Please try again.', need: 'Enter an email or mobile number and accept the consent box.',
    fbTitle: 'Waitlist is opening shortly', fbText: 'Please email us and we will add you:', fbBtn: 'Send email', priv: '/privacy/'
  };
  var ctx = { score: null, biz: '' };
  var form;

  function api() { var c = window.LOCALBOOST_API || {}; return c.enabled && c.baseUrl ? c.baseUrl.replace(/\/$/, '') : null; }
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (html) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function build(host) {
    var source = host.getAttribute('data-source') || 'site';
    host.className = 'lb-wl';
    host.innerHTML =
      '<h3>' + T.title + '</h3><p class="lb-wl-sub">' + T.sub + '</p>' +
      '<form novalidate>' +
      '<input name="business_name" placeholder="' + T.biz + '" autocomplete="organization" maxlength="120">' +
      '<input name="city" placeholder="' + T.city + '" maxlength="120">' +
      '<input name="email" type="email" placeholder="' + T.email + '" autocomplete="email" maxlength="254">' +
      '<input name="phone" type="tel" placeholder="' + T.phone + '" autocomplete="tel" maxlength="15">' +
      '<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="lb-wl-hp">' +
      '<label class="lb-wl-consent"><input type="checkbox" name="consent"> <span>' + T.consent.replace(/Privacy Policy|प्राइवेसी पॉलिसी/, '<a href="' + T.priv + '">$&</a>') + '</span></label>' +
      '<button type="submit" class="lb-wl-btn">' + T.btn + '</button>' +
      '<p class="lb-wl-msg" role="status" aria-live="polite"></p></form>';
    var f = host.querySelector('form'), msg = host.querySelector('.lb-wl-msg'), btn = host.querySelector('button');
    if (ctx.biz) f.business_name.value = ctx.biz;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = {
        business_name: f.business_name.value, city: f.city.value, email: f.email.value, phone: f.phone.value,
        website: f.website.value, consent: f.consent.checked, source: source, score: ctx.score, lang: hi ? 'hi' : 'en'
      };
      if ((!d.email.trim() && !d.phone.trim()) || !d.consent) { msg.className = 'lb-wl-msg err'; msg.textContent = T.need; return; }
      var base = api();
      if (!base) { // API not live yet: honest fallback, nothing is silently dropped
        var body = 'Business: ' + d.business_name + '\nCity: ' + d.city + '\nEmail: ' + d.email + '\nPhone: ' + d.phone + (d.score != null ? '\nAudit score: ' + d.score : '');
        var href = 'mailto:support@localboost.in?subject=' + encodeURIComponent('LocalBoost waitlist') + '&body=' + encodeURIComponent(body);
        f.style.display = 'none';
        host.insertAdjacentHTML('beforeend', '<div class="lb-wl-fb"><strong>' + T.fbTitle + '</strong><p>' + T.fbText + '</p><a class="lb-wl-btn" href="' + esc(href) + '">' + T.fbBtn + '</a></div>');
        return;
      }
      btn.disabled = true; btn.textContent = T.sending;
      fetch(base + '/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (x.ok) { f.style.display = 'none'; host.insertAdjacentHTML('beforeend', '<p class="lb-wl-ok">' + T.ok + '</p>'); }
          else { msg.className = 'lb-wl-msg err'; msg.textContent = x.j && x.j.error ? x.j.error : T.err; btn.disabled = false; btn.textContent = T.btn; }
        })
        .catch(function () { msg.className = 'lb-wl-msg err'; msg.textContent = T.err; btn.disabled = false; btn.textContent = T.btn; });
    });
  }

  window.LBWaitlist = { setContext: function (c) { for (var k in c) ctx[k] = c[k]; var f = document.querySelector('.lb-wl form'); if (f && ctx.biz && !f.business_name.value) f.business_name.value = ctx.biz; } };
  function init() { Array.prototype.forEach.call(document.querySelectorAll('[data-lb-waitlist]'), build); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
