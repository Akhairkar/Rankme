#!/usr/bin/env python3
"""Generate the six Business Growth guides (EN + HI) for LocalBoost.

Usage:  python3 generate_pages.py [--out DIR]
Default output is ./_generated (never overwrites live pages, never writes
to en-updated/ or site/). Copy files across deliberately after reviewing a diff.

Safety rules enforced at generation time (the script aborts if violated):
  * FAQ items come only from each page's own `faq` list; the visible FAQ and
    the FAQPage JSON-LD are rendered from that single source (same markup as
    businesses/bakery). The old generic 3-question FAQ block cannot be emitted.
  * No ranking guarantees, advertising-network mentions or retired brand names.
"""
import argparse, json, os, re, sys, html

# Content for business-growth guides. Each page: en/hi dicts with title, description, headline, lede, content_html, faq[(q,a)]
def sec(h,*ps): return "      <h2>%s</h2>\n"%h + "".join("      <p>%s</p>\n"%p for p in ps)
def lst(items): return "      <ul>\n"+"".join("        <li>%s</li>\n"%i for i in items)+"      </ul>\n"
def call(t): return '      <div class="callout">\n        %s\n      </div>'%t

PAGES = [
{
 "slug": "how-to-get-customers-from-google",
 "hi_slug": "google-se-customers-kaise-laaye",
 "en": {
  "title": "How to Get Customers from Google",
  "description": "Learn practical steps to attract more customers to your business directly from Google searches.",
  "headline": "How to Get Local Customers from Google",
  "lede": "Showing up on Google is the first step, but how do you actually turn those views into paying customers? Here is a practical framework.",
  "content_html":
   sec("1. Be visible where it matters",
     "When someone searches for \"best plumber near me\" or \"dentist open now\", Google often shows a map with a short list of local businesses (the Local Pack) above the regular results. To be considered there, your Google Business Profile must be verified, completely filled out, and relevant to what the person typed. Google says local results are based mainly on relevance, distance and prominence, so no one can promise you a fixed position.",
     "Start with the basics that you fully control: the right primary category, a correct address or service area, working hours that match reality, and a phone number that is answered. For many Indian businesses the phone or WhatsApp number is where the sale happens, so a missed call is a lost customer.") +
   sec("2. Build trust with reviews",
     "Visibility without trust won't bring customers. If you show up first but have a 3.2 rating while the shop next door has 4.8, many people will tap the other one. Build a simple habit of asking every happy customer for a review at the moment of delight, and reply to every review, good or bad, in a calm and specific way. Never offer discounts or gifts for reviews, and never ask only happy customers; both break Google's review rules.") +
   sec("3. Make it easy to contact you",
     "Customers want convenience. Check that your phone number is correct, add your website and any booking link, and list your services with short, plain descriptions. If most enquiries come on WhatsApp, make sure your website has a clear click-to-chat button and that someone answers during the hours your profile shows.") +
   sec("4. Post updates and offers",
     "Use Google Posts to show that your business is active: recent work, a seasonal offer before Diwali or the wedding season, or a change in timings. Posts are not a magic ranking switch, but they answer the question a customer is silently asking: is this place open and paying attention?") +
   sec("5. A one-week starting plan",
     "You do not need to do everything in a day. Try this order:") +
   lst(["Day 1: confirm category, address, hours and phone number.",
        "Day 2: add 10 or more real photos: signboard, entrance, inside, team, work.",
        "Day 3: list every service or product with a one-line description.",
        "Day 4: create your review link and QR code with the <a href=\"../../tools/qr-generator/index.html\">QR generator</a>.",
        "Day 5: reply to every existing review.",
        "Day 6: publish one post with a real photo.",
        "Day 7: run the <a href=\"../../check/index.html\">free visibility check</a> and note what is missing."]) +
   "\n" + call("Focus on answering the customer's unasked questions before they even contact you: Are you open right now? Do you offer the specific service they need? Do others trust you?"),
  "faq": [("How long does it take to start getting customers from Google?","There is no fixed timeline. Verification and edits to a profile can take from a few days to a few weeks to show, and how much traffic you get depends on your competition and category. Treat it as steady work over months, not a switch."),
          ("Do I need a website to get customers from Google?","Not strictly. A verified Google Business Profile can bring calls and visits without a website. A simple website with your services, area and contact details still helps customers trust you and gives Google more to understand.")]
 },
 "hi": {
  "title": "Google se customers kaise laaye",
  "description": "Janiye Google search se apne business ke liye naye customers laane ke practical tarike.",
  "headline": "Google se naye customers kaise laaye",
  "lede": "Google par dikhna sirf pehla kadam hai, un views ko asal customers mein kaise badle? Yahan ek practical tarika bataya gaya hai.",
  "content_html":
   sec("1. सही जगह दिखना ज़रूरी है",
     "जब कोई \"best plumber near me\" या \"dentist open now\" खोजता है, तो Google अक्सर नियमित नतीजों के ऊपर एक मैप और स्थानीय बिज़नेस की छोटी सूची (लोकल पैक) दिखाता है। वहाँ गिने जाने के लिए आपकी Google Business Profile वेरिफ़ाइड, पूरी भरी हुई और खोज से प्रासंगिक होनी चाहिए। Google के अनुसार लोकल नतीजे मुख्यतः प्रासंगिकता, दूरी और प्रमुखता पर आधारित होते हैं, इसलिए कोई भी निश्चित पोज़ीशन का वादा नहीं कर सकता।",
     "पहले वे बातें ठीक करें जो पूरी तरह आपके हाथ में हैं: सही प्राइमरी कैटेगरी, सही पता या सर्विस एरिया, असलियत से मेल खाते खुलने के समय, और ऐसा फ़ोन नंबर जो उठाया जाता हो। कई भारतीय बिज़नेस में बिक्री फ़ोन या WhatsApp पर ही तय होती है, इसलिए छूटी हुई कॉल मतलब खोया हुआ ग्राहक।") +
   sec("2. रिव्यू से भरोसा बनाएँ",
     "भरोसे के बिना दिखना काम नहीं आता। अगर आप सबसे ऊपर हैं पर रेटिंग 3.2 है और बगल की दुकान की 4.8, तो बहुत से लोग दूसरी दुकान चुनेंगे। हर खुश ग्राहक से ख़ुशी के पल में रिव्यू माँगने की आदत बनाएँ, और हर रिव्यू का, अच्छा हो या बुरा, शांत और ठोस जवाब दें। रिव्यू के बदले छूट या उपहार कभी न दें, और सिर्फ़ ख़ुश ग्राहकों से न माँगें; दोनों बातें Google के रिव्यू नियमों के ख़िलाफ़ हैं।") +
   sec("3. संपर्क करना आसान बनाएँ",
     "ग्राहक सुविधा चाहते हैं। जाँचें कि फ़ोन नंबर सही है, वेबसाइट और बुकिंग लिंक जोड़ें, और अपनी सर्विस छोटे, सरल विवरण के साथ लिखें। अगर ज़्यादातर पूछताछ WhatsApp पर आती है, तो वेबसाइट पर साफ़ क्लिक-टू-चैट बटन रखें और प्रोफ़ाइल में दिखाए समय पर कोई जवाब देने वाला हो।") +
   sec("4. अपडेट और ऑफ़र पोस्ट करें",
     "Google Posts से दिखाएँ कि आपका बिज़नेस चालू है: हाल का काम, दिवाली या शादी के सीज़न से पहले कोई ऑफ़र, या समय में बदलाव। पोस्ट कोई जादुई रैंकिंग स्विच नहीं हैं, पर वे उस सवाल का जवाब देती हैं जो ग्राहक मन में पूछता है: क्या यह जगह खुली है और ध्यान दे रही है?") +
   sec("5. पहले हफ़्ते की योजना",
     "सब कुछ एक दिन में करने की ज़रूरत नहीं। इस क्रम से शुरू करें:") +
   lst(["दिन 1: कैटेगरी, पता, समय और फ़ोन नंबर की पुष्टि करें।",
        "दिन 2: 10 या ज़्यादा असली फ़ोटो जोड़ें: साइनबोर्ड, एंट्रेंस, अंदर का हिस्सा, टीम, काम।",
        "दिन 3: हर सर्विस या प्रोडक्ट एक पंक्ति के विवरण के साथ जोड़ें।",
        "दिन 4: <a href=\"../../../tools/qr-generator/index.html\">QR जनरेटर</a> से रिव्यू लिंक और QR कोड बनाएँ।",
        "दिन 5: मौजूदा सभी रिव्यू का जवाब दें।",
        "दिन 6: असली फ़ोटो के साथ एक पोस्ट करें।",
        "दिन 7: <a href=\"../../../check/index.html\">फ्री विज़िबिलिटी चेक</a> चलाएँ और देखें क्या छूटा है।"]) +
   "\n" + call("ग्राहक के संपर्क करने से पहले उसके अनकहे सवालों के जवाब दें: क्या आप अभी खुले हैं? क्या आप वह सर्विस देते हैं जो उसे चाहिए? क्या दूसरे लोग आप पर भरोसा करते हैं?"),
  "faq": [("Google से ग्राहक आने में कितना समय लगता है?","कोई तय समय नहीं है। वेरिफ़िकेशन और प्रोफ़ाइल में बदलाव दिखने में कुछ दिन से कुछ हफ़्ते लग सकते हैं, और कितनी पूछताछ आएगी यह आपकी कैटेगरी और प्रतिस्पर्धा पर निर्भर है। इसे स्विच नहीं, महीनों चलने वाला नियमित काम समझें।"),
          ("क्या Google से ग्राहक पाने के लिए वेबसाइट ज़रूरी है?","ज़रूरी नहीं। वेरिफ़ाइड Google Business Profile बिना वेबसाइट के भी कॉल और विज़िट ला सकती है। फिर भी सर्विस, इलाक़े और संपर्क वाली एक सरल वेबसाइट ग्राहकों का भरोसा बढ़ाती है और Google को समझने के लिए ज़्यादा जानकारी देती है।")]
 }
},
{
 "slug": "how-to-get-customers-from-google-maps",
 "hi_slug": "google-maps-se-customers-kaise-laaye",
 "en": {
  "title": "How to Get Customers from Google Maps",
  "description": "Actionable tips on optimizing your business profile to drive foot traffic directly from Google Maps.",
  "headline": "How to Get Foot Traffic from Google Maps",
  "lede": "Google Maps isn't just for directions — it's how most local customers discover businesses. Here is how to make sure they choose yours.",
  "content_html":
   sec("1. Optimize your categories",
     "Your primary category tells Google what your business is, so it shapes which searches you can appear for. Pick the most specific option that describes your core business: \"Sweet shop\" rather than just \"Store\", \"Two wheeler repair shop\" rather than \"Auto repair\" if that is what you do. Then add secondary categories only for services you genuinely offer. Adding unrelated categories can confuse Google and customers alike.") +
   sec("2. Add real, useful photos",
     "People often judge a place from its photos before they read a word. Add pictures of your storefront from the street (so people can find the gate or the lane), the inside, your products or menu, and your team. Photos of a crowded counter, a busy festival week or finished work tell a customer you are real. Avoid stock images and heavy filters.") +
   sec("3. Respond to all reviews",
     "Replying to reviews, positive and negative, shows you care. Future customers read how you handle a complaint. Keep replies short, mention the specific thing the reviewer talked about, and never argue in public.") +
   sec("4. Get the pin and the entrance right",
     "A pin that is 200 metres away, or on the main road when your entrance is in a side lane, sends people to the wrong place and costs you a walk-in. Check the pin on the map, add a landmark in your photos, and if you are on the first floor of a market complex, say so in your profile and photos.") +
   sec("5. Think about the moment of the search",
     "Maps searches are often made while walking, on a two-wheeler or just before leaving home. Make the details a person needs in that moment easy: hours (including festival and weekly-off days), phone number, whether you have parking or home delivery, and the main things you sell.") +
   lst(["Primary category is specific and accurate.",
        "Hours include weekly off and festival changes.",
        "Pin is on the actual entrance.",
        "At least 10 real photos, refreshed monthly.",
        "Every review has a reply."]) + "\n" +
   call("Make sure your pin location on the map is exactly right. If customers get lost trying to find you because the pin is in the wrong place, they will leave frustrated. See the <a href=\"../../tools/maps-embed/index.html\">Maps embed tool</a> to show the same map on your website."),
  "faq": [("Can I get more customers from Google Maps without paying for ads?","Yes. A complete, accurate and active Google Business Profile is free and is the main way local businesses are found on Maps. Paid promotion is a separate choice and not required to appear in results."),
          ("What if my pin or address is wrong on Google Maps?","Edit the location in your Business Profile and, if needed, suggest an edit from Maps. Changes can be reviewed by Google and may take some time, so keep your address text consistent everywhere meanwhile.")]
 },
 "hi": {
  "title": "Google Maps se customers kaise laaye",
  "description": "Google Maps par apni profile ko optimize karke naye customers aur foot traffic laane ke asaan tarike.",
  "headline": "Google Maps se foot traffic kaise badhaye",
  "lede": "Google Maps sirf rasta dekhne ke liye nahi hai — zyada tar local customers yahin se naye business dhundhte hain. Janiye unhe apni taraf kaise aakarshit karein.",
  "content_html":
   sec("1. सही कैटेगरी चुनें",
     "आपकी प्राइमरी कैटेगरी Google को बताती है कि आपका बिज़नेस क्या है, इसलिए वही तय करती है कि आप किन खोजों में आ सकते हैं। अपने मुख्य काम को सबसे सटीक बताने वाला विकल्प चुनें: सिर्फ़ \"Store\" नहीं, बल्कि \"Sweet shop\"; सिर्फ़ \"Auto repair\" नहीं, बल्कि \"Two wheeler repair shop\", अगर आप वही करते हैं। फिर सेकंडरी कैटेगरी केवल उन सर्विस के लिए जोड़ें जो आप सच में देते हैं। असंबंधित कैटेगरी Google और ग्राहक दोनों को उलझा सकती हैं।") +
   sec("2. असली और काम की फ़ोटो जोड़ें",
     "लोग अक्सर एक शब्द पढ़ने से पहले फ़ोटो देखकर जगह के बारे में राय बना लेते हैं। सड़क से दिखती दुकान की फ़ोटो (ताकि लोग गेट या गली पहचान सकें), अंदर का हिस्सा, प्रोडक्ट या मेन्यू, और अपनी टीम की फ़ोटो जोड़ें। भीड़ वाला काउंटर, त्योहार का हफ़्ता या तैयार काम की फ़ोटो ग्राहक को बताती है कि आप असली हैं। स्टॉक इमेज और भारी फ़िल्टर से बचें।") +
   sec("3. सभी रिव्यू का जवाब दें",
     "अच्छे और बुरे, दोनों रिव्यू का जवाब देने से दिखता है कि आपको परवाह है। नए ग्राहक पढ़ते हैं कि आप शिकायत कैसे सँभालते हैं। जवाब छोटा रखें, रिव्यू में कही गई ख़ास बात का ज़िक्र करें, और सार्वजनिक रूप से बहस न करें।") +
   sec("4. पिन और एंट्रेंस सही रखें",
     "200 मीटर दूर लगा पिन, या मुख्य सड़क पर पिन जबकि आपका एंट्रेंस साइड की गली में है, लोगों को ग़लत जगह भेजता है और एक ग्राहक गँवा देता है। मैप पर पिन जाँचें, फ़ोटो में कोई लैंडमार्क दिखाएँ, और अगर आप मार्केट कॉम्प्लेक्स की पहली मंज़िल पर हैं, तो प्रोफ़ाइल और फ़ोटो में यह बताएँ।") +
   sec("5. खोज के उस पल के बारे में सोचें",
     "Maps की खोज अक्सर पैदल चलते, दोपहिया पर या घर से निकलने से ठीक पहले होती है। उस पल में जो जानकारी चाहिए उसे आसान रखें: खुलने का समय (साप्ताहिक छुट्टी और त्योहार के बदलाव सहित), फ़ोन नंबर, पार्किंग या होम डिलीवरी है या नहीं, और आप मुख्य रूप से क्या बेचते हैं।") +
   lst(["प्राइमरी कैटेगरी सटीक और सही है।",
        "समय में साप्ताहिक छुट्टी और त्योहार के बदलाव शामिल हैं।",
        "पिन असली एंट्रेंस पर है।",
        "कम से कम 10 असली फ़ोटो, हर महीने ताज़ा की गई।",
        "हर रिव्यू का जवाब दिया गया है।"]) + "\n" +
   call("पक्का करें कि मैप पर आपकी पिन लोकेशन बिल्कुल सही हो। ग़लत पिन की वजह से ग्राहक भटका तो वह निराश होकर लौट जाएगा। वही मैप अपनी वेबसाइट पर दिखाने के लिए <a href=\"../../../tools/maps-embed/index.html\">Maps एम्बेड टूल</a> देखें।"),
  "faq": [("क्या विज्ञापन पर पैसे खर्च किए बिना Google Maps से ग्राहक मिल सकते हैं?","हाँ। पूरी, सही और सक्रिय Google Business Profile मुफ़्त है और लोकल बिज़नेस के Maps पर मिलने का मुख्य तरीक़ा है। पेड प्रमोशन अलग विकल्प है और नतीजों में दिखने के लिए ज़रूरी नहीं।"),
          ("अगर Google Maps पर मेरी पिन या पता ग़लत है तो क्या करें?","अपनी Business Profile में लोकेशन एडिट करें और ज़रूरत हो तो Maps से सुझाव भेजें। Google बदलाव की समीक्षा कर सकता है और इसमें समय लग सकता है, इसलिए तब तक हर जगह पते का लिखा रूप एक जैसा रखें।")]
 }
},
{
 "slug": "how-to-get-local-customers",
 "hi_slug": "local-customers-kaise-laaye",
 "en": {
  "title": "How to Get Local Customers",
  "description": "Learn the best local SEO and marketing strategies to attract customers in your immediate neighborhood.",
  "headline": "Strategies to Attract Local Customers",
  "lede": "Attracting customers from your own neighborhood requires a mix of online visibility and community trust.",
  "content_html":
   sec("1. Localize your website content",
     "Make sure your website explicitly mentions the areas, neighborhoods, and cities you serve. A service page should say \"AC repair in Dwarka and Janakpuri\" rather than just \"AC repair\". Write for the way people actually speak: they say the colony, the market or the nearest metro station, not the postal district. Do not create dozens of near-identical pages for every locality; one useful page per genuine service area is better than many copies.") +
   sec("2. Claim and keep directory listings consistent",
     "Beyond Google, make sure your business is listed accurately on directories your customers actually use, such as Justdial and Bing Places, plus trade-specific directories. Use the same business name, address and phone number everywhere. Inconsistent details confuse customers and make it harder for search engines to trust which listing is yours. The <a href=\"../../tools/citation-checker/index.html\">citation checker</a> can help you keep a list.") +
   sec("3. Engage with the local community",
     "Sponsor a local sports event, support a school function or partner with neighbouring businesses. Online, this can mean a mention on a local news site, a residents' association page or a community blog. Real local links and mentions take effort, but they also bring real people through your door.") +
   sec("4. Use the channels your neighbours already use",
     "In most Indian neighbourhoods, the real recommendation network is WhatsApp: society groups, relatives, shop-to-shop referrals. A short, shareable message with your service, area and a link to your Google profile fits naturally there. Ask before adding people to broadcast lists, and never spam groups.") +
   sec("5. Pay attention to seasons",
     "Local demand is seasonal: AC servicing before summer, water-proofing and plumbing before the monsoon, sweets, gifts and tailoring before Diwali and Eid, venues and photographers before the wedding season, tutoring before exams. Plan your posts, photos and offers a few weeks before each peak.") + "\n" +
   call("Word-of-mouth is still powerful. A great online reputation combined with local community engagement creates a strong referral loop."),
  "faq": [("Which is better for local customers: a website or a Google Business Profile?","They do different jobs. Your Google Business Profile helps people find and contact you on Maps and Search; your website explains your services in more depth. Most local businesses benefit from having both, starting with the profile."),
          ("Should I list my business in directories like Justdial?","Accurate listings on directories your customers use can help them find you, as long as your name, address and phone number match your Google profile. Prioritise the few that matter for your trade instead of listing everywhere.")]
 },
 "hi": {
  "title": "Local customers kaise laaye",
  "description": "Apne aas-paas ke ilake se customers laane ke liye best local SEO aur marketing strategies.",
  "headline": "Local Customers aakarshit karne ki strategies",
  "lede": "Apne hi ilake se customers laane ke liye online visibility aur local community ke bharose, dono ki zaroorat hoti hai.",
  "content_html":
   sec("1. वेबसाइट का कंटेंट लोकल बनाएँ",
     "अपनी वेबसाइट पर उन इलाक़ों, मोहल्लों और शहरों का साफ़ ज़िक्र करें जहाँ आप सेवा देते हैं। सर्विस पेज पर सिर्फ़ \"AC repair\" नहीं, बल्कि \"द्वारका और जनकपुरी में AC रिपेयर\" लिखें। लोग जैसे बोलते हैं वैसे लिखें: वे कॉलोनी, मार्केट या सबसे पास का मेट्रो स्टेशन बताते हैं, डाक ज़िला नहीं। हर मोहल्ले के लिए लगभग एक जैसे दर्जनों पेज न बनाएँ; हर असली सर्विस एरिया के लिए एक काम का पेज कई नक़लों से बेहतर है।") +
   sec("2. डायरेक्टरी लिस्टिंग लें और एक जैसी रखें",
     "Google के अलावा, उन डायरेक्टरी में सही लिस्टिंग रखें जिन्हें आपके ग्राहक सच में इस्तेमाल करते हैं, जैसे Justdial और Bing Places, और अपने काम की ख़ास डायरेक्टरी। हर जगह एक ही बिज़नेस नाम, पता और फ़ोन नंबर रखें। अलग-अलग विवरण ग्राहकों को उलझाते हैं और सर्च इंजन के लिए यह भरोसा करना कठिन बनाते हैं कि कौन-सी लिस्टिंग आपकी है। <a href=\"../../../tools/citation-checker/index.html\">सिटेशन चेकर</a> सूची बनाए रखने में मदद कर सकता है।") +
   sec("3. स्थानीय समुदाय से जुड़ें",
     "किसी स्थानीय खेल आयोजन को स्पॉन्सर करें, स्कूल के कार्यक्रम में सहयोग दें या पड़ोस के बिज़नेस के साथ साझेदारी करें। ऑनलाइन इसका मतलब किसी स्थानीय न्यूज़ साइट, रेज़िडेंट्स एसोसिएशन के पेज या कम्युनिटी ब्लॉग पर ज़िक्र हो सकता है। असली स्थानीय लिंक और ज़िक्र पाने में मेहनत लगती है, पर वे असली लोगों को आपके दरवाज़े तक भी लाते हैं।") +
   sec("4. वे चैनल इस्तेमाल करें जो आपके पड़ोसी पहले से करते हैं",
     "ज़्यादातर भारतीय मोहल्लों में असली सिफ़ारिश नेटवर्क WhatsApp है: सोसायटी ग्रुप, रिश्तेदार, दुकान-से-दुकान रेफ़रल। आपकी सर्विस, इलाक़े और Google प्रोफ़ाइल के लिंक वाला छोटा शेयर करने लायक संदेश वहाँ स्वाभाविक रूप से फ़िट होता है। ब्रॉडकास्ट लिस्ट में जोड़ने से पहले पूछें, और ग्रुपों में स्पैम कभी न करें।") +
   sec("5. मौसम का ध्यान रखें",
     "लोकल माँग मौसमी होती है: गर्मी से पहले AC सर्विस, मानसून से पहले वॉटरप्रूफ़िंग और प्लंबिंग, दिवाली और ईद से पहले मिठाई, गिफ़्ट और सिलाई, शादी के सीज़न से पहले वेन्यू और फ़ोटोग्राफ़र, परीक्षा से पहले ट्यूशन। हर पीक से कुछ हफ़्ते पहले अपनी पोस्ट, फ़ोटो और ऑफ़र की योजना बना लें।") + "\n" +
   call("मुँह-ज़ुबानी प्रचार आज भी ताक़तवर है। अच्छी ऑनलाइन साख और स्थानीय समुदाय से जुड़ाव मिलकर एक मज़बूत रेफ़रल चक्र बनाते हैं।"),
  "faq": [("लोकल ग्राहकों के लिए वेबसाइट बेहतर है या Google Business Profile?","दोनों के काम अलग हैं। Google Business Profile से लोग Maps और Search पर आपको ढूँढ और संपर्क कर पाते हैं; वेबसाइट आपकी सर्विस गहराई से समझाती है। ज़्यादातर लोकल बिज़नेस को दोनों से फ़ायदा होता है, शुरुआत प्रोफ़ाइल से करें।"),
          ("क्या मुझे Justdial जैसी डायरेक्टरी में लिस्ट होना चाहिए?","जिन डायरेक्टरी का इस्तेमाल आपके ग्राहक करते हैं, उनमें सही लिस्टिंग लोगों को आप तक पहुँचा सकती है, बशर्ते आपका नाम, पता और फ़ोन नंबर Google प्रोफ़ाइल से मेल खाए। हर जगह लिस्ट होने के बजाय अपने काम के लिए ज़रूरी कुछ डायरेक्टरी चुनें।")]
 }
},
{
 "slug": "how-to-increase-customers-in-shop",
 "hi_slug": "shop-par-customers-kaise-badhaye",
 "en": {
  "title": "How to Increase Customers in Shop",
  "description": "Practical methods to turn online searchers into walk-in foot traffic for your physical retail store.",
  "headline": "How to Increase Walk-in Customers to Your Shop",
  "lede": "If you have a physical retail store, your online presence should be entirely focused on one goal: driving foot traffic through your door.",
  "content_html":
   sec("1. Show what's actually in store",
     "Retail searchers often want to know whether you stock a specific item before they travel to you. List your main products or product categories on your Google Business Profile with clear names and photos, and keep your website or WhatsApp catalogue current. If you sell items that are always in demand, such as school uniforms, mobile accessories, hardware fittings or sarees, say so in plain words. Honest \"in stock\" information saves a wasted trip and builds trust.") +
   sec("2. Keep hours strictly updated",
     "Nothing loses a customer faster than turning up at a closed shop that Google said was open. Mark your weekly off, afternoon break if you have one, and update special hours for holidays and festival days well in advance. Many small shops close at odd times during local events or market bandhs; if that happens, update your profile that day.") +
   sec("3. Local promotions and offers",
     "Run Google Posts for in-store offers, for example a festival discount or a new arrival. A line like \"mention this post at the counter\" bridges online browsing and a physical visit. Keep offers honest and simple, and avoid claims you cannot honour.") +
   sec("4. Make the shop easy to recognise and reach",
     "Add a clear photo of your signboard from the road, a photo of the entrance, and any landmark that customers use to find you. If you offer parking, a ramp, card or UPI payment, or home delivery in a limited radius, tick those attributes and mention them. Small conveniences decide close choices.") +
   sec("5. Collect reviews at the counter",
     "The billing counter is where a happy customer is standing in front of you. Put a small QR code standee there, made with the <a href=\"../../tools/qr-generator/index.html\">QR generator</a>, linking straight to your review page. Ask every customer, not only the ones who look pleased.") + "\n" +
   call("Make your storefront easy to recognise. Ensure your primary Google Maps photo clearly shows your signage so customers know they've arrived at the right place."),
  "faq": [("How can a small shop show its products on Google?","You can add products or product categories to your Business Profile with photos and short descriptions, and keep a simple catalogue on your website or WhatsApp Business. Availability of some product features varies by country and category, so check what your profile offers."),
          ("Does updating shop timings really matter?","Yes. Wrong hours are one of the most common reasons customers feel misled. Update weekly offs, festival timings and special days in advance and edit the same day if something changes.")]
 },
 "hi": {
  "title": "Shop par customers kaise badhaye",
  "description": "Online search karne walo ko apni physical dukaan par bulane ke asaan aur practical tarike.",
  "headline": "Apni Dukaan par foot traffic kaise badhaye",
  "lede": "Agar aapki ek physical dukaan hai, toh aapki online presence ka ek hi maqsad hona chahiye: logon ko chal kar dukaan tak laana.",
  "content_html":
   sec("1. दिखाएँ कि दुकान में असल में क्या है",
     "खुदरा खोजने वाले अक्सर आने से पहले जानना चाहते हैं कि आपके पास कोई ख़ास चीज़ है या नहीं। अपने मुख्य प्रोडक्ट या प्रोडक्ट कैटेगरी साफ़ नाम और फ़ोटो के साथ Google Business Profile पर जोड़ें, और वेबसाइट या WhatsApp कैटलॉग ताज़ा रखें। अगर आप ऐसी चीज़ें बेचते हैं जिनकी हमेशा माँग रहती है, जैसे स्कूल यूनिफ़ॉर्म, मोबाइल एक्सेसरी, हार्डवेयर फ़िटिंग या साड़ियाँ, तो सीधे शब्दों में लिखें। \"स्टॉक में है\" की ईमानदार जानकारी बेकार चक्कर बचाती है और भरोसा बनाती है।") +
   sec("2. खुलने का समय हमेशा सही रखें",
     "Google पर \"खुला\" दिखने वाली दुकान जब बंद मिले, तो ग्राहक सबसे जल्दी खोता है। साप्ताहिक छुट्टी और दोपहर का ब्रेक (अगर हो) दर्ज करें, और छुट्टियों व त्योहारों के ख़ास समय पहले से अपडेट करें। कई छोटी दुकानें स्थानीय आयोजनों या बाज़ार बंद के दौरान अजीब समय पर बंद होती हैं; ऐसा हो तो उसी दिन प्रोफ़ाइल अपडेट करें।") +
   sec("3. स्थानीय प्रमोशन और ऑफ़र",
     "दुकान के ऑफ़र के लिए Google Posts चलाएँ, जैसे त्योहार की छूट या नया स्टॉक। \"यह पोस्ट काउंटर पर दिखाएँ\" जैसी पंक्ति ऑनलाइन देखने और दुकान आने के बीच पुल बनाती है। ऑफ़र ईमानदार और सरल रखें, और ऐसे दावे न करें जो आप निभा न सकें।") +
   sec("4. दुकान को पहचानना और पहुँचना आसान बनाएँ",
     "सड़क से साइनबोर्ड की साफ़ फ़ोटो, एंट्रेंस की फ़ोटो और कोई भी लैंडमार्क जोड़ें जिससे ग्राहक आपको ढूँढते हैं। अगर पार्किंग, रैम्प, कार्ड या UPI पेमेंट, या सीमित दायरे में होम डिलीवरी है, तो वे एट्रिब्यूट चुनें और उनका ज़िक्र करें। छोटी सुविधाएँ क़रीबी चुनाव तय करती हैं।") +
   sec("5. काउंटर पर रिव्यू लें",
     "बिलिंग काउंटर वह जगह है जहाँ ख़ुश ग्राहक आपके सामने खड़ा होता है। वहाँ <a href=\"../../../tools/qr-generator/index.html\">QR जनरेटर</a> से बना छोटा QR स्टैंडी रखें, जो सीधे आपके रिव्यू पेज पर जाए। हर ग्राहक से माँगें, सिर्फ़ उनसे नहीं जो ख़ुश दिखें।") + "\n" +
   call("दुकान के बाहर की साफ़ फ़ोटो लगाएँ जिसमें आपका बोर्ड साफ़ दिखे, ताकि ग्राहकों को पता चल सके कि वे सही जगह पहुँच गए हैं।"),
  "faq": [("छोटी दुकान Google पर अपने प्रोडक्ट कैसे दिखा सकती है?","आप अपनी Business Profile में फ़ोटो और छोटे विवरण के साथ प्रोडक्ट या प्रोडक्ट कैटेगरी जोड़ सकते हैं, और वेबसाइट या WhatsApp Business पर एक सरल कैटलॉग रख सकते हैं। प्रोडक्ट से जुड़ी कुछ सुविधाएँ देश और कैटेगरी के अनुसार अलग हो सकती हैं, इसलिए अपनी प्रोफ़ाइल में देखें कि क्या उपलब्ध है।"),
          ("क्या दुकान का समय अपडेट रखना सच में मायने रखता है?","हाँ। ग़लत समय उन आम कारणों में है जिनसे ग्राहक को धोखा-सा लगता है। साप्ताहिक छुट्टी, त्योहार के समय और ख़ास दिन पहले से अपडेट करें, और कुछ बदले तो उसी दिन बदलाव करें।")]
 }
},
{
 "slug": "how-to-grow-business-online",
 "hi_slug": "business-online-kaise-badhaye",
 "en": {
  "title": "How to Grow Business Online",
  "description": "A roadmap for small businesses looking to expand their presence and sales through online channels.",
  "headline": "How to Grow Your Small Business Online",
  "lede": "Transitioning or expanding your business online can feel overwhelming. Here is a clear, step-by-step approach to steady online growth.",
  "content_html":
   sec("1. Own your core real estate",
     "Before experimenting with paid ads or social media, make sure your Google Business Profile and website are complete and accurate. These are assets you control, unlike a social media following that depends on someone else's algorithm. Check that your business name, address and phone number are the same on both.") +
   sec("2. Create content that answers questions",
     "Think about the ten questions customers ask you every week: price ranges, timelines, what documents to bring, whether you serve their area. Write a short page or post answering each one honestly. These pages can be found by people who have not heard of you yet. Use plain language, include your area name, and add a clear way to contact you.") +
   sec("3. Collect and showcase social proof",
     "Gather reviews on Google, and with the customer's written permission, also collect testimonials and before-and-after photos for your website. Only publish what is real and permitted: never invent reviews or names, and respect privacy, especially in healthcare, legal and financial work.") +
   sec("4. Meet customers on WhatsApp and UPI",
     "Many Indian customers prefer to ask a question on WhatsApp and pay by UPI. A WhatsApp Business catalogue, quick replies and a visible UPI QR remove friction. Keep response times short during business hours; that is often what decides whether an enquiry becomes a sale.") +
   sec("5. Measure a few things, monthly",
     "You do not need a dashboard of fifty numbers. Track calls, direction requests, website visits from your profile, review count and average rating, and where new customers say they found you. A notebook works. If you connect Google Business Profile or Search Console to a tool, check the numbers once a month and write down what you changed.") + "\n" +
   call("Consistency beats intensity. Publishing one helpful piece of content every week for a year is far better than publishing ten articles in a week and then stopping."),
  "faq": [("Where should a small business start online?","Start with a verified Google Business Profile with accurate details, then a simple website with your services, area and contact information. Add reviews and WhatsApp for enquiries before spending on ads or social media."),
          ("Do I need to run ads to grow online?","No. Ads are one option but not a requirement. Many local businesses grow steadily through their free Google profile, reviews, a useful website and referrals.")]
 },
 "hi": {
  "title": "Business online kaise badhaye",
  "description": "Chhote businesses ke liye online presence aur sales badhane ka ek clear roadmap.",
  "headline": "Apna Business Online Kaise Grow Karein",
  "lede": "Apne business ko online badhana thoda mushkil lag sakta hai. Yahan ek clear, step-by-step approach di gayi hai lagatar online growth ke liye.",
  "content_html":
   sec("1. अपना मूल आधार मज़बूत करें",
     "पेड विज्ञापन या सोशल मीडिया आज़माने से पहले पक्का करें कि आपकी Google Business Profile और वेबसाइट पूरी और सही हैं। ये वे चीज़ें हैं जिन्हें आप नियंत्रित करते हैं, सोशल मीडिया के फ़ॉलोअर की तरह नहीं जो किसी और के एल्गोरिदम पर निर्भर होते हैं। जाँचें कि दोनों जगह बिज़नेस का नाम, पता और फ़ोन नंबर एक जैसा है।") +
   sec("2. सवालों के जवाब देने वाला कंटेंट बनाएँ",
     "सोचिए कि ग्राहक हर हफ़्ते आपसे कौन-से दस सवाल पूछते हैं: दाम की रेंज, समय-सीमा, कौन-से दस्तावेज़ लाने हैं, क्या आप उनके इलाक़े में सेवा देते हैं। हर सवाल का ईमानदार जवाब देने वाला छोटा पेज या पोस्ट लिखें। ऐसे पेज वे लोग भी पा सकते हैं जिन्होंने आपके बारे में पहले सुना ही नहीं। सरल भाषा रखें, अपने इलाक़े का नाम शामिल करें और संपर्क का साफ़ तरीक़ा दें।") +
   sec("3. सोशल प्रूफ़ जुटाएँ और दिखाएँ",
     "Google पर रिव्यू जुटाएँ, और ग्राहक की लिखित अनुमति से अपनी वेबसाइट के लिए टेस्टिमोनियल और पहले-बाद की फ़ोटो भी जुटाएँ। केवल वही प्रकाशित करें जो असली और अनुमत हो: रिव्यू या नाम कभी गढ़ें नहीं, और ख़ासकर हेल्थकेयर, क़ानूनी और वित्तीय काम में निजता का सम्मान करें।") +
   sec("4. ग्राहकों से WhatsApp और UPI पर मिलें",
     "कई भारतीय ग्राहक WhatsApp पर सवाल पूछना और UPI से भुगतान करना पसंद करते हैं। WhatsApp Business कैटलॉग, क्विक रिप्लाई और दिखता हुआ UPI QR परेशानी हटाते हैं। कारोबारी घंटों में जवाब का समय कम रखें; अक्सर यही तय करता है कि पूछताछ बिक्री बनेगी या नहीं।") +
   sec("5. हर महीने कुछ ही चीज़ें नापें",
     "पचास आँकड़ों का डैशबोर्ड ज़रूरी नहीं। कॉल, डायरेक्शन रिक्वेस्ट, प्रोफ़ाइल से वेबसाइट विज़िट, रिव्यू की संख्या व औसत रेटिंग, और नए ग्राहक कहाँ से आए यह नोट करें। नोटबुक भी चलेगी। अगर आप Google Business Profile या Search Console किसी टूल से जोड़ते हैं, तो महीने में एक बार आँकड़े देखें और लिख लें कि आपने क्या बदला।") + "\n" +
   call("निरंतरता तीव्रता से जीतती है। एक हफ़्ते में दस लेख डालकर रुक जाने से कहीं बेहतर है कि साल भर हर हफ़्ते एक काम की सामग्री प्रकाशित करें।"),
  "faq": [("छोटे बिज़नेस को ऑनलाइन कहाँ से शुरुआत करनी चाहिए?","सही जानकारी वाली वेरिफ़ाइड Google Business Profile से शुरू करें, फिर सर्विस, इलाक़े और संपर्क वाली एक सरल वेबसाइट बनाएँ। विज्ञापन या सोशल मीडिया पर पैसे लगाने से पहले रिव्यू और पूछताछ के लिए WhatsApp जोड़ें।"),
          ("क्या ऑनलाइन बढ़ने के लिए विज्ञापन चलाना ज़रूरी है?","नहीं। विज्ञापन एक विकल्प है, ज़रूरत नहीं। कई लोकल बिज़नेस अपनी मुफ़्त Google प्रोफ़ाइल, रिव्यू, काम की वेबसाइट और रेफ़रल से लगातार बढ़ते हैं।")]
 }
},
{
 "slug": "free-local-business-promotion",
 "hi_slug": "free-local-business-promotion",
 "en": {
  "title": "Free Local Business Promotion",
  "description": "Discover highly effective ways to promote your local business without spending money on advertising.",
  "headline": "Effective Free Local Business Promotion Ideas",
  "lede": "You don't always need a massive ad budget to get noticed. The most effective local marketing is often entirely free.",
  "content_html":
   sec("1. Use every free Google Business Profile feature",
     "Your Business Profile is the most useful free promotional tool a local business has. Choose accurate categories, list your services or products, add photos, answer questions, publish Posts regularly and reply to reviews. Check what your category supports, because available features differ between business types and can change over time.") +
   sec("2. Partner with non-competing local businesses",
     "If you are a plumber, partner with a local electrician so you refer clients to each other. A wedding photographer can partner with a caterer and a decorator; a coaching class with a stationery shop. Cross-promotion costs only a good relationship, and a warm referral often converts better than a cold advertisement.") +
   sec("3. Join local groups, and help first",
     "Join neighbourhood and trade groups on Facebook and WhatsApp. Don't just post your services. Answer questions, share tips and be genuinely helpful. When people ask for a recommendation, your name will come up naturally. Respect each group's rules on promotion.") +
   sec("4. Turn customers into your marketing team",
     "Ask happy customers for a Google review, and ask whether they would recommend you to a friend or neighbour. Give a simple card or WhatsApp message they can forward. Do not pay or reward people for reviews, which Google does not allow, but a sincere thank-you costs nothing.") +
   sec("5. Make your shop and vehicles work for you",
     "A clear signboard, a visible phone number, a QR code at the counter, and branding on your delivery bag or service vehicle are one-time costs that keep working. Use the <a href=\"../../tools/qr-generator/index.html\">QR generator</a> to link your QR to your Google reviews page.") + "\n" +
   call("Free promotion costs time instead of money. Pick one or two free strategies and commit to them consistently rather than trying to do everything at once."),
  "faq": [("What is the cheapest way to promote a local business?","Setting up and regularly updating a free Google Business Profile, asking happy customers for reviews, and building referral relationships with neighbouring businesses are the lowest-cost options. They cost time rather than money."),
          ("Can I promote my business in local WhatsApp or Facebook groups?","Often yes, but follow each group's rules and focus on being helpful rather than repeatedly advertising. Spamming can get you removed and harms your reputation.")]
 },
 "hi": {
  "title": "Free local business promotion",
  "description": "Bina ads par paise kharch kiye apne local business ko promote karne ke sabse asardaar tarike.",
  "headline": "Free Local Business Promotion ke Best Ideas",
  "lede": "Business ko promote karne ke liye hamesha bade budget ki zaroorat nahi hoti. Local marketing ke sabse asardaar tarike aksar bilkul free hote hain.",
  "content_html":
   sec("1. Google Business Profile की हर मुफ़्त सुविधा इस्तेमाल करें",
     "आपकी Business Profile लोकल बिज़नेस का सबसे काम का मुफ़्त प्रचार टूल है। सटीक कैटेगरी चुनें, अपनी सर्विस या प्रोडक्ट सूचीबद्ध करें, फ़ोटो जोड़ें, सवालों के जवाब दें, नियमित पोस्ट करें और रिव्यू का जवाब दें। देखें कि आपकी कैटेगरी में क्या उपलब्ध है, क्योंकि सुविधाएँ बिज़नेस के प्रकार के अनुसार अलग होती हैं और समय के साथ बदल सकती हैं।") +
   sec("2. प्रतिस्पर्धा न करने वाले स्थानीय बिज़नेस से साझेदारी करें",
     "अगर आप प्लंबर हैं, तो किसी स्थानीय इलेक्ट्रीशियन से साझेदारी करें ताकि आप एक-दूसरे को ग्राहक भेजें। वेडिंग फ़ोटोग्राफ़र कैटरर और डेकोरेटर से, कोचिंग क्लास किसी स्टेशनरी शॉप से जुड़ सकती है। क्रॉस-प्रमोशन में सिर्फ़ अच्छे रिश्ते की लागत है, और भरोसेमंद सिफ़ारिश अक्सर ठंडे विज्ञापन से बेहतर काम करती है।") +
   sec("3. स्थानीय ग्रुप से जुड़ें, पहले मदद करें",
     "Facebook और WhatsApp पर मोहल्ले और अपने पेशे के ग्रुप से जुड़ें। सिर्फ़ अपनी सर्विस पोस्ट न करें। सवालों के जवाब दें, टिप्स साझा करें और सच में मददगार बनें। जब लोग सिफ़ारिश माँगेंगे, आपका नाम स्वाभाविक रूप से आएगा। हर ग्रुप के प्रचार संबंधी नियम मानें।") +
   sec("4. ग्राहकों को अपनी मार्केटिंग टीम बनाएँ",
     "ख़ुश ग्राहकों से Google रिव्यू माँगें, और पूछें कि क्या वे आपको किसी दोस्त या पड़ोसी को सुझाएँगे। उन्हें आगे भेजने लायक एक सरल कार्ड या WhatsApp संदेश दें। रिव्यू के लिए पैसे या इनाम न दें, Google इसकी अनुमति नहीं देता, पर सच्चा धन्यवाद कुछ नहीं लेता।") +
   sec("5. अपनी दुकान और गाड़ियों से काम लें",
     "साफ़ साइनबोर्ड, दिखता फ़ोन नंबर, काउंटर पर QR कोड, और डिलीवरी बैग या सर्विस गाड़ी पर ब्रांडिंग ऐसे एक बार के ख़र्च हैं जो लगातार काम करते हैं। अपना QR Google रिव्यू पेज से जोड़ने के लिए <a href=\"../../../tools/qr-generator/index.html\">QR जनरेटर</a> इस्तेमाल करें।") + "\n" +
   call("मुफ़्त प्रचार में पैसे नहीं, समय लगता है। एक साथ सब कुछ करने के बजाय एक या दो तरीक़े चुनें और उन्हें लगातार करते रहें।"),
  "faq": [("लोकल बिज़नेस का सबसे सस्ता प्रचार कौन-सा है?","मुफ़्त Google Business Profile बनाकर उसे नियमित अपडेट रखना, ख़ुश ग्राहकों से रिव्यू माँगना और पड़ोस के बिज़नेस से रेफ़रल संबंध बनाना सबसे कम लागत वाले विकल्प हैं। इनमें पैसे नहीं, समय लगता है।"),
          ("क्या मैं लोकल WhatsApp या Facebook ग्रुप में अपने बिज़नेस का प्रचार कर सकता हूँ?","अक्सर हाँ, पर हर ग्रुप के नियम मानें और बार-बार विज्ञापन करने के बजाय मददगार बनें। स्पैम करने पर आपको हटाया जा सकता है और साख को नुक़सान होता है।")]
 }
},
]


