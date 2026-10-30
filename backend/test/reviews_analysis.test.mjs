import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { routes, jobs, sentimentOf, topicsOf, analyzeBusiness, runRetention, bucketMonths, monthKey, reviewTtlDays, searchConsoleTtlDays, profileTtlDays } from "../src/reviews_analysis.js";

export function makeDB(files = ["000_base.sql", "001_rate_limits.sql", "010_google.sql", "020_billing.sql", "040_rank.sql", "100_reviews_competitors.sql"]) {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const f of files) sql.exec(readFileSync(fileURLToPath(new URL("../migrations/" + f, import.meta.url)), "utf8"));
  const norm = (a) => a.map((x) => (x === undefined ? null : x));
  return {
    sql,
    prepare(q) {
      return {
        bind(...a) {
          return {
            async first() { return sql.prepare(q).get(...norm(a)) || null; },
            async all() { return { results: sql.prepare(q).all(...norm(a)) }; },
            async run() { const r = sql.prepare(q).run(...norm(a)); return { meta: { changes: Number(r.changes) } }; },
          };
        },
      };
    },
  };
}
const NOW = Date.UTC(2026, 9, 30, 12);
const DAY = 86400000;
function ctxFor(db, userId, url, extra = {}) {
  return {
    env: { DB: db, ...(extra.env || {}) }, url: new URL(url), userId, ip: "1.1.1.1",
    json: (d, s = 200) => Response.json(d, { status: s }), now: () => NOW,
    getUserBusiness: (id) => db.prepare("SELECT * FROM businesses WHERE id=? AND user_id=? LIMIT 1").bind(id, userId).first(),
    requireFeature: async () => ({ ok: true }), rateLimit: async () => ({ ok: true }), ...(extra.ctx || {}),
  };
}
const R = (m, p) => routes.find((r) => r.method === m && r.path === p);

