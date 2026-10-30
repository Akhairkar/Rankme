// Review analytics (rule-based, transparent, no model) + Google data retention job.
// Docs: docs/api/reviews-competitors.md, docs/GOOGLE-DATA-RETENTION.md.
// Routes: GET /api/reviews/analysis, GET /api/reviews/reply-history. Job: google-data-retention.
//
// Sentiment = stars (dominant) + lexicon (tie-breaker). Topics = lexicon. Both lexicons are exported
// and listed in the docs; nothing here calls a model or an external service.

const DAY = 86400000;
const HOUR = 3600000;
const MAX_ROWS = 5000;
const SNIPPET_MAX = 140;
const SNIPPETS_PER_TOPIC = 3;

// ---------------------------------------------------------------- lexicons
// Entries are normalised with the same function as review text (lowercase, nukta stripped), so
// spelling variants such as ढ़/ढ or ज़/ज match. Multi-word entries match consecutive tokens.
export const SENTIMENT_LEXICON = {
  positive: [
    // English
    "good", "great", "excellent", "amazing", "awesome", "best", "friendly", "helpful", "clean", "professional",
    "love", "loved", "recommend", "recommended", "polite", "prompt", "satisfied", "perfect", "wonderful",
    "fantastic", "superb", "nice", "happy", "thank", "thanks", "affordable", "reasonable", "delicious",
    "value for money", "highly recommended", "well managed", "on time",
    // Hinglish (Latin script)
    "accha", "acha", "achha", "achchha", "achi", "acchi", "badhiya", "badiya", "shandar", "behtareen", "behtarin",
    "mast", "zabardast", "lajawab", "sasta", "saaf", "shukriya", "dhanyawad", "bahut accha", "bohot accha",
    // Hindi (Devanagari)
    "अच्छा", "अच्छी", "अच्छे", "बहुत अच्छा", "बहुत अच्छी", "बढ़िया", "शानदार", "बेहतरीन", "उत्तम", "लाजवाब",
    "ज़बरदस्त", "सस्ता", "साफ", "धन्यवाद", "शुक्रिया", "पसंद",
  ],
  negative: [
    // English
    "bad", "worst", "poor", "terrible", "horrible", "awful", "rude", "slow", "dirty", "unhygienic", "overpriced",
    "expensive", "late", "delay", "delayed", "waste", "cheat", "cheated", "fraud", "scam", "disappointed",
    "disappointing", "unprofessional", "ignored", "pathetic", "disgusting", "filthy", "stale", "never again",
    "noisy", "careless", "bad service",
    // Hinglish (Latin script)
    "ganda", "gandi", "gande", "gandagi", "kharab", "bekaar", "bekar", "ghatiya", "mehnga", "mehenga", "mahanga",
    "mahenga", "dhokha", "dhoka", "bakwas", "badtameez", "bura", "buri", "dheema", "sust", "laparwahi",
    // Hindi (Devanagari)
    "खराब", "गंदा", "गंदी", "गंदे", "गंदगी", "बेकार", "धीमा", "बदतमीज", "बदतमीज़", "महंगा", "मंहगा", "महँगा",
    "धोखा", "घटिया", "देरी", "बकवास", "लापरवाही", "बुरा", "बुरी",
  ],
};
const NEGATORS_BEFORE = new Set(["not", "no", "never", "dont", "doesnt", "didnt", "isnt", "wasnt", "cant", "wont", "without", "nahi", "nahin", "नहीं", "नही", "mat", "bina", "बिना"]);
const NEGATORS_AFTER = new Set(["nahi", "nahin", "nai", "नहीं", "नही", "na"]);