CSS = r"""  :root {
    --bg-base:#FAF9F6; --bg-surface:#FFFFFF; --bg-muted:#F0EEE9;
    --text-primary:#1E1E1E; --text-secondary:#5A5A54; --border:#E2E0D9;
    --primary-600:#0F766E; --primary-500:#14968C; --primary-100:#E0F5F2;
    --accent-600:#E8722C; --accent-100:#FCE8D9;
    --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:24px; --sp-6:32px; --sp-7:48px; --sp-8:64px;
    --radius-md:8px; --radius-lg:12px; --radius-xl:20px;
    --font:'Manrope','Noto Sans Devanagari',system-ui,-apple-system,sans-serif;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:var(--font); background:var(--bg-base); color:var(--text-primary); line-height:1.65; }
  a { color:inherit; text-decoration:none; }
  .wrap { max-width:900px; margin:0 auto; padding:0 var(--sp-5); }

  header { position:sticky; top:0; z-index:50; background:rgba(250,249,246,.92); backdrop-filter:blur(8px); border-bottom:1px solid var(--border); }
  .nav-inner { max-width:1180px; margin:0 auto; padding:var(--sp-4) var(--sp-5); display:flex; align-items:center; justify-content:space-between; }
  .logo { display:flex; align-items:center; gap:var(--sp-2); font-weight:800; font-size:18px; }
  .logo-mark { width:34px; height:34px; border-radius:9px; background:linear-gradient(135deg,var(--primary-600),var(--primary-500)); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:15px; }
  .nav-cta { background:var(--accent-600); color:#fff; font-weight:600; font-size:14px; padding:10px 18px; border-radius:var(--radius-md); }
  .nav-cta:hover { background:#CE5F1E; }
  .nav-right { display:flex; align-items:center; gap:var(--sp-3); }
  .lang-switch { font-size:13px; font-weight:600; color:var(--text-secondary); border:1px solid var(--border); border-radius:999px; padding:6px 12px; background:var(--bg-surface); }

  .breadcrumb { font-size:13.5px; color:var(--text-secondary); padding:var(--sp-5) var(--sp-5) 0; max-width:900px; margin:0 auto; }
  .breadcrumb a { color:var(--primary-600); font-weight:600; }
  .breadcrumb span { margin:0 6px; }

  .article-head { padding:var(--sp-4) 0 var(--sp-6); }
  .eyebrow { display:inline-block; font-size:12.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--primary-600); background:var(--primary-100); padding:4px 12px; border-radius:999px; margin-bottom:var(--sp-4); }
  h1 { font-size:32px; line-height:1.2; letter-spacing:-.01em; margin-bottom:var(--sp-3); }
  .lede { font-size:17.5px; color:var(--text-secondary); max-width:640px; }

  article { padding-bottom:var(--sp-7); }
  article h2 { font-size:22px; margin:var(--sp-7) 0 var(--sp-4); letter-spacing:-.01em; }
  article p { font-size:16px; color:var(--text-secondary); margin-bottom:var(--sp-4); }
  article ul,article ol { margin:0 0 var(--sp-4) var(--sp-5); color:var(--text-secondary); font-size:16px; }
  article li { margin-bottom:var(--sp-2); }
  article strong { color:var(--text-primary); }

  .callout { background:var(--primary-100); border-left:4px solid var(--primary-600); border-radius:var(--radius-md); padding:var(--sp-4) var(--sp-5); font-size:15px; color:var(--text-primary); margin:var(--sp-5) 0; }

  .cta-box { background:linear-gradient(135deg,var(--primary-600),var(--primary-500)); color:#fff; border-radius:var(--radius-xl); padding:var(--sp-6); text-align:center; margin:var(--sp-7) 0; }
  .cta-box h3 { font-size:20px; margin-bottom:var(--sp-2); }
  .cta-box p { color:rgba(255,255,255,.85); margin-bottom:var(--sp-4); }
  .btn-primary { display:inline-block; background:#fff; color:var(--primary-600); font-weight:700; font-size:15px; padding:13px 26px; border-radius:var(--radius-md); }
  .btn-primary:hover { background:var(--bg-muted); }

  .related { padding:var(--sp-7) var(--sp-5); max-width:900px; margin:0 auto; }
  .related h3 { font-size:18px; margin-bottom:var(--sp-4); }
  .related-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:var(--sp-4); }
  .related-card { background:var(--bg-surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:var(--sp-4); font-size:14.5px; font-weight:600; }
  .related-card:hover { border-color:var(--primary-500); }
  .related-card .tag { display:block; font-size:11.5px; font-weight:700; text-transform:uppercase; color:var(--accent-600); margin-bottom:4px; }

  footer { background:var(--bg-muted); border-top:1px solid var(--border); padding:var(--sp-7) 0; margin-top:var(--sp-6); }
  .disclaimer-box { max-width:1180px; margin:0 auto var(--sp-5); padding:0 var(--sp-5); font-size:13px; color:var(--text-secondary); }
  .disclaimer-box strong { color:var(--text-primary); }
  .footer-bottom { max-width:1180px; margin:0 auto; padding:0 var(--sp-5); font-size:13px; color:var(--text-secondary); }

  @media (max-width:860px) { .related-grid { grid-template-columns:repeat(2,1fr); } }
  @media (max-width:700px) { h1 { font-size:26px; } .related-grid { grid-template-columns:1fr; } }

  .faq-section { margin-top:40px; }
  .faq-card { background:var(--bg-surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:20px; margin-bottom:16px; }
  .faq-card h4 { font-size:17px; font-weight:700; color:var(--text-primary); margin-bottom:8px; }
  .faq-card p { font-size:15px; color:var(--text-secondary); margin:0; }
  article a { color:var(--primary-600); font-weight:600; }
"""

