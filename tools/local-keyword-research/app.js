/* Local keyword ideas: pattern-based generator. No volumes, no difficulty, no network requests. */
(function () {
  var $ = LB.$;
  var CATS = [
    ['restaurant', 'Restaurant / Cafe', 'रेस्टोरेंट / कैफ़े', 'restaurant'], ['salon', 'Salon / Beauty parlour', 'सैलून / ब्यूटी पार्लर', 'beauty parlour'],
    ['clinic', 'Doctor / Clinic', 'डॉक्टर / क्लिनिक', 'clinic'], ['dental', 'Dental clinic', 'डेंटल क्लिनिक', 'dentist'],
    ['pharmacy', 'Pharmacy / Medical store', 'फ़ार्मेसी / मेडिकल स्टोर', 'medical store'], ['gym', 'Gym / Fitness studio', 'जिम / फ़िटनेस स्टूडियो', 'gym'],
    ['kirana', 'Kirana / Grocery store', 'किराना / ग्रॉसरी स्टोर', 'grocery store'], ['retail', 'Clothing / Retail shop', 'कपड़े / रिटेल दुकान', 'clothing store'],
    ['repair', 'Mobile / Electronics repair', 'मोबाइल / इलेक्ट्रॉनिक्स रिपेयर', 'mobile repair shop'], ['auto', 'Car / Bike service centre', 'कार / बाइक सर्विस सेंटर', 'car service centre'],
    ['coaching', 'Coaching / Tuition class', 'कोचिंग / ट्यूशन क्लास', 'coaching classes'], ['realestate', 'Real estate / Property dealer', 'रियल एस्टेट / प्रॉपर्टी डीलर', 'property dealer'],
    ['hotel', 'Hotel / Homestay', 'होटल / होमस्टे', 'hotel'], ['homeservice', 'Home services (plumber, electrician)', 'होम सर्विस (प्लंबर, इलेक्ट्रीशियन)', 'plumber'],
    ['photo', 'Photography / Event services', 'फ़ोटोग्राफ़ी / इवेंट सर्विस', 'photographer'], ['other', 'Other local business', 'अन्य लोकल बिज़नेस', '']
  ];
  var GROUPS = ['core', 'nearme', 'locality', 'question', 'price', 'brand'];
  var GL = {
    en: { core: 'Core (service + city)', nearme: 'Near me', locality: 'Locality / neighbourhood', question: 'Questions', price: 'Price and comparison', brand: 'Brand / navigational' },
    hi: { core: 'मुख्य (सर्विस + शहर)', nearme: 'मेरे पास (near me)', locality: 'इलाका / मोहल्ला', question: 'सवाल', price: 'कीमत और तुलना', brand: 'ब्रांड / नेविगेशनल' }
  };
  var IL = { en: { transactional: 'Transactional', commercial: 'Commercial', informational: 'Informational', navigational: 'Navigational' },
             hi: { transactional: 'खरीद/बुकिंग (Transactional)', commercial: 'तुलना (Commercial)', informational: 'जानकारी (Informational)', navigational: 'नेविगेशनल' } };
  var T = {
    en: { need: 'Enter at least one service (or choose a category) and a city.', count: 'ideas', none: 'No ideas match the current filters.', copy: 'Copy selected', csv: 'Export CSV', save: 'Save list to history', saved: 'Saved', saveFail: 'Could not save (browser storage is blocked).',
          load: 'Load', del: 'Delete', noHist: 'No saved lists yet.', selected: 'selected', trunc: 'Showing the first 600 ideas. Remove some services or localities to see the rest.', all: 'All', kw: 'Keyword', grp: 'Group', intent: 'Intent', cap: 'Keyword ideas', sel: 'Select',
          selAll: 'Select all shown', selNone: 'Clear selection', exportAll: 'No rows selected, so all shown rows were exported.' },
    hi: { need: 'कम से कम एक सर्विस (या कैटेगरी चुनें) और शहर भरें।', count: 'आइडिया', none: 'मौजूदा फ़िल्टर से कोई आइडिया नहीं मिला।', copy: 'चुने हुए कॉपी करें', csv: 'CSV एक्सपोर्ट', save: 'लिस्ट हिस्ट्री में सेव करें', saved: 'सेव हो गया', saveFail: 'सेव नहीं हो सका (ब्राउज़र स्टोरेज बंद है)।',
          load: 'खोलें', del: 'हटाएँ', noHist: 'अभी कोई सेव की हुई लिस्ट नहीं है।', selected: 'चुने गए', trunc: 'पहले 600 आइडिया दिखाए जा रहे हैं। बाकी देखने के लिए कुछ सर्विस या इलाके हटाएँ।', all: 'सभी', kw: 'कीवर्ड', grp: 'ग्रुप', intent: 'इरादा', cap: 'कीवर्ड आइडिया', sel: 'चुनें',
          selAll: 'दिखाए गए सभी चुनें', selNone: 'चयन हटाएँ', exportAll: 'कोई पंक्ति चुनी नहीं थी, इसलिए दिखाई गई सभी पंक्तियाँ एक्सपोर्ट हुईं।' }
  };
  function tt(k) { return LB.t(T, k); }
  var HIST = 'lb_kw_history_v1', MAXROWS = 600;
  var rows = [], view = [], picked = {}, meta = {};

  function clean(s, n) { return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 60); }
  function list(raw, max) {
    var seen = {}, out = [];
    String(raw || '').split(/[,\n;।]+/).forEach(function (x) { x = clean(x, 50); var k = x.toLowerCase(); if (x && !seen[k]) { seen[k] = 1; out.push(x); } });
    return out.slice(0, max);
  }

  /* ---------- intent rules (first match wins) ---------- */
  var RE_NAV = /\b(contact number|phone number|address|timings?|opening hours|website|login)\b|संपर्क नंबर|पता|समय/i;
  var RE_INFO = /^(how|what|which|where|why|when|can|is|are|do|does)\b|\b(kaise|kya|kaun|kitne|kitna|kyun|kahan)\b|\bvs\b|\bguide\b|\btips?\b|कैसे|क्या|कौन|कितना|कहाँ|बनाम/i;
  var RE_COMM = /\b(best|top|affordable|cheap|reviews?|price|cost|rates?|charges|fees|compare|comparison|sasta|kimat|rate)\b|सबसे अच्छा|कीमत|सस्ता|रेट|खर्च/i;
  var RE_TRANS = /\b(near me|nearby|book|appointment|24x7|open now|home service|call|order)\b|मेरे पास|बुक/i;
  function intent(k, isBrand) {
    if (isBrand && !/\b(reviews?|vs)\b/i.test(k)) return 'navigational';
    if (RE_NAV.test(k)) return 'navigational';
    if (RE_INFO.test(k)) return 'informational';
    if (RE_COMM.test(k)) return 'commercial';
    if (RE_TRANS.test(k)) return 'transactional';
    return 'transactional'; /* plain "service + place" is a local buying search */
  }

  function generate(o) {
    var out = [], seen = {};
    function add(group, kw, brand) {
      kw = clean(kw, 120); var key = kw.toLowerCase();
      if (!kw || seen[key]) return; seen[key] = 1;
      out.push({ kw: kw, group: group, intent: intent(kw, brand) });
    }
    var hn = o.mix !== 'en', dv = o.mix === 'all';
    var city = o.city;
    o.services.forEach(function (s) {
      /* core */
      add('core', s + ' ' + city); add('core', s + ' in ' + city);
      ['best', 'top', 'affordable', 'cheap', 'trusted'].forEach(function (m) { add('core', m + ' ' + s + ' in ' + city); });
      if (o.h24) { add('core', '24x7 ' + s + ' in ' + city); add('core', s + ' ' + city + ' open 24 hours'); }
      if (hn) { add('core', city + ' mein ' + s); add('core', city + ' mein best ' + s); add('core', city + ' me ' + s); }
      if (dv) { add('core', city + ' में ' + s); add('core', city + ' में सबसे अच्छा ' + s); }
      /* near me */
      add('nearme', s + ' near me'); add('nearme', 'best ' + s + ' near me'); add('nearme', s + ' nearby'); add('nearme', s + ' near me open now');
      if (o.h24) add('nearme', '24x7 ' + s + ' near me');
      if (hn) { add('nearme', s + ' mere paas'); add('nearme', 'mere paas ' + s); }
      if (dv) add('nearme', 'मेरे पास ' + s);
      /* locality */
      o.localities.forEach(function (l) {
        add('locality', s + ' in ' + l); add('locality', s + ' near ' + l); add('locality', 'best ' + s + ' in ' + l + ' ' + city);
        if (hn) add('locality', l + ' mein ' + s);
        if (dv) add('locality', l + ' में ' + s);
      });
      /* questions */
      add('question', 'which is the best ' + s + ' in ' + city); add('question', 'where to find ' + s + ' in ' + city);
      add('question', 'how to choose a ' + s); add('question', 'how much does ' + s + ' cost in ' + city);
      if (hn) { add('question', s + ' kaise'); add('question', s + ' kaise kare'); add('question', city + ' mein best ' + s + ' kaun sa hai'); add('question', s + ' kitne ka hota hai'); }
      if (dv) { add('question', s + ' कैसे'); add('question', s + ' कितने का होता है'); add('question', city + ' में सबसे अच्छा ' + s + ' कौन सा है'); }
      /* price and comparison */
      add('price', s + ' price in ' + city); add('price', s + ' cost in ' + city); add('price', s + ' charges in ' + city); add('price', s + ' rates ' + city);
      add('price', 'cheap ' + s + ' ' + city); add('price', s + ' reviews ' + city);
      if (hn) { add('price', s + ' ka rate ' + city); add('price', 'sasta ' + s + ' ' + city); }
      if (dv) { add('price', s + ' की कीमत'); add('price', city + ' में सस्ता ' + s); }
    });
    for (var i = 0; i < o.services.length; i++) for (var j = i + 1; j < o.services.length && j < i + 3; j++) add('price', o.services[i] + ' vs ' + o.services[j]);
    if (o.brand) {
      add('brand', o.brand, true); add('brand', o.brand + ' ' + city, true); add('brand', o.brand + ' contact number', true);
      add('brand', o.brand + ' address', true); add('brand', o.brand + ' timings', true); add('brand', o.brand + ' reviews', true);
    }
    var order = {}; GROUPS.forEach(function (g, i) { order[g] = i; });
    out.sort(function (a, b) { return order[a.group] - order[b.group]; });
    return out;
  }
  window.LBKeywords = { generate: generate, intent: intent };

  function read() {
    var cat = CATS.filter(function (c) { return c[0] === $('kwCat').value; })[0] || CATS[CATS.length - 1];
    var services = list($('kwServices').value, 10);
    if (!services.length && cat[3]) services = [cat[3]];
    return { cat: cat, services: services, city: clean($('kwCity').value, 50), localities: list($('kwLocal').value, 10),
             mix: $('kwMix').value, h24: $('kwH24').checked, brand: clean($('kwBrand').value, 60) };
  }

  function filtered() {
    var g = $('kwFg').value, i = $('kwFi').value, q = $('kwFq').value.trim().toLowerCase();
    return rows.filter(function (r) { return (!g || r.group === g) && (!i || r.intent === i) && (!q || r.kw.toLowerCase().indexOf(q) >= 0); });
  }
  function render() {
    view = filtered();
    var tb = $('kwBody'); tb.innerHTML = '';
    var L = LB.lang;
    view.forEach(function (r) {
      var tr = document.createElement('tr');
      var td0 = document.createElement('td'); var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!picked[r.kw]; cb.setAttribute('aria-label', tt('sel') + ': ' + r.kw);
      cb.addEventListener('change', function () { if (cb.checked) picked[r.kw] = 1; else delete picked[r.kw]; count(); });
      td0.appendChild(cb); tr.appendChild(td0);
      var td1 = document.createElement('td'); td1.textContent = r.kw; tr.appendChild(td1);
      var td2 = document.createElement('td'); td2.textContent = GL[L][r.group]; tr.appendChild(td2);
      var td3 = document.createElement('td'); var b = document.createElement('span'); b.className = 'badge ' + r.intent; b.textContent = IL[L][r.intent]; td3.appendChild(b); tr.appendChild(td3);
      tb.appendChild(tr);
    });
    $('kwEmpty').classList.toggle('lb-hidden', view.length > 0);
    count();
  }
  function count() { $('kwCount').textContent = view.length + ' ' + tt('count') + ' · ' + Object.keys(picked).length + ' ' + tt('selected'); }
  function chosen() {
    var sel = rows.filter(function (r) { return picked[r.kw]; });
    return sel.length ? sel : view;
  }

  $('kwForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var o = read();
    if (!o.services.length || !o.city) { $('kwErr').textContent = tt('need'); return; }
    $('kwErr').textContent = '';
    var all = generate(o);
    var cut = all.length > MAXROWS;
    rows = all.slice(0, MAXROWS); picked = {}; meta = { category: o.cat[1], city: o.city };
    $('kwTrunc').textContent = cut ? tt('trunc') : '';
    $('kwFg').value = ''; $('kwFi').value = ''; $('kwFq').value = '';
    $('kwResult').classList.remove('lb-hidden');
    render();
    $('kwResult').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  ['kwFg', 'kwFi'].forEach(function (id) { $(id).addEventListener('change', render); });
  $('kwFq').addEventListener('input', render);
  $('kwSelAll').addEventListener('click', function () { view.forEach(function (r) { picked[r.kw] = 1; }); render(); });
  $('kwSelNone').addEventListener('click', function () { picked = {}; render(); });
  $('kwCopy').addEventListener('click', function () { LB.copy(chosen().map(function (r) { return r.kw; }).join('\n'), $('kwCopy')); });
  $('kwCsv').addEventListener('click', function () {
    var rs = chosen();
    var data = [['keyword', 'group', 'intent', 'business_category', 'city']].concat(rs.map(function (r) { return [r.kw, r.group, r.intent, meta.category, meta.city]; }));
    LB.download('local-keyword-ideas.csv', 'text/csv;charset=utf-8', '﻿' + LB.csv(data));
  });

  /* ---------- history (localStorage, optional) ---------- */
  function hist() { var h = LB.store.get(HIST, []); return Array.isArray(h) ? h : []; }
  function renderHist() {
    var h = hist(), box = $('kwHist'); box.innerHTML = '';
    if (!h.length) { box.textContent = tt('noHist'); return; }
    h.forEach(function (it, idx) {
      var row = document.createElement('div'); row.className = 'lb-row'; row.style.marginBottom = '8px';
      var s = document.createElement('span'); s.style.flex = '1 1 200px'; s.textContent = it.name + ' (' + it.rows.length + ')';
      var l = document.createElement('button'); l.type = 'button'; l.className = 'lb-btn'; l.textContent = tt('load');
      l.addEventListener('click', function () { rows = it.rows; picked = {}; meta = it.meta || {}; $('kwResult').classList.remove('lb-hidden'); $('kwTrunc').textContent = ''; render(); });
      var d = document.createElement('button'); d.type = 'button'; d.className = 'lb-btn'; d.textContent = tt('del');
      d.addEventListener('click', function () { var hh = hist(); hh.splice(idx, 1); LB.store.set(HIST, hh); renderHist(); });
      row.appendChild(s); row.appendChild(l); row.appendChild(d); box.appendChild(row);
    });
  }
  $('kwSave').addEventListener('click', function () {
    var h = hist();
    var name = (meta.city || '') + ' - ' + (meta.category || '') + ' - ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
    h.unshift({ name: name, meta: meta, rows: rows });
    var ok = LB.store.set(HIST, h.slice(0, 15));
    var m = $('kwSaveMsg'); m.textContent = ok ? tt('saved') : tt('saveFail');
    renderHist();
  });

  var sel = $('kwCat'); CATS.forEach(function (c) { var o = document.createElement('option'); o.value = c[0]; o.textContent = c[LB.lang === 'hi' ? 2 : 1]; sel.appendChild(o); });
  var fg = $('kwFg'); GROUPS.forEach(function (g) { var o = document.createElement('option'); o.value = g; o.textContent = GL[LB.lang][g]; fg.appendChild(o); });
  var fi = $('kwFi'); ['transactional', 'commercial', 'informational', 'navigational'].forEach(function (g) { var o = document.createElement('option'); o.value = g; o.textContent = IL[LB.lang][g]; fi.appendChild(o); });
  renderHist();
})();
