/* LocalBoost UI helpers (assets/lb-ui.js) -> window.LBUI. Dependency-free; every component degrades without it.
   - Tabs:  <div data-lb-tabs> with role=tablist/tab/tabpanel markup (arrow/Home/End keys, aria-selected)
   - Modal: <dialog class="lb-modal" id="x"> ; opener <button data-lb-open="x">; closers <button data-lb-close>
   - Toast: LBUI.toast('Saved', {type:'success'|'error'|'warning'|'info', timeout:5000})
   - App shell: <button data-lb-nav-toggle aria-controls="lb-sidebar"> toggles .is-nav-open on .lb-app
   - LBUI.trapFocus(el) -> release(): focus trap for custom drawers/popovers */
(function () {
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function trapFocus(el) {
    function onKey(e) {
      if (e.key !== 'Tab') return;
      var f = [].filter.call(el.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
    el.addEventListener('keydown', onKey);
    return function () { el.removeEventListener('keydown', onKey); };
  }
  function toast(msg, o) {
    o = o || {};
    var r = document.querySelector('.lb-toast-region');
    if (!r) { r = document.createElement('div'); r.className = 'lb-toast-region'; r.setAttribute('role', 'status'); r.setAttribute('aria-live', 'polite'); document.body.appendChild(r); }
    var t = document.createElement('div'); t.className = 'lb-toast' + (o.type && o.type !== 'info' ? ' lb-toast--' + o.type : '');
    var m = document.createElement('span'); m.className = 'lb-toast__msg'; m.textContent = msg; t.appendChild(m);
    var b = document.createElement('button'); b.type = 'button'; b.className = 'lb-btn lb-btn--ghost lb-btn--sm'; b.textContent = (document.documentElement.lang || '').slice(0, 2) === 'hi' ? 'बंद' : 'Dismiss';
    b.onclick = function () { t.remove(); }; t.appendChild(b); r.appendChild(t);
    if (o.timeout !== 0) setTimeout(function () { t.remove(); }, o.timeout || 5000);
    return t;
  }
  function openModal(id) {
    var d = typeof id === 'string' ? document.getElementById(id) : id; if (!d) return;
    d._lbReturn = document.activeElement;
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  function closeModal(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest) return;
    var o = t.closest('[data-lb-open]'); if (o) { openModal(o.getAttribute('data-lb-open')); return; }
    var c = t.closest('[data-lb-close]'); if (c) { var d = c.closest('dialog'); if (d) closeModal(d); return; }
    if (t.tagName === 'DIALOG' && t.classList.contains('lb-modal')) closeModal(t); /* backdrop click */
    var n = t.closest('[data-lb-nav-toggle]');
    if (n) { var app = document.querySelector('.lb-app'); if (app) { var open = app.classList.toggle('is-nav-open'); n.setAttribute('aria-expanded', String(open)); } return; }
    if (t.closest('[data-lb-nav-close]')) closeNav();
    var tab = t.closest('[role="tab"]'); if (tab) selectTab(tab, false);
  });
  document.addEventListener('close', function (e) { var d = e.target; if (d && d._lbReturn && d._lbReturn.focus) d._lbReturn.focus(); }, true);
  function closeNav() {
    var app = document.querySelector('.lb-app'); if (!app) return; app.classList.remove('is-nav-open');
    [].forEach.call(document.querySelectorAll('[data-lb-nav-toggle]'), function (b) { b.setAttribute('aria-expanded', 'false'); });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
    var tab = e.target.closest && e.target.closest('[role="tab"]'); if (!tab) return;
    var tabs = [].slice.call(tab.parentNode.querySelectorAll('[role="tab"]')), i = tabs.indexOf(tab), n;
    if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length]; else if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === 'Home') n = tabs[0]; else if (e.key === 'End') n = tabs[tabs.length - 1];
    if (n) { e.preventDefault(); selectTab(n, true); }
  });
  function selectTab(tab, focus) {
    var list = tab.parentNode;
    [].forEach.call(list.querySelectorAll('[role="tab"]'), function (t) {
      var on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      var p = document.getElementById(t.getAttribute('aria-controls')); if (p) p.hidden = !on;
    });
    if (focus) tab.focus();
  }
  window.LBUI = { toast: toast, openModal: openModal, closeModal: closeModal, trapFocus: trapFocus };
})();
