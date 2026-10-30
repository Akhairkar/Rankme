# LocalBoost (Rankme) — Implementation vs Roadmap Audit

तारीख: 2026-10-30 · दायरा: सिर्फ़ `Akhairkar/Rankme` · आधार: repo का कोड, `BUILD-STATUS.md`, `backend/`, और ब्राउज़र में चलाकर जाँच।

**परिभाषा**
- ✅ **काम कर रहा है**: बिना बाहरी account/credentials के आज चलता है, और जाँचा गया।
- 🟡 **सिर्फ़ UI/कोड बना**: कोड मौजूद है, पर production deploy, login या बाहरी provider के बिना चल नहीं सकता।
- ⛔ **बना ही नहीं**: कोड नहीं है।

## 1. एक नज़र में

| क्षेत्र | स्थिति |
|---|---|
| Content और SEO ढांचा | ✅ मज़बूत, पर technical सफ़ाई ज़रूरी (नीचे §4) |
| Free tools और self-audit | ✅ चलते हैं |
| असली SaaS (login → Google → data → actions) | 🟡 कोड का बड़ा हिस्सा है, deploy और credentials के बिना कुछ नहीं चलता |
| Revenue | ⛔ तैयार नहीं: payment gateway नहीं, Worker/D1 deploy नहीं |

`BUILD-STATUS.md` में 60 बातें ✅ और 20 ☐ दिखती हैं, पर उसके ✅ का मतलब अक्सर "कोड/UI मौजूद" है, "असली डेटा पर चला" नहीं। इस audit में यही फ़र्क़ किया गया है।

## 2. Feature-वार वर्गीकरण

### ✅ वास्तव में काम कर रहा है
| Feature | प्रमाण / टिप्पणी |
|---|---|
| 11 free tools (description, services, review reply/request/dispute, QR, checklist, citation checker, rank-grid simulator, maps-embed, places-lookup) | सब browser में चलते हैं, कोई API नहीं लगती। Rank-grid सिर्फ़ "simulator" है, असली ranking नहीं, और इसी नाम से बताया गया है। |
| 8-सवाल का self-audit (`/check/`) + परिणाम के बाद waitlist funnel | चलाकर जाँचा (EN/HI)। Score खुद के जवाबों से बनता है और साफ़ बताया गया है। |
| Site search | चलता है, पर index में सिर्फ़ 62 (EN) / 42 (HI) entries हैं, जबकि 176 pages हैं। |
| 176 indexable pages (25 business types, 13 cities, blog, guides; 106 EN + 95 HI files) | सब में h1, description और `www.localboost.in` canonical है। JSON-LD सब valid। Internal links टूटे नहीं (सिर्फ़ 2 template placeholders)। |
| Backend कोड की बुनियाद | Worker अब load होता है (दो syntax errors इसी सत्र में ठीक हुए), 11 tests pass: AES-GCM token encryption, hashed sessions, OAuth state check, rate limit, entitlement gating, waitlist validation। ये mock पर परखे गए हैं, असली Google पर नहीं। |

### 🟡 सिर्फ़ UI / कोड बना (चलने के लिए बाहरी चीज़ चाहिए)
| Feature | क्या कमी है |
|---|---|
| Login और session | कोड है; Google credentials और deployed Worker चाहिए। Frontend में `LOCALBOOST_API.enabled=false` है। |
| Google Business Profile connect, accounts/locations खोजना (`/api/google/sync`) | इसी सत्र में लिखा, live Google पर कभी चला नहीं। Business Profile API की approval चाहिए। |
| Business जोड़ना, location चुनना, dashboard के 14 pages | सब session पर निर्भर; कोई user लॉगिन नहीं कर सकता, इसलिए आज कोई भी page असली डेटा नहीं दिखाता। |
| Profile audit, Visibility Score, Action Center | गणना का कोड है (`score.js`, 49 lines), पर इनपुट के लिए Google से आया location डेटा चाहिए। |
| Reviews dashboard | `/api/reviews/sync` सिर्फ़ पहले से normalized reviews लेता है; Google से reviews खींचने वाला endpoint 503 stub है। Reply भेजना provider-gated है। |
| Performance और Search Console sync | 503 `provider_not_ready` stub। साथ ही OAuth scope में `webmasters.readonly` है ही नहीं। |
| Rank tracking | `ranks/run` adapter तैयार है; कोई provider चुना ही नहीं गया। |
| Competitors | इनपुट सेव होता है; खोज/tracking का कोई provider नहीं। |
| Monitoring / cron | अब चलेगा, पर rank provider के बिना कुछ नहीं बनाता। |
| Reports | पेज सिर्फ़ API का डेटा print करता है; PDF/मासिक ईमेल कुछ नहीं। |
| AI recommendations | सिर्फ़ नियम-आधारित (deterministic) सुझाव; कोई AI model नहीं जुड़ा। |
| Plans / entitlements | tables और gating कोड हैं; subscriptions बनने का रास्ता नहीं। |
| Auto-Reply और 30-Day Growth Plan pages | स्थिर HTML, कोई state या `fetch` नहीं। |
| Website audit engine (`/audit/`) | browser से किसी साइट का HTML खींचता है; ज़्यादातर साइटें CORS से रोक देंगी, यानी भरोसेमंद नहीं। "AI website analysis" नहीं है। |
| Waitlist (API वाला रास्ता) | कोड और tests हैं; deploy के बाद ही DB में सेव होगा। तब तक ईमेल fallback चलता है। |