BANNED = [r"guarantee[sd]? (a |the )?(#1|top|first|rank)", r"adsense", r"rankme", r"#1 ranking in",
          r"Is LocalBoost free to use", r"Pointy", r"100% accurate", r"significantly more"]

L10N = {
  "en": dict(lang="en", home="Home", crumb="Business Growth", eyebrow="Business Growth", cta_nav="Start Free Audit",
             cta_h="Start with a free audit", cta_p="See exactly where your business stands in just 2 minutes, for free.",
             cta_b="Check My Business \u2014 Free", rel="Related guides", faq="Frequently Asked Questions",
             alt_label="\u0939\u093f\u0902\u0926\u0940 \u092e\u0947\u0902 \u0926\u0947\u0916\u0947\u0902",
             note="<strong>A note on results:</strong> Growth outcomes depend on many factors specific to your business and market and cannot be guaranteed. This guide is general educational information and is not affiliated with or endorsed by Google.",
             cards=[("GBP Setup","Set up your Google Business Profile","google-business-profile"),("Maps SEO","Why you're not showing up on Maps","google-maps-seo"),("Local SEO","Local SEO basics","local-seo"),("Reviews","Getting Google reviews the right way","google-reviews")]),
  "hi": dict(lang="hi", home="\u0939\u094b\u092e", crumb="\u092c\u093f\u091c\u0928\u0947\u0938 \u0917\u094d\u0930\u094b\u0925", eyebrow="\u092c\u093f\u091c\u0928\u0947\u0938 \u0917\u094d\u0930\u094b\u0925", cta_nav="\u092b\u094d\u0930\u0940 \u0911\u0921\u093f\u091f \u0936\u0941\u0930\u0942 \u0915\u0930\u0947\u0902",
             cta_h="\u092b\u094d\u0930\u0940 \u0911\u0921\u093f\u091f \u0938\u0947 \u0936\u0941\u0930\u0941\u0906\u0924 \u0915\u0930\u0947\u0902", cta_p="\u0938\u093f\u0930\u094d\u092b 2 \u092e\u093f\u0928\u091f \u092e\u0947\u0902 \u091a\u0947\u0915 \u0915\u0930\u0947\u0902 \u0915\u093f \u0906\u092a\u0915\u093e \u092c\u093f\u091c\u0928\u0947\u0938 Google \u092a\u0930 \u0915\u0939\u093e\u0902 \u0938\u094d\u091f\u0948\u0902\u0921 \u0915\u0930\u0924\u093e \u0939\u0948, \u092c\u093f\u0932\u094d\u0915\u0941\u0932 \u092b\u094d\u0930\u0940\u0964",
             cta_b="\u092b\u094d\u0930\u0940 \u092e\u0947\u0902 \u091a\u0947\u0915 \u0915\u0930\u0947\u0902", rel="\u0938\u0902\u092c\u0902\u0927\u093f\u0924 \u0917\u093e\u0907\u0921\u094d\u0938", faq="\u0905\u0915\u094d\u0938\u0930 \u092a\u0942\u091b\u0947 \u091c\u093e\u0928\u0947 \u0935\u093e\u0932\u0947 \u092a\u094d\u0930\u0936\u094d\u0928",
             alt_label="View in English",
             note="<strong>\u0927\u094d\u092f\u093e\u0928 \u0926\u0947\u0902:</strong> \u0930\u093f\u091c\u0932\u094d\u091f\u094d\u0938 \u0906\u092a\u0915\u0947 \u092c\u093f\u091c\u0928\u0947\u0938 \u0914\u0930 \u092e\u093e\u0930\u094d\u0915\u0947\u091f \u092a\u0930 \u0928\u093f\u0930\u094d\u092d\u0930 \u0915\u0930\u0924\u0947 \u0939\u0948\u0902 \u0914\u0930 \u0907\u0928\u0915\u0940 \u0915\u094b\u0908 \u0917\u093e\u0930\u0902\u091f\u0940 \u0928\u0939\u0940\u0902 \u0926\u0940 \u091c\u093e \u0938\u0915\u0924\u0940\u0964 \u092f\u0939 \u0917\u093e\u0907\u0921 \u0915\u0947\u0935\u0932 \u0936\u0948\u0915\u094d\u0937\u0923\u093f\u0915 \u091c\u093e\u0928\u0915\u093e\u0930\u0940 \u0915\u0947 \u0932\u093f\u090f \u0939\u0948 \u0914\u0930 Google \u0938\u0947 \u0938\u0902\u092c\u0926\u094d\u0927 \u0928\u0939\u0940\u0902 \u0939\u0948\u0964",
             cards=[("GBP Setup","Google Business Profile \u092c\u0928\u093e\u090f\u0902","google-business-profile"),("Maps SEO","\u0906\u092a \u092e\u0948\u092a\u094d\u0938 \u092a\u0930 \u0915\u094d\u092f\u094b\u0902 \u0928\u0939\u0940\u0902 \u0926\u093f\u0916 \u0930\u0939\u0947?","google-maps-seo"),("Local SEO","\u0932\u094b\u0915\u0932 SEO \u092c\u0947\u0938\u093f\u0915\u094d\u0938","local-seo"),("Reviews","\u0938\u0939\u0940 \u0924\u0930\u0940\u0915\u0947 \u0938\u0947 Google reviews \u092a\u093e\u090f\u0902","google-reviews")]),
}

