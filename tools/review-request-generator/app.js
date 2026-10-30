/* Review Request Generator: WhatsApp / SMS / Email templates for asking customers for an honest Google review.
   Runs in the browser; nothing is sent anywhere and nothing is sent to customers automatically. */
(function () {
  var $ = LB.$;
  var TPL = {
    en: {
      wa: { warm: 'Hi {c},\n\nThank you for choosing {b}{s}. We hope everything went smoothly.\n\nIf you have a minute, we would really appreciate your honest feedback on Google. It helps other people in the area know what to expect:\n{l}\n\nThank you,\nTeam {b}',
            professional: 'Dear {c},\n\nThank you for choosing {b}{s}. We value your feedback, whether positive or critical.\n\nYou can share your honest review on Google here:\n{l}\n\nRegards,\n{b}',
            brief: 'Hi {c}, thanks for choosing {b}. Would you share your honest feedback on Google? {l}' },
      sms: { warm: 'Hi {c}, thanks for choosing {b}. Share your honest feedback on Google: {l}', professional: 'Dear {c}, thank you for choosing {b}. Your honest review on Google: {l}', brief: '{b}: thanks! Honest review on Google: {l}' },
      sub: { warm: 'Your feedback about {b}', professional: 'Share your feedback about {b}', brief: 'Quick feedback request from {b}' },
      em: { warm: 'Hi {c},\n\nThank you for choosing {b}{s}. We would really appreciate your honest feedback, whatever it is, so we can keep improving and so others can know what to expect.\n\nYou can leave a Google review here (it takes about a minute):\n{l}\n\nThank you,\nTeam {b}',
            professional: 'Dear {c},\n\nThank you for choosing {b}{s}. We value your honest feedback, whether positive or critical.\n\nPlease share your review on Google using this link:\n{l}\n\nRegards,\n{b}',
            brief: 'Hi {c},\n\nThanks for choosing {b}. Your honest review on Google helps us and others:\n{l}\n\n{b}' },
      cust: 'customer', svc: ' for {s}'
    },
    hi: {
      wa: { warm: 'नमस्ते {c},\n\n{b}{s} को चुनने के लिए धन्यवाद। उम्मीद है सब कुछ ठीक रहा।\n\nअगर आपके पास एक मिनट हो, तो Google पर अपनी ईमानदार राय देकर हमारी मदद करें। इससे इलाके के दूसरे लोगों को भी पता चलता है कि क्या उम्मीद रखें:\n{l}\n\nधन्यवाद,\nटीम {b}',
            professional: 'आदरणीय {c},\n\n{b}{s} को चुनने के लिए धन्यवाद। हम आपकी प्रतिक्रिया की कद्र करते हैं, चाहे वह अच्छी हो या आलोचना।\n\nआप अपना ईमानदार रिव्यू Google पर यहाँ दे सकते हैं:\n{l}\n\nसादर,\n{b}',
            brief: 'नमस्ते {c}, {b} को चुनने के लिए धन्यवाद। क्या आप Google पर अपनी ईमानदार राय देंगे? {l}' },
      sms: { warm: 'नमस्ते {c}, {b} को चुनने के लिए धन्यवाद। Google पर अपनी ईमानदार राय दें: {l}', professional: 'आदरणीय {c}, {b} को चुनने के लिए धन्यवाद। Google पर आपका ईमानदार रिव्यू: {l}', brief: '{b}: धन्यवाद! Google पर ईमानदार रिव्यू: {l}' },
      sub: { warm: '{b} के बारे में आपकी राय', professional: '{b} के बारे में अपनी प्रतिक्रिया दें', brief: '{b} की ओर से राय का एक छोटा अनुरोध' },
      em: { warm: 'नमस्ते {c},\n\n{b}{s} को चुनने के लिए धन्यवाद। हमें आपकी ईमानदार राय की सच में कद्र होगी, जो भी हो, ताकि हम सुधरते रहें और दूसरों को भी पता चल सके कि क्या उम्मीद रखें।\n\nआप Google रिव्यू यहाँ दे सकते हैं (लगभग एक मिनट लगता है):\n{l}\n\nधन्यवाद,\nटीम {b}',
            professional: 'आदरणीय {c},\n\n{b}{s} को चुनने के लिए धन्यवाद। हम आपकी ईमानदार प्रतिक्रिया की कद्र करते हैं, चाहे वह अच्छी हो या आलोचना।\n\nकृपया इस लिंक से Google पर अपना रिव्यू साझा करें:\n{l}\n\nसादर,\n{b}',
            brief: 'नमस्ते {c},\n\n{b} को चुनने के लिए धन्यवाद। Google पर आपका ईमानदार रिव्यू हमारी और दूसरों की मदद करता है:\n{l}\n\n{b}' },
      cust: 'ग्राहक', svc: ' ({s})'
    },
    hn: {
      wa: { warm: 'Namaste {c},\n\n{b}{s} ko chunne ke liye dhanyavaad. Umeed hai sab kuch theek raha.\n\nAgar aapke paas ek minute ho, to Google par apni imaandar raay dekar hamari madad karein. Isse area ke doosre logon ko bhi pata chalta hai ki kya ummeed rakhein:\n{l}\n\nDhanyavaad,\nTeam {b}',
            professional: 'Dear {c},\n\n{b}{s} ko chunne ke liye dhanyavaad. Hum aapki feedback ki kadar karte hain, chahe woh achhi ho ya critical.\n\nAap apna imaandar review Google par yahan de sakte hain:\n{l}\n\nRegards,\n{b}',
            brief: 'Namaste {c}, {b} ko chunne ke liye dhanyavaad. Kya aap Google par apni imaandar raay denge? {l}' },
      sms: { warm: 'Namaste {c}, {b} ko chunne ke liye dhanyavaad. Google par apni imaandar raay dein: {l}', professional: 'Dear {c}, {b} ko chunne ke liye dhanyavaad. Google par aapka imaandar review: {l}', brief: '{b}: dhanyavaad! Google par imaandar review: {l}' },
      sub: { warm: '{b} ke baare mein aapki raay', professional: '{b} ke baare mein apni feedback dein', brief: '{b} ki taraf se feedback ka ek chhota request' },
      em: { warm: 'Namaste {c},\n\n{b}{s} ko chunne ke liye dhanyavaad. Humein aapki imaandar raay ki sach mein kadar hogi, jo bhi ho, taaki hum sudharte rahein aur doosron ko bhi pata chal sake ki kya ummeed rakhein.\n\nAap Google review yahan de sakte hain (lagbhag ek minute lagta hai):\n{l}\n\nDhanyavaad,\nTeam {b}',
            professional: 'Dear {c},\n\n{b}{s} ko chunne ke liye dhanyavaad. Hum aapki imaandar feedback ki kadar karte hain, chahe woh achhi ho ya critical.\n\nKripya is link se Google par apna review share karein:\n{l}\n\nRegards,\n{b}',
            brief: 'Namaste {c},\n\n{b} ko chunne ke liye dhanyavaad. Google par aapka imaandar review hamari aur doosron ki madad karta hai:\n{l}\n\n{b}' },
      cust: 'customer', svc: ' ({s})'
    }
  };
  var UI = {
    en: { needBiz: 'Enter your business name.', needLink: 'Paste your Google review link.', badLink: 'This does not look like a valid Google review link. Use a https://g.page/... link, a https://search.google.com/local/writereview?placeid=... link, or a https://maps.app.goo.gl/... link.',
          badPhone: 'Enter a 10-digit Indian mobile number (optional), or leave it blank.', sms: 'SMS', chars: 'characters', over: 'Over 160 characters: it will be sent as several SMS parts.', uni: 'This SMS contains Hindi characters (Unicode), so one SMS part holds only 70 characters.', segs: 'parts',
          wa: 'WhatsApp message', smsT: 'SMS message', em: 'Email', subject: 'Subject', body: 'Body', copy: 'Copy', openWa: 'Open in WhatsApp', openSms: 'Open in SMS app', openMail: 'Open in email app', copySub: 'Copy subject', copyBody: 'Copy body' },
    hi: { needBiz: 'अपने बिज़नेस का नाम भरें।', needLink: 'अपना Google रिव्यू लिंक पेस्ट करें।', badLink: 'यह सही Google रिव्यू लिंक नहीं लगता। https://g.page/... लिंक, https://search.google.com/local/writereview?placeid=... लिंक या https://maps.app.goo.gl/... लिंक इस्तेमाल करें।',
          badPhone: '10 अंकों का भारतीय मोबाइल नंबर डालें (वैकल्पिक), या खाली छोड़ें।', sms: 'SMS', chars: 'अक्षर', over: '160 अक्षरों से ज़्यादा: यह कई SMS भागों में जाएगा।', uni: 'इस SMS में हिंदी अक्षर (Unicode) हैं, इसलिए एक SMS भाग में सिर्फ़ 70 अक्षर आते हैं।', segs: 'भाग',
          wa: 'WhatsApp संदेश', smsT: 'SMS संदेश', em: 'ईमेल', subject: 'विषय', body: 'मुख्य भाग', copy: 'कॉपी करें', openWa: 'WhatsApp में खोलें', openSms: 'SMS ऐप में खोलें', openMail: 'ईमेल ऐप में खोलें', copySub: 'विषय कॉपी करें', copyBody: 'मुख्य भाग कॉपी करें' }
  };
  function ui(k) { return LB.t(UI, k); }
  function clean(s, n) { return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }
  function fill(t, m) { return t.replace(/\{(\w)\}/g, function (_, k) { return m[k] != null ? m[k] : ''; }); }

  /* Accept only the official review-link shapes. Returns normalised href or ''. */
  function validReviewLink(raw) {
    var u; try { u = new URL(String(raw || '').trim()); } catch (e) { return ''; }
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
    var h = u.hostname.toLowerCase();
    if (h === 'g.page') return u.pathname.length > 3 ? u.href : '';
    if (h === 'maps.app.goo.gl') return u.pathname.length > 2 ? u.href : '';
    if (h === 'search.google.com') {
      var id = u.searchParams.get('placeid');
      return (u.pathname.replace(/\/$/, '') === '/local/writereview' && id && /^[A-Za-z0-9_-]{20,}$/.test(id)) ? u.href : '';
    }
    return '';
  }
  window.LBReviewReq = { validReviewLink: validReviewLink };
  function phone(raw) { var d = String(raw || '').replace(/[\s\-()]/g, '').replace(/^(\+?91|0)/, ''); return /^[6-9]\d{9}$/.test(d) ? d : null; }

  function card(title, id) { return '<div class="lb-out"><h3>' + LB.esc(title) + '</h3>' + id + '</div>'; }
  function build() {
    var biz = clean($('rqBiz').value, 80), cust = clean($('rqCust').value, 40), svc = clean($('rqSvc').value, 60), link = validReviewLink($('rqLink').value);
    var lang = $('rqLang').value, tone = $('rqTone').value, ph = phone($('rqPhone').value);
    var err = '';
    if (!biz) err = ui('needBiz'); else if (!$('rqLink').value.trim()) err = ui('needLink'); else if (!link) err = ui('badLink'); else if ($('rqPhone').value.trim() && !ph) err = ui('badPhone');
    $('rqErr').textContent = err;
    if (err) { $('rqResult').classList.add('lb-hidden'); return; }
    var P = TPL[lang];
    var m = { b: biz, c: cust || '', l: link, s: svc ? P.svc.replace('{s}', svc) : '' };
    function F(t) {
      if (!cust) t = t.replace(/(Dear|आदरणीय) \{c\}/g, '$1 ' + P.cust).replace(/ \{c\}/g, '');
      return fill(t, m);
    }
    var wa = F(P.wa[tone]), sms = F(P.sms[tone]), sub = F(P.sub[tone]), body = F(P.em[tone]);
    $('rqWa').value = wa; $('rqSms').value = sms; $('rqSub').value = sub; $('rqBody').value = body;
    $('rqResult').classList.remove('lb-hidden');
    state.ph = ph; refresh();
    $('rqResult').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  var state = { ph: null };
  function refresh() {
    var wa = $('rqWa').value, sms = $('rqSms').value, sub = $('rqSub').value, body = $('rqBody').value;
    $('rqWaOpen').href = 'https://wa.me/' + (state.ph ? '91' + state.ph : '') + '?text=' + encodeURIComponent(wa);
    $('rqSmsOpen').href = 'sms:' + (state.ph ? '+91' + state.ph : '') + '?body=' + encodeURIComponent(sms);
    $('rqMailOpen').href = 'mailto:?subject=' + encodeURIComponent(sub) + '&body=' + encodeURIComponent(body);
    var n = Array.from(sms).length, uni = /[^\u0000-\u007f]/.test(sms), lim = uni ? 70 : 160;
    var c = $('rqSmsCount'); c.className = 'lb-count' + (n > lim ? ' over' : '');
    c.textContent = n + ' ' + ui('chars') + ' / ' + lim + (n > lim ? ' (' + Math.ceil(n / (uni ? 67 : 153)) + ' ' + ui('segs') + ')' : '');
    $('rqSmsWarn').textContent = (uni ? ui('uni') + ' ' : '') + (n > lim ? ui('over') : '');
    $('rqWaCount').textContent = Array.from(wa).length + ' ' + ui('chars');
  }
  window.LBReviewReq.build = build;
  $('rqForm').addEventListener('submit', function (e) { e.preventDefault(); build(); });
  ['rqWa', 'rqSms', 'rqSub', 'rqBody'].forEach(function (id) { $(id).addEventListener('input', refresh); });
  [['rqWaCopy', 'rqWa'], ['rqSmsCopy', 'rqSms'], ['rqSubCopy', 'rqSub'], ['rqBodyCopy', 'rqBody']].forEach(function (p) { $(p[0]).addEventListener('click', function () { LB.copy($(p[1]).value, $(p[0])); }); });
  $('rqLang').value = LB.lang === 'hi' ? 'hi' : 'en';
})();