function seed(db) {
  const s = db.sql;
  for (const u of ["uA", "uB"]) s.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?)").run(u, "g_" + u, u + "@x.in", "N", null, 1, 1);
  for (const [b, u] of [["bA", "uA"], ["bB", "uB"]]) {
    s.prepare("INSERT INTO businesses (id,user_id,name,category,city,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(b, u, "Biz " + b, "Cafe", "Pune", "active", 1, 1);
    s.prepare("INSERT INTO business_locations (id,business_id,name,created_at,updated_at) VALUES (?,?,?,?,?)").run("loc" + b, b, "L", 1, 1);
    s.prepare("INSERT INTO google_connections VALUES (?,?,?,?)").run(u, "CIPHER", "business.manage", 1);
  }
}
let seq = 0;
function review(db, biz, o) {
  db.sql.prepare("INSERT INTO reviews (id,business_location_id,google_review_name,reviewer_display_name,rating,review_text,review_time,reply_status,raw_reference_json,synced_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(o.id || "r" + ++seq, "loc" + biz, "g/" + seq, o.name === undefined ? "Some Person" : o.name, o.rating ?? null, o.text ?? null, o.time ?? null, o.status || "unanswered", o.raw === undefined ? '{"raw":1}' : o.raw, o.synced ?? NOW);
}

test("sentiment: English, Devanagari Hindi and Hinglish fixtures", () => {
  const cases = [
    ["Excellent service, very friendly staff", 5, "positive"],
    ["Staff was rude and the place was dirty", 1, "negative"],
    ["बहुत अच्छा अनुभव, धन्यवाद", null, "positive"],
    ["सर्विस बहुत खराब, महंगा भी", null, "negative"],
    ["service bahut ganda hai, mehnga bhi", 2, "negative"],
    ["Bahut badhiya service, staff mast hai", 4, "positive"],
    ["accha nahi laga", null, "negative"],
    ["not bad at all", null, "positive"],
    ["gandaaaa experience", null, "negative"],
    ["It was okay", 3, "neutral"],
    ["Slow service but great food", 5, "positive"],       // stars dominate lexicon
    ["good good good", 2, "negative"],                    // 2 stars: -2 + 1 = -1
    ["amazing, best, love it", 3, "positive"],            // 3 stars: lexicon decides
    ["I would not recommend", null, "negative"],
    [null, 5, "positive"],
    [null, 1, "negative"],
  ];
  for (const [text, rating, want] of cases) assert.equal(sentimentOf(text, rating).label, want, `${text} / ${rating}`);
  assert.equal(sentimentOf(null, null), null);
  assert.equal(sentimentOf("   ", undefined), null);
});

test("topics: lexicon hits across languages", () => {
  const t = (s) => topicsOf(s).map((x) => x.topic).sort();
  assert.deepEqual(t("Staff was rude and we had a long wait. Parking is easy."), ["location_parking", "staff", "wait_time"]);
  assert.deepEqual(t("kaafi mehnga hai, bill bahut zyada"), ["price"]);
  assert.deepEqual(t("डिलीवरी में देरी हुई और सफाई भी ठीक नहीं"), ["cleanliness", "delivery", "wait_time"]);
  assert.deepEqual(t("Good quality, tasty and fresh"), ["quality"]);
  assert.deepEqual(t("nothing relevant here"), []);
  assert.deepEqual(t(null), []);
});

test("bucketMonths trend math", () => {
  const m = bucketMonths([
    { rating: 5, review_time: Date.UTC(2026, 0, 5), reply_status: "answered" },
    { rating: 3, review_time: Date.UTC(2026, 0, 20), reply_status: "unanswered" },
    { rating: null, review_time: Date.UTC(2026, 0, 21), reply_status: "unknown" },
    { rating: 1, review_time: Date.UTC(2026, 1, 1), reply_status: "answered" },
    { rating: 4, review_time: null, reply_status: "answered" },
  ]);
  const jan = m.get("2026-01");
  assert.equal(jan.count, 3); assert.equal(jan.rated, 2); assert.equal(jan.sum / jan.rated, 4); assert.deepEqual(jan.dist, [0, 0, 1, 0, 1]); assert.equal(jan.answered, 1);
  assert.equal(m.get("2026-02").count, 1);
  assert.equal(m.size, 2);
  assert.equal(monthKey(Date.UTC(2026, 11, 31, 23, 59)), "2026-12");
});

test("TTL env config: defaults and overrides", () => {
  assert.equal(reviewTtlDays({}), 30); assert.equal(profileTtlDays({}), 30); assert.equal(searchConsoleTtlDays({}), 540);
  assert.equal(reviewTtlDays({ GOOGLE_REVIEW_CONTENT_TTL_DAYS: "7" }), 7);
  assert.equal(reviewTtlDays({ GOOGLE_REVIEW_CONTENT_TTL_DAYS: "abc" }), 30);
  assert.equal(reviewTtlDays({ GOOGLE_REVIEW_CONTENT_TTL_DAYS: "0" }), 30);
  assert.equal(searchConsoleTtlDays({ GOOGLE_SEARCH_CONSOLE_TTL_DAYS: "90" }), 90);
});

test("analysis: empty state when no stored reviews", async () => {
  const db = makeDB(); seed(db);
  const res = await R("GET", "/api/reviews/analysis").handler(new Request("https://x/"), ctxFor(db, "uA", "https://x/api/reviews/analysis?business_id=bA"));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.empty, true); assert.equal(j.state, "no_reviews"); assert.equal(j.method, "rating+lexicon");
  assert.equal(j.coverage.total_stored, 0); assert.equal(j.data_freshness.latest_review_fetch_at, null);
  assert.equal(j.rating_distribution, null); assert.deepEqual(j.topics, []);
});

