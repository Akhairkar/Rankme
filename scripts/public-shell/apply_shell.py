#!/usr/bin/env python3
"""LocalBoost public shell: make header + footer identical on every public page.

Usage (from anywhere):
  python3 scripts/public-shell/apply_shell.py              # write mode, whole repo
  python3 scripts/public-shell/apply_shell.py --dry-run    # report only, change nothing
  python3 scripts/public-shell/apply_shell.py --check      # exit 1 if any page deviates (CI)
  python3 scripts/public-shell/apply_shell.py --only index.html hi/pricing   # limit to files/dirs
  python3 scripts/public-shell/apply_shell.py --year 2026  # copyright year (default 2026)

What it does for each public .html page:
  * detects depth (-> site_root such as "../../"), language (hi/ prefix or <html lang>)
  * replaces the existing <header>...</header> and <footer>...</footer> with the canonical
    markup from header.html / footer.html, wrapped in <!-- lb:header --> / <!-- /lb:header -->
    (and lb:footer) markers, so reruns are idempotent
  * computes the language switch from the page's own <link rel="alternate" hreflang> tags,
    so EN/HI twins with different slugs link correctly
  * injects <link rel="stylesheet" href="{site_root}assets/public-shell.css"> if absent
  * leaves every other byte of the page untouched

Stdlib only. Templates use {{placeholders}}; see render() below.
Excluded: dashboard/, hi/dashboard/, design-system/, checkout/, hi/checkout/, _templates/,
audit/engine.html, google3d*.html, 404.html (standalone error page), non-page dirs.
"""
import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SITE = "https://www.localboost.in"
DEFAULT_YEAR = "2026"

EXCLUDE_PREFIXES = (
    "dashboard/", "hi/dashboard/", "design-system/", "hi/design-system/",
    "checkout/", "hi/checkout/", "_templates/", "hi/_templates/",
    "audit/engine.html", "hi/audit/engine.html",
    "node_modules/", ".git/", "backend/", "docs/", "scripts/",
)
EXCLUDE_NAME_RE = re.compile(r"(^|/)google3d[^/]*\.html$|^404\.html$")

