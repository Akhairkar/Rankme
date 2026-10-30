/* LocalBoost theme manager (assets/theme.js) -> window.LBTheme
   Put this tiny inline snippet FIRST in <head> (before CSS) to avoid a flash:
   <script>try{var t=localStorage.getItem('lb_theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
   Then load <script src="/assets/theme.js" defer></script>.
   Preference is 'light' | 'dark' | 'system' (system = no data-theme attribute, OS decides). */
(function () {
  var KEY = 'lb_theme', root = document.documentElement, listeners = [];
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var ORDER = ['light', 'dark', 'system'];
  var isHi = (root.lang || '').slice(0, 2) === 'hi';
  var NAMES = isHi ? { light: 'लाइट', dark: 'डार्क', system: 'सिस्टम' } : { light: 'Light', dark: 'Dark', system: 'System' };

  function read() { try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch (e) { return 'system'; } }
  function resolved(p) { p = p || read(); return p === 'system' ? (mq && mq.matches ? 'dark' : 'light') : p; }
  function apply() {
    var p = read();
    if (p === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', p);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved(p) === 'dark' ? '#121311' : '#0F766E');
    syncButtons();
  }
  function emit() { var d = { preference: read(), resolved: resolved() }; listeners.slice().forEach(function (f) { try { f(d); } catch (e) {} }); }
  function set(p) {
    if (ORDER.indexOf(p) < 0) p = 'system';
    try { if (p === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch (e) {}
    apply(); emit();
  }
  function toggle() { set(ORDER[(ORDER.indexOf(read()) + 1) % 3]); }

  var ICONS = {
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg>',
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>'
  };
  function syncButtons() {
    var p = read(), next = ORDER[(ORDER.indexOf(p) + 1) % 3];
    [].forEach.call(document.querySelectorAll('[data-lb-theme-toggle]'), function (b) {
      b.innerHTML = ICONS[p];
      b.setAttribute('data-theme-pref', p);
      b.setAttribute('aria-label', (isHi ? 'थीम: ' : 'Theme: ') + NAMES[p] + '. ' + (isHi ? 'बदलें: ' : 'Switch to ') + NAMES[next]);
      b.title = b.getAttribute('aria-label');
    });
    [].forEach.call(document.querySelectorAll('[data-lb-theme]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lb-theme') === p)); });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-lb-theme-toggle],[data-lb-theme]');
    if (!t) return;
    if (t.hasAttribute('data-lb-theme-toggle')) toggle(); else set(t.getAttribute('data-lb-theme'));
  });
  if (mq) (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { if (read() === 'system') { apply(); emit(); } });
  window.addEventListener('storage', function (e) { if (e.key === KEY) { apply(); emit(); } });

  window.LBTheme = {
    get: read, resolved: resolved, set: set, toggle: toggle,
    onChange: function (f) { listeners.push(f); return function () { listeners = listeners.filter(function (x) { return x !== f; }); }; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