test("analysis: distribution, trend, unanswered, sentiment, topics, snippets, freshness, coverage", async () => {
  const db = makeDB(); seed(db);
  const t = (y, m, d) => Date.UTC(y, m - 1, d);
  const long = "Staff was rude. " + "The waiting time was very long and nobody cared. ".repeat(8);
  review(db, "bA", { rating: 5, text: "Excellent service and friendly staff", time: t(2026, 10, 10), status: "answered", synced: NOW - 1000 });
  review(db, "bA", { rating: 1, text: long, time: t(2026, 10, 12), synced: NOW - 500 });
  review(db, "bA", { rating: 4, text: "बहुत अच्छा, सफाई बढ़िया", time: t(2026, 9, 3), status: "answered", synced: NOW - 1500 });
  review(db, "bA", { rating: 2, text: "mehnga aur service ganda", time: t(2026, 9, 4), synced: NOW - 1700 });
  review(db, "bA", { rating: 3, text: null, time: t(2026, 9, 5), synced: NOW - 1800 });
  review(db, "bA", { rating: null, text: null, time: null, synced: NOW - 1900 }); // unclassifiable and undated
  review(db, "bB", { rating: 1, text: "SECRET_OTHER_TENANT", time: t(2026, 10, 1) });
  const res = await R("GET", "/api/reviews/analysis").handler(new Request("https://x/"), ctxFor(db, "uA", "https://x/api/reviews/analysis?business_id=bA"));
  const j = await res.json();
  assert.equal(j.state, "verified_data");
  assert.deepEqual(j.rating_distribution.counts, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 });
  assert.equal(j.rating_distribution.average_rating, 3);
  assert.deepEqual(j.monthly_trend.map((m) => [m.month, m.count, m.average_rating, m.source]), [["2026-09", 3, 3, "rows"], ["2026-10", 2, 3, "rows"]]);
  assert.equal(j.unanswered.count, 4); // 6 stored, 2 answered
  assert.equal(j.unanswered.share, Math.round((4 / 6) * 10000) / 10000);
  assert.equal(j.reply_latency.value, null); assert.ok(j.reply_latency.reason);
  assert.equal(j.method, "rating+lexicon");
  assert.deepEqual([j.sentiment.positive, j.sentiment.neutral, j.sentiment.negative, j.sentiment.classified], [2, 1, 2, 5]);
  assert.equal(j.data_freshness.latest_review_fetch_at, NOW - 500);
  assert.equal(j.coverage.total_stored, 6); assert.equal(j.coverage.reviews_analysed, 5); assert.equal(j.coverage.undated, 1);
  const byTopic = Object.fromEntries(j.topics.map((x) => [x.topic, x]));
  assert.ok(byTopic.staff.count >= 2 && byTopic.wait_time.count >= 1 && byTopic.cleanliness.count >= 1 && byTopic.price.count === 1);
  for (const tp of j.topics) {
    assert.ok(tp.snippets.length <= 3);
    for (const sn of tp.snippets) assert.ok(sn.length <= 140);
  }
  assert.ok(byTopic.wait_time.snippets.some((s) => s.length === 140 || s.includes("wait")));
  assert.ok(!JSON.stringify(j).includes("SECRET_OTHER_TENANT"));
});

test("analysis: reply latency from review_replies when present", async () => {
  const db = makeDB(); seed(db);
  review(db, "bA", { id: "rx", rating: 5, text: "great", time: NOW - 10 * DAY, status: "answered" });
  review(db, "bA", { id: "ry", rating: 5, text: "great", time: NOW - 10 * DAY, status: "answered" });
  const ins = db.sql.prepare("INSERT INTO review_replies (id,user_id,business_id,review_id,reply_text,status,confirmed_at,posted_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)");
  ins.run("p1", "uA", "bA", "rx", "Thanks!", "posted", 1, NOW - 10 * DAY + 2 * 3600000, 1);
  ins.run("p2", "uA", "bA", "ry", "Thanks!", "posted", 1, NOW - 10 * DAY + 6 * 3600000, 2);
  const j = await analyzeBusiness({ DB: db }, "bA", NOW);
  assert.deepEqual(j.reply_latency.value, { sample_size: 2, median_hours: 4, average_hours: 4 });
});

