/* Website SEO Checker: calls POST /api/site-check (and GET /api/pagespeed) only when window.LOCALBOOST_API.enabled === true. */
(function () {
  var $ = LB.$, S = window.LBSite;
  var T = {
    en: { checking: 'Checking', p1: 'Contacting the website and reading robots.txt...', p2: 'Reading the page: title, headings, links, structured data...', p3: 'Checking internal links and local signals. This can take up to a minute...',
      sumPages: 'Pages checked', high: 'High', medium: 'Medium', low: 'Low', score: 'Score (from the API)', checked: 'Checked', finalUrl: 'Final URL after redirects', redirected: 'The site redirected your address to a different one. Results are for the final URL.',
      partial: 'Partial result: not every check could finish (time or request limits). What is shown is real, but some items may be missing.', robots: 'robots.txt', sitemap: 'Sitemap', sitemapChecked: 'checked, {u} URLs listed, {s} sampled',
      skipped: 'Skipped URLs', all: 'All', sev: 'Severity', cat: 'Category', q: 'Search issues', noIssues: 'No issues were flagged by these automated checks. This is not a guarantee of good rankings; it only means these specific checks passed.', noMatch: 'No issues match the filters.',
      fix: 'Fix', evidence: 'Evidence', page: 'Page', thUrl: 'URL', thStatus: 'Status', thTitle: 'Title', thDesc: 'Meta description', thH1: 'H1', thCanon: 'Canonical', thIdx: 'Indexable', thWords: 'Words', thAlt: 'Images w/o alt', thLinks: 'Internal links', thBroken: 'Broken links', thSchema: 'Schema types', thVp: 'Viewport',
      yes: 'Yes', no: 'No', missing: 'Missing', unknown: 'Not checked', copyT: 'Copy as text', csvI: 'Export issues CSV', csvP: 'Export pages CSV', print: 'Print / save PDF', again: 'Check again',
      psTitle: 'PageSpeed (Google PageSpeed Insights)', psMobile: 'Mobile', psDesktop: 'Desktop', psLab: 'Lab data (one simulated test run)', psField: 'Field data (real users, Chrome UX Report)', psNoField: 'Not available for this URL (not enough real-user data).', psNoLab: 'Not returned.',
      psMetric: 'Metric', psLabH: 'Lab', psFieldH: 'Field', psScore: 'Performance score (lab)', psInp: 'INP (responsiveness)', psLcp: 'LCP (loading)', psCls: 'CLS (layout shift)', psTbt: 'TBT (lab blocking time)', psAt: 'Measured', psNote: 'Lab and field numbers can differ. Field data reflects real visitors; lab data is a single simulated test. Ratings use Google\'s published Core Web Vitals thresholds.',
      psUnavail: 'PageSpeed data is not available right now.', psRate: 'PageSpeed rate limit reached. Try again later.', psGood: 'Good', psNi: 'Needs improvement', psPoor: 'Poor', psLoading: 'Loading PageSpeed data...',
      title: 'Website SEO check report', copied: 'Copied', sevL: { high: 'High', medium: 'Medium', low: 'Low' }, rl: 'Rate limit', blockedT: 'Address not allowed', unrT: 'Website unreachable', netT: 'Network error', errT: 'Checker error', retry: 'Try again',
      noJs: 'The report has no pages.' },
    hi: { checking: 'जाँच हो रही है', p1: 'वेबसाइट से संपर्क और robots.txt पढ़ा जा रहा है...', p2: 'पेज पढ़ा जा रहा है: टाइटल, हेडिंग, लिंक, स्ट्रक्चर्ड डेटा...', p3: 'आंतरिक लिंक और लोकल संकेत जाँचे जा रहे हैं। इसमें एक मिनट तक लग सकता है...',
      sumPages: 'जाँचे गए पेज', high: 'ज़्यादा', medium: 'मध्यम', low: 'कम', score: 'स्कोर (API से)', checked: 'जाँच का समय', finalUrl: 'रीडायरेक्ट के बाद का अंतिम URL', redirected: 'साइट ने आपका पता किसी दूसरे पते पर भेजा। नतीजे अंतिम URL के हैं।',
      partial: 'आंशिक नतीजा: समय या रिक्वेस्ट की सीमा के कारण सारी जाँच पूरी नहीं हो सकी। जो दिख रहा है वह असली है, पर कुछ बातें छूट सकती हैं।', robots: 'robots.txt', sitemap: 'साइटमैप', sitemapChecked: 'जाँचा गया, {u} URL सूचीबद्ध, {s} का नमूना',
      skipped: 'छोड़े गए URL', all: 'सभी', sev: 'गंभीरता', cat: 'श्रेणी', q: 'समस्याएँ खोजें', noIssues: 'इन स्वचालित जाँचों में कोई समस्या नहीं मिली। यह अच्छी रैंकिंग की गारंटी नहीं है; इसका मतलब सिर्फ़ इतना है कि ये खास जाँचें पास हुईं।', noMatch: 'फ़िल्टर से कोई समस्या मेल नहीं खाती।',
      fix: 'सुधार', evidence: 'सबूत', page: 'पेज', thUrl: 'URL', thStatus: 'स्टेटस', thTitle: 'टाइटल', thDesc: 'मेटा विवरण', thH1: 'H1', thCanon: 'कैनोनिकल', thIdx: 'इंडेक्स योग्य', thWords: 'शब्द', thAlt: 'बिना alt वाली इमेज', thLinks: 'आंतरिक लिंक', thBroken: 'टूटे लिंक', thSchema: 'स्कीमा टाइप', thVp: 'व्यूपोर्ट',
      yes: 'हाँ', no: 'नहीं', missing: 'गायब', unknown: 'जाँचा नहीं', copyT: 'टेक्स्ट कॉपी करें', csvI: 'समस्याएँ CSV', csvP: 'पेज CSV', print: 'प्रिंट / PDF सेव', again: 'दोबारा जाँचें',
      psTitle: 'पेज स्पीड (Google PageSpeed Insights)', psMobile: 'मोबाइल', psDesktop: 'डेस्कटॉप', psLab: 'लैब डेटा (एक नकली टेस्ट रन)', psField: 'फ़ील्ड डेटा (असली यूज़र, Chrome UX Report)', psNoField: 'इस URL के लिए उपलब्ध नहीं (असली यूज़र का पर्याप्त डेटा नहीं)।', psNoLab: 'नहीं मिला।',
      psMetric: 'मीट्रिक', psLabH: 'लैब', psFieldH: 'फ़ील्ड', psScore: 'परफ़ॉर्मेंस स्कोर (लैब)', psInp: 'INP (प्रतिक्रिया)', psLcp: 'LCP (लोडिंग)', psCls: 'CLS (लेआउट शिफ़्ट)', psTbt: 'TBT (लैब ब्लॉकिंग टाइम)', psAt: 'मापा गया', psNote: 'लैब और फ़ील्ड संख्याएँ अलग हो सकती हैं। फ़ील्ड डेटा असली विज़िटरों का है; लैब डेटा एक नकली टेस्ट है। रेटिंग Google की प्रकाशित Core Web Vitals सीमाओं पर आधारित है।',
      psUnavail: 'PageSpeed डेटा अभी उपलब्ध नहीं है।', psRate: 'PageSpeed की सीमा पूरी हो गई। बाद में कोशिश करें।', psGood: 'अच्छा', psNi: 'सुधार चाहिए', psPoor: 'खराब', psLoading: 'PageSpeed डेटा लोड हो रहा है...',
      title: 'वेबसाइट SEO जाँच रिपोर्ट', copied: 'कॉपी हो गया', sevL: { high: 'ज़्यादा', medium: 'मध्यम', low: 'कम' }, rl: 'सीमा', blockedT: 'पता अनुमत नहीं', unrT: 'वेबसाइट नहीं खुली', netT: 'नेटवर्क त्रुटि', errT: 'चेकर त्रुटि', retry: 'दोबारा कोशिश करें',
      noJs: 'रिपोर्ट में कोई पेज नहीं है।' }
  };
  function tt(k) { return LB.t(T, k); }
  var last = null, lastUrl = '', psStrategy = 'mobile', timers = [];

  function status(html, cls) { var b = $('scStatus'); b.className = 'lb-banner ' + (cls || 'info'); b.innerHTML = html; b.classList.remove('lb-hidden'); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function run(raw) {
    var n = LB.normalizeUrl(raw);
    if (!n.ok) { $('scErr').textContent = S.urlError(n.error); return; }
    $('scErr').textContent = ''; lastUrl = n.url;
    $('scResult').classList.add('lb-hidden'); $('scGo').disabled = true;
    status('<span class="lb-spinner" aria-hidden="true"></span>' + LB.esc(tt('checking')) + ': ' + LB.esc(n.url) + '<br><span id="scProg">' + LB.esc(tt('p1')) + '</span>', 'info');
    timers.push(setTimeout(function () { var p = $('scProg'); if (p) p.textContent = tt('p2'); }, 3000));
    timers.push(setTimeout(function () { var p = $('scProg'); if (p) p.textContent = tt('p3'); }, 9000));
    S.check(n.url).then(function (r) {
      clearTimers(); $('scGo').disabled = false;
      if (r.kind === 'ok') { $('scStatus').classList.add('lb-hidden'); last = r.data; show(r.data); loadSpeed(r.data.final_url || r.data.url || n.url); return; }
      if (r.kind === 'blocked') { var why = S.reason(r.data.reason); status('<strong>' + LB.esc(tt('blockedT')) + '.</strong> ' + LB.esc(S.m('blocked')) + (why ? '<br>' + LB.esc(why) : ''), 'danger'); return; }
      if (r.kind === 'unreachable') { var w2 = S.ureason(r.data.reason); status('<strong>' + LB.esc(tt('unrT')) + '.</strong> ' + LB.esc(S.m('unreachable')) + (w2 ? ' ' + LB.esc(w2) : ''), 'danger'); return; }
      if (r.kind === 'ratelimit') { status('<strong>' + LB.esc(tt('rl')) + '.</strong> ' + LB.esc(S.m('rate')), 'warn'); return; }
      if (r.kind === 'network') { status('<strong>' + LB.esc(tt('netT')) + '.</strong> ' + LB.esc(S.m('network')), 'danger'); return; }
      status('<strong>' + LB.esc(tt('errT')) + '.</strong> ' + LB.esc(S.m('server')) + (r.status ? ' (HTTP ' + r.status + ')' : '') + '.', 'danger');
    });
  }

  function show(d) {
    var s = d.summary || { high: 0, medium: 0, low: 0, pages_checked: (d.pages || []).length };
    var stats = [[tt('sumPages'), s.pages_checked], [tt('high'), s.high], [tt('medium'), s.medium], [tt('low'), s.low]];
    if (typeof d.score === 'number') stats.push([tt('score'), d.score]);
    $('scStats').innerHTML = stats.map(function (x) { return '<div class="lb-stat"><b>' + LB.esc(x[1]) + '</b><span>' + LB.esc(x[0]) + '</span></div>'; }).join('');
    var meta = [];
    meta.push('<div>' + LB.esc(tt('checked')) + ': ' + LB.esc(d.checked_at ? new Date(d.checked_at).toLocaleString() : '-') + ' &middot; ' + LB.esc(d.url || '') + '</div>');
    if (d.final_url && d.url && d.final_url !== d.url) meta.push('<div>' + LB.esc(tt('finalUrl')) + ': <strong>' + LB.esc(d.final_url) + '</strong></div><div class="lb-note">' + LB.esc(tt('redirected')) + '</div>');
    if (d.robots && d.robots.state) meta.push('<div>' + LB.esc(tt('robots')) + ': ' + LB.esc(d.robots.state) + '</div>');
    if (d.sitemap && d.sitemap.checked) meta.push('<div>' + LB.esc(tt('sitemap')) + ': ' + LB.esc(tt('sitemapChecked').replace('{u}', d.sitemap.urls).replace('{s}', d.sitemap.sampled)) + '</div>');
    $('scMeta').innerHTML = meta.join('');
    var ban = [];
    if (d.state === 'partial') ban.push('<div class="lb-banner warn">' + LB.esc(tt('partial')) + '</div>');
    if (d.message) ban.push('<div class="lb-banner info">' + LB.esc(d.message) + '</div>');
    $('scBanner').innerHTML = ban.join('');
    var sk = d.skipped || [];
    $('scSkipped').innerHTML = sk.length ? '<details class="lb-details"><summary>' + LB.esc(tt('skipped')) + ' (' + sk.length + ')</summary><ul>' + sk.map(function (x) { return '<li>' + LB.esc(x.url) + ' - ' + LB.esc(x.reason) + '</li>'; }).join('') + '</ul></details>' : '';
    var cats = {}; (d.issues || []).forEach(function (i) { cats[i.category || ''] = 1; });
    var cs = $('scCat'); cs.innerHTML = '<option value="">' + LB.esc(tt('all')) + '</option>' + Object.keys(cats).sort().map(function (c) { return '<option>' + LB.esc(c) + '</option>'; }).join('');
    $('scSev').value = ''; $('scQ').value = '';
    renderIssues(); renderPages(d.pages || []);
    $('scResult').classList.remove('lb-hidden');
    $('scResult').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function filteredIssues() {
    var sev = $('scSev').value, cat = $('scCat').value, q = $('scQ').value.trim().toLowerCase();
    return ((last && last.issues) || []).filter(function (i) {
      return (!sev || i.severity === sev) && (!cat || i.category === cat) && (!q || (i.message + ' ' + i.evidence + ' ' + i.fix + ' ' + i.page_url).toLowerCase().indexOf(q) >= 0);
    });
  }
  function renderIssues() {
    var list = filteredIssues(), box = $('scIssues');
    if (!((last && last.issues) || []).length) { box.innerHTML = '<div class="lb-banner ok">' + LB.esc(tt('noIssues')) + '</div>'; return; }
    if (!list.length) { box.innerHTML = '<p class="lb-note">' + LB.esc(tt('noMatch')) + '</p>'; return; }
    box.innerHTML = list.map(function (i) {
      return '<div class="lb-out" style="margin-bottom:10px;"><div class="lb-row" style="margin-bottom:6px;"><span class="badge ' + LB.esc(i.severity) + '">' + LB.esc(tt('sevL')[i.severity] || i.severity) + '</span><span class="badge neutral">' + LB.esc(i.category) + '</span></div>' +
        '<div style="font-weight:700;">' + LB.esc(i.message) + '</div>' +
        (i.evidence ? '<div class="lb-note"><strong>' + LB.esc(tt('evidence')) + ':</strong> ' + LB.esc(i.evidence) + '</div>' : '') +
        (i.fix ? '<div style="font-size:14px;margin-top:6px;"><strong>' + LB.esc(tt('fix')) + ':</strong> ' + LB.esc(i.fix) + '</div>' : '') +
        (i.page_url ? '<div class="lb-note"><strong>' + LB.esc(tt('page')) + ':</strong> ' + LB.esc(i.page_url) + '</div>' : '') + '</div>';
    }).join('');
  }
  function yn(v) { return v === true ? tt('yes') : (v === false ? tt('no') : tt('unknown')); }
  function renderPages(pages) {
    var h = ['thUrl', 'thStatus', 'thTitle', 'thDesc', 'thH1', 'thCanon', 'thIdx', 'thWords', 'thAlt', 'thLinks', 'thBroken', 'thSchema', 'thVp'];
    var rows = pages.map(function (p) {
      return '<tr><td>' + LB.esc(p.url) + '</td><td>' + LB.esc(p.status) + '</td><td>' + (p.title ? LB.esc(p.title) : '<em>' + LB.esc(tt('missing')) + '</em>') + '</td><td>' + (p.description ? LB.esc(p.description) : '<em>' + LB.esc(tt('missing')) + '</em>') + '</td><td>' + LB.esc(p.h1_count) + '</td><td>' + (p.canonical ? LB.esc(p.canonical) : '-') + '</td><td>' + yn(p.indexable) + '</td><td>' + LB.esc(p.word_count) + '</td><td>' + LB.esc(p.images_missing_alt) + '</td><td>' + LB.esc(p.links_internal) + '</td><td>' + (p.links_broken == null ? LB.esc(tt('unknown')) : LB.esc(p.links_broken)) + '</td><td>' + LB.esc((p.schema_types || []).join(', ') || '-') + '</td><td>' + (p.viewport ? LB.esc(p.viewport) : '<em>' + LB.esc(tt('missing')) + '</em>') + '</td></tr>';
    }).join('');
    $('scPages').innerHTML = '<table class="lb-table" style="min-width:1100px"><thead><tr>' + h.map(function (k) { return '<th scope="col">' + LB.esc(tt(k)) + '</th>'; }).join('') + '</tr></thead><tbody>' + (rows || '<tr><td colspan="13">' + LB.esc(tt('noJs')) + '</td></tr>') + '</tbody></table>';
  }

  /* ---------- PageSpeed ---------- */
  function loadSpeed(url) {
    var box = $('scPs'); box.classList.remove('lb-hidden');
    $('scPsBody').innerHTML = '<span class="lb-spinner" aria-hidden="true"></span>' + LB.esc(tt('psLoading'));
    S.pagespeed(url, psStrategy).then(function (r) {
      if (r.kind === 'hidden' || r.kind === 'disabled') { box.classList.add('lb-hidden'); return; }
      if (r.kind === 'ratelimit') { $('scPsBody').innerHTML = '<p class="lb-note">' + LB.esc(tt('psRate')) + '</p>'; return; }
      if (r.kind !== 'ok') { $('scPsBody').innerHTML = '<p class="lb-note">' + LB.esc(tt('psUnavail')) + '</p>'; return; }
      var d = r.data, lab = d.lab || (d.field_data ? null : { lcp_ms: d.lcp_ms, cls: d.cls, performance_score: d.performance_score });
      var fld = d.field || (d.field_data ? { lcp_ms: d.lcp_ms, inp_ms: d.inp_ms, cls: d.cls } : null);
      function cell(metric, v, fmt) { if (v == null) return '-'; var rt = S.rate(metric, v); return LB.esc(fmt(v)) + (rt ? ' <span class="badge ' + (rt === 'good' ? 'transactional' : rt === 'ni' ? 'medium' : 'high') + '">' + LB.esc(tt(rt === 'good' ? 'psGood' : rt === 'ni' ? 'psNi' : 'psPoor')) + '</span>' : ''); }
      var score = lab && lab.performance_score != null ? lab.performance_score : null;
      var html = '<div class="lb-scroll" style="max-height:none"><table class="lb-table"><thead><tr><th>' + LB.esc(tt('psMetric')) + '</th><th>' + LB.esc(tt('psLab')) + '</th><th>' + LB.esc(tt('psField')) + '</th></tr></thead><tbody>' +
        '<tr><td>' + LB.esc(tt('psScore')) + '</td><td>' + (score == null ? '-' : LB.esc(score) + ' / 100') + '</td><td>-</td></tr>' +
        '<tr><td>' + LB.esc(tt('psLcp')) + '</td><td>' + (lab ? cell('lcp', lab.lcp_ms, S.fmtMs) : LB.esc(tt('psNoLab'))) + '</td><td>' + (fld ? cell('lcp', fld.lcp_ms, S.fmtMs) : LB.esc(tt('psNoField'))) + '</td></tr>' +
        '<tr><td>' + LB.esc(tt('psCls')) + '</td><td>' + (lab ? cell('cls', lab.cls, S.fmtCls) : LB.esc(tt('psNoLab'))) + '</td><td>' + (fld ? cell('cls', fld.cls, S.fmtCls) : LB.esc(tt('psNoField'))) + '</td></tr>' +
        '<tr><td>' + LB.esc(tt('psInp')) + '</td><td>-</td><td>' + (fld ? cell('inp', fld.inp_ms, S.fmtMs) : LB.esc(tt('psNoField'))) + '</td></tr>' +
        (lab && lab.tbt_ms != null ? '<tr><td>' + LB.esc(tt('psTbt')) + '</td><td>' + LB.esc(S.fmtMs(lab.tbt_ms)) + '</td><td>-</td></tr>' : '') +
        '</tbody></table></div><p class="lb-note">' + LB.esc(tt('psAt')) + ': ' + LB.esc(d.measured_at ? new Date(d.measured_at).toLocaleString() : '-') + '. ' + LB.esc(tt('psNote')) + '</p>';
      $('scPsBody').innerHTML = html;
    });
  }

  /* ---------- exports ---------- */
  function textReport() {
    if (!last) return '';
    var d = last, s = d.summary || {}, L = [];
    L.push(tt('title')); L.push(d.url + (d.final_url && d.final_url !== d.url ? ' -> ' + d.final_url : '')); L.push(tt('checked') + ': ' + d.checked_at);
    L.push(tt('sumPages') + ': ' + s.pages_checked + ' | ' + tt('high') + ': ' + s.high + ' | ' + tt('medium') + ': ' + s.medium + ' | ' + tt('low') + ': ' + s.low);
    if (d.state === 'partial') L.push(tt('partial'));
    L.push('');
    (d.issues || []).forEach(function (i, n) { L.push((n + 1) + '. [' + String(i.severity).toUpperCase() + '] [' + i.category + '] ' + i.message); if (i.evidence) L.push('   ' + tt('evidence') + ': ' + i.evidence); if (i.fix) L.push('   ' + tt('fix') + ': ' + i.fix); if (i.page_url) L.push('   ' + tt('page') + ': ' + i.page_url); });
    return L.join('\n');
  }
  function csvIssues() { var rows = [['severity', 'category', 'message', 'evidence', 'fix', 'page_url', 'code']]; ((last && last.issues) || []).forEach(function (i) { rows.push([i.severity, i.category, i.message, i.evidence, i.fix, i.page_url, i.code]); }); return LB.csv(rows); }
  function csvPages() { var rows = [['url', 'status', 'title', 'description', 'h1_count', 'canonical', 'robots', 'indexable', 'word_count', 'images_missing_alt', 'links_internal', 'links_broken', 'schema_types', 'viewport']]; ((last && last.pages) || []).forEach(function (p) { rows.push([p.url, p.status, p.title, p.description, p.h1_count, p.canonical, p.robots, p.indexable, p.word_count, p.images_missing_alt, p.links_internal, p.links_broken, (p.schema_types || []).join('; '), p.viewport]); }); return LB.csv(rows); }
  window.LBSiteReport = { text: textReport };

  $('scForm').addEventListener('submit', function (e) { e.preventDefault(); if (!LB.api()) return; run($('scUrl').value); });
  ['scSev', 'scCat'].forEach(function (id) { $(id).addEventListener('change', renderIssues); });
  $('scQ').addEventListener('input', renderIssues);
  $('scCopy').addEventListener('click', function () { LB.copy(textReport(), $('scCopy')); });
  $('scCsvI').addEventListener('click', function () { LB.download('website-seo-issues.csv', 'text/csv;charset=utf-8', '﻿' + csvIssues()); });
  $('scCsvP').addEventListener('click', function () { LB.download('website-seo-pages.csv', 'text/csv;charset=utf-8', '﻿' + csvPages()); });
  $('scPrint').addEventListener('click', function () { window.print(); });
  $('scAgain').addEventListener('click', function () { if (lastUrl) run(lastUrl); });
  document.querySelectorAll('[data-ps]').forEach(function (b) { b.addEventListener('click', function () { psStrategy = b.getAttribute('data-ps'); document.querySelectorAll('[data-ps]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); x.classList.toggle('primary', x === b); }); if (last) loadSpeed(last.final_url || last.url || lastUrl); }); });

  if (!LB.api()) { $('scDisabled').classList.remove('lb-hidden'); $('scGo').disabled = true; }
})();
