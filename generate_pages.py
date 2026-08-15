import os
import json

EN_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} | LocalBoost</title>
<meta name="description" content="{description}">
<link rel="canonical" href="https://www.localboost.in/business-growth/{slug}/">
<link rel="alternate" hreflang="en" href="https://www.localboost.in/business-growth/{slug}/">
<link rel="alternate" hreflang="hi" href="https://www.localboost.in/hi/business-growth/{hi_slug}/">
<link rel="alternate" hreflang="x-default" href="https://www.localboost.in/business-growth/{slug}/">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://www.localboost.in/business-growth/{slug}/">
<meta name="twitter:card" content="summary_large_image">

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{title}",
  "description": "{description}",
  "author": { "@type": "Organization", "name": "LocalBoost" },
  "publisher": { "@type": "Organization", "name": "LocalBoost" },
  "mainEntityOfPage": "https://www.localboost.in/business-growth/{slug}/"
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.localboost.in/" },
    { "@type": "ListItem", "position": 2, "name": "Business Growth", "item": "https://www.localboost.in/business-growth/" },
    { "@type": "ListItem", "position": 3, "name": "{title}", "item": "https://www.localboost.in/business-growth/{slug}/" }
  ]
}
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@400;500;600&display=swap" rel="stylesheet">

<style>
  :root {
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
</style>
</head>
<body>

<header>
  <div class="nav-inner">
    <a href="/" class="logo"><span class="logo-mark">LB</span><span>LocalBoost</span></a>
    <div class="nav-right">
      <a class="lang-switch" href="/hi/business-growth/{hi_slug}/" aria-label="हिंदी में देखें">EN · हिं</a>
      <a href="/#hero-form" class="nav-cta">Start Free Audit</a>
    </div>
  </div>
</header>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="/">Home</a><span>/</span>
  <a href="/business-growth/">Business Growth</a><span>/</span>
  <span>{title}</span>
</nav>

<main>
  <div class="wrap">
    <div class="article-head">
      <div class="eyebrow">Business Growth</div>
      <h1>{headline}</h1>
      <p class="lede">{lede}</p>
    </div>

    <article>
{content_html}

      <div class="cta-box">
        <h3>Start with a free audit</h3>
        <p>See exactly where your business stands in just 2 minutes, for free.</p>
        <a href="/check/" class="btn-primary">Check My Business — Free</a>
      </div>
    </article>

    <div class="related">
      <h3>Related guides</h3>
      <div class="related-grid">
        <a class="related-card" href="/google-business-profile/"><span class="tag">GBP Setup</span>Set up your Google Business Profile</a>
        <a class="related-card" href="/google-maps-seo/"><span class="tag">Maps SEO</span>Why you're not showing up on Maps</a>
        <a class="related-card" href="/local-seo/"><span class="tag">Local SEO</span>Local SEO basics</a>
        <a class="related-card" href="/google-reviews/"><span class="tag">Reviews</span>Getting Google reviews the right way</a>
      </div>
    </div>
  </div>
</main>

<footer>
  <div class="disclaimer-box">
    <strong>A note on results:</strong> Growth outcomes depend on many factors specific to your business and market and cannot be guaranteed. This guide is general educational information and is not affiliated with or endorsed by Google.
  </div>
  <div class="footer-bottom">© 2026 LocalBoost.</div>
</footer>

</body>
</html>
"""

HI_TEMPLATE = EN_TEMPLATE.replace(
    'lang="en"', 'lang="hi"'
).replace(
    'href="/hi/business-growth/{hi_slug}/" aria-label="हिंदी में देखें">EN · हिं</a>',
    'href="/business-growth/{slug}/" aria-label="View in English">EN · हिं</a>'
).replace(
    'Start Free Audit', 'फ्री ऑडिट शुरू करें'
).replace(
    'Home', 'होम'
).replace(
    'Business Growth', 'बिजनेस ग्रोथ'
).replace(
    'Start with a free audit', 'फ्री ऑडिट से शुरुआत करें'
).replace(
    'See exactly where your business stands in just 2 minutes, for free.', 'सिर्फ 2 मिनट में चेक करें कि आपका बिजनेस Google पर कहां स्टैंड करता है, बिल्कुल फ्री।'
).replace(
    'Check My Business — Free', 'फ्री में चेक करें'
).replace(
    'Related guides', 'संबंधित गाइड्स'
).replace(
    'Set up your Google Business Profile', 'Google Business Profile बनाएं'
).replace(
    "Why you're not showing up on Maps", 'आप मैप्स पर क्यों नहीं दिख रहे?'
).replace(
    'Local SEO basics', 'लोकल SEO बेसिक्स'
).replace(
    'Getting Google reviews the right way', 'सही तरीके से Google reviews पाएं'
).replace(
    '<strong>A note on results:</strong> Growth outcomes depend on many factors specific to your business and market and cannot be guaranteed. This guide is general educational information and is not affiliated with or endorsed by Google.',
    '<strong>ध्यान दें:</strong> रिजल्ट्स आपके बिजनेस और मार्केट पर निर्भर करते हैं और इनकी कोई गारंटी नहीं दी जा सकती। यह गाइड केवल शैक्षणिक जानकारी के लिए है और Google से संबद्ध नहीं है।'
).replace(
    '/check/', '/hi/check/'
).replace(
    '/google-business-profile/', '/hi/google-business-profile/'
).replace(
    '/google-maps-seo/', '/hi/google-maps-seo/'
).replace(
    '/local-seo/', '/hi/local-seo/'
).replace(
    '/google-reviews/', '/hi/google-reviews/'
)

pages = [
    {
        "slug": "how-to-get-customers-from-google",
        "hi_slug": "google-se-customers-kaise-laaye",
        "en": {
            "title": "How to Get Customers from Google",
            "description": "Learn practical steps to attract more customers to your business directly from Google searches.",
            "headline": "How to Get Local Customers from Google",
            "lede": "Showing up on Google is the first step, but how do you actually turn those views into paying customers? Here is a practical framework.",
            "content_html": '''      <h2>1. Be visible where it matters</h2>
      <p>When someone searches for "best plumber near me" or "dentist open now", they usually look at the Google Local Pack (the map with 3 businesses) first. To appear here, your Google Business Profile must be verified, completely filled out, and highly relevant to their search.</p>
      
      <h2>2. Build trust with reviews</h2>
      <p>Visibility without trust won't bring customers. If you show up first but have a 3.2 rating while your competitor has 4.8, the customer will choose them. You need a consistent system to ask happy customers for reviews.</p>
      
      <h2>3. Make it easy to contact you</h2>
      <p>Customers want convenience. Ensure your phone number is correct and prominently displayed. If you take appointments, use a booking link directly in your profile.</p>

      <h2>4. Post updates and offers</h2>
      <p>Use Google Posts to show that your business is active. Share recent work, special offers, or upcoming events. Active profiles show customers you are open for business and attentive.</p>
      
      <div class="callout">
        Focus on answering the customer's unasked questions before they even contact you: Are you open right now? Do you offer the specific service they need? Do others trust you?
      </div>'''
        },
        "hi": {
            "title": "Google se customers kaise laaye",
            "description": "Janiye Google search se apne business ke liye naye customers laane ke practical tarike.",
            "headline": "Google se naye customers kaise laaye",
            "lede": "Google par dikhna sirf pehla kadam hai, un views ko asal customers mein kaise badle? Yahan ek practical tarika bataya gaya hai.",
            "content_html": '''      <h2>1. Sahi jagah par dikhna zaroori hai</h2>
      <p>Jab koi "best plumber near me" search karta hai, toh log sabse pehle Google Local Pack (3 business wala map) dekhte hain. Yahan aane ke liye aapki Google Business Profile verified, puri tarah bhari hui, aur search se relevant honi chahiye.</p>
      
      <h2>2. Reviews se bharosa banayein</h2>
      <p>Bina bharose ke visibility kaam nahi aayegi. Agar aap top par hain par aapki rating 3.2 hai aur padosi ki 4.8, toh customer wahi jayega. Khush customers se review maangne ki aadat banayein.</p>
      
      <h2>3. Sampark karna asaan banayein</h2>
      <p>Customers convenience chahte hain. Apna phone number sahi aur saaf dikhayein. Agar aap appointments lete hain, toh profile mein direct booking link zaroor daalein.</p>

      <h2>4. Updates aur offers post karein</h2>
      <p>Google Posts ka istemaal karke dikhayein ki aapka business active hai. Naye offers ya kaam ke photos share karein. Active profiles se customers ko lagta hai ki aap dhyan dete hain.</p>
      
      <div class="callout">
        Customer ke contact karne se pehle uske sawalon ka jawab dene ki koshish karein: Kya aap abhi khule hain? Kya aap woh service dete hain jo unhe chahiye? Kya dusre log aap par bharosa karte hain?
      </div>'''
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
            "content_html": '''      <h2>1. Optimize your categories</h2>
      <p>Your primary category determines when you show up. Make sure it's the most specific and accurate description of your core business. Use secondary categories to cover other important services.</p>
      
      <h2>2. Add high-quality photos</h2>
      <p>Customers often make snap judgments based on photos. Include pictures of your storefront (so they can find you), the inside of your shop, and your products or team. Profiles with photos receive significantly more requests for directions.</p>
      
      <h2>3. Respond to all reviews</h2>
      <p>Replying to reviews (both positive and negative) shows you care about your customers. Future customers read these replies to judge how you handle problems.</p>
      
      <div class="callout">
        Make sure your pin location on the map is 100% accurate. If customers get lost trying to find you because the pin is in the wrong place, they will leave frustrated.
      </div>'''
        },
        "hi": {
            "title": "Google Maps se customers kaise laaye",
            "description": "Google Maps par apni profile ko optimize karke naye customers aur foot traffic laane ke asaan tarike.",
            "headline": "Google Maps se foot traffic kaise badhaye",
            "lede": "Google Maps sirf rasta dekhne ke liye nahi hai — zyada tar local customers yahin se naye business dhundhte hain. Janiye unhe apni taraf kaise aakarshit karein.",
            "content_html": '''      <h2>1. Sahi categories chunein</h2>
      <p>Aapki primary category tay karti hai ki aap kab dikhenge. Ise apne main business ke hisaab se sabse accurate rakhein. Baaki services ke liye secondary categories ka istemaal karein.</p>
      
      <h2>2. Achhi quality ke photos dalein</h2>
      <p>Customers aksar photos dekh kar turant faisla karte hain. Apni dukan ke bahar ki photo (taaki log dhund sakein), andar ka mahol, aur products/team ki photos lagayein. Photos wali profiles ko directions ke liye zyada clicks milte hain.</p>
      
      <h2>3. Sabhi reviews ka jawab dein</h2>
      <p>Reviews (achhe aur bure dono) ka jawab dene se dikhta hai ki aapko customers ki parwah hai. Naye customers aapke jawab padhkar dekhte hain ki aap problem kaise solve karte hain.</p>
      
      <div class="callout">
        Ensure karein ki map par aapki pin location 100% sahi hai. Agar galat pin ki wajah se customer bhatak gaya, toh woh frustrated hokar chala jayega.
      </div>'''
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
            "content_html": '''      <h2>1. Localize your website content</h2>
      <p>Make sure your website explicitly mentions the areas, neighborhoods, and cities you serve. A service page should say "Plumbing services in South Delhi" rather than just "Plumbing services".</p>
      
      <h2>2. Claim local directory listings</h2>
      <p>Beyond Google, ensure your business is listed accurately on other local directories (JustDial, Yelp, Bing Places, etc.). Consistency across these platforms builds authority.</p>
      
      <h2>3. Engage with the local community</h2>
      <p>Sponsor local events or partner with neighboring businesses. Online, this can mean getting backlinks from local news sites or community blogs.</p>
      
      <div class="callout">
        Word-of-mouth is still powerful. A great online reputation combined with local community engagement creates a strong referral loop.
      </div>'''
        },
        "hi": {
            "title": "Local customers kaise laaye",
            "description": "Apne aas-paas ke ilake se customers laane ke liye best local SEO aur marketing strategies.",
            "headline": "Local Customers aakarshit karne ki strategies",
            "lede": "Apne hi ilake se customers laane ke liye online visibility aur local community ke bharose, dono ki zaroorat hoti hai.",
            "content_html": '''      <h2>1. Website content ko local banayein</h2>
      <p>Apni website par un ilakon aur shehron ka zaroor zikar karein jahan aap service dete hain. Sirf "Plumbing services" likhne ke bajaye "South Delhi mein Plumbing services" likhein.</p>
      
      <h2>2. Local directories mein list karein</h2>
      <p>Google ke alawa, apne business ko dusri local directories (Jaise JustDial, Bing Places) par bhi accurately list karein. Sabhi jagah ek jaisi details hone se authority badhti hai.</p>
      
      <h2>3. Local community ke sath judein</h2>
      <p>Local events ko sponsor karein ya pados ke businesses ke sath partner karein. Online duniya mein iska matlab hai local news sites ya blogs se links (backlinks) paana.</p>
      
      <div class="callout">
        Word-of-mouth aaj bhi sabse asardaar hai. Ek achhi online reputation aur local community mein pehchaan milkar ek bohot strong referral network banate hain.
      </div>'''
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
            "content_html": '''      <h2>1. Highlight exactly what's in store</h2>
      <p>Retail searchers often want to know if you have a specific item in stock before they drive over. Use the Google Pointy integration or manually add your most popular products to your Business Profile.</p>
      
      <h2>2. Keep hours strictly updated</h2>
      <p>Nothing loses a customer faster than showing up to a closed store that Google said was open. Always update your holiday and special hours weeks in advance.</p>
      
      <h2>3. Local promotions and offers</h2>
      <p>Run Google Posts with in-store exclusive offers. E.g., "Show this post at the counter for 10% off". This directly bridges the gap between online browsing and physical visiting.</p>
      
      <div class="callout">
        Make your storefront easy to recognize. Ensure your primary Google Maps photo clearly shows your signage so customers know they've arrived at the right place.
      </div>'''
        },
        "hi": {
            "title": "Shop par customers kaise badhaye",
            "description": "Online search karne walo ko apni physical dukaan par bulane ke asaan aur practical tarike.",
            "headline": "Apni Dukaan par foot traffic kaise badhaye",
            "lede": "Agar aapki ek physical dukaan hai, toh aapki online presence ka ek hi maqsad hona chahiye: logon ko chal kar dukaan tak laana.",
            "content_html": '''      <h2>1. Dukaan ke products clearly dikhayein</h2>
      <p>Log aane se pehle janna chahte hain ki unhe jo chahiye wo aapke paas hai ya nahi. Apne sabse popular products ko apne Google Business Profile mein add karein.</p>
      
      <h2>2. Timings (Hours) hamesha update rakhein</h2>
      <p>Agar Google par dukaan khuli dikh rahi hai aur customer ke aane par band mile, toh wo hamesha ke liye chala jayega. Tyoharon aur chhuttiyon ke timings pehle se update karein.</p>
      
      <h2>3. In-store offers chalayein</h2>
      <p>Google Posts par aise offers dalein jo sirf dukaan aane par milein. Jaise: "Counter par ye post dikhayein aur 10% discount payein." Isse log online dekh kar dukaan aane par majboor hote hain.</p>
      
      <div class="callout">
        Dukaan ke bahar ki saaf photo lagayein jismein aapka board/sign saaf dikhe, taaki customers ko pata chal sake ki wo sahi jagah pahunch gaye hain.
      </div>'''
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
            "content_html": '''      <h2>1. Own your core real estate</h2>
      <p>Before experimenting with paid ads or social media, ensure your Google Business Profile and Website are fully optimized. These are assets you own and control.</p>
      
      <h2>2. Create content that answers questions</h2>
      <p>Think about the top 10 questions your customers ask you every day. Create a dedicated page or blog post on your website answering each of those questions thoroughly.</p>
      
      <h2>3. Collect and showcase social proof</h2>
      <p>Gather reviews on Google, but also collect case studies, testimonials, and before/after photos for your website. Social proof is the currency of online growth.</p>
      
      <div class="callout">
        Consistency beats intensity. Publishing one helpful piece of content every week for a year is far better than publishing 10 articles in a week and then stopping.
      </div>'''
        },
        "hi": {
            "title": "Business online kaise badhaye",
            "description": "Chhote businesses ke liye online presence aur sales badhane ka ek clear roadmap.",
            "headline": "Apna Business Online Kaise Grow Karein",
            "lede": "Apne business ko online badhana thoda mushkil lag sakta hai. Yahan ek clear, step-by-step approach di gayi hai lagatar online growth ke liye.",
            "content_html": '''      <h2>1. Apna core base strong karein</h2>
      <p>Ads ya social media par paise lagane se pehle, zaroori hai ki aapka Google Business Profile aur Website puri tarah tayyar ho. Ye aapke main online assets hain.</p>
      
      <h2>2. Sawalon ke jawab dene wala content banayein</h2>
      <p>Sochiye ki aapke customers roz aapse konse 10 sawal puchte hain. Apni website par har ek sawal ka detail mein jawab dene wala page ya post banayein.</p>
      
      <h2>3. Social proof ikattha karein</h2>
      <p>Google par reviews jama karein, aur apni website ke liye testimonials aur kaam ke before/after photos ikattha karein. Online duniya mein bharosa hi sab kuch hai.</p>
      
      <div class="callout">
        Consistency sabse zaroori hai. Ek hafte mein 10 post daal kar ruk jane se behtar hai ki har hafte ek achha aur kaam ka post dalein.
      </div>'''
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
            "content_html": '''      <h2>1. Maximize Google Business Profile features</h2>
      <p>Your GBP is the most powerful free promotional tool available. Use the Products tab to list inventory, use Posts for weekly updates, and turn on messaging to chat with customers directly.</p>
      
      <h2>2. Partner with non-competing local businesses</h2>
      <p>If you're a plumber, partner with a local electrician to refer clients to each other. Cross-promotion doesn't cost money, just a good relationship.</p>
      
      <h2>3. Leverage local Facebook groups</h2>
      <p>Join community groups. Don't just spam your services — answer questions and be genuinely helpful. When people ask for recommendations, your name will naturally come up.</p>
      
      <div class="callout">
        Free promotion costs time instead of money. Pick one or two free strategies and commit to them consistently rather than trying to do everything at once.
      </div>'''
        },
        "hi": {
            "title": "Free local business promotion",
            "description": "Bina ads par paise kharch kiye apne local business ko promote karne ke sabse asardaar tarike.",
            "headline": "Free Local Business Promotion ke Best Ideas",
            "lede": "Business ko promote karne ke liye hamesha bade budget ki zaroorat nahi hoti. Local marketing ke sabse asardaar tarike aksar bilkul free hote hain.",
            "content_html": '''      <h2>1. Google Business Profile ka poora fayda uthayein</h2>
      <p>Aapka GBP sabse powerful free tool hai. Apne saaman ko Products tab mein dalein, weekly updates ke liye Posts use karein, aur customers se direct baat karne ke liye messaging on karein.</p>
      
      <h2>2. Dusre local businesses ke sath juden</h2>
      <p>Agar aap plumber hain, toh kisi local electrician se dosti karein aur ek dusre ko clients refer karein. Is cross-promotion mein paise nahi lagte, bas achhe rishte chahiye.</p>
      
      <h2>3. Local Facebook groups ka istemaal karein</h2>
      <p>Apne ilake ke Facebook groups join karein. Sirf apna prachaar na karein — logon ke sawalon ke jawab dein aur unki madad karein. Jab log recommendation mangenge, aapka naam khud aayega.</p>
      
      <div class="callout">
        Free promotion mein paise nahi, samay lagta hai. Ek sath sab kuch karne ke bajaye ek ya do tarike chunein aur unhe lagatar karte rahein.
      </div>'''
        }
    }
]

import os
os.makedirs("en-updated/business-growth", exist_ok=True)
os.makedirs("hi/business-growth", exist_ok=True)
os.makedirs("site/business-growth", exist_ok=True)

for p in pages:
    # Write English
    en_content = EN_TEMPLATE.replace("{slug}", p["slug"])
    en_content = en_content.replace("{hi_slug}", p["hi_slug"])
    en_content = en_content.replace("{title}", p["en"]["title"])
    en_content = en_content.replace("{description}", p["en"]["description"])
    en_content = en_content.replace("{headline}", p["en"]["headline"])
    en_content = en_content.replace("{lede}", p["en"]["lede"])
    en_content = en_content.replace("{content_html}", p["en"]["content_html"])

    en_dir = os.path.join("en-updated", "business-growth", p["slug"])
    os.makedirs(en_dir, exist_ok=True)
    with open(os.path.join(en_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(en_content)
        
    site_en_dir = os.path.join("site", "business-growth", p["slug"])
    os.makedirs(site_en_dir, exist_ok=True)
    with open(os.path.join(site_en_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(en_content)

    # Write Hindi
    hi_content = HI_TEMPLATE.replace("{slug}", p["slug"])
    hi_content = hi_content.replace("{hi_slug}", p["hi_slug"])
    hi_content = hi_content.replace("{title}", p["hi"]["title"])
    hi_content = hi_content.replace("{description}", p["hi"]["description"])
    hi_content = hi_content.replace("{headline}", p["hi"]["headline"])
    hi_content = hi_content.replace("{lede}", p["hi"]["lede"])
    hi_content = hi_content.replace("{content_html}", p["hi"]["content_html"])
    hi_dir = os.path.join("hi", "business-growth", p["hi_slug"])
    os.makedirs(hi_dir, exist_ok=True)
    with open(os.path.join(hi_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(hi_content)

print("Created 12 HTML files.")
