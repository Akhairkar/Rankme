export function id(prefix = "lb") {
  return prefix + "_" + crypto.randomUUID().replaceAll("-", "");
}

export async function getUserBusiness(env, userId, businessId) {
  if (!env.DB) return null;
  return env.DB.prepare("SELECT * FROM businesses WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(businessId, userId).first();
}

export async function listBusinesses(env, userId) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    "SELECT id,name,category,city,phone,website_url,status,created_at,updated_at FROM businesses WHERE user_id = ? ORDER BY updated_at DESC"
  ).bind(userId).all();
  return results || [];
}

export async function listKeywords(env, userId, businessId) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    "SELECT k.id,k.keyword,k.location_name,k.device,k.active,k.created_at,k.updated_at FROM keywords k JOIN businesses b ON b.id=k.business_id WHERE b.user_id=? AND k.business_id=? ORDER BY k.created_at DESC"
  ).bind(userId, businessId).all();
  return results || [];
}

export async function createBusiness(env, userId, input) {
  if (!env.DB) throw new Error("Database unavailable");
  const now = Date.now(), businessId = id("biz");
  await env.DB.prepare(
    "INSERT INTO businesses (id,user_id,name,category,website_url,phone,city,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'active',?,?)"
  ).bind(businessId,userId,input.name,input.category,input.website_url||null,input.phone||null,input.city,now,now).run();
  return getUserBusiness(env,userId,businessId);
}

export async function createKeyword(env, userId, businessId, input) {
  if (!env.DB) throw new Error("Database unavailable");
  const business = await getUserBusiness(env,userId,businessId);
  if (!business) return null;
  const now=Date.now(), device=input.device||"desktop";
  const existing=await env.DB.prepare(
    "SELECT * FROM keywords WHERE business_id=? AND keyword=? AND location_name=? AND device=? AND active=1 LIMIT 1"
  ).bind(businessId,input.keyword,input.location_name,device).first();
  if(existing) return existing;
  const keywordId=id("kw");
  await env.DB.prepare(
    "INSERT INTO keywords (id,business_id,keyword,location_name,device,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)"
  ).bind(keywordId,businessId,input.keyword,input.location_name,device,now,now).run();
  return env.DB.prepare("SELECT * FROM keywords WHERE id=?").bind(keywordId).first();
}


export async function listRankSnapshots(env, userId, businessId, keywordId) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    "SELECT r.id,r.keyword_id,r.checked_at,r.position,r.visibility,r.ranking_url,r.provider FROM rank_snapshots r JOIN keywords k ON k.id=r.keyword_id JOIN businesses b ON b.id=k.business_id WHERE b.user_id=? AND b.id=? AND k.id=? ORDER BY r.checked_at DESC LIMIT 100"
  ).bind(userId,businessId,keywordId).all();
  return results || [];
}

export async function createRankSnapshot(env, userId, businessId, keywordId, input) {
  if (!env.DB) throw new Error("Database unavailable");
  const keyword = await env.DB.prepare(
    "SELECT k.id FROM keywords k JOIN businesses b ON b.id=k.business_id WHERE k.id=? AND k.business_id=? AND b.user_id=? LIMIT 1"
  ).bind(keywordId,businessId,userId).first();
  if (!keyword) return null;
  const snapshotId = id("rank");
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO rank_snapshots (id,keyword_id,checked_at,position,visibility,ranking_url,provider,raw_reference_json) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(snapshotId,keywordId,input.checked_at||now,input.position??null,input.visibility??null,input.ranking_url||null,input.provider||null,input.raw_reference_json||null).run();
  return env.DB.prepare("SELECT * FROM rank_snapshots WHERE id=?").bind(snapshotId).first();
}

export async function listActionItems(env, userId, businessId) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    "SELECT a.* FROM action_items a JOIN businesses b ON b.id=a.business_id WHERE a.business_id=? AND b.user_id=? ORDER BY CASE a.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, a.created_at DESC"
  ).bind(businessId,userId).all();
  return results || [];
}

