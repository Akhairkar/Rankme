/* LocalBoost consent manager (assets/consent.js) -> window.LBConsent
   Add to every page:  <script src="/assets/localboost-api-config.js" defer></script>
                       <script src="/assets/consent.js" defer></script>
   Footer link:        <a href="#" data-lb-cookie-settings>Cookie settings</a>  (or call LBConsent.open())
   API: get() -> 'accepted'|'declined'|null, granted() -> bool, set(v), open(), onChange(fn)->unsubscribe.
   Nothing is tracked unless accepted: analytics.js is only fetched after acceptance. */
(function () {
  var KEY = 'lb_cookie_consent', listeners = [], banner = null, lastFocus = null;
  var hi = (document.documentElement.lang || '').slice(0, 2) === 'hi';
  var T = hi ? {
    msg: 'हम साइट चलाने और अनुभव बेहतर करने के लिए सीमित डेटा इस्तेमाल करते हैं। स्वीकार करने पर ही गुमनाम उपयोग-आँकड़े भेजे जाते हैं। देखें: <a href="/hi/privacy/">प्राइवेसी पॉलिसी</a>।',
    yes: 'स्वीकार करें', no: 'अस्वीकार करें', label: 'कुकी सहमति', set: 'कुकी सेटिंग'
  } : {
    msg: 'We use limited data to run the site. Anonymous usage stats are sent only if you accept. See our <a href="/privacy/">Privacy Policy</a>.',
    yes: 'Accept', no: 'Decline', label: 'Cookie consent', set: 'Cookie settings'
  };
  function get() { try { var v = localStorage.getItem(KEY); return v === 'accepted' || v === 'declined' ? v : null; } catch (e) { return null; } }
  function granted() { return get() === 'accepted'; }
  function loadAnalytics() {
    if (!granted() || window.__lbAnalyticsAsked || document.querySelector('script[src*="/analytics.js"]')) return;
    window.__lbAnalyticsAsked = true;
    var me = document.currentScript || document.querySelector('script[src*="consent.js"]');
    var s = document.createElement('script');
    s.src = me && me.src ? me.src.replace(/consent\.js(\?.*)?$/, 'analytics.js') : '/assets/analytics.js';
    s.defer = true; document.head.appendChild(s);
  }
  function consentMode() {
    if (typeof window.gtag === 'function') window.gtag('consent', 'update', { analytics_storage: granted() ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  }
  function set(v) {
    if (v !== 'accepted' && v !== 'declined') return;
    var prev = get();
    try { localStorage.setItem(KEY, v); } catch (e) {}
    close(); consentMode();
    if (v === 'accepted') loadAnalytics();
    if (prev !== v) listeners.slice().forEach(function (f) { try { f(v, prev); } catch (e) {} });
    try { document.dispatchEvent(new CustomEvent('lb:consent', { detail: { value: v } })); } catch (e) {}
  }
  function close() { if (banner) { banner.remove(); banner = null; if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {} } }
  function css() {
    if (document.getElementById('lbConsentCss')) return;
    var s = document.createElement('style'); s.id = 'lbConsentCss';
    s.textContent = '#lbCookieConsent{position:fixed;bottom:12px;left:12px;right:12px;max-width:680px;margin:0 auto;background:#0F172A;color:#E2E8F0;border:1px solid #334155;border-radius:12px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:99999;font:12.5px/1.5 Manrope,"Noto Sans Devanagari",system-ui,sans-serif;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}' +
      '#lbCookieConsent p{margin:0;flex:1 1 260px}#lbCookieConsent a{color:#7DD3FC;text-decoration:underline}' +
      '#lbCookieConsent div{display:flex;gap:8px;margin-left:auto}#lbCookieConsent button{font:inherit;font-size:13px;font-weight:700;min-height:44px;min-width:44px;padding:6px 16px;border-radius:8px;cursor:pointer}' +
      '#lbCookieConsent button:focus-visible,#lbCookieConsent a:focus-visible{outline:3px solid #5EEAD4;outline-offset:2px}' +
      '#lbConsentDecline{background:transparent;border:1px solid #94A3B8;color:#E2E8F0}#lbConsentDecline:hover{background:#1E293B}' +
      '#lbConsentAccept{background:#2DD4BF;border:1px solid #2DD4BF;color:#042F2E}#lbConsentAccept:hover{background:#5EEAD4}';
    document.head.appendChild(s);
  }
  function open() {
    if (banner || !document.body) return;
    css(); lastFocus = document.activeElement;
    banner = document.createElement('div'); banner.id = 'lbCookieConsent';
    banner.setAttribute('role', 'dialog'); banner.setAttribute('aria-label', T.label);
    banner.innerHTML = '<p>' + T.msg + '</p><div><button type="button" id="lbConsentDecline">' + T.no + '</button><button type="button" id="lbConsentAccept">' + T.yes + '</button></div>';
    document.body.appendChild(banner);
    banner.querySelector('#lbConsentAccept').onclick = function () { set('accepted'); };
    banner.querySelector('#lbConsentDecline').onclick = function () { set('declined'); };
    banner.addEventListener('keydown', function (e) { if (e.key === 'Escape' && get()) close(); });
    if (get()) banner.querySelector('#lbConsentAccept').focus();
  }
  window.LBConsent = {
    get: get, granted: granted, set: set, open: open,
    onChange: function (f) { listeners.push(f); return function () { listeners = listeners.filter(function (x) { return x !== f; }); }; }
  };
  /* Safe no-op until analytics.js is loaded, so pages can call LBTrack() unconditionally. */
  if (!window.LBTrack) window.LBTrack = function () {};
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-lb-cookie-settings]');
    if (a) { e.preventDefault(); open(); }
  });
  window.addEventListener('storage', function (e) { if (e.key === KEY) { close(); loadAnalytics(); } });
  function init() { if (get() === null) open(); else loadAnalytics(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
