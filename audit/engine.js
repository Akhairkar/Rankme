/* LocalBoost audit engine: evidence-based client-side checks.
   It never invents scores. Server-side persistence can consume the returned result later. */
(function(){
  "use strict";
  function normalizeUrl(value){
    if(!value) return "";
    try { const u=new URL(value); return /^https?:$/.test(u.protocol) ? u.href : ""; }
    catch(e){ return ""; }
  }
  function analyzeDocument(doc,url){
    const issues=[];
    const title=(doc.querySelector("title")||{}).textContent?.trim()||"";
    const description=(doc.querySelector('meta[name="description"]')||{}).getAttribute?.("content")?.trim()||"";
    const h1=doc.querySelectorAll("h1").length;
    const canonical=(doc.querySelector('link[rel="canonical"]')||{}).getAttribute?.("href")||"";
    const viewport=!!doc.querySelector('meta[name="viewport"]');
    const robots=doc.querySelector('meta[name="robots"]')?.getAttribute("content")||"";
    const schema=[...doc.querySelectorAll('script[type="application/ld+json"]')];
    if(!title) issues.push({code:"missing-title",severity:"high",category:"On-page SEO",message:"Page title is missing."});
    else if(title.length<30||title.length>60) issues.push({code:"title-length",severity:"medium",category:"On-page SEO",message:"Page title length should be reviewed for search-result clarity."});
    if(!description) issues.push({code:"missing-description",severity:"medium",category:"On-page SEO",message:"Meta description is missing."});
    else if(description.length<70||description.length>160) issues.push({code:"description-length",severity:"low",category:"On-page SEO",message:"Meta description length should be reviewed."});
    if(h1===0) issues.push({code:"missing-h1",severity:"high",category:"Content",message:"No H1 heading was found."});
    if(h1>1) issues.push({code:"multiple-h1",severity:"medium",category:"Content",message:"Multiple H1 headings were found."});
    if(!canonical) issues.push({code:"missing-canonical",severity:"medium",category:"Technical SEO",message:"Canonical URL was not found."});
    if(!viewport) issues.push({code:"missing-viewport",severity:"medium",category:"Technical SEO",message:"Mobile viewport metadata was not found."});
    if(/noindex/i.test(robots)) issues.push({code:"noindex",severity:"high",category:"Technical SEO",message:"The page declares noindex and may be excluded from search indexing."});
    if(!schema.length) issues.push({code:"no-schema",severity:"low",category:"Structured data",message:"No JSON-LD structured data was detected on this page."});
    return {url,title,description,h1,canonical,viewport,robots,schemaCount:schema.length,issues};
  }
  async function auditWebsite(input){
    const url=normalizeUrl(input);
    if(!url) throw new Error("Enter a valid http:// or https:// website URL.");
    const startedAt=new Date().toISOString();
    const response=await fetch(url,{redirect:"follow",credentials:"omit"});
    if(!response.ok) throw new Error("Website returned HTTP "+response.status+".");
    const type=response.headers.get("content-type")||"";
    if(!/text\/html/i.test(type)) throw new Error("The supplied URL did not return an HTML page.");
    const html=await response.text();
    const doc=new DOMParser().parseFromString(html,"text/html");
    const result=analyzeDocument(doc,response.url||url);
    return {version:1,startedAt,completedAt:new Date().toISOString(),status:"complete",pages:[result],issues:result.issues};
  }
  window.LocalBoostAudit={auditWebsite,analyzeDocument,normalizeUrl};
})();