export const TOPIC_LEXICON = {
  service: ["service", "services", "support", "treatment", "consultation", "appointment", "seva", "सर्विस", "सेवा", "सेवाएं"],
  staff: ["staff", "doctor", "team", "owner", "manager", "receptionist", "behaviour", "behavior", "attitude", "waiter", "employee", "employees", "rude", "polite", "friendly", "helpful", "कर्मचारी", "स्टाफ", "डॉक्टर", "व्यवहार", "बदतमीज", "badtameez", "vyavhar"],
  price: ["price", "prices", "pricing", "cost", "costly", "expensive", "cheap", "affordable", "overpriced", "charges", "charged", "fee", "fees", "bill", "rates", "value for money", "mehnga", "mehenga", "mahanga", "sasta", "kimat", "daam", "महंगा", "मंहगा", "सस्ता", "कीमत", "दाम", "पैसे", "फीस"],
  cleanliness: ["clean", "dirty", "hygiene", "hygienic", "unhygienic", "neat", "filthy", "washroom", "toilet", "sanitized", "smell", "saaf", "safai", "ganda", "gandi", "gandagi", "साफ", "सफाई", "गंदा", "गंदी", "गंदगी"],
  wait_time: ["wait", "waiting", "waited", "queue", "slow", "delay", "delayed", "late", "long time", "prompt", "quick", "quickly", "intezaar", "intezar", "deri", "dheema", "इंतजार", "इंतज़ार", "देर", "देरी", "धीमा"],
  quality: ["quality", "taste", "tasty", "delicious", "fresh", "stale", "material", "product", "products", "workmanship", "results", "ghatiya", "क्वालिटी", "गुणवत्ता", "स्वाद", "घटिया"],
  location_parking: ["location", "parking", "park", "parked", "nearby", "accessible", "access", "traffic", "directions", "easy to find", "jagah", "पार्किंग", "लोकेशन", "जगह"],
  delivery: ["delivery", "delivered", "deliver", "courier", "shipping", "shipped", "dispatch", "home delivery", "takeaway", "डिलीवरी", "डिलिवरी"],
};

export const SENTIMENT_METHOD = "rating+lexicon";
export const SENTIMENT_RULES =
  "score = 2*stars_base + sign(lexicon_positive_hits - lexicon_negative_hits); stars_base = +1 for 4-5 stars, 0 for 3, -1 for 1-2, 0 when no rating. " +
  "label = positive if score >= 1, negative if score <= -1, else neutral. A lexicon term preceded within 2 tokens by a negator (not, never, nahi, नहीं ...) " +
  "or followed by a Hindi/Hinglish negator is counted with the opposite polarity. Reviews with neither a rating nor text are not classified.";

// ---------------------------------------------------------------- text helpers
export function normalizeText(s) {
  return String(s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/़/g, "")                 // Devanagari nukta: ज़ -> ज, ढ़ -> ढ
    .replace(/([a-z])\1{2,}/g, "$1");       // gandaaaa -> ganda
}
export function tokenize(text) {
  const norm = normalizeText(text), out = [], re = /[\p{L}\p{M}\p{N}]+/gu;
  let m;
  while ((m = re.exec(norm))) out.push({ t: m[0], start: m.index });
  return out;
}
function compile(list) {
  const byFirst = new Map();
  for (const entry of list) {
    const toks = tokenize(entry).map((x) => x.t);
    if (!toks.length) continue;
    if (!byFirst.has(toks[0])) byFirst.set(toks[0], []);
    byFirst.get(toks[0]).push(toks);
  }
  for (const arr of byFirst.values()) arr.sort((a, b) => b.length - a.length); // longest phrase first
  return byFirst;
}
const POS = compile(SENTIMENT_LEXICON.positive);
const NEG = compile(SENTIMENT_LEXICON.negative);
const TOPICS = Object.fromEntries(Object.entries(TOPIC_LEXICON).map(([k, v]) => [k, compile(v)]));

// Returns [{start (char offset), tokStart, tokEnd}] for every non-overlapping match of the compiled lexicon.
function matches(tokens, compiled) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const cands = compiled.get(tokens[i].t);
    if (!cands) continue;
    for (const c of cands) {
      let ok = i + c.length <= tokens.length;
      for (let j = 1; ok && j < c.length; j++) if (tokens[i + j].t !== c[j]) ok = false;
      if (ok) { out.push({ start: tokens[i].start, tokStart: i, tokEnd: i + c.length }); i += c.length - 1; break; }
    }
  }
  return out;
}
function negated(tokens, m) {
  for (let k = 1; k <= 2; k++) if (m.tokStart - k >= 0 && NEGATORS_BEFORE.has(tokens[m.tokStart - k].t)) return true;
  for (let k = 0; k <= 1; k++) if (m.tokEnd + k < tokens.length && NEGATORS_AFTER.has(tokens[m.tokEnd + k].t)) return true;
  return false;
}

