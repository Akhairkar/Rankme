import { listBusinesses, createBusiness, listKeywords, createKeyword, getUserBusiness } from "./db.js";

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
function corsHeaders(request, env) { const origin=request.headers.get("Origin")||""; const allowed=(env.ALLOWED_ORIGINS||"https://localboost.in,https://www.localboost.in").split(",").map(s=>s.trim()).filter(Boolean); return {"access-control-allow-origin":allowed.includes(origin)?origin:allowed[0],"access-control-allow-credentials":"true","access-control-allow-headers":"content-type","access-control-allow-methods":"GET,POST,OPTIONS"}; }
function withCors(response,request,env){const h=new Headers(response.headers);Object.entries(corsHeaders(request,env)).forEach(([k,v])=>h.set(k,v));return new Response(response.body,{status:response.status,headers:h});}
async function health(env){let database="unavailable";if(env.DB){try{await env.DB.prepare("SELECT 1").first();database="ok"}catch(_){database="error"}}return json({ok:true,service:"localboost-api",database});}
async function requestUser(request, env){
  const cookie=request.headers.get("Cookie")||"";
  const m=cookie.match(/(?:^|;\s*)lb_session=([^;]+)/);
  if(!m||!env.DB)return null;
  const raw=decodeURIComponent(m[1]);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
  const idHash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const row=await env.DB.prepare("SELECT user_id FROM sessions WHERE id_hash=? AND expires_at>? LIMIT 1").bind(idHash,Date.now()).first();
  return row?.user_id||null;
}
function validBusiness(x){return x&&typeof x.name==="string"&&x.name.trim()&&typeof x.category==="string"&&x.category.trim()&&typeof x.city==="string"&&x.city.trim();}
export default {async fetch(request,env){if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(request,env)});const url=new URL(request.url);try{
if(url.pathname==="/health"&&request.method==="GET")return withCors(await health(env),request,env);
if(url.pathname==="/api/me"&&request.method==="GET"){const uid=await requestUser(request,env);if(!uid)return withCors(json({authenticated:false,user:null}),request,env);const user=env.DB?await env.DB.prepare("SELECT id,email,name,picture_url FROM users WHERE id=? LIMIT 1").bind(uid).first():null;return withCors(json({authenticated:!!user,user:user||null}),request,env);}
if(url.pathname==="/auth/logout"&&request.method==="POST"){const cookie=request.headers.get("Cookie")||"";const m=cookie.match(/(?:^|;\s*)lb_session=([^;]+)/);if(m&&env.DB){const raw=decodeURIComponent(m[1]);const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));const h=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");await env.DB.prepare("DELETE FROM sessions WHERE id_hash=?").bind(h).run();}return withCors(new Response(null,{status:204,headers:{"Set-Cookie":"lb_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"}}),request,env);}
if(url.pathname==="/api/businesses"&&request.method==="GET"){const uid=requestUser(request,env);if(!uid)return withCors(json({error:"Authentication required"},401),request,env);return withCors(json({businesses:await listBusinesses(env,uid)}),request,env);}
if(url.pathname==="/api/businesses"&&request.method==="POST"){const uid=await requestUser(request,env);if(!uid)return withCors(json({error:"Authentication required"},401),request,env);const body=await request.json().catch(()=>null);if(!validBusiness(body))return withCors(json({error:"name, category and city are required"},400),request,env);const business=await createBusiness(env,uid,{name:body.name.trim(),category:body.category.trim(),city:body.city.trim(),phone:body.phone,website_url:body.website_url});return withCors(json({business},201),request,env);}
if(url.pathname==="/api/keywords"&&request.method==="GET"){const uid=await requestUser(request,env);if(!uid)return withCors(json({error:"Authentication required"},401),request,env);const businessId=url.searchParams.get("business_id");if(!businessId)return withCors(json({error:"business_id is required"},400),request,env);return withCors(json({keywords:await listKeywords(env,uid,businessId)}),request,env);}
if(url.pathname==="/api/keywords"&&request.method==="POST"){const uid=await requestUser(request,env);if(!uid)return withCors(json({error:"Authentication required"},401),request,env);const body=await request.json().catch(()=>null);if(!body||typeof body.keyword!=="string"||typeof body.location_name!=="string")return withCors(json({error:"keyword and location_name are required"},400),request,env);const keyword=await createKeyword(env,uid,body.business_id,{keyword:body.keyword.trim(),location_name:body.location_name.trim(),device:body.device});if(!keyword)return withCors(json({error:"Business not found"},404),request,env);return withCors(json({keyword},201),request,env);}
if(url.pathname==="/api/action-center"&&request.method==="GET")return withCors(json({score:null,actions:[],state:"awaiting_verified_data"}),request,env);
if(url.pathname==="/auth/google/start"&&request.method==="GET"){
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_REDIRECT_URI)return withCors(json({error:"Google OAuth is not configured for production."},503),request,env);
 const state=crypto.randomUUID()+crypto.randomUUID();
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(state));
 const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
 if(!env.DB)return withCors(json({error:"Database unavailable"},503),request,env);
 await env.DB.prepare("INSERT INTO oauth_states(state_hash,created_at) VALUES(?,?)").bind(hash,Date.now()).run();
 const p=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:env.GOOGLE_REDIRECT_URI,response_type:"code",scope:"openid email profile https://www.googleapis.com/auth/business.manage",access_type:"offline",prompt:"consent",state});
 return Response.redirect("https://accounts.google.com/o/oauth2/v2/auth?"+p.toString(),302);
}
if(url.pathname==="/auth/google/callback"&&request.method==="GET"){
 return withCors(json({error:"Google OAuth callback exchange requires production Google credentials and secure token persistence configuration."},503),request,env);
}
return withCors(json({error:"Not found"},404),request,env);
}catch(_){return withCors(json({error:"Internal server error"},500),request,env)}}};
