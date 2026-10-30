/* Places Lookup helper: builds a Google Maps search link, and a "write a review" link only for a pasted Place ID.
   No network requests. */
(function () {
  var $ = LB.$;
  var T = {
    en: {
      needBoth: 'Enter both the business name and the city or locality.',
      mapsTitle: 'Google Maps search link',
      mapsNote: 'This opens a Google Maps search for your query. Check that the right listing appears; this is a search link, not a verified match.',
      open: 'Open in Google Maps', copy: 'Copy link',
      pidEmpty: 'Paste your Place ID first.',
      pidBad: 'This does not look like a Google Place ID. Place IDs usually start with "ChIJ" and contain only letters, numbers, "-" and "_". A business name, Maps URL or "g.page" link will not work here.',
      pidOk: 'Format check passed. This only checks the pattern, not that the Place ID exists. Open the link and confirm it shows the review box for the correct business.',
      reviewTitle: 'Write-a-review link', openRev: 'Open review link', copyRev: 'Copy review link'
    },
    hi: {
      needBoth: 'बिज़नेस का नाम और शहर या इलाका, दोनों भरें।',
      mapsTitle: 'Google Maps सर्च लिंक',
      mapsNote: 'यह लिंक आपकी खोज के साथ Google Maps खोलता है। देख लें कि सही लिस्टिंग दिख रही है; यह सिर्फ़ सर्च लिंक है, पक्का मिलान नहीं।',
      open: 'Google Maps में खोलें', copy: 'लिंक कॉपी करें',
      pidEmpty: 'पहले अपना Place ID पेस्ट करें।',
      pidBad: 'यह Google Place ID जैसा नहीं दिखता। Place ID आम तौर पर "ChIJ" से शुरू होता है और उसमें सिर्फ़ अक्षर, अंक, "-" और "_" होते हैं। बिज़नेस का नाम, Maps URL या "g.page" लिंक यहाँ नहीं चलेगा।',
      pidOk: 'फ़ॉर्मेट सही है। यह सिर्फ़ पैटर्न जाँचता है, यह नहीं कि Place ID असल में मौजूद है। लिंक खोलकर देखें कि सही बिज़नेस का रिव्यू बॉक्स खुल रहा है।',
      reviewTitle: 'रिव्यू लिखने का लिंक', openRev: 'रिव्यू लिंक खोलें', copyRev: 'रिव्यू लिंक कॉपी करें'
    }
  };
  function tt(k) { return LB.t(T, k); }

  /* Pattern check only. Typical IDs: "ChIJ" + base64url (27 chars total), older "GhIJ", and longer "Eh/Ei" IDs. */
  function validPlaceId(id) {
    return /^(ChIJ[A-Za-z0-9_-]{16,80}|GhIJ[A-Za-z0-9_-]{16,80}|E[hi][A-Za-z0-9_-]{20,400})$/.test(id);
  }
  window.LBPlaces = { validPlaceId: validPlaceId };

  function showLink(prefix, title, url, openLabel, copyLabel, note, cls) {
    $(prefix + 'Box').classList.remove('lb-hidden');
    $(prefix + 'Title').textContent = title;
    $(prefix + 'Url').textContent = url;
    var open = $(prefix + 'Open');
    open.href = url; open.textContent = openLabel;
    var cp = $(prefix + 'Copy');
    cp.textContent = copyLabel; cp.setAttribute('data-label', copyLabel);
    cp.onclick = function () { LB.copy(url, cp); };
    var n = $(prefix + 'Note'); n.textContent = note; n.className = 'lb-banner ' + (cls || 'info');
  }

  $('placesForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('plName').value.trim().replace(/\s+/g, ' ');
    var city = $('plCity').value.trim().replace(/\s+/g, ' ');
    var err = $('plErr');
    if (!name || !city) { err.textContent = tt('needBoth'); return; }
    err.textContent = '';
    var url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ' ' + city);
    showLink('plMaps', tt('mapsTitle'), url, tt('open'), tt('copy'), tt('mapsNote'), 'info');
  });

  $('pidForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('plPid').value.trim();
    var err = $('pidErr');
    $('plRevBox').classList.add('lb-hidden');
    if (!id) { err.textContent = tt('pidEmpty'); return; }
    if (!validPlaceId(id)) { err.textContent = tt('pidBad'); return; }
    err.textContent = '';
    var url = 'https://search.google.com/local/writereview?placeid=' + encodeURIComponent(id);
    showLink('plRev', tt('reviewTitle'), url, tt('openRev'), tt('copyRev'), tt('pidOk'), 'ok');
  });
})();
