/* Services list drafter: neutral service names by business type, selectable and editable. Browser only. */
(function () {
  var $ = LB.$;
  var DB = {
    salon: ['Haircut and Styling', 'Hair Colouring', 'Keratin Treatment', 'Hair Spa', 'Facial and Skin Cleanup', 'Bridal Makeup', 'Party Makeup', 'Manicure', 'Pedicure', 'Nail Art', 'Threading', 'Waxing'],
    restaurant: ['Dine-in', 'Takeaway', 'Home Delivery', 'Catering for Events', 'Birthday and Party Bookings', 'Vegetarian Menu', 'Beverages and Desserts'],
    dentist: ['Dental Check-up and Cleaning', 'Root Canal Treatment', 'Teeth Whitening', 'Dental Implants', 'Crowns and Bridges', 'Braces and Aligners', 'Tooth Extraction', 'Children\'s Dentistry'],
    doctor: ['General Physician Consultation', 'Diabetes and Blood Pressure Care', 'Preventive Health Check-ups', 'Child Vaccination', 'Follow-up Visits', 'Minor Procedures'],
    gym: ['Monthly Membership', 'Annual Membership', 'Personal Training', 'Group Classes', 'Cardio and Strength Training', 'Diet and Nutrition Guidance', 'Body Composition Assessment'],
    plumber: ['Leak Repair', 'Pipe Burst Repair', 'Bathroom Fitting Installation', 'Drain Unblocking', 'Water Tank Cleaning', 'Motor Pump Repair', 'Geyser and RO Plumbing'],
    electrician: ['Wiring and Re-wiring', 'MCB and Short-circuit Repair', 'Inverter and Battery Installation', 'Fan and Light Fitting', 'Geyser Installation', 'Earthing and Safety Check'],
    'car-repair': ['Periodic Service', 'Oil and Filter Change', 'Car AC Repair and Gas Refill', 'Denting and Painting', 'Brake and Suspension Repair', 'Wheel Alignment and Balancing', 'Battery Replacement', 'Computerised Scanning'],
    kirana: ['Groceries and Staples', 'Fresh Fruits and Vegetables', 'Dairy and Packaged Foods', 'Household Essentials', 'Home Delivery'],
    repair: ['Screen Replacement', 'Battery Replacement', 'Charging Port Repair', 'Software Update and Fixes', 'Water Damage Check', 'Laptop Repair', 'Accessories']
  };
  var NAMES = { salon: ['Salon & Beauty Parlour', 'सैलून / ब्यूटी पार्लर'], restaurant: ['Restaurant & Cafe', 'रेस्टोरेंट / कैफ़े'], dentist: ['Dental Clinic', 'डेंटल क्लिनिक'], doctor: ['Medical Clinic', 'मेडिकल क्लिनिक'], gym: ['Gym & Fitness', 'जिम / फ़िटनेस'], plumber: ['Plumber & Sanitary', 'प्लंबर / सैनिटरी'], electrician: ['Electrician & Wiring', 'इलेक्ट्रीशियन / वायरिंग'], 'car-repair': ['Car Repair & Workshop', 'कार रिपेयर / वर्कशॉप'], kirana: ['Kirana / Grocery', 'किराना / ग्रॉसरी'], repair: ['Mobile & Electronics Repair', 'मोबाइल / इलेक्ट्रॉनिक्स रिपेयर'] };
  var T = {
    en: { need: 'Choose a business type.', copy: 'Copy selected services', copyD: 'Copy with descriptions', add: 'Add your own service', sel: 'selected', desc: 'Short description (max 300 characters)', descTpl: '{s} at {b}{c}.', in: ' in ' },
    hi: { need: 'बिज़नेस टाइप चुनें।', copy: 'चुनी हुई सर्विस कॉपी करें', copyD: 'विवरण के साथ कॉपी करें', add: 'अपनी सर्विस जोड़ें', sel: 'चुनी गईं', desc: 'छोटा विवरण (ज़्यादा से ज़्यादा 300 अक्षर)', descTpl: '{b}{c} में {s}।', in: ' ' }
  };
  function tt(k) { return LB.t(T, k); }
  function clean(s, n) { return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }
  var sel = $('servBizType');
  Object.keys(NAMES).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = NAMES[k][LB.lang === 'hi' ? 1 : 0]; sel.appendChild(o); });
  var rows = [];
  function lines(withDesc) {
    var biz = clean($('servBiz').value, 80), city = clean($('servCity').value, 60);
    return rows.filter(function (r) { return r.cb.checked && clean(r.input.value, 120); }).map(function (r) {
      var name = clean(r.input.value, 120);
      if (!withDesc || !biz) return name;
      var d = tt('descTpl').replace('{s}', name).replace('{b}', biz).replace('{c}', city ? tt('in') + city : '');
      return name + '\n  ' + d.slice(0, 300);
    });
  }
  function count() { $('servCount').textContent = rows.filter(function (r) { return r.cb.checked; }).length + ' ' + tt('sel'); }
  function addRow(text, checked) {
    var d = document.createElement('div'); d.className = 'lb-row'; d.style.marginBottom = '8px';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = checked; cb.setAttribute('aria-label', text); cb.style.width = 'auto';
    var inp = document.createElement('input'); inp.type = 'text'; inp.value = text; inp.maxLength = 120; inp.style.cssText = 'flex:1 1 220px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font:inherit;';
    cb.addEventListener('change', count); d.appendChild(cb); d.appendChild(inp); $('servList').appendChild(d); rows.push({ cb: cb, input: inp });
  }
  $('servForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var list = DB[sel.value]; if (!list) { $('servErr').textContent = tt('need'); return; }
    $('servErr').textContent = ''; $('servList').innerHTML = ''; rows = [];
    list.forEach(function (s) { addRow(s, true); });
    $('servBox').classList.remove('lb-hidden'); count();
    $('servBox').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('servAddBtn').addEventListener('click', function () { var v = clean($('servAdd').value, 120); if (!v) return; addRow(v, true); $('servAdd').value = ''; count(); });
  $('servCopyBtn').addEventListener('click', function () { LB.copy(lines(false).join('\n'), $('servCopyBtn')); });
  $('servCopyDBtn').addEventListener('click', function () { LB.copy(lines(true).join('\n'), $('servCopyDBtn')); });
  window.LBServices = { DB: DB };
})();
