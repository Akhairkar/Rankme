/* Local SEO checklist: progress is kept only in this browser (localStorage, optional). */
(function () {
  var $ = LB.$, KEY = 'localboost_checklist_v2';
  var boxes = Array.prototype.slice.call(document.querySelectorAll('.chk-task'));
  var saved = LB.store.get(KEY, []);
  if (!Array.isArray(saved)) saved = [];
  boxes.forEach(function (cb) { cb.checked = saved.indexOf(cb.id) >= 0; });
  function update(persist) {
    var ids = boxes.filter(function (c) { return c.checked; }).map(function (c) { return c.id; });
    if (persist) LB.store.set(KEY, ids);
    $('checkedCount').textContent = ids.length; $('checkTotal').textContent = boxes.length;
    $('scorePct').textContent = Math.round(ids.length / boxes.length * 100) + '%';
    var bar = $('progBar'); bar.style.width = (ids.length / boxes.length * 100) + '%'; bar.parentNode.setAttribute('aria-valuenow', ids.length);
    document.querySelectorAll('[data-sec]').forEach(function (h) {
      var s = h.getAttribute('data-sec'), all = boxes.filter(function (c) { return c.getAttribute('data-s') === s; });
      h.querySelector('.sec-n').textContent = all.filter(function (c) { return c.checked; }).length + '/' + all.length;
    });
  }
  boxes.forEach(function (cb) { cb.addEventListener('change', function () { update(true); }); });
  $('resetBtn').addEventListener('click', function () { boxes.forEach(function (c) { c.checked = false; }); update(true); });
  update(false);
})();
