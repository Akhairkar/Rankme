#!/usr/bin/env python3
"""Static SEO/integrity checks for the built site. Exit 1 on any failure. Usage: python3 scripts/seo_check.py"""
import json, os, re, sys, collections
from site_lib import *

fail = collections.defaultdict(list)
files = html_files()
S = {f: read(f) for f in files}

def url2file(u):
    p = re.sub(r"https?://[^/]+", "", u).lstrip("/")
    return p + ("index.html" if p.endswith("/") or p == "" else "")

sm = read("sitemap.xml")
locs = re.findall(r"<loc>([^<]+)</loc>", sm)
inmap = set()
if any(not l.startswith(HOST + "/") for l in locs): fail["sitemap non-canonical host"].append("")
if len(locs) != len(set(locs)): fail["sitemap duplicates"].append("")
for l in locs:
    f = url2file(l); inmap.add(f)
    if f not in S: fail["sitemap URL has no file"].append(l); continue
    if canonical(S[f]) != l: fail["sitemap URL != page canonical"].append(l)
    if is_noindex(S[f]): fail["noindex page in sitemap"].append(l)

titles = collections.defaultdict(list)
for f, s in S.items():
    c = canonical(s)
    if indexable(f, s):
        if c != self_url(f): fail["canonical is not self"].append(f)
        if f not in inmap: fail["indexable page missing from sitemap"].append(f)
        titles[title(s)].append(f)
        if len(re.findall(r"<h1[ >]", s)) != 1: fail["h1 count != 1"].append(f)
        if not description(s): fail["missing meta description"].append(f)
        h = hreflangs(s); me = HOST + "/" + re.sub(r"index\.html$", "", f)
        lang = "hi" if f.startswith("hi/") else "en"
        if h.get(lang) != me: fail["hreflang self reference"].append(f)
        if "x-default" not in h: fail["hreflang x-default"].append(f)
        for l, u in h.items():
            if l == "x-default": continue
            g = url2file(u)
            if g not in S: fail["hreflang target missing"].append((f, u))
            elif hreflangs(S[g]).get(l) != u: fail["hreflang not reciprocal"].append((f, l))
        if f.startswith("hi/") and 'lang="hi"' not in s[:400]: fail["hi page without lang=hi"].append(f)
    for p in ("og:title", "og:description", "og:url", "og:type", "og:image", "twitter:card"):
        if len(re.findall(r'(?:property|name)="%s"' % p, s)) > 1: fail["duplicate " + p].append(f)
    if len(re.findall(r'rel="canonical"', s)) > 1: fail["duplicate canonical"].append(f)
    for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try: json.loads(b)
        except Exception: fail["invalid JSON-LD"].append(f)
    # relative internal links resolve
    for h in re.findall(r'(?:href|src)="([^"#?]+)', s):
        if re.match(r"(https?:|mailto:|tel:|javascript:|data:|//|\{|\$)", h) or "${" in h or "{{" in h: continue
        t = h.lstrip("/") if h.startswith("/") else os.path.normpath(os.path.join(os.path.dirname(f), h))
        if t in ("", "."): continue
        if not any(os.path.isfile(os.path.join(ROOT, c)) for c in (t, t + "/index.html", os.path.join(t, "index.html"))):
            fail["broken internal link/asset"].append((f, h))
for t, fs in titles.items():
    if len(fs) > 1 and t: fail["duplicate <title> among indexable pages"].append((t[:50], len(fs)))

if "workers.dev" in read("robots.txt") or "workers.dev" in sm: fail["stale workers.dev host"].append("sitemap/robots")
if f"Sitemap: {HOST}/sitemap.xml" not in read("robots.txt"): fail["robots.txt sitemap line"].append("")

if fail:
    print("SEO/integrity check FAILED")
    for k, v in fail.items(): print(f"  {k}: {len(v)} e.g. {v[:3]}")
    sys.exit(1)
print(f"SEO/integrity check passed: {len(files)} pages, {len(locs)} sitemap URLs")
