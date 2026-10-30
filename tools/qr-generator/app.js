/* QR generator: real, scannable QR codes (qrcode-generator, MIT) built in the browser. Nothing is uploaded. */
(function () {
  var $ = LB.$;
  var T = {
    en: { need: 'Paste your review link to generate the QR code.', bad: 'Enter a full web address starting with https:// (for example your g.page review link).', long: 'This link is too long for a QR code. Use a shorter link.', placeholder: 'Your QR code appears here', soft: 'This is not a Google review link. The QR code will still work, but check that it opens your review form.', ok: 'Scan test: open the link below on a phone before printing.', yourName: 'Your Business Name' },
    hi: { need: 'QR कोड बनाने के लिए अपना रिव्यू लिंक पेस्ट करें।', bad: 'https:// से शुरू होने वाला पूरा वेब पता डालें (जैसे आपका g.page रिव्यू लिंक)।', long: 'यह लिंक QR कोड के लिए बहुत लंबा है। छोटा लिंक इस्तेमाल करें।', placeholder: 'आपका QR कोड यहाँ दिखेगा', soft: 'यह Google रिव्यू लिंक नहीं है। QR कोड फिर भी चलेगा, पर जाँच लें कि वह आपका रिव्यू फ़ॉर्म खोलता है।', ok: 'स्कैन टेस्ट: प्रिंट से पहले नीचे का लिंक फ़ोन पर खोलकर देखें।', yourName: 'आपके बिज़नेस का नाम' }
  };
  function tt(k) { return LB.t(T, k); }
  var qr = null, link = '';
  function validLink(raw) {
    var s = String(raw || '').trim(); if (!s) return { e: 'need' };
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    var u; try { u = new URL(s); } catch (e) { return { e: 'bad' }; }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !/\./.test(u.hostname) || /\s/.test(raw.trim())) return { e: 'bad' };
    if (u.href.length > 600) return { e: 'long' };
    return { url: u.href, google: /(^|\.)(g\.page|google\.com|goo\.gl)$/.test(u.hostname) };
  }
  function make(text) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    var q = qrcode(0, 'M'); q.addData(text, 'Byte'); q.make(); return q;
  }
  function svgString(q, size, margin) {
    var n = q.getModuleCount(), total = n + margin * 2, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + margin) + ' ' + (r + margin) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges"><rect width="' + total + '" height="' + total + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  function pngBlob(q, px, cb) {
    var n = q.getModuleCount(), margin = 4, total = n + margin * 2, scale = Math.max(1, Math.floor(px / total)), size = total * scale;
    var cv = document.createElement('canvas'); cv.width = size; cv.height = size; var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
    cv.toBlob(cb, 'image/png');
  }
  function update() {
    $('cardBizName').textContent = $('storeName').value || tt('yourName');
    $('cardCta').textContent = $('ctaHead').value || (LB.lang === 'hi' ? 'Google पर हमें रेट करें!' : 'Rate Us On Google!');
    $('cardSub').textContent = $('subPrompt').value || (LB.lang === 'hi' ? 'फ़ोन कैमरे से स्कैन करें' : 'Scan with phone camera');
    var v = validLink($('reviewLink').value), box = $('qrBox'), err = $('qrErr'), note = $('qrNote');
    qr = null;
    ['qrPng', 'qrSvg', 'qrPrint'].forEach(function (id) { $(id).disabled = true; });
    note.textContent = '';
    if (v.e) {
      box.innerHTML = '<span style="font-size:12px;color:#64748B;text-align:center;padding:8px;">' + LB.esc(tt('placeholder')) + '</span>';
      err.textContent = $('reviewLink').value.trim() ? tt(v.e) : '';
      return;
    }
    err.textContent = '';
    try { qr = make(v.url); } catch (e) { box.innerHTML = ''; err.textContent = tt('long'); return; }
    link = v.url;
    box.innerHTML = svgString(qr, 140, 1).replace('<svg ', '<svg role="img" aria-label="QR code" ');
    ['qrPng', 'qrSvg', 'qrPrint'].forEach(function (id) { $(id).disabled = false; });
    note.innerHTML = (v.google ? '' : LB.esc(tt('soft')) + ' ') + LB.esc(tt('ok')) + ' <a href="' + LB.esc(v.url) + '" target="_blank" rel="noopener noreferrer">' + LB.esc(v.url.length > 70 ? v.url.slice(0, 67) + '...' : v.url) + '</a>';
  }
  window.LBQR = { make: make, validLink: validLink };
  ['storeName', 'ctaHead', 'reviewLink', 'subPrompt'].forEach(function (id) { $(id).addEventListener('input', update); });
  $('qrSvg').addEventListener('click', function () { if (qr) LB.download('review-qr.svg', 'image/svg+xml', svgString(qr, 1024, 4)); });
  $('qrPng').addEventListener('click', function () { if (qr) pngBlob(qr, 1024, function (b) { if (b) LB.download('review-qr.png', 'image/png', b); }); });
  $('qrPrint').addEventListener('click', function () { window.print(); });
  update();
})();