export function sentimentOf(text, rating) {
  const hasText = typeof text === "string" && text.trim().length > 0;
  const r = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
  if (!hasText && r == null) return null; // nothing to classify
  let pos = 0, neg = 0;
  if (hasText) {
    const tokens = tokenize(text);
    for (const m of matches(tokens, POS)) negated(tokens, m) ? neg++ : pos++;
    for (const m of matches(tokens, NEG)) negated(tokens, m) ? pos++ : neg++;
  }
  const base = r == null ? 0 : r >= 4 ? 1 : r <= 2 ? -1 : 0;
  const score = 2 * base + Math.sign(pos - neg);
  return { label: score >= 1 ? "positive" : score <= -1 ? "negative" : "neutral", score, positive_hits: pos, negative_hits: neg };
}

function snippet(text, charStart) {
  const t = String(text).replace(/\s+/g, " ").trim();
  if (t.length <= SNIPPET_MAX) return t;
  const pre = Math.max(0, Math.min(charStart - 40, t.length - 1));
  const lead = pre > 0 ? "…" : "";
  let body = t.slice(pre, pre + SNIPPET_MAX - lead.length);
  if (pre + body.length < t.length) body = body.slice(0, body.length - 1) + "…";
  return lead + body;
}

export function topicsOf(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const tokens = tokenize(text), hits = [];
  for (const [topic, compiled] of Object.entries(TOPICS)) {
    const m = matches(tokens, compiled);
    if (m.length) hits.push({ topic, start: m[0].start });
  }
  return hits;
}

// ---------------------------------------------------------------- time / trend helpers
export const monthKey = (ms) => new Date(ms).toISOString().slice(0, 7);
function monthEndMs(key) { const [y, m] = key.split("-").map(Number); return Date.UTC(y, m, 1); } // exclusive end
const median = (a) => { const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const round = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

export function ttlDays(env, name, def) {
  const n = Number(env?.[name]);
  return Number.isFinite(n) && n >= 1 && n <= 36500 ? Math.floor(n) : def;
}
export const reviewTtlDays = (env) => ttlDays(env, "GOOGLE_REVIEW_CONTENT_TTL_DAYS", 30);
export const profileTtlDays = (env) => ttlDays(env, "GOOGLE_PROFILE_CACHE_TTL_DAYS", 30);
export const searchConsoleTtlDays = (env) => ttlDays(env, "GOOGLE_SEARCH_CONSOLE_TTL_DAYS", 540);

/** Pure: monthly buckets from rows [{rating, review_time, reply_status}] -> Map(month -> bucket). */
export function bucketMonths(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.review_time)) continue;
    const k = monthKey(r.review_time);
    let b = map.get(k);
    if (!b) map.set(k, (b = { month: k, count: 0, rated: 0, sum: 0, dist: [0, 0, 0, 0, 0], answered: 0 }));
    b.count++;
    if (Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5) { b.rated++; b.sum += r.rating; b.dist[r.rating - 1]++; }
    if (r.reply_status === "answered") b.answered++;
  }
  return map;
}

// ---------------------------------------------------------------- DB access
const REVIEW_SELECT =
  "SELECT r.id,r.rating,r.review_text,r.review_time,r.reply_status,r.synced_at FROM reviews r " +
  "JOIN business_locations bl ON bl.id=r.business_location_id WHERE bl.business_id=?";

async function safeAll(env, sql, binds) {
  try { return (await env.DB.prepare(sql).bind(...binds).all()).results || []; } catch { return null; }
}