STRINGS = {
    "en": {
        "logo_label": "LocalBoost home", "nav_label": "Main navigation",
        "nav_tools": "Tools", "nav_industries": "Industries", "nav_cities": "Cities",
        "nav_guides": "Guides", "nav_blog": "Blog", "nav_pricing": "Pricing",
        "nav_search": "Search", "nav_search_label": "Search website",
        "lang_switch_label": "View this page in Hindi", "theme_label": "Toggle dark mode",
        "nav_cta": "Free Audit",
        "footer_tag": "Honest local SEO for Indian businesses: real data, clear fixes, no ranking promises.",
        "f_product": "Product", "f_how": "How it works", "f_pricing": "Pricing", "f_pro": "LocalBoost Pro",
        "f_waitlist": "Join the waitlist", "f_check": "Free visibility check",
        "f_tools": "Free tools", "f_audit": "Business audit", "f_checklist": "Local SEO checklist",
        "f_reply": "Review reply generator", "f_request": "Review request generator",
        "f_desc": "Description generator", "f_qr": "Review QR generator", "f_grid": "Rank grid simulator",
        "f_all_tools": "All free tools",
        "f_guides": "Guides", "f_gbp": "Google Business Profile", "f_maps": "Google Maps SEO",
        "f_reviews": "Google reviews", "f_localseo": "Local SEO", "f_growth": "Business growth",
        "f_company": "Company", "f_about": "About", "f_contact": "Contact",
        "f_legal": "Legal", "f_privacy": "Privacy policy", "f_terms": "Terms of service",
        "f_disclaimer": "Disclaimer", "f_compliance": "Google compliance", "f_refund": "Refund policy",
        "f_cookies": "Cookie settings",
        "f_disclaimer_text": "LocalBoost is an independent product and is not affiliated with, endorsed by or sponsored by Google LLC. Google, Google Maps and Google Business Profile are trademarks of Google LLC.",
        "f_rights": "All rights reserved.",
    },
    "hi": {
        "logo_label": "LocalBoost होम", "nav_label": "मुख्य नेविगेशन",
        "nav_tools": "टूल्स", "nav_industries": "उद्योग", "nav_cities": "शहर",
        "nav_guides": "गाइड्स", "nav_blog": "ब्लॉग", "nav_pricing": "मूल्य",
        "nav_search": "खोजें", "nav_search_label": "वेबसाइट में खोजें",
        "lang_switch_label": "View this page in English", "theme_label": "डार्क मोड बदलें",
        "nav_cta": "फ्री ऑडिट",
        "footer_tag": "भारतीय कारोबारों के लिए ईमानदार लोकल SEO: असली डेटा, साफ़ सुझाव, रैंकिंग का कोई वादा नहीं।",
        "f_product": "प्रोडक्ट", "f_how": "यह कैसे काम करता है", "f_pricing": "मूल्य", "f_pro": "LocalBoost Pro",
        "f_waitlist": "वेटलिस्ट में जुड़ें", "f_check": "फ्री विज़िबिलिटी चेक",
        "f_tools": "फ्री टूल्स", "f_audit": "बिज़नेस ऑडिट", "f_checklist": "लोकल SEO चेकलिस्ट",
        "f_reply": "रिव्यू रिप्लाई जेनरेटर", "f_request": "रिव्यू रिक्वेस्ट जेनरेटर",
        "f_desc": "डिस्क्रिप्शन जेनरेटर", "f_qr": "रिव्यू QR जेनरेटर", "f_grid": "रैंक ग्रिड सिमुलेटर",
        "f_all_tools": "सभी फ्री टूल्स",
        "f_guides": "गाइड्स", "f_gbp": "Google Business Profile", "f_maps": "Google Maps SEO",
        "f_reviews": "Google रिव्यू", "f_localseo": "लोकल SEO", "f_growth": "बिज़नेस ग्रोथ",
        "f_company": "कंपनी", "f_about": "हमारे बारे में", "f_contact": "संपर्क",
        "f_legal": "कानूनी", "f_privacy": "प्राइवेसी पॉलिसी", "f_terms": "सेवा की शर्तें",
        "f_disclaimer": "डिस्क्लेमर", "f_compliance": "Google अनुपालन", "f_refund": "रिफ़ंड पॉलिसी",
        "f_cookies": "कुकी सेटिंग्स",
        "f_disclaimer_text": "LocalBoost एक स्वतंत्र प्रोडक्ट है। इसका Google LLC से कोई संबंध नहीं है और Google ने इसे न प्रायोजित किया है, न समर्थन दिया है। Google, Google Maps और Google Business Profile, Google LLC के ट्रेडमार्क हैं।",
        "f_rights": "सर्वाधिकार सुरक्षित।",
    },
}

HEADER_MARK = ("<!-- lb:header -->", "<!-- /lb:header -->")
FOOTER_MARK = ("<!-- lb:footer -->", "<!-- /lb:footer -->")
CSS_LINK_RE = re.compile(r"public-shell\.css")


def read_template(name):
    with open(os.path.join(HERE, name), encoding="utf-8", newline="") as f:
        return f.read().replace("\r\n", "\n").rstrip("\n") + "\n"


def collect_files(only):
    out = []
    for dp, dns, fns in os.walk(REPO):
        rel_dir = os.path.relpath(dp, REPO).replace(os.sep, "/")
        dns[:] = [d for d in dns if not d.startswith(".") and d not in ("node_modules",)]
        for fn in fns:
            if not fn.endswith(".html"):
                continue
            rel = fn if rel_dir == "." else rel_dir + "/" + fn
            out.append(rel)
    out.sort()
    if only:
        sel = []
        norm = [o.strip("/").replace(os.sep, "/") for o in only]
        for rel in out:
            for o in norm:
                if rel == o or rel.startswith(o.rstrip("/") + "/") or rel == o + "/index.html":
                    sel.append(rel)
                    break
        out = sel
    return out


def excluded(rel):
    return rel.startswith(EXCLUDE_PREFIXES) or bool(EXCLUDE_NAME_RE.search(rel))


def detect_lang(rel, text):
    if rel.startswith("hi/"):
        return "hi"
    m = re.search(r"<html\b[^>]*\blang\s*=\s*[\"']?([a-zA-Z-]+)", text, re.I)
    if m and m.group(1).lower().startswith("hi"):
        return "hi"
    return "en"


