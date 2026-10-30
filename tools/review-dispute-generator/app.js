/* Review dispute drafter: builds a factual message from what the user enters. It does not submit anything to Google. */
(function () {
  var $ = LB.$;
  var POL = {
    conflict: { en: 'Conflict of interest', hi: 'हितों का टकराव (Conflict of interest)', body: { en: 'I believe the reviewer has a conflict of interest with our business, for example as a competitor or a former employee.', hi: 'मेरा मानना है कि समीक्षक का हमारे बिज़नेस से हितों का टकराव है, जैसे प्रतिस्पर्धी या पूर्व कर्मचारी होना।' } },
    fake: { en: 'Fake engagement', hi: 'फ़र्ज़ी एंगेजमेंट (Fake engagement)', body: { en: 'I believe this review does not reflect a genuine customer experience.', hi: 'मेरा मानना है कि यह रिव्यू किसी असली ग्राहक अनुभव को नहीं दर्शाता।' } },
    harassment: { en: 'Offensive content or harassment', hi: 'आपत्तिजनक सामग्री या उत्पीड़न', body: { en: 'The review contains abusive, offensive or harassing language.', hi: 'रिव्यू में गाली-गलौज, आपत्तिजनक या उत्पीड़न वाली भाषा है।' } },
    offtopic: { en: 'Off-topic content', hi: 'विषय से हटकर सामग्री (Off-topic)', body: { en: 'The review does not describe a real experience at this business (for example it is about a different place, or is unrelated to us).', hi: 'रिव्यू इस बिज़नेस के किसी असली अनुभव का वर्णन नहीं करता (जैसे यह किसी दूसरी जगह के बारे में है या हमसे असंबंधित है)।' } },
    spam: { en: 'Spam or promotional content', hi: 'स्पैम या प्रचार सामग्री', body: { en: 'The review looks like spam or advertising, for example it promotes another business or contains links.', hi: 'रिव्यू स्पैम या विज्ञापन जैसा लगता है, जैसे किसी दूसरे बिज़नेस का प्रचार या लिंक।' } }
  };
  var T = {
    en: { need: 'Enter your business name and the review text.', placeholderBox: 'Your draft will appear here.', copy: 'Copy draft',
      subj: 'Request to review a Google review for policy violation', hello: 'Hello Google Business Profile Support,', intro: 'I am the owner or authorised representative of the business below and I am reporting a review that I believe breaks the Google Maps contributed content policy.',
      biz: 'Business', rev: 'Reviewer display name', txt: 'Review text', pol: 'Policy concern', why: 'Why I am reporting it', rec: 'I checked my own records and could not find a customer, booking or order matching this reviewer.', ask: 'Please review this content against your policy. I understand that the decision is yours, and I would be grateful for a response.', thanks: 'Thank you,', na: '(not given)' },
    hi: { need: 'अपने बिज़नेस का नाम और रिव्यू का टेक्स्ट भरें।', placeholderBox: 'आपका ड्राफ़्ट यहाँ दिखेगा।', copy: 'ड्राफ़्ट कॉपी करें',
      subj: 'नीति उल्लंघन के लिए एक Google रिव्यू की समीक्षा का अनुरोध', hello: 'नमस्ते Google Business Profile सपोर्ट,', intro: 'मैं नीचे दिए बिज़नेस का मालिक या अधिकृत प्रतिनिधि हूँ और एक ऐसे रिव्यू की शिकायत कर रहा/रही हूँ जो मेरे अनुसार Google Maps की कंट्रीब्यूटेड कंटेंट पॉलिसी का उल्लंघन करता है।',
      biz: 'बिज़नेस', rev: 'रिव्यूअर का डिस्प्ले नाम', txt: 'रिव्यू का टेक्स्ट', pol: 'नीति संबंधी चिंता', why: 'मैं इसकी शिकायत क्यों कर रहा/रही हूँ', rec: 'मैंने अपने रिकॉर्ड जाँचे और इस रिव्यूअर से मेल खाता कोई ग्राहक, बुकिंग या ऑर्डर नहीं मिला।', ask: 'कृपया इस सामग्री की आपकी नीति के अनुसार समीक्षा करें। मैं समझता/समझती हूँ कि फ़ैसला आपका है, और जवाब के लिए आभारी रहूँगा/रहूँगी।', thanks: 'धन्यवाद,', na: '(नहीं दिया)' }
  };
  function tt(k) { return LB.t(T, k); }
  function clean(s, n) { return String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, n); }
  function build(v) {
    var L = LB.lang, p = POL[v.policy] || POL.fake;
    var lines = [tt('subj'), '', tt('hello'), '', tt('intro'), '', tt('biz') + ': ' + v.biz, tt('rev') + ': ' + (v.reviewer || tt('na')), tt('pol') + ': ' + p[L], '', tt('txt') + ':', '"' + v.text + '"', '', tt('why') + ':', p.body[L]];
    if (v.extra) lines.push(v.extra);
    if (v.records) lines.push(tt('rec'));
    lines.push('', tt('ask'), '', tt('thanks'), v.biz);
    return lines.join('\n');
  }
  window.LBDispute = { build: build };
  $('disForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = { biz: clean($('disBizName').value, 120), reviewer: clean($('disReviewer').value, 80), policy: $('disPolicy').value, text: clean($('disExcerpt').value, 1500), extra: clean($('disExtra').value, 500), records: $('disRecords').checked };
    if (!v.biz || !v.text) { $('disErr').textContent = tt('need'); return; }
    $('disErr').textContent = '';
    $('appealBox').value = build(v); $('disOut').classList.remove('lb-hidden');
    $('disOut').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('disCopy').addEventListener('click', function () { LB.copy($('appealBox').value, $('disCopy')); });
})();
