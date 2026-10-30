/* LocalBoost dashboard API client. Plain script, no framework. */
(function () {
  "use strict";
  var LB = (window.LB = window.LB || {});
  var cfg = window.LOCALBOOST_API || {};
  var base = String(cfg.baseUrl || "").replace(/\/$/, "");
  var enabled = cfg.enabled === true && !!base;

  function normalise(e, status) {
    if (e && e.__lb) return e;
    var err = { __lb: true, status: status || 0, code: "error", message: "", data: null };
    if (e && e.name === "AbortError") { err.code = "timeout"; err.message = "The request timed out."; }
    else if (e instanceof TypeError) { err.code = "network"; err.message = "Could not reach the LocalBoost API."; }
    else if (e && typeof e === "object") { err.message = e.message || ""; }
    return err;
  }

  function request(method, path, body, opts) {
    opts = opts || {};
    if (!enabled) {
      return Promise.reject({ __lb: true, status: 0, code: "api_disabled", message: "Production API not connected yet.", data: null });
    }
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeout || 20000) : null;
    var headers = { Accept: opts.text ? "text/csv, application/json" : "application/json" };
    var init = { method: method, credentials: "include", headers: headers };
    if (ctl) init.signal = ctl.signal;
    if (body !== undefined) { headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
    return fetch(base + path, init).then(function (res) {
      return (opts.text ? res.text() : res.text().then(function (t) { try { return t ? JSON.parse(t) : {}; } catch (_) { return { _raw: t }; } }))
        .then(function (data) {
          if (res.ok) return data;
          var d = (data && typeof data === "object") ? data : {};
          var err = { __lb: true, status: res.status, code: d.code || (res.status === 401 ? "unauthenticated" : res.status === 403 ? "forbidden" : "http_" + res.status),
            message: d.error || d.message || "Request failed (" + res.status + ").", data: d };
          if (res.status === 401) { document.dispatchEvent(new CustomEvent("lb:signedout")); }
          throw err;
        });
    }).catch(function (e) { throw normalise(e); })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function q(params) {
    var s = [];
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null && params[k] !== "") s.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
    });
    return s.length ? "?" + s.join("&") : "";
  }

  LB.api = {
    enabled: enabled,
    base: base,
    q: q,
    get: function (path, params, opts) { return request("GET", path + q(params), undefined, opts); },
    getText: function (path, params) { return request("GET", path + q(params), undefined, { text: true }); },
    post: function (path, body, params, opts) { return request("POST", path + q(params), body === undefined ? {} : body, opts); },
    /* Run fn up to n times with a small back-off, only for network/timeout/5xx. */
    retry: function (fn, n) {
      n = n || 3;
      return fn().catch(function (e) {
        var transient = e && (e.code === "network" || e.code === "timeout" || e.status >= 500);
        if (n > 1 && transient) return new Promise(function (r) { setTimeout(r, 600); }).then(function () { return LB.api.retry(fn, n - 1); });
        throw e;
      });
    },
    signInUrl: function (extra) { return base + "/auth/google/start" + q(extra); },
    isUpgrade: function (e) { var c = e && (e.code || (e.data && e.data.code)); return !!e && e.status === 403 && /upgrade_required$/.test(c || ""); }
  };
})();