def parse_hreflangs(text):
    head_end = text.lower().find("</head>")
    head = text if head_end < 0 else text[:head_end]
    langs = {}
    for tag in re.findall(r"<link\b[^>]*>", head, re.I):
        if not re.search(r"\brel\s*=\s*[\"']?alternate", tag, re.I):
            continue
        hl = re.search(r"\bhreflang\s*=\s*[\"']([^\"']+)[\"']", tag, re.I)
        hr = re.search(r"\bhref\s*=\s*[\"']([^\"']+)[\"']", tag, re.I)
        if hl and hr:
            langs[hl.group(1).lower()] = hr.group(1)
    return langs


class Page:
    def __init__(self, rel, text, year):
        self.rel = rel
        self.text = text
        self.year = year
        self.lang = detect_lang(rel, text)
        self.depth = rel.count("/")
        self.site_root = "../" * self.depth
        self.t = STRINGS[self.lang]
        self.langs = parse_hreflangs(text)

    # --- link helpers -------------------------------------------------
    def exists(self, path):
        return os.path.isfile(os.path.join(REPO, path))

    def href(self, path):
        """Language-aware relative link to a site path like 'tools/index.html'."""
        if self.lang == "hi":
            if self.exists("hi/" + path):
                return self.site_root + "hi/" + path
            if self.exists(path):
                return self.site_root + path
            return self.site_root + "hi/" + path
        return self.site_root + path

    def home_href(self):
        return "hi/index.html" if self.lang == "hi" else "index.html"

    def guides_href(self):
        for cand in ("guides/index.html",):
            if self.exists(("hi/" if self.lang == "hi" else "") + cand) or (self.lang == "hi" and self.exists(cand)):
                return self.href(cand)
        return self.href("google-business-profile/index.html")

    def lang_switch(self):
        target = "en" if self.lang == "hi" else "hi"
        url = self.langs.get(target)
        if url:
            path = url
            if path.startswith(SITE):
                path = path[len(SITE):]
            if path.startswith("http"):  # foreign host: leave as is
                return path, target
            path = path.lstrip("/")
            if path == "" or path.endswith("/"):
                path += "index.html"
            elif "." not in path.rsplit("/", 1)[-1]:
                path += "/index.html"
            return self.site_root + path, target
        # fallback: derive twin by path, else the other language's home
        if self.lang == "hi":
            twin = self.rel[3:]
            return self.site_root + (twin if self.exists(twin) else "index.html"), "en"
        twin = "hi/" + self.rel
        return self.site_root + (twin if self.exists(twin) else "hi/index.html"), "hi"

    def logo(self):
        """Brand logo: assets/brand/logo.svg (+ logo-dark.svg for dark themes) if present, else the LB mark."""
        if self.exists("assets/brand/logo.svg"):
            img = '<img class="lb-logo-img lb-logo-light" src="%sassets/brand/logo.svg" alt="LocalBoost" width="129" height="32">' % self.site_root
            if self.exists("assets/brand/logo-dark.svg"):
                img += '<img class="lb-logo-img lb-logo-dark" src="%sassets/brand/logo-dark.svg" alt="" width="129" height="32" aria-hidden="true">' % self.site_root
            return img
        return '<span class="logo-mark" aria-hidden="true">LB</span><span>LocalBoost</span>'

    def render(self, tpl):
        sw_href, sw_lang = self.lang_switch()
        simple = {
            "site_root": self.site_root, "home_href": self.home_href(),
            "lang_switch_href": sw_href, "lang_switch_lang": sw_lang,
            "guides_href": self.guides_href(), "year": self.year,
            "logo": self.logo(),
        }
        out = re.sub(r"\{\{href:([^}]+)\}\}", lambda m: self.href(m.group(1)), tpl)
        out = re.sub(r"\{\{t:([a-z_]+)\}\}", lambda m: self.t[m.group(1)], out)
        out = re.sub(r"\{\{([a-z_]+)\}\}", lambda m: simple[m.group(1)], out)
        return out


def block_regex(tag, marks):
    o, c = re.escape(marks[0]), re.escape(marks[1])
    return re.compile(r"%s.*?%s|<%s\b.*?</%s>" % (o, c, tag, tag), re.S | re.I)


