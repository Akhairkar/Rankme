
// LocalBoost Privacy & Cookie Consent Banner (Google Consent Mode v2 Compliant)
(function() {
  if (localStorage.getItem('lb_cookie_consent')) return;

  const banner = document.createElement('div');
  banner.id = 'lbCookieConsent';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Cookie Consent');
  banner.style.cssText = 'position:fixed; bottom:16px; left:16px; right:16px; max-width:540px; margin:0 auto; background:#0F172A; color:#F8FAFC; border-radius:12px; padding:20px; box-shadow:0 10px 25px rgba(0,0,0,0.25); z-index:99999; font-family:system-ui,sans-serif; font-size:13.5px; line-height:1.5;';

  const isHindi = document.documentElement.lang === 'hi';
  const text = isHindi
    ? 'हम अपनी साइट की कार्यक्षमता और विज्ञापन प्रासंगिकता को बेहतर बनाने के लिए कुकीज का उपयोग करते हैं। अधिक जानकारी के लिए हमारी <a href="/hi/privacy/" style="color:#38BDF8; text-decoration:underline;">प्राइवेसी पॉलिसी</a> पढ़ें।'
    : 'We use cookies and authorized partners (such as Google AdSense) to deliver relevant content and analyze traffic. View our <a href="/privacy/" style="color:#38BDF8; text-decoration:underline;">Privacy Policy</a>.';

  const btnAccept = isHindi ? 'स्वीकार करें' : 'Accept All';
  const btnDecline = isHindi ? 'अस्वीकार करें' : 'Decline';

  banner.innerHTML = `
    <p style="margin:0 0 14px; color:#E2E8F0;">${text}</p>
    <div style="display:flex; gap:10px; justify-content:flex-end;">
      <button id="lbConsentDecline" style="background:transparent; border:1px solid #475569; color:#CBD5E1; padding:7px 16px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer;">${btnDecline}</button>
      <button id="lbConsentAccept" style="background:#0F766E; border:none; color:#fff; padding:7px 18px; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer;">${btnAccept}</button>
    </div>
  `;

  document.body.appendChild(banner);

  document.getElementById('lbConsentAccept').onclick = function() {
    localStorage.setItem('lb_cookie_consent', 'accepted');
    banner.remove();
  };
  document.getElementById('lbConsentDecline').onclick = function() {
    localStorage.setItem('lb_cookie_consent', 'declined');
    banner.remove();
  };
})();
