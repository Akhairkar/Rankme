/* Maps embed helper: builds iframe code. Accepts Google's own embed code (recommended) or a name search. Browser only. */
(function () {
  var $ = LB.$;
  var T = {
    en: { need: 'Enter a business name and area, or paste the embed code from Google Maps.', w: 'Width must be like 100% or 600 (pixels, 200 to 1600).', h: 'Height must be a number from 150 to 1200 (pixels).', badEmbed: 'The pasted code does not contain a Google Maps embed address (https://www.google.com/maps/embed?...). In Google Maps choose Share, then Embed a map, then Copy HTML.',
          official: 'Using the iframe address from Google\'s own embed code.', legacy: 'Search-based embed: this uses a simple Google Maps address that is not part of Google\'s documented embed options and could change. For the officially supported code, use Share, then Embed a map in Google Maps and paste it above.', title: 'Map showing the location of ', titleDef: 'Business location on Google Maps', copy: 'Copy Code' },
    hi: { need: 'बिज़नेस का नाम और इलाका डालें, या Google Maps का एम्बेड कोड पेस्ट करें।', w: 'चौड़ाई 100% जैसी या 600 (पिक्सल, 200 से 1600) होनी चाहिए।', h: 'ऊँचाई 150 से 1200 (पिक्सल) के बीच की संख्या होनी चाहिए।', badEmbed: 'पेस्ट किए कोड में Google Maps एम्बेड पता (https://www.google.com/maps/embed?...) नहीं है। Google Maps में Share, फिर Embed a map, फिर Copy HTML चुनें।',
          official: 'Google के अपने एम्बेड कोड का iframe पता इस्तेमाल हो रहा है।', legacy: 'सर्च-आधारित एम्बेड: यह सरल Google Maps पता इस्तेमाल करता है जो Google के दस्तावेज़ित एम्बेड विकल्पों का हिस्सा नहीं है और बदल सकता है। आधिकारिक कोड के लिए Google Maps में Share, फिर Embed a map चुनकर ऊपर पेस्ट करें।', title: 'इस जगह का नक्शा: ', titleDef: 'Google Maps पर बिज़नेस की लोकेशन', copy: 'कोड कॉपी करें' }
  };
  function tt(k) { return LB.t(T, k); }
  function attr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function clean(s, n) { return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }
  function officialSrc(raw) {
    var m = String(raw || '').match(/src\s*=\s*["']([^"']+)["']/i); var s = m ? m[1] : String(raw || '').trim();
    s = s.replace(/&amp;/g, '&');
    try { var u = new URL(s); if (u.protocol === 'https:' && u.hostname === 'www.google.com' && u.pathname.indexOf('/maps/embed') === 0) return u.href; } catch (e) {}
    return '';
  }
  function build(o) {
    var w = String(o.w).trim() || '100%', h = String(o.h).trim() || '450';
    var wOk = /^(100|[1-9]\d?)%$/.test(w) || (/^\d{3,4}(px)?$/.test(w) && parseInt(w, 10) >= 200 && parseInt(w, 10) <= 1600);
    if (!wOk) return { err: 'w' };
    var hn = parseInt(h, 10); if (!/^\d{3,4}$/.test(h) || hn < 150 || hn > 1200) return { err: 'h' };
    var src, official = false;
    if (o.embed && o.embed.trim()) { src = officialSrc(o.embed); if (!src) return { err: 'badEmbed' }; official = true; }
    else { var q = clean(o.name, 200); if (!q) return { err: 'need' }; src = 'https://maps.google.com/maps?q=' + encodeURIComponent(q) + '&z=15&output=embed'; }
    var title = o.name && clean(o.name, 120) ? tt('title') + clean(o.name, 120) : tt('titleDef');
    var wAttr = /%$/.test(w) ? w : String(parseInt(w, 10));
    var code = '<iframe src="' + attr(src) + '" width="' + wAttr + '" height="' + hn + '" style="border:0; max-width:100%;" title="' + attr(title) + '" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>';
    return { code: code, src: src, official: official, h: hn };
  }
  window.LBMaps = { build: build, officialSrc: officialSrc };
  $('mapsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var r = build({ name: $('embedBizName').value, embed: $('embedPaste').value, w: $('embedWidth').value, h: $('embedHeight').value });
    var err = $('mapsErr');
    if (r.err) { err.textContent = tt(r.err); $('mapsResultBox').classList.add('lb-hidden'); return; }
    err.textContent = '';
    $('mapsOut').textContent = r.code;
    var pv = $('mapsPreview'); pv.innerHTML = '';
    var f = document.createElement('iframe'); f.src = r.src; f.width = '100%'; f.height = r.h; f.style.border = '0'; f.title = tt('titleDef'); f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade'; pv.appendChild(f);
    var n = $('mapsNote'); n.textContent = r.official ? tt('official') : tt('legacy'); n.className = 'lb-banner ' + (r.official ? 'ok' : 'warn');
    $('mapsResultBox').classList.remove('lb-hidden');
    $('mapsResultBox').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('mapsCopyBtn').addEventListener('click', function () { LB.copy($('mapsOut').textContent, $('mapsCopyBtn')); });
})();
