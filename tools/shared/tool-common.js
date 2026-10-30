/* LocalBoost tool helpers (browser only). Shared by the interactive tools in /tools/ and /hi/tools/.
   Nothing in here sends data anywhere. */
(function () {
  var LB = window.LB = window.LB || {};
  LB.lang = (document.documentElement.getAttribute('lang') || 'en').slice(0, 2) === 'hi' ? 'hi' : 'en';
  LB.$ = function (id) { return document.getElementById(id); };
  LB.t = function (dict, key) { var d = dict[LB.lang] || dict.en; return (d && d[key] != null) ? d[key] : (dict.en[key] != null ? dict.en[key] : key); };

  LB.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* Copy text. Uses the async clipboard API and falls back to a hidden textarea. */
  LB.copy = function (text, btn, doneLabel) {
    function done(ok) {
      if (!btn) return;
      var old = btn.getAttribute('data-label') || btn.textContent;
      btn.setAttribute('data-label', old);
      btn.textContent = ok ? (doneLabel || (LB.lang === 'hi' ? 'कॉपी हो गया' : 'Copied')) : (LB.lang === 'hi' ? 'कॉपी नहीं हुआ' : 'Copy failed');
      clearTimeout(btn._lbT);
      btn._lbT = setTimeout(function () { btn.textContent = old; }, 1600);
    }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        done(!!ok);
      } catch (e) { done(false); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
      } else { fallback(); }
    } catch (e) { fallback(); }
  };

  /* CSV cell: always quoted, quotes doubled, and a leading = + - @ tab or CR is neutralised
     with an apostrophe so spreadsheets never treat the cell as a formula. */
  LB.csvCell = function (v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  LB.csv = function (rows) { return rows.map(function (r) { return r.map(LB.csvCell).join(','); }).join('\r\n') + '\r\n'; };

  LB.download = function (filename, mime, content) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  };

  LB.store = {
    get: function (k, fallback) { try { var v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  LB.api = function () {
    var c = window.LOCALBOOST_API || {};
    return (c.enabled === true && c.baseUrl) ? String(c.baseUrl).replace(/\/$/, '') : null;
  };

  /* Normalise a typed website address. Returns {ok, url, error}. */
  LB.normalizeUrl = function (raw) {
    var s = String(raw || '').trim();
    if (!s) return { ok: false, error: 'empty' };
    if (/\s/.test(s)) return { ok: false, error: 'invalid' };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^\/]*\.[^\/:]+:\d+/.test(s)) return { ok: false, error: 'scheme' };
      s = 'https://' + s;
    }
    var u;
    try { u = new URL(s); } catch (e) { return { ok: false, error: 'invalid' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'scheme' };
    if (u.username || u.password) return { ok: false, error: 'credentials' };
    var h = u.hostname;
    if (!/\.[a-z]{2,}$/i.test(h) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return { ok: false, error: 'invalid' };
    return { ok: true, url: u.href };
  };
})();