export async function upsertGoogleReviews(env, userId, businessId, reviews = []) {
  if (!env.DB) throw new Error("Database unavailable");
  const location = await getGoogleLocationForBusiness(env,userId,businessId);
  if (!location || !Array.isArray(reviews)) return { synced: 0, state: "awaiting_google_location" };
  let synced = 0;
  for (const review of reviews) {
    if (!review?.google_review_name) continue;
    const now=Date.now();
    const existing=await env.DB.prepare("SELECT id FROM reviews WHERE google_review_name=? LIMIT 1").bind(review.google_review_name).first();
    if(existing){
      await env.DB.prepare("UPDATE reviews SET reviewer_display_name=?,rating=?,review_text=?,review_time=?,reply_status=?,raw_reference_json=?,synced_at=? WHERE id=?")
        .bind(review.reviewer_display_name,review.rating,review.review_text,review.review_time,review.reply_status,review.raw_reference_json,now,existing.id).run();
    } else {
      const reviewId=id("review");
      await env.DB.prepare("INSERT INTO reviews (id,business_location_id,google_review_name,reviewer_display_name,rating,review_text,review_time,reply_status,raw_reference_json,synced_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(reviewId,location.id,review.google_review_name,review.reviewer_display_name,review.rating,review.review_text,review.review_time,review.reply_status,review.raw_reference_json,now).run();
    }
    synced++;
  }
  return { synced, state: "verified_data", location_id: location.id };
}

export async function getReviewSummary(env, userId, businessId) {
  if (!env.DB) return { count: 0, unanswered: 0, average_rating: null };
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count, SUM(CASE WHEN r.reply_status IN ('unanswered','unknown') THEN 1 ELSE 0 END) AS unanswered, AVG(r.rating) AS average_rating FROM reviews r JOIN business_locations bl ON bl.id=r.business_location_id JOIN businesses b ON b.id=bl.business_id WHERE bl.business_id=? AND b.user_id=?"
  ).bind(businessId,userId).first();
  return {
    count: Number(row?.count || 0),
    unanswered: Number(row?.unanswered || 0),
    average_rating: row?.average_rating == null ? null : Number(row.average_rating)
  };
}

export async function listReviews(env, userId, businessId) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    "SELECT r.id,r.google_review_name,r.reviewer_display_name,r.rating,r.review_text,r.review_time,r.reply_status,r.synced_at FROM reviews r JOIN business_locations bl ON bl.id=r.business_location_id JOIN businesses b ON b.id=bl.business_id WHERE bl.business_id=? AND b.user_id=? ORDER BY r.review_time DESC LIMIT 100"
  ).bind(businessId,userId).all();
  return results || [];
}


export async function listGoogleLocations(env, userId) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    "SELECT resource_name,account_name,location_name,raw_json,synced_at FROM google_locations WHERE user_id=? ORDER BY synced_at DESC"
  ).bind(userId).all();
  return results || [];
}

export async function linkBusinessLocation(env, userId, businessId, input) {
  if (!env.DB) throw new Error("Database unavailable");
  const business = await getUserBusiness(env, userId, businessId);
  if (!business || !input?.name) return null;
  const now=Date.now(), resource=input.google_resource_name||null;
  if (resource) {
    const existing=await env.DB.prepare(
      "SELECT id FROM business_locations WHERE business_id=? AND google_resource_name=? LIMIT 1"
    ).bind(businessId,resource).first();
    if (existing) {
      await env.DB.prepare(
        "UPDATE business_locations SET name=?,address_json=?,latitude=?,longitude=?,sync_status='synced',last_synced_at=?,updated_at=? WHERE id=?"
      ).bind(input.name,input.address_json||null,input.latitude??null,input.longitude??null,input.last_synced_at||now,now,existing.id).run();
      return env.DB.prepare("SELECT * FROM business_locations WHERE id=?").bind(existing.id).first();
    }
  }
  const locationId=id("loc");
  await env.DB.prepare(
    "INSERT INTO business_locations (id,business_id,google_resource_name,name,address_json,latitude,longitude,sync_status,last_synced_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'synced',?,?,?)"
  ).bind(locationId,businessId,resource,input.name,input.address_json||null,input.latitude??null,input.longitude??null,input.last_synced_at||now,now,now).run();
  return env.DB.prepare("SELECT * FROM business_locations WHERE id=?").bind(locationId).first();
}


export async function getGoogleLocationForBusiness(env,userId,businessId){
  if(!env.DB)return null;
  return env.DB.prepare(
    "SELECT bl.id,bl.google_resource_name,bl.name,bl.address_json,bl.latitude,bl.longitude,bl.sync_status,bl.last_synced_at FROM business_locations bl JOIN businesses b ON b.id=bl.business_id WHERE bl.business_id=? AND b.user_id=? ORDER BY bl.updated_at DESC LIMIT 1"
  ).bind(businessId,userId).first();
}

export async function getBusinessLocationSummary(env, userId, businessId) {
  if (!env.DB) return null;
  return env.DB.prepare(
    "SELECT bl.id,bl.google_resource_name,bl.name,bl.address_json,bl.latitude,bl.longitude,bl.sync_status,bl.last_synced_at FROM business_locations bl JOIN businesses b ON b.id=bl.business_id WHERE bl.business_id=? AND b.user_id=? ORDER BY bl.updated_at DESC LIMIT 1"
  ).bind(businessId,userId).first();
}

export async function getLatestVerifiedMetrics(env, userId, businessId) {
  if (!env.DB) return null;
  return env.DB.prepare(
    "SELECT * FROM performance_metrics WHERE business_id=? AND user_id=? ORDER BY checked_at DESC LIMIT 1"
  ).bind(businessId,userId).first();
}

