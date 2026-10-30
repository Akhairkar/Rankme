/* Business description drafter: factual, non-promotional template within Google's 750-character limit. Browser only. */
(function () {
  var $ = LB.$, MAX = 750;
  var T = {
    en: { need: 'Fill in the business name, category and city or area.', chars: 'characters', copy: 'Copy description', promo: 'Google discourages promotional wording in the description. Check these words in your input: ', cut: 'Some sentences were left out to stay within 750 characters.', link: 'Remove links, phone numbers and email addresses from the description; Google does not allow them here.',
      s1: '{n} is a {c} in {a}.', s2: 'We offer {s}.', s4: 'You can contact us for more information about our services.', and: ' and ' },
    hi: { need: 'बिज़नेस का नाम, कैटेगरी और शहर या इलाका भरें।', chars: 'अक्षर', copy: 'विवरण कॉपी करें', promo: 'Google विवरण में प्रचार वाले शब्दों को पसंद नहीं करता। अपने इनपुट में ये शब्द जाँचें: ', cut: '750 अक्षरों की सीमा के लिए कुछ वाक्य छोड़ दिए गए।', link: 'विवरण से लिंक, फ़ोन नंबर और ईमेल हटाएँ; Google यहाँ इन्हें अनुमति नहीं देता।',
      s1: '{n}, {a} में स्थित एक {c} है।', s2: 'हमारी सेवाओं में {s} शामिल हैं।', s4: 'हमारी सेवाओं के बारे में अधिक जानकारी के लिए आप हमसे संपर्क कर सकते हैं।', and: ' और ' },
    hn: { s1: '{n}, {a} mein sthit ek {c} hai.', s2: 'Hamari services mein {s} shamil hain.', s4: 'Services ke baare mein adhik jaankari ke liye aap humse sampark kar sakte hain.', and: ' aur ' }
  };
  var PROMO = /\b(free|discount|offers?|sale|cheap(?:est)?|best|no\.?\s?1|#1|100%|guarantee[d]?|lowest|cheapest|call now|limited|deal|coupon)\b/gi;
  function clean(s, n) { return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }
  function ui(k) { return LB.t(T, k); }
  function list(raw) { var seen = {}, o = []; String(raw || '').split(/[,\n;]+/).forEach(function (x) { x = clean(x, 60); var k = x.toLowerCase(); if (x && !seen[k]) { seen[k] = 1; o.push(x); } }); return o.slice(0, 12); }
  function joinList(a, and) { return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + and + a[a.length - 1]; }
  function endDot(s, lang) { s = s.trim(); return /[.!?।]$/.test(s) ? s : s + (lang === 'hi' ? '।' : '.'); }
  function len(s) { return Array.from(s).length; }
  function build(v) {
    var P = T[v.lang]; var sentences = [];
    sentences.push(P.s1.replace('{n}', v.name).replace('{c}', v.cat).replace('{a}', v.area));
    if (v.usp) sentences.push(endDot(v.usp, v.lang));
    var cut = false;
    if (v.services.length) {
      var sv = v.services.slice();
      while (true) {
        var cand = sentences.slice(); cand.splice(1, 0, P.s2.replace('{s}', joinList(sv, P.and)));
        if (len(cand.join(' ')) <= MAX - len(' ' + P.s4) || sv.length === 1) { sentences = cand; break; }
        sv.pop(); cut = true;
      }
      if (sv.length < v.services.length) cut = true;
    }
    sentences.push(P.s4);
    while (len(sentences.join(' ')) > MAX && sentences.length > 1) { sentences.pop(); cut = true; }
    var out = sentences.join(' ');
    if (len(out) > MAX) { out = Array.from(out).slice(0, MAX).join(''); out = out.replace(/\s+\S*$/, '').replace(/[,;:\-\s]+$/, '') + '.'; cut = true; }
    return { text: out, cut: cut };
  }
  window.LBDesc = { build: build };
  function count() { var n = len($('descOut').value); var c = $('descCount'); c.textContent = n + ' / ' + MAX + ' ' + ui('chars'); c.className = 'lb-count' + (n > MAX ? ' over' : ''); }
  $('descForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = { name: clean($('bizName').value, 100), cat: clean($('bizCat').value, 80), area: clean($('bizCity').value, 80), lang: $('bizLang').value, services: list($('bizServices').value), usp: clean($('bizUSP').value, 200) };
    if (v.lang === 'hinglish') v.lang = 'hn';
    var err = $('descErr');
    if (!v.name || !v.cat || !v.area) { err.textContent = ui('need'); $('descBox').classList.add('lb-hidden'); return; }
    err.textContent = '';
    var r = build(v);
    $('descOut').value = r.text; count();
    var warns = [], all = [v.name, v.cat, v.area, v.usp].concat(v.services).join(' | ');
    var m = all.match(PROMO); if (m) warns.push(ui('promo') + Array.from(new Set(m.map(function (x) { return x.toLowerCase(); }))).join(', '));
    if (/https?:\/\/|www\.|@|\b\d{10}\b|\+91/.test(all)) warns.push(ui('link'));
    if (r.cut) warns.push(ui('cut'));
    $('descWarn').innerHTML = warns.map(function (w) { return '<div class="lb-banner warn">' + LB.esc(w) + '</div>'; }).join('');
    $('descBox').classList.remove('lb-hidden');
    $('descBox').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('descOut').addEventListener('input', count);
  $('descCopy').addEventListener('click', function () { LB.copy($('descOut').value, $('descCopy')); });
})();
