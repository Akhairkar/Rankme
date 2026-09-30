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
  const now=Date.now(), keywordId=id("kw");
  await env.DB.prepare(
    "INSERT INTO keywords (id,business_id,keyword,location_name,device,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)"
  ).bind(keywordId,businessId,input.keyword,input.location_name,input.device||"desktop",now,now).run();
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

export async function listReviews(env, userId, businessId) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    "SELECT r.* FROM reviews r JOIN business_locations bl ON bl.id=r.business_location_id JOIN businesses b ON b.id=bl.business_id WHERE bl.business_id=? AND b.user_id=? ORDER BY r.review_time DESC LIMIT 100"
  ).bind(businessId,userId).all();
  return results || [];
}
