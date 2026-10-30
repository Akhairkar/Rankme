/* NAP formatter: builds copy-ready text blocks for directory listings. Nothing is submitted or sent anywhere. */
(function () {
  var $ = LB.$;
  var T = {
    en: { need: 'Enter the business name, address and phone number first.', phone: 'The phone number should have 10 digits (with or without +91). Check it before copying.', web: 'The website address looks invalid. Use a full address such as https://www.example.com or leave it blank.',
          ok: 'copied. Paste it into the directory yourself; LocalBoost does not submit anything.', block: 'Standard NAP block' },
    hi: { need: 'पहले बिज़नेस का नाम, पता और फ़ोन नंबर भरें।', phone: 'फ़ोन नंबर में 10 अंक होने चाहिए (+91 के साथ या बिना)। कॉपी करने से पहले जाँच लें।', web: 'वेबसाइट का पता सही नहीं लगता। https://www.example.com जैसा पूरा पता डालें या खाली छोड़ें।',
          ok: 'कॉपी हो गया। इसे डायरेक्टरी में खुद पेस्ट करें; LocalBoost कुछ भी सबमिट नहीं करता।', block: 'स्टैंडर्ड NAP ब्लॉक' }
  };
  function tt(k) { return LB.t(T, k); }
  function clean(s, n) { return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }
  function phoneFmt(raw) {
    var d = String(raw || '').replace(/[^\d]/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    return /^[6-9]\d{9}$/.test(d) ? '+91 ' + d.slice(0, 5) + ' ' + d.slice(5) : null;
  }
  function text(portal, v) {
    var L = ['--- ' + portal + ' ---', 'Business Name: ' + v.name, 'Address: ' + v.addr, 'Phone: ' + v.phone];
    if (v.web) L.push('Website: ' + v.web);
    return L.join('\n');
  }
  function read() {
    var v = { name: clean($('napName').value, 120), addr: clean($('napAddr').value, 250), phone: clean($('napPhone').value, 30), web: clean($('napWeb').value, 200) };
    var err = '';
    if (!v.name || !v.addr || !v.phone) err = tt('need');
    else {
      var p = phoneFmt(v.phone); if (!p) err = tt('phone'); else v.phone = p;
      if (!err && v.web) { var n = LB.normalizeUrl(v.web); if (!n.ok) err = tt('web'); else v.web = n.url; }
    }
    $('napErr').textContent = err; return err ? null : v;
  }
  window.LBNap = { phoneFmt: phoneFmt, text: text };
  document.querySelectorAll('[data-portal]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = read(); if (!v) return;
      var portal = b.getAttribute('data-portal');
      LB.copy(text(portal, v), b);
      $('napOk').textContent = portal + ' ' + tt('ok');
    });
  });
  $('napAll').addEventListener('click', function () { var v = read(); if (!v) return; LB.copy(text(tt('block'), v), $('napAll')); $('napOk').textContent = tt('block') + ' ' + tt('ok'); });
})();