test("analysis and reply-history: tenant isolation, validation, plan gate", async () => {
  const db = makeDB(); seed(db);
  review(db, "bB", { rating: 5, text: "B only", time: NOW });
  db.sql.prepare("INSERT INTO review_replies (id,user_id,business_id,review_id,reply_text,status,confirmed_at,created_at) VALUES ('q','uB','bB',(SELECT id FROM reviews LIMIT 1),'B_REPLY','posted',1,1)").run();
  for (const p of ["/api/reviews/analysis", "/api/reviews/reply-history"]) {
    const h = R("GET", p).handler;
    assert.equal((await h(new Request("https://x/"), ctxFor(db, "uA", `https://x${p}?business_id=bB`))).status, 404);
    assert.equal((await h(new Request("https://x/"), ctxFor(db, "uA", `https://x${p}`))).status, 400);
    const denied = await h(new Request("https://x/"), ctxFor(db, "uA", `https://x${p}?business_id=bA`, { ctx: { requireFeature: async () => ({ ok: false }) } }));
    assert.equal(denied.status, 403);
    const limited = await h(new Request("https://x/"), ctxFor(db, "uA", `https://x${p}?business_id=bA`, { ctx: { rateLimit: async () => ({ ok: false }) } }));
    assert.equal(limited.status, 429);
  }
  const mine = await (await R("GET", "/api/reviews/reply-history").handler(new Request("https://x/"), ctxFor(db, "uB", "https://x/api/reviews/reply-history?business_id=bB"))).json();
  assert.equal(mine.replies.length, 1); assert.equal(mine.replies[0].reply_text, "B_REPLY");
  const none = await (await R("GET", "/api/reviews/reply-history").handler(new Request("https://x/"), ctxFor(db, "uA", "https://x/api/reviews/reply-history?business_id=bA"))).json();
  assert.deepEqual(none.replies, []);
});

test("reply-history degrades when review_replies table is missing", async () => {
  const db = makeDB(["000_base.sql", "001_rate_limits.sql", "100_reviews_competitors.sql"]); seed(db);
  const j = await (await R("GET", "/api/reviews/reply-history").handler(new Request("https://x/"), ctxFor(db, "uA", "https://x/api/reviews/reply-history?business_id=bA"))).json();
  assert.equal(j.state, "unavailable"); assert.deepEqual(j.replies, []);
  const a = await analyzeBusiness({ DB: db }, "bA", NOW);
  assert.equal(a.empty, true);
});

test("retention job: aggregates computed BEFORE purge, text removed, analysis reads aggregates for old months", async () => {
  const db = makeDB(); seed(db);
  const old = (d) => Date.UTC(2026, 0, d), stale = NOW - 60 * DAY;
  review(db, "bA", { rating: 5, text: "Old great review OLD_TEXT_1", name: "Alice", time: old(5), status: "answered", synced: stale });
  review(db, "bA", { rating: 2, text: "Old bad review OLD_TEXT_2", name: "Bob", time: old(20), synced: stale });
  review(db, "bA", { rating: 4, text: "Fresh review FRESH_TEXT", time: NOW - 2 * DAY, synced: NOW - DAY });
  const r = await runRetention({ DB: db }, NOW);
  assert.equal(r.review_text_purged, 2); assert.equal(r.errors, 0);
  const rows = db.sql.prepare("SELECT review_text,reviewer_display_name,raw_reference_json,rating,review_time,reply_status FROM reviews ORDER BY review_time").all();
  assert.equal(rows.length, 3);
  assert.deepEqual([rows[0].review_text, rows[0].reviewer_display_name, rows[0].raw_reference_json], [null, null, null]);
  assert.equal(rows[0].rating, 5); assert.equal(rows[0].reply_status, "answered"); // text-less row keeps aggregates inputs
  assert.equal(rows[2].review_text, "Fresh review FRESH_TEXT");
  const agg = db.sql.prepare("SELECT * FROM review_monthly_aggregates WHERE business_id='bA' AND month='2026-01'").get();
  assert.deepEqual([agg.count, agg.avg_rating, agg.five, agg.two, agg.answered_count], [2, 3.5, 1, 1, 1]);
  // the fresh month was not touched by the purge
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM review_monthly_aggregates").get().n, 1);
  // even if the old rows are gone entirely, trends survive via aggregates
  db.sql.prepare("DELETE FROM reviews WHERE review_time<?").run(Date.UTC(2026, 1, 1));
  const a = await analyzeBusiness({ DB: db }, "bA", NOW);
  const jan = a.monthly_trend.find((m) => m.month === "2026-01");
  assert.deepEqual([jan.count, jan.average_rating, jan.source], [2, 3.5, "aggregate"]);
  assert.equal(a.coverage.aggregate_months, 1);
  assert.deepEqual(a.rating_distribution.counts, { 1: 0, 2: 1, 3: 0, 4: 1, 5: 1 });
  assert.equal(a.monthly_trend.find((m) => m.month === "2026-10").source, "rows");
  // log has counts only
  const log = db.sql.prepare("SELECT * FROM data_retention_log WHERE dataset='review_text'").all();
  assert.equal(log.length, 1); assert.equal(log[0].rows_affected, 2); assert.equal(log[0].action, "ttl_purge"); assert.equal(log[0].ttl_days, 30);
  assert.ok(!JSON.stringify(db.sql.prepare("SELECT * FROM data_retention_log").all()).includes("OLD_TEXT"));
  // idempotent
  assert.equal((await runRetention({ DB: db }, NOW)).review_text_purged, 0);
});

