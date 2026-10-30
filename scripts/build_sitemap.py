#!/usr/bin/env python3
"""Regenerate sitemap.xml from the pages themselves. Usage: python3 scripts/build_sitemap.py [--check]"""
import re, sys
from site_lib import *

def build():
    old = {}
    try:
        for m in re.finditer(r"<url>.*?</url>", read("sitemap.xml"), re.S):
            b = m.group(0)
            p = re.sub(r"https?://[^/]+", "", re.search(r"<loc>([^<]+)", b).group(1))
            cf = re.search(r"<changefreq>([^<]+)", b); pr = re.search(r"<priority>([^<]+)", b)
            old[p] = (cf.group(1) if cf else None, pr.group(1) if pr else None)
    except FileNotFoundError:
        pass
    entries = []
    for f in html_files():
        s = read(f)
        if not indexable(f, s):
            continue
        me = self_url(f)
        cf, pr = old.get(re.sub(r"https?://[^/]+", "", me), (None, None))
        alts = "".join(f'    <xhtml:link rel="alternate" hreflang="{l}" href="{u}"/>\n' for l, u in re.findall(r'hreflang="([^"]+)" href="([^"]+)"', s))
        entries.append(f"  <url>\n    <loc>{me}</loc>\n{alts}    <changefreq>{cf or 'monthly'}</changefreq>\n    <priority>{pr or '0.5'}</priority>\n  </url>\n")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
            '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n\n' + "\n".join(entries) + "\n</urlset>\n"), len(entries)

if __name__ == "__main__":
    xml, n = build()
    if "--check" in sys.argv:
        ok = xml == read("sitemap.xml")
        print("sitemap up to date" if ok else "sitemap.xml is stale: run python3 scripts/build_sitemap.py")
        sys.exit(0 if ok else 1)
    open(ROOT + "/sitemap.xml", "w", encoding="utf-8").write(xml)
    print("sitemap.xml written with", n, "URLs")
