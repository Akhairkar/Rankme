/* LocalBoost first-party analytics (assets/analytics.js) -> window.LBTrack(name, props)
   Privacy: no cookies, no third-party scripts, nothing sent unless LBConsent.granted() AND
   window.LOCALBOOST_API.enabled. Loaded automatically by consent.js after acceptance.
   Events (fixed whitelist, also enforced server-side): page_view, tool_used, audit_started,
   audit_completed, signup_started, google_connect_clicked, waitlist_submitted, pricing_viewed,
   checkout_started, checkout_completed.   Props sent: {tool, path, lang, plan} only. */
(function () {
  if (window.__lbAnalyticsLoaded) return; window.__lbAnalyticsLoaded = true;
  var OK = ['page_view', 'tool_used', 'audit_started', 'audit_completed', 'signup_started', 'google_connect_clicked', 'waitlist_submitted', 'pricing_viewed', 'checkout_started', 'checkout_completed'];
  function allowed() {
    var c = window.LBConsent, api = window.LOCALBOOST_API;
    return !!(c && c.granted() && api && api.enabled && api.baseUrl);
  }
  function str(v, n) { return typeof v === 'string' ? v.slice(0, n) : undefined; }
  function track(name, props) {
    try {
      if (OK.indexOf(name) < 0 || !allowed()) return false;
      props = props || {};
      var p = { path: location.pathname.slice(0, 200), lang: (document.documentElement.lang || 'en').slice(0, 2) };
      var tool = str(props.tool, 60), plan = str(props.plan, 40);
      if (tool) p.tool = tool; if (plan) p.plan = plan;
      var url = String(window.LOCALBOOST_API.baseUrl).replace(/\/$/, '') + '/api/events';
      fetch(url, { method: 'POST', keepalive: true, credentials: 'omit', mode: 'cors',
        headers: { 'content-type': 'application/json', 'x-lb-consent': 'granted' },
        body: JSON.stringify({ event: name, props: p }) }).catch(function () {});
      return true;
    } catch (e) { return false; }
  }
  window.LBTrack = track;
  var path = location.pathname;
  function auto() {
    track('page_view');
    if (/(^|\/)pricing\/?$/.test(path) || /(^|\/)pricing\//.test(path)) track('pricing_viewed', { plan: (location.search.match(/[?&]plan=([\w-]+)/) || [])[1] });
  }
  if (document.readyState === 'complete') auto(); else window.addEventListener('load', auto);
})();