### ⛔ बना ही नहीं
- Production deploy: Cloudflare D1, Worker, `api.localboost.in`, secrets। (`BUILD-STATUS.md` में अभी ☐ हैं।)
- Payment gateway, webhook verification, subscription जीवन-चक्र, invoice/GST।
- Rank-tracking provider का चुनाव और integration।
- Google से Performance, Reviews और Search Console का असली डेटा खींचना; review reply को Google पर पोस्ट करना।
- Analytics (GA4/Search Console verification के अलावा कुछ नहीं) और conversion tracking।
- Transactional email (waitlist की पुष्टि, रिपोर्ट, alerts)।
- Leads देखने का admin पेज/export।
- Frontend tests और CI (`.github/` नहीं); end-to-end test (signup → Google → business → data → score)।
- Cookie banner सिर्फ़ दिखावटी है: किसी analytics/ads को रोकता नहीं (इस समय कोई analytics है भी नहीं)।

## 3. Roadmap बनाम असलियत: 3 गलतफ़हमियाँ जो ठीक करनी हैं
1. `BUILD-STATUS.md` के कई ✅ ("Review monitoring UI connected…", "Customer-facing verified performance report") का मतलब "UI/API का ढांचा है" है, "ग्राहक देख सकता है" नहीं। इसे "कोड तैयार / deploy में सत्यापित / असली डेटा पर सत्यापित" तीन कॉलम में बाँटें।
2. 52 session `.md` फ़ाइलें और कई roadmap (`MASTER-ROADMAP`, `PROJECT-ROADMAP`, दो `51-MASTER-*`) एक-दूसरे को दोहराते हैं। एक ही स्रोत रखें और बाकी `docs/archive/` में भेजें।
3. `generate_pages.py` से पुराने गलत FAQ दोबारा बन सकते हैं; इसे generator में भी ठीक/जाँचना होगा।

## 4. Technical SEO सफ़ाई (ज़रूरी, कम समय में)
| समस्या | असर | सुझाव |
|---|---|---|
| `sitemap.xml` में 173 URLs `rankme.khairkar92.workers.dev` पर हैं (सिर्फ़ 2 नए `localboost.in` पर), और `robots.txt` भी वही sitemap बताता है, जबकि canonical `www.localboost.in` है | **सबसे ज़रूरी।** Google को परस्पर-विरोधी संकेत मिलते हैं | सारे URLs `https://www.localboost.in/...` करें; `robots.txt` में सही Sitemap पता |
| `hi/businesses/index.html` sitemap में नहीं | एक Hindi पेज indexable नहीं | जोड़ें |
| 27 Hindi pages के `<title>` अंग्रेज़ी वाले पेज जैसे ही हैं | Hindi खोज में कमज़ोर | Hindi titles लिखें |
| 87 titles 65 अक्षरों से लंबे | खोज में कटेंगे | छोटा करें |
| Search index में 176 में से सिर्फ़ 62 pages | साइट-खोज अधूरी | index स्वतः बनाएँ |
| `places-lookup` "Verified Listing Query" लिखता है और review link में `placeid=<नाम>` डालता है | भ्रामक और टूटा link | लेबल ठीक करें; असली Place ID ज़रूरी है |
| Privacy/Disclaimer में AdSense की बात, `ads.txt` हटा दी गई | नीति और उत्पाद में विरोध | तय करें कि विज्ञापन लगाएँगे या नहीं |
| Hindi के कुछ dashboard/guide pages नहीं हैं | अधूरा Hindi अनुभव | सूची §5 में |

## 5. एकीकृत सुधार योजना

**चरण 0: तुरंत, बिना बाहरी account (मैं कर सकता हूँ)**
1. Sitemap/robots का domain सही करना; Hindi titles; छोटे titles; search index स्वतः बनना।
2. `places-lookup` की भ्रामक बातें ठीक करना।
3. `BUILD-STATUS.md` को तीन-कॉलम (कोड / deploy / असली डेटा) में बदलना; दोहराई roadmap फ़ाइलें archive करना।
4. Frontend/Worker के लिए GitHub Actions: `npm test`, HTML link check।
5. GA4 या Plausible की जगह तय करके consent के पीछे जोड़ना (आपकी पसंद चाहिए)।

**चरण 1: आपके account चाहिए (क्रम में)**
1. Google Cloud project + Business Profile API की अर्ज़ी (सबसे लंबा इंतज़ार, आज ही शुरू करें) + OAuth consent screen।
2. Cloudflare: D1, Worker deploy, `api.localboost.in`, 3 secrets। फिर `schema.sql` चलाना।
3. `LOCALBOOST_API.enabled=true`, `/health` और waitlist की जाँच।

**चरण 2: असली डेटा का रास्ता (मैं, credentials मिलने पर)**
1. End-to-end test: login → business → location sync → score → actions।
2. Reviews और Performance खींचने वाले endpoints (stubs की जगह); Search Console का scope जोड़ना।
3. Rank provider (DataForSEO/SerpApi जैसा) चुनकर adapter जोड़ना।
4. Leads के लिए admin export; waitlist की पुष्टि ईमेल।

**चरण 3: कमाई**
1. Razorpay या Cashfree: checkout, webhook verification, subscription स्थिति, GST invoice।
2. PDF/मासिक रिपोर्ट ईमेल; Auto-Reply और Growth Plan को असली डेटा/state से जोड़ना।
3. AI recommendations: कोई model जोड़ने से पहले privacy policy और लागत-सीमा।

**चरण 4: लॉन्च से पहले**
1. Mobile और Desktop QA, accessibility, performance।
2. अंतिम "नकली/डेमो सामग्री" audit और production-readiness audit।

## 6. तुरंत फ़ैसले जो आपसे चाहिए
1. Domain: क्या `www.localboost.in` live है? (Sitemap किस host पर रखें)
2. Payment gateway: Razorpay या Cashfree?
3. विज्ञापन (AdSense) लगाएँगे या नहीं?
4. असली WhatsApp business नंबर (contact page पर)।
5. Analytics: GA4 या Plausible?
