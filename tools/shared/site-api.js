/* Client for the LocalBoost public crawler endpoints (POST /api/site-check, GET /api/pagespeed).
   Only used by the Website SEO Checker and Competitor Comparison tools. Requires LB (tool-common.js). */
(function () {
  var S = window.LBSite = {};
  var M = {
    en: {
      blocked: 'This address cannot be checked. The checker only fetches public web pages on the standard web ports. These are not allowed: localhost or internal hostnames, private-network or raw IP addresses, links with a username or password, non-web schemes (such as ftp:), and non-standard ports.',
      reasons: { invalid_url: 'The address is not a valid URL.', unsupported_protocol: 'Only http:// and https:// addresses are supported.', credentials_not_allowed: 'Remove the username and password from the URL.', port_not_allowed: 'Only the standard web ports (80 and 443) are allowed.', private_address: 'Private-network addresses are not allowed.', ip_literal_not_allowed: 'Raw IP addresses are not allowed; use the domain name.', internal_hostname: 'Internal hostnames (without a dot) are not allowed.' },
      unreachable: 'The website could not be reached.',
      ureasons: { timeout: 'The site did not respond within 8 seconds.', network_error: 'The server could not be contacted (DNS or connection error).', too_many_redirects: 'The site redirects too many times.', redirect_loop: 'The site redirects in a loop.', blocked_redirect: 'The site redirected to an address that cannot be checked.', robots_disallowed: 'robots.txt disallows our checker for this page.', bad_redirect: 'The site sent an invalid redirect.' },
      rate: 'Rate limit reached. The free checker allows 10 checks per hour from one network. Please try again later.',
      network: 'Could not reach the LocalBoost API (network error). Check your internet connection and try again.',
      server: 'The checker returned an error', badurl: 'Enter a valid website address, for example https://www.example.com',
      empty: 'Enter a website address.', scheme: 'Only http:// and https:// addresses are supported.', credentials: 'Remove the username and password from the address.'
    },
    hi: {
      blocked: 'इस पते की जाँच नहीं हो सकती। चेकर सिर्फ़ सार्वजनिक वेब पेज और मानक वेब पोर्ट से लेता है। ये अनुमति में नहीं हैं: localhost या आंतरिक होस्टनेम, प्राइवेट-नेटवर्क या सीधे IP पते, यूज़रनेम/पासवर्ड वाले लिंक, गैर-वेब स्कीम (जैसे ftp:), और गैर-मानक पोर्ट।',
      reasons: { invalid_url: 'यह पता सही URL नहीं है।', unsupported_protocol: 'सिर्फ़ http:// और https:// पते चलते हैं।', credentials_not_allowed: 'URL से यूज़रनेम और पासवर्ड हटाएँ।', port_not_allowed: 'सिर्फ़ मानक वेब पोर्ट (80 और 443) की अनुमति है।', private_address: 'प्राइवेट-नेटवर्क पते की अनुमति नहीं है।', ip_literal_not_allowed: 'सीधे IP पते की अनुमति नहीं है; डोमेन नाम इस्तेमाल करें।', internal_hostname: 'बिना डॉट वाले आंतरिक होस्टनेम की अनुमति नहीं है।' },
      unreachable: 'वेबसाइट तक पहुँचा नहीं जा सका।',
      ureasons: { timeout: 'साइट ने 8 सेकंड में जवाब नहीं दिया।', network_error: 'सर्वर से संपर्क नहीं हो सका (DNS या कनेक्शन त्रुटि)।', too_many_redirects: 'साइट बहुत ज़्यादा रीडायरेक्ट करती है।', redirect_loop: 'साइट रीडायरेक्ट के चक्कर में है।', blocked_redirect: 'साइट ऐसे पते पर रीडायरेक्ट हुई जिसकी जाँच नहीं हो सकती।', robots_disallowed: 'robots.txt इस पेज के लिए हमारे चेकर को मना करता है।', bad_redirect: 'साइट ने गलत रीडायरेक्ट भेजा।' },
      rate: 'सीमा पूरी हो गई। मुफ़्त चेकर एक नेटवर्क से घंटे में 10 जाँच की अनुमति देता है। कृपया बाद में कोशिश करें।',
      network: 'LocalBoost API तक नहीं पहुँचा जा सका (नेटवर्क त्रुटि)। इंटरनेट कनेक्शन जाँचकर दोबारा कोशिश करें।',
      server: 'चेकर ने त्रुटि लौटाई', badurl: 'सही वेबसाइट पता डालें, जैसे https://www.example.com',
      empty: 'वेबसाइट का पता डालें।', scheme: 'सिर्फ़ http:// और https:// पते चलते हैं।', credentials: 'पते से यूज़रनेम और पासवर्ड हटाएँ।'
    }
  };
  S.m = function (k) { return LB.t(M, k); };
  S.urlError = function (code) { return S.m(code === 'invalid' ? 'badurl' : code); };
  S.reason = function (r) { var d = (M[LB.lang] || M.en).reasons; return d[r] || ''; };
  S.ureason = function (r) { var d = (M[LB.lang] || M.en).ureasons; return d[r] || ''; };

  function fetchJson(url, opts, ms) {
    var ctl = new AbortController(); var timer = setTimeout(function () { ctl.abort(); }, ms || 60000);
    opts = opts || {}; opts.signal = ctl.signal; opts.credentials = 'include';
    return fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (j) { return { status: res.status, ok: res.ok, json: j || {}, retry: res.headers.get('retry-after') }; });
    }, function (err) { clearTimeout(timer); throw err; });
  }

  /* Resolves {kind: ok|blocked|unreachable|ratelimit|network|error, data?, status?, message?} */
  S.check = function (url) {
    var base = LB.api();
    if (!base) return Promise.resolve({ kind: 'disabled' });
    return fetchJson(base + '/api/site-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url }) }, 70000).then(function (r) {
      if (r.status === 429) return { kind: 'ratelimit', retry: r.retry };
      var d = r.json;
      if (d.state === 'blocked_url') return { kind: 'blocked', data: d };
      if (d.state === 'unreachable') return { kind: 'unreachable', data: d };
      if (!r.ok || !d.state) return { kind: 'error', status: r.status, message: d.error || '' , code: d.code };
      return { kind: 'ok', data: d };
    }, function () { return { kind: 'network' }; });
  };

  S.pagespeed = function (url, strategy) {
    var base = LB.api();
    if (!base) return Promise.resolve({ kind: 'disabled' });
    return fetchJson(base + '/api/pagespeed?url=' + encodeURIComponent(url) + '&strategy=' + (strategy === 'desktop' ? 'desktop' : 'mobile'), { method: 'GET' }, 40000).then(function (r) {
      if (r.status === 429) return { kind: 'ratelimit' };
      var d = r.json;
      if (d.state === 'verified_data') return { kind: 'ok', data: d };
      if (d.state === 'provider_not_configured') return { kind: 'hidden' };
      return { kind: 'unavailable', data: d };
    }, function () { return { kind: 'network' }; });
  };

  /* Core Web Vitals thresholds published by Google (web.dev). */
  S.rate = function (metric, v) {
    if (v == null) return '';
    var t = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] }[metric];
    return v <= t[0] ? 'good' : (v <= t[1] ? 'ni' : 'poor');
  };
  S.fmtMs = function (v) { return v == null ? '-' : (v >= 1000 ? (v / 1000).toFixed(2) + ' s' : Math.round(v) + ' ms'); };
  S.fmtCls = function (v) { return v == null ? '-' : String(Math.round(v * 1000) / 1000); };
})();
