/* Competitor comparison: two POST /api/site-check calls (+ optional GET /api/pagespeed), then side-by-side facts.
   All statements are generated from the compared facts only. Runs only when window.LOCALBOOST_API.enabled === true. */
(function () {
  var $ = LB.$, S = window.LBSite;
  var T = {
    en: { sameSite: 'Enter two different websites.', you: 'Your site', comp: 'Competitor', checking: 'Checking both websites...', failSide: 'could not be checked', needBoth: 'Both websites must be checked to compare them.',
      rowUrl: 'Final URL checked', rowStatus: 'HTTP status', rowTitle: 'Title', rowDesc: 'Meta description', rowH1: 'H1 headings (count)', rowSchema: 'Schema types', rowWords: 'Visible words', rowVp: 'Mobile viewport tag', rowInternal: 'Internal links', rowAlt: 'Images without alt', rowIdx: 'Indexable', rowCanon: 'Canonical', rowIssues: 'Issues flagged (high / medium / low)',
      rowPhone: 'Phone (tel: link or number)', rowAddr: 'Street address on page', rowMap: 'Embedded map', rowContact: 'Link to contact page', rowLb: 'LocalBusiness schema', rowSpeed: 'Page speed (PageSpeed Insights, mobile)',
      missing: 'Missing', none: 'None', yes: 'Yes', no: 'No', present: 'Present', chars: 'characters', unknown: 'Not available',
      lPhone: 'Not detected', lPhoneText: 'Number as text only, no tel: link', lOk: 'No issue flagged (detected)', 
      speedNA: 'Not available (PageSpeed not connected or no data)', lab: 'lab test', field: 'real users', score: 'score', lcp: 'LCP',
      behindT: 'Where the competitor does something you do not', aheadT: 'Where you are ahead', nothingB: 'No differences found in the compared elements where the competitor is ahead.', nothingA: 'No differences found in the compared elements where you are ahead.',
      scope: 'This compares public elements of one page each. It says nothing about rankings, reviews, traffic or business quality. Element differences are not proof that they cause any difference in results.',
      copy: 'Copy comparison as text', print: 'Print / save PDF', again: 'Compare again',
      sBDesc: 'The competitor page has a meta description; yours has none.', sADesc: 'Your page has a meta description; the competitor page has none.',
      sBTitle: 'The competitor page has a title tag; yours has none.', sATitle: 'Your page has a title tag; the competitor page has none.',
      sBH1: 'The competitor page has exactly one H1; yours has {a}.', sAH1: 'Your page has exactly one H1; the competitor page has {b}.',
      sBSchema: 'The competitor page declares schema types you do not: {x}.', sASchema: 'Your page declares schema types the competitor does not: {x}.',
      sBLb: 'The competitor page has LocalBusiness structured data; none was detected on yours.', sALb: 'Your page has LocalBusiness structured data; none was detected on the competitor page.',
      sBPhone: 'A phone number or tel: link was detected on the competitor page but not on yours.', sAPhone: 'A phone number or tel: link was detected on your page but not on the competitor page.',
      sBTel: 'The competitor page has a clickable tel: link; your phone number is plain text.', sATel: 'Your page has a clickable tel: link; the competitor phone number is plain text.',
      sBAddr: 'A street address was detected on the competitor page but not on yours.', sAAddr: 'A street address was detected on your page but not on the competitor page.',
      sBMap: 'The competitor page has an embedded map; none was detected on yours.', sAMap: 'Your page has an embedded map; none was detected on the competitor page.',
      sBContact: 'The competitor page links to a contact or location page; no such link was detected on yours.', sAContact: 'Your page links to a contact or location page; no such link was detected on the competitor page.',
      sBVp: 'The competitor page has a mobile viewport tag; yours has none.', sAVp: 'Your page has a mobile viewport tag; the competitor page has none.',
      sBIdx: 'The competitor page is indexable; yours is not (check noindex or the HTTP status).', sAIdx: 'Your page is indexable; the competitor page is not.',
      sBWords: 'The competitor page has more visible text ({b} words vs {a}). Word count alone is not a ranking factor.', sAWords: 'Your page has more visible text ({a} words vs {b}). Word count alone is not a ranking factor.',
      sBLinks: 'The competitor page has more internal links ({b} vs {a}).', sALinks: 'Your page has more internal links ({a} vs {b}).',
      sBAlt: 'All images on the competitor page have alt text; {a} on yours do not.', sAAlt: 'All images on your page have alt text; {b} on the competitor page do not.',
      sBIss: 'The checker flagged fewer high-severity issues on the competitor page ({b}) than on yours ({a}).', sAIss: 'The checker flagged fewer high-severity issues on your page ({a}) than on the competitor page ({b}).',
      sBSpeed: 'The competitor page measured faster on mobile ({b} vs {a}, same data type: {t}).', sASpeed: 'Your page measured faster on mobile ({a} vs {b}, same data type: {t}).' },
    hi: { sameSite: 'दो अलग-अलग वेबसाइट डालें।', you: 'आपकी साइट', comp: 'प्रतिस्पर्धी', checking: 'दोनों वेबसाइट जाँची जा रही हैं...', failSide: 'की जाँच नहीं हो सकी', needBoth: 'तुलना के लिए दोनों वेबसाइट की जाँच होनी चाहिए।',
      rowUrl: 'जाँचा गया अंतिम URL', rowStatus: 'HTTP स्टेटस', rowTitle: 'टाइटल', rowDesc: 'मेटा विवरण', rowH1: 'H1 हेडिंग (गिनती)', rowSchema: 'स्कीमा टाइप', rowWords: 'दिखने वाले शब्द', rowVp: 'मोबाइल व्यूपोर्ट टैग', rowInternal: 'आंतरिक लिंक', rowAlt: 'बिना alt वाली इमेज', rowIdx: 'इंडेक्स योग्य', rowCanon: 'कैनोनिकल', rowIssues: 'चिह्नित समस्याएँ (ज़्यादा / मध्यम / कम)',
      rowPhone: 'फ़ोन (tel: लिंक या नंबर)', rowAddr: 'पेज पर पता', rowMap: 'एम्बेडेड मैप', rowContact: 'संपर्क पेज का लिंक', rowLb: 'LocalBusiness स्कीमा', rowSpeed: 'पेज स्पीड (PageSpeed Insights, मोबाइल)',
      missing: 'गायब', none: 'कोई नहीं', yes: 'हाँ', no: 'नहीं', present: 'मौजूद', chars: 'अक्षर', unknown: 'उपलब्ध नहीं',
      lPhone: 'नहीं मिला', lPhoneText: 'सिर्फ़ टेक्स्ट में नंबर, tel: लिंक नहीं', lOk: 'कोई समस्या चिह्नित नहीं (मिला)',
      speedNA: 'उपलब्ध नहीं (PageSpeed जुड़ा नहीं या डेटा नहीं)', lab: 'लैब टेस्ट', field: 'असली यूज़र', score: 'स्कोर', lcp: 'LCP',
      behindT: 'जहाँ प्रतिस्पर्धी कुछ ऐसा करता है जो आप नहीं करते', aheadT: 'जहाँ आप आगे हैं', nothingB: 'तुलना किए गए तत्वों में ऐसा कोई अंतर नहीं मिला जहाँ प्रतिस्पर्धी आगे हो।', nothingA: 'तुलना किए गए तत्वों में ऐसा कोई अंतर नहीं मिला जहाँ आप आगे हों।',
      scope: 'यह दोनों के एक-एक पेज के सार्वजनिक तत्वों की तुलना है। यह रैंकिंग, रिव्यू, ट्रैफ़िक या बिज़नेस की गुणवत्ता के बारे में कुछ नहीं कहती। तत्वों का अंतर इस बात का सबूत नहीं कि वही नतीजों के फ़र्क़ का कारण है।',
      copy: 'तुलना टेक्स्ट में कॉपी करें', print: 'प्रिंट / PDF सेव', again: 'दोबारा तुलना करें',
      sBDesc: 'प्रतिस्पर्धी के पेज पर मेटा विवरण है; आपके पेज पर नहीं।', sADesc: 'आपके पेज पर मेटा विवरण है; प्रतिस्पर्धी के पेज पर नहीं।',
      sBTitle: 'प्रतिस्पर्धी के पेज पर टाइटल टैग है; आपके पेज पर नहीं।', sATitle: 'आपके पेज पर टाइटल टैग है; प्रतिस्पर्धी के पेज पर नहीं।',
      sBH1: 'प्रतिस्पर्धी के पेज पर ठीक एक H1 है; आपके पेज पर {a} हैं।', sAH1: 'आपके पेज पर ठीक एक H1 है; प्रतिस्पर्धी के पेज पर {b} हैं।',
      sBSchema: 'प्रतिस्पर्धी का पेज ऐसे स्कीमा टाइप बताता है जो आपका नहीं: {x}।', sASchema: 'आपका पेज ऐसे स्कीमा टाइप बताता है जो प्रतिस्पर्धी का नहीं: {x}।',
      sBLb: 'प्रतिस्पर्धी के पेज पर LocalBusiness स्ट्रक्चर्ड डेटा है; आपके पेज पर नहीं मिला।', sALb: 'आपके पेज पर LocalBusiness स्ट्रक्चर्ड डेटा है; प्रतिस्पर्धी के पेज पर नहीं मिला।',
      sBPhone: 'प्रतिस्पर्धी के पेज पर फ़ोन नंबर या tel: लिंक मिला, आपके पेज पर नहीं।', sAPhone: 'आपके पेज पर फ़ोन नंबर या tel: लिंक मिला, प्रतिस्पर्धी के पेज पर नहीं।',
      sBTel: 'प्रतिस्पर्धी के पेज पर क्लिक होने वाला tel: लिंक है; आपका फ़ोन नंबर सादा टेक्स्ट है।', sATel: 'आपके पेज पर क्लिक होने वाला tel: लिंक है; प्रतिस्पर्धी का फ़ोन नंबर सादा टेक्स्ट है।',
      sBAddr: 'प्रतिस्पर्धी के पेज पर पता मिला, आपके पेज पर नहीं।', sAAddr: 'आपके पेज पर पता मिला, प्रतिस्पर्धी के पेज पर नहीं।',
      sBMap: 'प्रतिस्पर्धी के पेज पर एम्बेडेड मैप है; आपके पेज पर नहीं मिला।', sAMap: 'आपके पेज पर एम्बेडेड मैप है; प्रतिस्पर्धी के पेज पर नहीं मिला।',
      sBContact: 'प्रतिस्पर्धी का पेज संपर्क या लोकेशन पेज से जुड़ा है; आपके पेज पर ऐसा लिंक नहीं मिला।', sAContact: 'आपका पेज संपर्क या लोकेशन पेज से जुड़ा है; प्रतिस्पर्धी के पेज पर ऐसा लिंक नहीं मिला।',
      sBVp: 'प्रतिस्पर्धी के पेज पर मोबाइल व्यूपोर्ट टैग है; आपके पेज पर नहीं।', sAVp: 'आपके पेज पर मोबाइल व्यूपोर्ट टैग है; प्रतिस्पर्धी के पेज पर नहीं।',
      sBIdx: 'प्रतिस्पर्धी का पेज इंडेक्स योग्य है; आपका नहीं (noindex या HTTP स्टेटस जाँचें)।', sAIdx: 'आपका पेज इंडेक्स योग्य है; प्रतिस्पर्धी का नहीं।',
      sBWords: 'प्रतिस्पर्धी के पेज पर ज़्यादा टेक्स्ट है ({b} शब्द बनाम {a})। सिर्फ़ शब्द-संख्या रैंकिंग का कारक नहीं है।', sAWords: 'आपके पेज पर ज़्यादा टेक्स्ट है ({a} शब्द बनाम {b})। सिर्फ़ शब्द-संख्या रैंकिंग का कारक नहीं है।',
      sBLinks: 'प्रतिस्पर्धी के पेज पर ज़्यादा आंतरिक लिंक हैं ({b} बनाम {a})।', sALinks: 'आपके पेज पर ज़्यादा आंतरिक लिंक हैं ({a} बनाम {b})।',
      sBAlt: 'प्रतिस्पर्धी के पेज की सभी इमेज में alt टेक्स्ट है; आपकी {a} इमेज में नहीं।', sAAlt: 'आपके पेज की सभी इमेज में alt टेक्स्ट है; प्रतिस्पर्धी की {b} इमेज में नहीं।',
      sBIss: 'चेकर ने प्रतिस्पर्धी के पेज पर कम ज़्यादा-गंभीर समस्याएँ चिह्नित कीं ({b}) बनाम आपके ({a})।', sAIss: 'चेकर ने आपके पेज पर कम ज़्यादा-गंभीर समस्याएँ चिह्नित कीं ({a}) बनाम प्रतिस्पर्धी के ({b})।',
      sBSpeed: 'प्रतिस्पर्धी का पेज मोबाइल पर तेज़ मापा गया ({b} बनाम {a}, एक ही डेटा प्रकार: {t})।', sASpeed: 'आपका पेज मोबाइल पर तेज़ मापा गया ({a} बनाम {b}, एक ही डेटा प्रकार: {t})।' }
  };
  function tt(k) { return LB.t(T, k); }
  var cur = null, urls = null;

  function status(html, cls) { var b = $('ccStatus'); b.className = 'lb-banner ' + (cls || 'info'); b.innerHTML = html; b.classList.remove('lb-hidden'); }

  function failMsg(r) {
    if (r.kind === 'blocked') return S.m('blocked') + (S.reason(r.data.reason) ? ' ' + S.reason(r.data.reason) : '');
    if (r.kind === 'unreachable') return S.m('unreachable') + ' ' + S.ureason(r.data.reason);
    if (r.kind === 'ratelimit') return S.m('rate');
    if (r.kind === 'network') return S.m('network');
    return S.m('server') + (r.status ? ' (HTTP ' + r.status + ')' : '');
  }

  /* Extract comparable facts from one site-check response. Local signals come from the checker's issue codes. */
  function facts(d, ps) {
    var p = (d.pages && d.pages[0]) || {}, codes = {};
    (d.issues || []).forEach(function (i) { if (!i.page_url || i.page_url === p.url || true) codes[i.code] = 1; });
    var sev = { high: 0, medium: 0, low: 0 };
    (d.issues || []).forEach(function (i) { if (sev[i.severity] != null) sev[i.severity]++; });
    return {
      url: d.final_url || d.url, status: p.status, title: p.title || '', desc: p.description || '', h1: p.h1_count || 0, schema: p.schema_types || [], words: p.word_count || 0,
      vp: !!p.viewport, links: p.links_internal || 0, alt: p.images_missing_alt || 0, idx: p.indexable === true, canon: p.canonical || '', sev: sev,
      phone: codes.local_phone_not_detected ? 'no' : (codes.local_phone_not_clickable ? 'text' : 'yes'),
      addr: !codes.local_address_not_detected, map: !codes.local_map_not_detected, contact: !codes.local_contact_link_not_detected, lb: !codes.schema_localbusiness_not_detected,
      ps: ps
    };
  }
  function speedVal(ps) {
    if (!ps || ps.kind !== 'ok') return null;
    var d = ps.data, type = d.field_data ? 'field' : 'lab';
    return { type: type, lcp: d.lcp_ms, score: d.performance_score };
  }
  function speedText(sv) { if (!sv) return tt('speedNA'); return tt('lcp') + ' ' + S.fmtMs(sv.lcp) + (sv.score != null ? ', ' + tt('score') + ' ' + sv.score : '') + ' (' + tt(sv.type) + ')'; }

  /* Statements. A = you, B = competitor. Each rule returns 'B' (competitor ahead), 'A' (you ahead) or null. */
  function statements(A, B) {
    var behind = [], ahead = [];
    function put(side, key, m) { var s = tt(key); Object.keys(m || {}).forEach(function (k) { s = s.replace('{' + k + '}', m[k]); }); (side === 'B' ? behind : ahead).push(s); }
    function bool(a, b, base) { if (b && !a) put('B', 'sB' + base); else if (a && !b) put('A', 'sA' + base); }
    bool(!!A.title, !!B.title, 'Title'); bool(!!A.desc, !!B.desc, 'Desc');
    if (B.h1 === 1 && A.h1 !== 1) put('B', 'sBH1', { a: A.h1 }); else if (A.h1 === 1 && B.h1 !== 1) put('A', 'sAH1', { b: B.h1 });
    var onlyB = B.schema.filter(function (t) { return A.schema.indexOf(t) < 0; }), onlyA = A.schema.filter(function (t) { return B.schema.indexOf(t) < 0; });
    if (onlyB.length) put('B', 'sBSchema', { x: onlyB.slice(0, 6).join(', ') }); if (onlyA.length) put('A', 'sASchema', { x: onlyA.slice(0, 6).join(', ') });
    bool(A.lb, B.lb, 'Lb');
    var ap = A.phone !== 'no', bp = B.phone !== 'no';
    if (bp && !ap) put('B', 'sBPhone'); else if (ap && !bp) put('A', 'sAPhone');
    else if (B.phone === 'yes' && A.phone === 'text') put('B', 'sBTel'); else if (A.phone === 'yes' && B.phone === 'text') put('A', 'sATel');
    bool(A.addr, B.addr, 'Addr'); bool(A.map, B.map, 'Map'); bool(A.contact, B.contact, 'Contact'); bool(A.vp, B.vp, 'Vp'); bool(A.idx, B.idx, 'Idx');
    if (B.words >= A.words * 1.5 && B.words - A.words >= 150) put('B', 'sBWords', { a: A.words, b: B.words }); else if (A.words >= B.words * 1.5 && A.words - B.words >= 150) put('A', 'sAWords', { a: A.words, b: B.words });
    if (B.links >= A.links * 1.5 && B.links - A.links >= 10) put('B', 'sBLinks', { a: A.links, b: B.links }); else if (A.links >= B.links * 1.5 && A.links - B.links >= 10) put('A', 'sALinks', { a: A.links, b: B.links });
    if (A.alt > 0 && B.alt === 0) put('B', 'sBAlt', { a: A.alt }); else if (B.alt > 0 && A.alt === 0) put('A', 'sAAlt', { b: B.alt });
    if (B.sev.high < A.sev.high) put('B', 'sBIss', { a: A.sev.high, b: B.sev.high }); else if (A.sev.high < B.sev.high) put('A', 'sAIss', { a: A.sev.high, b: B.sev.high });
    var sa = speedVal(A.ps), sb = speedVal(B.ps);
    if (sa && sb && sa.type === sb.type && sa.lcp != null && sb.lcp != null && Math.abs(sa.lcp - sb.lcp) >= 500) {
      var t = tt(sa.type);
      if (sb.lcp < sa.lcp) put('B', 'sBSpeed', { a: 'LCP ' + S.fmtMs(sa.lcp), b: 'LCP ' + S.fmtMs(sb.lcp), t: t }); else put('A', 'sASpeed', { a: 'LCP ' + S.fmtMs(sa.lcp), b: 'LCP ' + S.fmtMs(sb.lcp), t: t });
    }
    return { behind: behind, ahead: ahead };
  }
  window.LBCompare = { facts: facts, statements: statements };

  function yn(v) { return v ? tt('yes') : tt('no'); }
  function render(A, B) {
    var phoneL = function (f) { return f.phone === 'yes' ? tt('lOk') : (f.phone === 'text' ? tt('lPhoneText') : tt('lPhone')); };
    var flag = function (v) { return v ? tt('lOk') : tt('lPhone'); };
    var txt = function (s, extra) { return s ? LB.esc(s) + (extra ? ' <span class="lb-note">(' + s.length + ' ' + tt('chars') + ')</span>' : '') : '<em>' + LB.esc(tt('missing')) + '</em>'; };
    var rows = [
      ['rowUrl', function (f) { return LB.esc(f.url || '-'); }], ['rowStatus', function (f) { return LB.esc(f.status == null ? '-' : f.status); }],
      ['rowTitle', function (f) { return txt(f.title, 1); }], ['rowDesc', function (f) { return txt(f.desc, 1); }], ['rowH1', function (f) { return LB.esc(f.h1); }],
      ['rowSchema', function (f) { return LB.esc(f.schema.join(', ') || tt('none')); }], ['rowLb', function (f) { return LB.esc(flag(f.lb)); }],
      ['rowWords', function (f) { return LB.esc(f.words); }], ['rowVp', function (f) { return LB.esc(yn(f.vp)); }], ['rowInternal', function (f) { return LB.esc(f.links); }], ['rowAlt', function (f) { return LB.esc(f.alt); }],
      ['rowIdx', function (f) { return LB.esc(yn(f.idx)); }], ['rowCanon', function (f) { return f.canon ? LB.esc(f.canon) : '<em>' + LB.esc(tt('missing')) + '</em>'; }],
      ['rowPhone', function (f) { return LB.esc(phoneL(f)); }], ['rowAddr', function (f) { return LB.esc(flag(f.addr)); }], ['rowMap', function (f) { return LB.esc(flag(f.map)); }], ['rowContact', function (f) { return LB.esc(flag(f.contact)); }],
      ['rowIssues', function (f) { return LB.esc(f.sev.high + ' / ' + f.sev.medium + ' / ' + f.sev.low); }],
      ['rowSpeed', function (f) { return LB.esc(speedText(speedVal(f.ps))); }]
    ];
    var h = '<table class="lb-table"><thead><tr><th scope="col"></th><th scope="col">' + LB.esc(tt('you')) + '</th><th scope="col">' + LB.esc(tt('comp')) + '</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><th scope="row" style="position:static;text-transform:none;letter-spacing:0;font-size:13.5px;">' + LB.esc(tt(r[0])) + '</th><td>' + r[1](A) + '</td><td>' + r[1](B) + '</td></tr>'; }).join('') + '</tbody></table>';
    $('ccTable').innerHTML = h;
    var st = statements(A, B);
    function ul(list, empty) { return list.length ? '<ul style="margin:8px 0 0 20px;">' + list.map(function (s) { return '<li style="margin-bottom:6px;">' + LB.esc(s) + '</li>'; }).join('') + '</ul>' : '<p class="lb-note">' + LB.esc(empty) + '</p>'; }
    $('ccBehind').innerHTML = '<h3>' + LB.esc(tt('behindT')) + '</h3>' + ul(st.behind, tt('nothingB'));
    $('ccAhead').innerHTML = '<h3>' + LB.esc(tt('aheadT')) + '</h3>' + ul(st.ahead, tt('nothingA'));
    cur = { A: A, B: B, st: st };
    $('ccResult').classList.remove('lb-hidden');
    $('ccResult').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function run(a, b) {
    var na = LB.normalizeUrl(a), nb = LB.normalizeUrl(b);
    if (!na.ok) { $('ccErr').textContent = tt('you') + ': ' + S.urlError(na.error); return; }
    if (!nb.ok) { $('ccErr').textContent = tt('comp') + ': ' + S.urlError(nb.error); return; }
    var ha = new URL(na.url).hostname.replace(/^www\./, ''), hb = new URL(nb.url).hostname.replace(/^www\./, '');
    if (ha === hb) { $('ccErr').textContent = tt('sameSite'); return; }
    $('ccErr').textContent = ''; urls = [na.url, nb.url];
    $('ccResult').classList.add('lb-hidden'); $('ccGo').disabled = true;
    status('<span class="lb-spinner" aria-hidden="true"></span>' + LB.esc(tt('checking')), 'info');
    Promise.all([S.check(na.url), S.check(nb.url)]).then(function (rs) {
      var bad = []; rs.forEach(function (r, i) { if (r.kind !== 'ok') bad.push('<li><strong>' + LB.esc(tt(i ? 'comp' : 'you')) + '</strong> ' + LB.esc(tt('failSide')) + ': ' + LB.esc(failMsg(r)) + '</li>'); });
      if (bad.length) { $('ccGo').disabled = false; status('<ul style="margin-left:18px;">' + bad.join('') + '</ul><p>' + LB.esc(tt('needBoth')) + '</p>', rs.some(function (r) { return r.kind === 'ratelimit'; }) ? 'warn' : 'danger'); return; }
      Promise.all([S.pagespeed(rs[0].data.final_url || na.url, 'mobile'), S.pagespeed(rs[1].data.final_url || nb.url, 'mobile')]).then(function (ps) {
        $('ccGo').disabled = false; $('ccStatus').classList.add('lb-hidden');
        render(facts(rs[0].data, ps[0]), facts(rs[1].data, ps[1]));
      });
    });
  }

  function textReport() {
    if (!cur) return '';
    var L = [tt('you') + ': ' + cur.A.url, tt('comp') + ': ' + cur.B.url, '', tt('scope'), '', tt('behindT') + ':'];
    (cur.st.behind.length ? cur.st.behind : [tt('nothingB')]).forEach(function (s) { L.push('- ' + s); });
    L.push('', tt('aheadT') + ':'); (cur.st.ahead.length ? cur.st.ahead : [tt('nothingA')]).forEach(function (s) { L.push('- ' + s); });
    return L.join('\n');
  }
  $('ccForm').addEventListener('submit', function (e) { e.preventDefault(); if (!LB.api()) return; run($('ccYou').value, $('ccComp').value); });
  $('ccCopy').addEventListener('click', function () { LB.copy(textReport(), $('ccCopy')); });
  $('ccPrint').addEventListener('click', function () { window.print(); });
  $('ccAgain').addEventListener('click', function () { if (urls) run(urls[0], urls[1]); });
  if (!LB.api()) { $('ccDisabled').classList.remove('lb-hidden'); $('ccGo').disabled = true; }
})();