test("retention job: TTL is configurable", async () => {
  const db = makeDB(); seed(db);
  review(db, "bA", { rating: 5, text: "ten days old", time: NOW - 10 * DAY, synced: NOW - 10 * DAY });
  assert.equal((await runRetention({ DB: db }, NOW)).review_text_purged, 0);
  assert.equal((await runRetention({ DB: db, GOOGLE_REVIEW_CONTENT_TTL_DAYS: "7" }, NOW)).review_text_purged, 1);
  assert.equal(db.sql.prepare("SELECT review_text FROM reviews").get().review_text, null);
});

test("retention job: Search Console rows past TTL and stale competitor Places data are expired", async () => {
  const db = makeDB(); seed(db);
  db.sql.prepare("INSERT INTO search_console_properties (id,user_id,business_id,property_url,property_type,created_at,updated_at) VALUES ('sp','uA','bA','https://a.in/','url_prefix',1,1)").run();
  const ins = db.sql.prepare("INSERT INTO search_console_metrics (id,user_id,business_id,property_id,date,clicks,query_text,created_at) VALUES (?,?,?,?,?,?,?,?)");
  ins.run("m1", "uA", "bA", "sp", "2024-01-01", 1, "old query", 1);
  ins.run("m2", "uA", "bA", "sp", "2026-10-01", 1, "new query", 1);
  db.sql.prepare("INSERT INTO competitor_profiles (id,business_id,name,created_at,updated_at) VALUES ('c1','bA','Rival',1,1)").run();
  db.sql.prepare("INSERT INTO competitor_places_data (competitor_id,place_id,rating,fetched_at) VALUES ('c1','p1',4.5,?)").run(NOW - 40 * DAY);
  db.sql.prepare("INSERT INTO competitor_place_candidates (competitor_id,place_id,data_json,fetched_at) VALUES ('c1','p1','{}',?)").run(NOW - 2 * DAY);
  const r = await runRetention({ DB: db }, NOW);
  assert.equal(r.search_console_rows_expired, 1);
  assert.deepEqual(db.sql.prepare("SELECT id FROM search_console_metrics").all().map((x) => x.id), ["m2"]);
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM competitor_places_data").get().n, 0);
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM competitor_place_candidates").get().n, 0);
  assert.equal(db.sql.prepare("SELECT place_id FROM competitor_profiles").get().place_id, null); // place_id itself is not Places content; profile row is untouched
});

