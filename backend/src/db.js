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