def esc(s): return html.escape(s, quote=True)

def render_faq_html(items, heading):
    """Same markup as businesses/bakery FAQ block."""
    cards = "".join('<div class="faq-card"><h4>%s</h4><p>%s</p></div>\n        ' % (esc(q), esc(a)) for q, a in items)
    return '      <div class="faq-section">\n        <h2>%s</h2>\n        %s\n      </div>' % (heading, cards.rstrip())

def render_faq_jsonld(items):
    obj = {"@context": "https://schema.org", "@type": "FAQPage",
           "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in items]}
    return '<script type="application/ld+json">\n' + json.dumps(obj, ensure_ascii=False) + '\n</script>'

def render(p, lang):
    L = L10N[lang]; d = p[lang]
    other = "hi" if lang == "en" else "en"
    en_url = "https://www.localboost.in/business-growth/%s/" % p["slug"]
    hi_url = "https://www.localboost.in/hi/business-growth/%s/" % p["hi_slug"]
    self_url = en_url if lang == "en" else hi_url
    up = "../../" if lang == "en" else "../../../"
    pre = up if lang == "en" else up
    hp = "" if lang == "en" else "hi/"
    home = up + "index.html" if lang == "en" else "../../index.html"
    alt = (up + "hi/business-growth/%s/index.html" % p["hi_slug"]) if lang == "en" else (up + "business-growth/%s/index.html" % p["slug"])
    check = up + "check/index.html" if lang == "en" else up + "hi/check/index.html"
    hub = up + hp + "business-growth/index.html"
    t = d["title"]
    faq_ld = render_faq_jsonld(d["faq"])
    cards = "".join('        <a class="related-card" href="%s%s%s/index.html"><span class="tag">%s</span>%s</a>\n' % (up, hp, slug, tag, txt) for tag, txt, slug in L["cards"])
    out = """<!DOCTYPE html>
<html lang="%(lang)s">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%(t)s | LocalBoost</title>
<meta name="description" content="%(desc)s">
<link rel="canonical" href="%(self)s">
<link rel="alternate" hreflang="en" href="%(en)s">
<link rel="alternate" hreflang="hi" href="%(hi)s">
<link rel="alternate" hreflang="x-default" href="%(en)s">
<meta property="og:title" content="%(t)s">
<meta property="og:description" content="%(desc)s">
<meta property="og:type" content="article">
<meta property="og:url" content="%(self)s">
<meta name="twitter:card" content="summary_large_image">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": %(tj)s,
  "description": %(dj)s,
  "author": { "@type": "Organization", "name": "LocalBoost" },
  "publisher": { "@type": "Organization", "name": "LocalBoost" },
  "mainEntityOfPage": "%(self)s"
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": %(homej)s, "item": "https://www.localboost.in/%(hp)s" },
    { "@type": "ListItem", "position": 2, "name": %(crumbj)s, "item": "https://www.localboost.in/%(hp)sbusiness-growth/" },
    { "@type": "ListItem", "position": 3, "name": %(tj)s, "item": "%(self)s" }
  ]
}
</script>
%(faqld)s

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
%(css)s</style>
<link rel="icon" type="image/svg+xml" href="%(up)sassets/favicon.svg">
<link rel="apple-touch-icon" href="%(up)sassets/apple-touch-icon.png">
<meta name="theme-color" content="#0F766E">
<meta property="og:image" content="https://www.localboost.in/assets/og-image.png">
<meta property="og:site_name" content="LocalBoost">
<link rel="stylesheet" href="%(up)sassets/site.css">
</head>
<body>

<header>
  <div class="nav-inner">
    <a href="%(home)s" class="logo"><span class="logo-mark">LB</span><span>LocalBoost</span></a>
    <div class="nav-right">
      <a class="lang-switch" href="%(alt)s" aria-label="%(altl)s">EN \u00b7 \u0939\u093f\u0902</a>
      <a href="%(check)s" class="nav-cta">%(ctanav)s</a>
    </div>
  </div>
</header>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="%(home)s">%(homet)s</a><span>/</span>
  <a href="%(hub)s">%(crumb)s</a><span>/</span>
  <span>%(te)s</span>
</nav>

<main>
  <div class="wrap">
    <div class="article-head">
      <div class="eyebrow">%(eyebrow)s</div>
      <h1>%(headline)s</h1>
      <p class="lede">%(lede)s</p>
    </div>

    <article>
%(content)s

%(faqhtml)s

      <div class="cta-box">
        <h3>%(ctah)s</h3>
        <p>%(ctap)s</p>
        <a href="%(check)s" class="btn-primary">%(ctab)s</a>
      </div>
    </article>

    <div class="related">
      <h3>%(rel)s</h3>
      <div class="related-grid">
%(cards)s      </div>
    </div>
  </div>
</main>

<footer>
  <div class="disclaimer-box">
    %(note)s
  </div>
  <div class="footer-bottom">\u00a9 2026 LocalBoost.</div>
</footer>

<script src="%(up)sassets/consent.js" defer></script>
<script src="%(up)sassets/site.js" defer></script>
</body>
</html>
""" % dict(lang=lang, t=esc(t), desc=esc(d["description"]), self=self_url, en=en_url, hi=hi_url,
           tj=json.dumps(t, ensure_ascii=False), dj=json.dumps(d["description"], ensure_ascii=False),
           homej=json.dumps(L["home"], ensure_ascii=False), crumbj=json.dumps(L["crumb"], ensure_ascii=False), hp=hp,
           faqld=faq_ld, css=CSS, up=up, home=home, alt=alt, altl=L["alt_label"], check=check, ctanav=L["cta_nav"],
           homet=L["home"], hub=hub, crumb=L["crumb"], te=esc(t), eyebrow=L["eyebrow"], headline=d["headline"], lede=d["lede"],
           content=d["content_html"].rstrip(), faqhtml=render_faq_html(d["faq"], L["faq"]), ctah=L["cta_h"], ctap=L["cta_p"],
           ctab=L["cta_b"], rel=L["rel"], cards=cards, note=L["note"])
    for pat in BANNED:
        if re.search(pat, out, re.I):
            sys.exit("Generation aborted: banned phrase %r in %s/%s" % (pat, lang, p["slug"]))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="_generated")
    a = ap.parse_args()
    n = 0
    for p in PAGES:
        for lang, slug in (("en", p["slug"]), ("hi", p["hi_slug"])):
            path = os.path.join(a.out, "" if lang == "en" else "hi", "business-growth", slug)
            os.makedirs(path, exist_ok=True)
            with open(os.path.join(path, "index.html"), "w", encoding="utf-8") as f:
                f.write(render(p, lang))
            n += 1
    print("Created %d HTML files in %s" % (n, a.out))

if __name__ == "__main__":
    main()