test("retention job: disconnect purges cached Google content within one run; connected users untouched", async () => {
  const db = makeDB(); seed(db);
  db.sql.prepare("DELETE FROM google_connections WHERE user_id='uA'").run(); // uA disconnected
  review(db, "bA", { id: "keep", rating: 5, text: "REPLIED_TEXT", name: "Zed", time: Date.UTC(2026, 9, 1), status: "answered" });
  review(db, "bA", { id: "gone", rating: 1, text: "DELETE_ME", time: Date.UTC(2026, 9, 2) });
  review(db, "bB", { id: "b1", rating: 5, text: "B_TEXT", time: Date.UTC(2026, 9, 2) });
  db.sql.prepare("INSERT INTO review_replies (id,user_id,business_id,review_id,reply_text,status,confirmed_at,created_at) VALUES ('rp','uA','bA','keep','Our reply','posted',1,1)").run();
  const loc = db.sql.prepare("INSERT INTO google_locations VALUES (?,?,?,?,?,?)");
  loc.run("uA", "accounts/1/locations/1", "accounts/1", "locations/1", '{"title":"A_PROFILE"}', NOW - DAY);
  loc.run("uA", "accounts/1/locations/2", "accounts/1", "locations/2", '{"title":"A_OLD"}', NOW - 90 * DAY);
  loc.run("uB", "accounts/2/locations/1", "accounts/2", "locations/1", '{"title":"B_PROFILE"}', NOW - 90 * DAY);
  db.sql.prepare("INSERT INTO search_console_properties (id,user_id,business_id,property_url,property_type,created_at,updated_at) VALUES ('spA','uA','bA','https://a.in/','url_prefix',1,1),('spB','uB','bB','https://b.in/','url_prefix',1,1)").run();
  db.sql.prepare("INSERT INTO search_console_metrics (id,user_id,business_id,property_id,date,query_text,created_at) VALUES ('mA','uA','bA','spA','2026-10-01','qa',1),('mB','uB','bB','spB','2026-10-01','qb',1)").run();
  db.sql.prepare("INSERT INTO performance_metrics (id,user_id,business_id,checked_at,impressions,raw_reference_json) VALUES ('pA','uA','bA',1,100,'{\"x\":1}'),('pB','uB','bB',1,50,'{\"x\":1}')").run();

  const r = await runRetention({ DB: db }, NOW);
  assert.equal(r.disconnected_users, 1); assert.equal(r.errors, 0);
  // aggregates preserved, rows without replies deleted, replied row kept text-less
  assert.equal(db.sql.prepare("SELECT count FROM review_monthly_aggregates WHERE business_id='bA' AND month='2026-10'").get().count, 2);
  assert.deepEqual(db.sql.prepare("SELECT id,review_text,reviewer_display_name,raw_reference_json FROM reviews WHERE id IN ('keep','gone')").all().map((x) => ({ ...x })), [{ id: "keep", review_text: null, reviewer_display_name: null, raw_reference_json: null }]);
  assert.equal(db.sql.prepare("SELECT reply_text FROM review_replies WHERE id='rp'").get().reply_text, "Our reply"); // user-authored data stays
  assert.deepEqual(db.sql.prepare("SELECT raw_json FROM google_locations WHERE user_id='uA'").all().map((x) => x.raw_json), ["{}", "{}"]);
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM search_console_metrics WHERE user_id='uA'").get().n, 0);
  assert.equal(db.sql.prepare("SELECT raw_reference_json FROM performance_metrics WHERE id='pA'").get().raw_reference_json, null);
  assert.equal(db.sql.prepare("SELECT impressions FROM performance_metrics WHERE id='pA'").get().impressions, 100); // derived number kept
  // connected user B untouched
  assert.equal(db.sql.prepare("SELECT review_text FROM reviews WHERE id='b1'").get().review_text, "B_TEXT");
  assert.equal(db.sql.prepare("SELECT raw_json FROM google_locations WHERE user_id='uB'").get().raw_json, '{"title":"B_PROFILE"}');
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM search_console_metrics WHERE user_id='uB'").get().n, 1);
  // log: counts only, per dataset
  const log = db.sql.prepare("SELECT dataset,action,rows_affected,user_id FROM data_retention_log WHERE user_id='uA'").all();
  assert.ok(log.some((l) => l.dataset === "review_rows" && l.action === "disconnect_purge" && l.rows_affected === 1));
  assert.ok(log.some((l) => l.dataset === "search_console" && l.rows_affected === 1));
  assert.ok(log.some((l) => l.dataset === "google_locations_raw" && l.action === "ttl_purge" && l.rows_affected === 1));
  assert.ok(log.some((l) => l.dataset === "google_locations_raw" && l.action === "disconnect_purge" && l.rows_affected === 1));
  const dump = JSON.stringify(db.sql.prepare("SELECT * FROM data_retention_log").all());
  for (const s of ["DELETE_ME", "REPLIED_TEXT", "A_PROFILE", "qa"]) assert.ok(!dump.includes(s));
  // trends survive disconnect through aggregates
  const a = await analyzeBusiness({ DB: db }, "bA", NOW);
  assert.equal(a.empty, false);
  assert.equal(a.monthly_trend[0].count, 2);
  // second run is a no-op for this user
  const again = await runRetention({ DB: db }, NOW);
  assert.equal(again.errors, 0);
});

test("module exports the google-data-retention job", () => {
  assert.equal(jobs.length, 1); assert.equal(jobs[0].name, "google-data-retention");
  assert.equal(typeof jobs[0].run, "function");
});