export async function upsertPerformanceMetrics(env, userId, businessId, metrics={}) {
  if (!env.DB) throw new Error("Database unavailable");
  const business = await getUserBusiness(env,userId,businessId);
  if (!business) return null;
  const now=Number(metrics.checked_at||Date.now());
  const metricId=id("perf");
  await env.DB.prepare(
    "INSERT INTO performance_metrics (id,user_id,business_id,checked_at,impressions,website_clicks,call_clicks,direction_requests,search_keyword_impressions,raw_reference_json) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).bind(metricId,userId,businessId,now,metrics.impressions??null,metrics.website_clicks??null,metrics.call_clicks??null,metrics.direction_requests??null,metrics.search_keyword_impressions??null,metrics.raw_reference_json||null).run();
  return env.DB.prepare("SELECT * FROM performance_metrics WHERE id=?").bind(metricId).first();
}

export async function getLatestAudit(env, userId, businessId) {
  if (!env.DB) return null;
  return env.DB.prepare(
    "SELECT a.* FROM audits a JOIN businesses b ON b.id=a.business_id WHERE a.business_id=? AND b.user_id=? ORDER BY a.created_at DESC LIMIT 1"
  ).bind(businessId,userId).first();
}

export async function listAuditIssues(env, userId, businessId, auditId) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    "SELECT i.* FROM audit_issues i JOIN audits a ON a.id=i.audit_id JOIN businesses b ON b.id=a.business_id WHERE i.audit_id=? AND a.business_id=? AND b.user_id=? ORDER BY CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, i.created_at DESC"
  ).bind(auditId,businessId,userId).all();
  return results || [];
}

export async function createAudit(env, userId, businessId, input={}) {
  if (!env.DB) throw new Error("Database unavailable");
  const business = await getUserBusiness(env,userId,businessId);
  if (!business) return null;
  const auditId=id("audit"), now=Date.now();
  await env.DB.prepare(
    "INSERT INTO audits (id,business_id,audit_type,status,score,source_url,started_at,created_at) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(auditId,businessId,input.audit_type||"google_business_profile", "pending", null, input.source_url||null, now, now).run();
  return env.DB.prepare("SELECT * FROM audits WHERE id=?").bind(auditId).first();
}


export async function getReportOverview(env, userId, businessId) {
  if (!env.DB) return null;
  const business = await getUserBusiness(env, userId, businessId);
  if (!business) return null;
  const reviews = await getReviewSummary(env, userId, businessId);
  const keywords = await listKeywords(env, userId, businessId);
  let rankSnapshots = [];
  for (const keyword of keywords.slice(0, 100)) {
    const rows = await listRankSnapshots(env, userId, businessId, keyword.id);
    rankSnapshots.push(...rows.map(r => ({ ...r, keyword: keyword.keyword, location_name: keyword.location_name })));
  }
  rankSnapshots.sort((a,b)=>(b.checked_at||0)-(a.checked_at||0));
  return { business, reviews, keywords, rank_snapshots: rankSnapshots.slice(0,200) };
}


const PLAN_DEFAULTS = {
  free: { max_businesses: 1, max_locations: 1, max_keywords: 5, rank_tracking_enabled: 0, review_monitoring_enabled: 0, reports_enabled: 0, competitor_tracking_enabled: 0 },
  pro: { max_businesses: 1, max_locations: 3, max_keywords: 50, rank_tracking_enabled: 1, review_monitoring_enabled: 1, reports_enabled: 1, competitor_tracking_enabled: 1 },
  agency: { max_businesses: 10, max_locations: 10, max_keywords: 500, rank_tracking_enabled: 1, review_monitoring_enabled: 1, reports_enabled: 1, competitor_tracking_enabled: 1 }
};

export async function getSubscriptionEntitlements(env, userId) {
  if (!env.DB) return { plan_code: "free", status: "unavailable", ...PLAN_DEFAULTS.free };
  const sub = await env.DB.prepare("SELECT plan_code,status,current_period_end FROM subscriptions WHERE user_id=? ORDER BY updated_at DESC LIMIT 1").bind(userId).first();
  const active = sub && ["active","trialing"].includes(sub.status);
  const plan = active && PLAN_DEFAULTS[sub.plan_code] ? sub.plan_code : "free";
  return { plan_code: plan, status: active ? sub.status : "free", current_period_end: active ? sub.current_period_end : null, ...PLAN_DEFAULTS[plan] };
}

export async function countBusinessKeywords(env, userId, businessId) {
  if (!env.DB) return 0;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM keywords k JOIN businesses b ON b.id=k.business_id WHERE k.business_id=? AND b.user_id=? AND k.active=1"
  ).bind(businessId,userId).first();
  return Number(row?.count || 0);
}

export async function countBusinessLocations(env, userId, businessId) {
  if (!env.DB) return 0;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM business_locations bl JOIN businesses b ON b.id=bl.business_id WHERE bl.business_id=? AND b.user_id=?"
  ).bind(businessId,userId).first();
  return Number(row?.count || 0);
}

export async function countUserBusinesses(env, userId) {
  if (!env.DB) return 0;
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM businesses WHERE user_id=? AND status='active'").bind(userId).first();
  return Number(row?.count || 0);
}