def apply(rel, text, tpl_h, tpl_f, year):
    """Return (new_text, notes). Pure function; does no I/O except existence checks."""
    notes = []
    nl = "\r\n" if "\r\n" in text else "\n"
    pg = Page(rel, text, year)
    head_h = HEADER_MARK[0] + "\n" + pg.render(tpl_h) + HEADER_MARK[1]
    foot_h = FOOTER_MARK[0] + "\n" + pg.render(tpl_f) + FOOTER_MARK[1]
    if nl != "\n":
        head_h, foot_h = head_h.replace("\n", nl), foot_h.replace("\n", nl)

    body_m = re.search(r"<body\b[^>]*>", text, re.I)
    if not body_m:
        return text, ["no <body>: skipped"], pg
    pre, post = text[:body_m.end()], text[body_m.end():]

    # header
    m = block_regex("header", HEADER_MARK).search(post)
    if m:
        post = post[:m.start()] + head_h + post[m.end():]
    else:
        post = nl + head_h + post
        notes.append("header inserted")
    # footer
    m = block_regex("footer", FOOTER_MARK).search(post)
    if m:
        post = post[:m.start()] + foot_h + post[m.end():]
    else:
        main_end = re.search(r"</main>", post, re.I)
        start = main_end.end() if main_end else 0
        sm = re.search(r"<script\b", post[start:], re.I)
        if sm:
            idx = start + sm.start()
        else:
            bm = re.search(r"</body>", post, re.I)
            idx = bm.start() if bm else len(post)
        post = post[:idx] + foot_h + nl + post[idx:]
        notes.append("footer inserted")
    new = pre + post

    # shared stylesheet
    head_end = re.search(r"</head>", new, re.I)
    if head_end and not CSS_LINK_RE.search(new[:head_end.start()]):
        link = '<link rel="stylesheet" href="%sassets/public-shell.css">%s' % (pg.site_root, nl)
        new = new[:head_end.start()] + link + new[head_end.start():]
        notes.append("public-shell.css linked")
    # theme manager (assets/theme.js) drives the header theme toggle; load early to avoid a theme flash
    head_end = re.search(r"</head>", new, re.I)
    if head_end and "assets/theme.js" not in new[:head_end.start()]:
        tag = '<script src="%sassets/theme.js"></script>%s' % (pg.site_root, nl)
        new = new[:head_end.start()] + tag + new[head_end.start():]
        notes.append("theme.js added")
    # advisory warnings (not changed): mobile menu needs site.css + site.js
    if "assets/site.js" not in new:
        notes.append("WARN no assets/site.js (mobile menu inactive)")
    if "assets/site.css" not in new:
        notes.append("WARN no assets/site.css (mobile menu styles missing)")
    return new, notes, pg


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="report what would change, write nothing")
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 if any page deviates")
    ap.add_argument("--only", nargs="+", help="limit to these files or directories (repo-relative)")
    ap.add_argument("--year", default=DEFAULT_YEAR)
    ap.add_argument("-q", "--quiet", action="store_true", help="only print pages that change, plus summary")
    args = ap.parse_args()

    tpl_h, tpl_f = read_template("header.html"), read_template("footer.html")
    counts = {"changed": 0, "ok": 0, "skipped": 0, "warn": 0}
    for rel in collect_files(args.only):
        if excluded(rel):
            counts["skipped"] += 1
            if not args.quiet:
                print("SKIP      %s (excluded)" % rel)
            continue
        path = os.path.join(REPO, rel)
        with open(path, "rb") as f:
            raw = f.read()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            print("SKIP      %s (not utf-8)" % rel)
            counts["skipped"] += 1
            continue
        new, notes, pg = apply(rel, text, tpl_h, tpl_f, args.year)
        warn = [n for n in notes if n.startswith("WARN")]
        counts["warn"] += len(warn)
        info = "[%s depth=%d]" % (pg.lang, pg.depth) + ((" " + "; ".join(notes)) if notes else "")
        if new == text:
            counts["ok"] += 1
            if not args.quiet:
                print("OK        %s %s" % (rel, info))
            continue
        counts["changed"] += 1
        if args.check or args.dry_run:
            print("DEVIATES  %s %s" % (rel, info) if args.check else "WOULD-FIX %s %s" % (rel, info))
        else:
            with open(path, "wb") as f:
                f.write(new.encode("utf-8"))
            print("UPDATED   %s %s" % (rel, info))
    print("\nsummary: %(changed)d to change/changed, %(ok)d already canonical, %(skipped)d skipped, %(warn)d warnings" % counts)
    if args.check and counts["changed"]:
        print("check FAILED: %d page(s) deviate from the canonical shell" % counts["changed"])
        sys.exit(1)
    if args.check:
        print("check passed")


if __name__ == "__main__":
    main()
