/* Lightweight i18n: English source strings are the keys. Hindi lives in i18n-hi.js (loaded on /hi/ pages only). */
(function () {
  "use strict";
  var LB = (window.LB = window.LB || {});
  LB.lang = document.documentElement.lang === "hi" ? "hi" : "en";
  LB.locale = LB.lang === "hi" ? "hi-IN" : "en-IN";
  LB.t = function (s, vars) {
    var r = (LB.lang === "hi" && LB.HI && LB.HI[s]) || s;
    if (vars) r = r.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return r;
  };
  /* Dashboard root for the current language, and helper to build links. */
  LB.root = LB.lang === "hi" ? "/hi/dashboard/" : "/dashboard/";
  LB.href = function (rel) { return LB.root + (rel || ""); };
})();