export async function recomputeAggregates(env, businessId, months, now = Date.now()) {
  let n = 0;
  for (const month of months) {
    const rows = (await env.DB.prepare(REVIEW_SELECT + " AND r.review_time IS NOT NULL AND strftime('%Y-%m', r.review_time/1000, 'unixepoch')=?").bind(businessId, month).all()).results || [];
    const b = bucketMonths(rows).get(month);
    if (!b) continue;
    await env.DB.prepare(
      "INSERT INTO review_monthly_aggregates (business_id,month,count,avg_rating,five,four,three,two,one,answered_count,computed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) " +
      "ON CONFLICT(business_id,month) DO UPDATE SET count=excluded.count,avg_rating=excluded.avg_rating,five=excluded.five,four=excluded.four,three=excluded.three,two=excluded.two,one=excluded.one,answered_count=excluded.answered_count,computed_at=excluded.computed_at"
    ).bind(businessId, month, b.count, b.rated ? b.sum / b.rated : null, b.dist[4], b.dist[3], b.dist[2], b.dist[1], b.dist[0], b.answered, now).run();
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- analysis
export async function analyzeBusiness(env, businessId, now = Date.now()) {
  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(r.synced_at) AS latest FROM reviews r JOIN business_locations bl ON bl.id=r.business_location_id WHERE bl.business_id=?").bind(businessId).first();
  const totalStored = Number(totalRow?.n || 0);
  const aggRows = (await safeAll(env, "SELECT * FROM review_monthly_aggregates WHERE business_id=? ORDER BY month", [businessId])) || [];
  if (totalStored === 0 && aggRows.length === 0) {
    return {
      state: "no_reviews", empty: true,
      message: "No reviews are stored for this business yet. Connect Google Business Profile and fetch reviews to see analytics.",
      method: SENTIMENT_METHOD, sentiment_rules: SENTIMENT_RULES,
      coverage: { reviews_analysed: 0, total_stored: 0, topics_analysed: 0, text_purged_or_missing: 0, undated: 0, truncated: false },
      data_freshness: { latest_review_fetch_at: null }, rating_distribution: null, monthly_trend: [], unanswered: null, reply_latency: null, sentiment: null, topics: [],
    };
  }
  const rows = (await env.DB.prepare(REVIEW_SELECT + " ORDER BY r.review_time DESC LIMIT " + MAX_ROWS).bind(businessId).all()).results || [];
  const ttl = reviewTtlDays(env), cutoff = now - ttl * DAY;
  const aggByMonth = new Map(aggRows.map((a) => [a.month, a]));
  const rowMonths = bucketMonths(rows);

  // Month source rule: a month with an aggregate is served from the aggregate when it ended before the content TTL
  // cutoff, when no rows remain, or when rows were deleted (aggregate.count > stored rows); otherwise from stored rows.
  const months = [];
  for (const k of new Set([...rowMonths.keys(), ...aggByMonth.keys()])) {
    const a = aggByMonth.get(k), live = rowMonths.get(k);
    if (a && (monthEndMs(k) <= cutoff || !live || a.count > live.count)) {
      months.push({ month: k, source: "aggregate", count: a.count, average_rating: round(a.avg_rating), dist: [a.one, a.two, a.three, a.four, a.five], answered: a.answered_count, as_of: a.computed_at });
    } else if (live) {
      months.push({ month: k, source: "rows", count: live.count, average_rating: live.rated ? round(live.sum / live.rated) : null, dist: live.dist, answered: live.answered, as_of: totalRow.latest });
    }
  }
  months.sort((x, y) => (x.month < y.month ? -1 : 1));
  const dist = [0, 0, 0, 0, 0];
  let dated = 0, answered = 0;
  for (const m of months) { m.dist.forEach((c, i) => (dist[i] += c)); dated += m.count; answered += m.answered; }
  // Undated rows (no review_time) are counted from rows only.
  const undated = rows.filter((r) => !Number.isFinite(r.review_time));
  for (const r of undated) {
    if (Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5) dist[r.rating - 1]++;
    if (r.reply_status === "answered") answered++;
  }
  const totalReviews = dated + undated.length;
  const ratedTotal = dist.reduce((a, b) => a + b, 0);
  const avg = ratedTotal ? dist.reduce((s, c, i) => s + c * (i + 1), 0) / ratedTotal : null;

  // Sentiment + topics from stored rows (rating always available; text only when not purged).
  const sent = { positive: 0, neutral: 0, negative: 0 };
  const topicAgg = Object.fromEntries(Object.keys(TOPIC_LEXICON).map((t) => [t, { topic: t, count: 0, sentiment: { positive: 0, neutral: 0, negative: 0 }, snippets: [] }]));
  let analysed = 0, topicsAnalysed = 0, noText = 0;
  for (const r of rows) {
    const text = typeof r.review_text === "string" && r.review_text.trim() ? r.review_text : null;
    if (!text) noText++;
    const s = sentimentOf(text, r.rating);
    if (!s) continue;
    analysed++; sent[s.label]++;
    if (text) {
      topicsAnalysed++;
      for (const h of topicsOf(text)) {
        const t = topicAgg[h.topic];
        t.count++; t.sentiment[s.label]++;
        if (t.snippets.length < SNIPPETS_PER_TOPIC) t.snippets.push(snippet(text, h.start));
      }
    }
  }
  const unansweredCount = totalReviews - answered;

  // Reply latency: only for replies posted through LocalBoost (we hold posted_at); Google's own reply time is not stored.
  let latency = { value: null, reason: "no_reply_timestamps_stored" };
  const lat = await safeAll(env,
    "SELECT rr.posted_at AS p, r.review_time AS t FROM review_replies rr JOIN reviews r ON r.id=rr.review_id WHERE rr.business_id=? AND rr.status='posted' AND rr.posted_at IS NOT NULL AND r.review_time IS NOT NULL",
    [businessId]);
  if (lat === null) latency.reason = "review_replies_table_unavailable";
  else {
    const hrs = lat.map((x) => (x.p - x.t) / HOUR).filter((h) => h >= 0).sort((a, b) => a - b);
    if (hrs.length) {
      latency = {
        value: { sample_size: hrs.length, median_hours: round(median(hrs)), average_hours: round(hrs.reduce((a, b) => a + b, 0) / hrs.length) },
        basis: "replies posted through LocalBoost (posted_at minus review_time)",
      };
    }
  }

  return {
    state: "verified_data", empty: false,
    method: SENTIMENT_METHOD, sentiment_rules: SENTIMENT_RULES,
    ttl_days: ttl,
    coverage: {
      reviews_analysed: analysed, total_stored: totalStored, topics_analysed: topicsAnalysed,
      text_purged_or_missing: noText, undated: undated.length, truncated: totalStored > rows.length,
      aggregate_months: months.filter((m) => m.source === "aggregate").length,
    },
    data_freshness: { latest_review_fetch_at: totalRow?.latest ?? null, source: "google_business_profile_api" },
    rating_distribution: { counts: { 1: dist[0], 2: dist[1], 3: dist[2], 4: dist[3], 5: dist[4] }, rated_total: ratedTotal, average_rating: round(avg) },
    monthly_trend: months.map((m) => ({ month: m.month, count: m.count, average_rating: m.average_rating, source: m.source })),
    unanswered: { count: unansweredCount, share: totalReviews ? round(unansweredCount / totalReviews, 4) : null, note: "reviews not known to be answered (reply_status other than 'answered')" },
    reply_latency: latency,
    sentiment: { ...sent, classified: analysed },
    topics: Object.values(topicAgg).filter((t) => t.count > 0).sort((a, b) => b.count - a.count),
    topic_lexicon_version: "1",
  };
}

// ---------------------------------------------------------------- routes
async function gate(ctx) {
  const g = await ctx.requireFeature("review_monitoring_enabled");
  return g.ok ? null : ctx.json({ error: "Your plan does not include this feature.", code: "plan_upgrade_required", feature: "review_monitoring_enabled" }, 403);
}
async function common(ctx) {
  if (!ctx.env.DB) return { res: ctx.json({ error: "Database unavailable", code: "database_unavailable" }, 503) };
  const denied = await gate(ctx);
  if (denied) return { res: denied };
  const rl = await ctx.rateLimit(`reviews-analysis:${ctx.userId}`, 60, 60000);
  if (!rl.ok) return { res: ctx.json({ error: "Too many requests", code: "rate_limited" }, 429) };
  const businessId = (ctx.url.searchParams.get("business_id") || "").trim();
  if (!businessId) return { res: ctx.json({ error: "business_id is required", code: "validation_failed" }, 400) };
  const biz = await ctx.getUserBusiness(businessId);
  if (!biz) return { res: ctx.json({ error: "Business not found", code: "not_found" }, 404) };
  return { businessId };
}

async function analysisRoute(request, ctx) {
  const c = await common(ctx);
  if (c.res) return c.res;
  return ctx.json({ business_id: c.businessId, ...(await analyzeBusiness(ctx.env, c.businessId, ctx.now())) });
}

async function replyHistoryRoute(request, ctx) {
  const c = await common(ctx);
  if (c.res) return c.res;
  const limit = Math.min(Math.max(parseInt(ctx.url.searchParams.get("limit") || "50", 10) || 50, 1), 200);
  const rows = await safeAll(ctx.env,
    "SELECT id,review_id,reply_text,status,error_code,confirmed_at,posted_at,created_at FROM review_replies WHERE business_id=? AND user_id=? ORDER BY created_at DESC LIMIT " + limit,
    [c.businessId, ctx.userId]);
  if (rows === null) return ctx.json({ business_id: c.businessId, replies: [], state: "unavailable", reason: "review_replies_table_missing" });
  return ctx.json({ business_id: c.businessId, replies: rows, state: rows.length ? "verified_data" : "no_replies" });
}

export const routes = [
  { method: "GET", path: "/api/reviews/analysis", auth: "session", handler: analysisRoute },
  { method: "GET", path: "/api/reviews/reply-history", auth: "session", handler: replyHistoryRoute },
];

// ---------------------------------------------------------------- retention job
const newId = () => "drl_" + crypto.randomUUID().replaceAll("-", "");

async function logPurge(env, now, { userId = null, businessId = null, dataset, action, rows, ttl = null }) {
  if (!rows) return;
  try {
    await env.DB.prepare("INSERT INTO data_retention_log (id,user_id,business_id,dataset,action,rows_affected,ttl_days,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(newId(), userId, businessId, dataset, action, rows, ttl, now).run();
  } catch { /* the log must never break a purge */ }
}
const changes = (r) => Number(r?.meta?.changes || 0);

const CONTENT_PRESENT = "(r.review_text IS NOT NULL OR r.reviewer_display_name IS NOT NULL OR r.raw_reference_json IS NOT NULL)";

async function monthsOf(env, businessId, extraWhere, binds) {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT strftime('%Y-%m', r.review_time/1000, 'unixepoch') AS m FROM reviews r JOIN business_locations bl ON bl.id=r.business_location_id WHERE bl.business_id=? AND r.review_time IS NOT NULL" + extraWhere
  ).bind(businessId, ...binds).all();
  return (results || []).map((x) => x.m).filter(Boolean);
}

async function purgeStaleReviewText(env, now, ttl) {
  const cutoff = now - ttl * DAY;
  const { results } = await env.DB.prepare(
    "SELECT bl.business_id AS business_id, b.user_id AS user_id FROM reviews r JOIN business_locations bl ON bl.id=r.business_location_id JOIN businesses b ON b.id=bl.business_id WHERE r.synced_at<? AND " + CONTENT_PRESENT + " GROUP BY bl.business_id, b.user_id"
  ).bind(cutoff).all();
  let total = 0;
  for (const biz of results || []) {
    // 1. aggregates first, from every stored row of the affected months, so trends survive the purge.
    const months = await monthsOf(env, biz.business_id, " AND r.synced_at<? AND " + CONTENT_PRESENT, [cutoff]);
    await recomputeAggregates(env, biz.business_id, months, now);
    // 2. keep a text-less row (rating, review_time, reply_status, opaque Google resource id for re-sync dedupe).
    const r = await env.DB.prepare(
      "UPDATE reviews SET review_text=NULL, reviewer_display_name=NULL, raw_reference_json=NULL WHERE id IN (SELECT r.id FROM reviews r JOIN business_locations bl ON bl.id=r.business_location_id WHERE bl.business_id=? AND r.synced_at<? AND " + CONTENT_PRESENT + ")"
    ).bind(biz.business_id, cutoff).run();
    total += changes(r);
    await logPurge(env, now, { userId: biz.user_id, businessId: biz.business_id, dataset: "review_text", action: "ttl_purge", rows: changes(r), ttl });
  }
  return total;
}

async function disconnectedUsers(env) {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT u FROM (" +
    "SELECT b.user_id AS u FROM businesses b JOIN business_locations bl ON bl.business_id=b.id JOIN reviews r ON r.business_location_id=bl.id " +
    "UNION SELECT gl.user_id FROM google_locations gl WHERE gl.raw_json<>'{}' " +
    "UNION SELECT m.user_id FROM search_console_metrics m " +
    "UNION SELECT p.user_id FROM performance_metrics p WHERE p.raw_reference_json IS NOT NULL" +
    ") WHERE u NOT IN (SELECT user_id FROM google_connections) LIMIT 500"
  ).bind().all();
  return (results || []).map((x) => x.u);
}

async function purgeDisconnectedUser(env, now, userId, profileTtl) {
  const out = { review_rows_deleted: 0, review_text_cleared: 0, locations_cleared: 0, gsc_rows: 0, perf_raw_cleared: 0 };
  const { results: bizs } = await env.DB.prepare("SELECT id FROM businesses WHERE user_id=?").bind(userId).all();
  for (const { id: businessId } of bizs || []) {
    // aggregates first (all months), then remove review content/rows.
    await recomputeAggregates(env, businessId, await monthsOf(env, businessId, "", []), now);
    const locIds = "(SELECT id FROM business_locations WHERE business_id=?)";
    let del;
    try {
      del = await env.DB.prepare("DELETE FROM reviews WHERE business_location_id IN " + locIds + " AND id NOT IN (SELECT review_id FROM review_replies)").bind(businessId).run();
    } catch { // review_replies missing: nothing references reviews
      del = await env.DB.prepare("DELETE FROM reviews WHERE business_location_id IN " + locIds).bind(businessId).run();
    }
    const clr = await env.DB.prepare(
      "UPDATE reviews SET review_text=NULL, reviewer_display_name=NULL, raw_reference_json=NULL WHERE business_location_id IN " + locIds + " AND (review_text IS NOT NULL OR reviewer_display_name IS NOT NULL OR raw_reference_json IS NOT NULL)"
    ).bind(businessId).run();
    out.review_rows_deleted += changes(del); out.review_text_cleared += changes(clr);
    await logPurge(env, now, { userId, businessId, dataset: "review_rows", action: "disconnect_purge", rows: changes(del) });
    await logPurge(env, now, { userId, businessId, dataset: "review_text", action: "disconnect_purge", rows: changes(clr) });
  }
  // google_locations raw_json: rows past the profile TTL first (ttl_purge), then everything else (disconnect_purge).
  const stale = await env.DB.prepare("UPDATE google_locations SET raw_json='{}' WHERE user_id=? AND raw_json<>'{}' AND synced_at<?").bind(userId, now - profileTtl * DAY).run();
  await logPurge(env, now, { userId, dataset: "google_locations_raw", action: "ttl_purge", rows: changes(stale), ttl: profileTtl });
  const rest = await env.DB.prepare("UPDATE google_locations SET raw_json='{}' WHERE user_id=? AND raw_json<>'{}'").bind(userId).run();
  out.locations_cleared = changes(stale) + changes(rest);
  await logPurge(env, now, { userId, dataset: "google_locations_raw", action: "disconnect_purge", rows: changes(rest) });
  const gsc = await env.DB.prepare("DELETE FROM search_console_metrics WHERE user_id=?").bind(userId).run();
  out.gsc_rows = changes(gsc);
  await logPurge(env, now, { userId, dataset: "search_console", action: "disconnect_purge", rows: changes(gsc) });
  const perf = await env.DB.prepare("UPDATE performance_metrics SET raw_reference_json=NULL WHERE user_id=? AND raw_reference_json IS NOT NULL").bind(userId).run();
  out.perf_raw_cleared = changes(perf);
  await logPurge(env, now, { userId, dataset: "performance_raw", action: "disconnect_purge", rows: changes(perf) });
  return out;
}

export async function runRetention(env, now = Date.now()) {
  if (!env.DB) return { skipped: true };
  const reviewTtl = reviewTtlDays(env), profileTtl = profileTtlDays(env), gscTtl = searchConsoleTtlDays(env);
  const summary = { review_text_purged: 0, disconnected_users: 0, search_console_rows_expired: 0, competitor_places_expired: 0, errors: 0 };
  const step = async (fn) => { try { await fn(); } catch { summary.errors++; } };

  await step(async () => { summary.review_text_purged = await purgeStaleReviewText(env, now, reviewTtl); });
  await step(async () => {
    for (const uid of await disconnectedUsers(env)) {
      try { await purgeDisconnectedUser(env, now, uid, profileTtl); summary.disconnected_users++; } catch { summary.errors++; }
    }
  });
  await step(async () => {
    const cutoffDate = new Date(now - gscTtl * DAY).toISOString().slice(0, 10);
    const r = await env.DB.prepare("DELETE FROM search_console_metrics WHERE date<?").bind(cutoffDate).run();
    summary.search_console_rows_expired = changes(r);
    await logPurge(env, now, { dataset: "search_console", action: "ttl_purge", rows: changes(r), ttl: gscTtl });
  });
  await step(async () => {
    const cand = await env.DB.prepare("DELETE FROM competitor_place_candidates WHERE fetched_at<?").bind(now - DAY).run();
    const data = await env.DB.prepare("DELETE FROM competitor_places_data WHERE fetched_at<?").bind(now - profileTtl * DAY).run();
    summary.competitor_places_expired = changes(data);
    await logPurge(env, now, { dataset: "competitor_places", action: "ttl_purge", rows: changes(cand) + changes(data), ttl: profileTtl });
  });
  await step(async () => { await env.DB.prepare("DELETE FROM data_retention_log WHERE created_at<?").bind(now - 400 * DAY).run(); });
  return summary;
}

export const jobs = [{ name: "google-data-retention", run: (env) => runRetention(env) }];
