"""Shared helpers for the static-site tooling (stdlib only)."""
import os, re, subprocess

HOST = "https://www.localboost.in"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SKIP_PREFIX = ("google3d", "_templates", "design-system/", "node_modules/")
NOT_INDEXED_DIRS = ("dashboard/", "hi/dashboard/", "checkout/", "hi/checkout/")


def html_files():
    out = subprocess.check_output(["git", "ls-files", "-co", "--exclude-standard", "*.html"], cwd=ROOT).decode().split("\n")
    return sorted(f for f in out if f and not f.startswith(SKIP_PREFIX) and os.path.exists(os.path.join(ROOT, f)))


def read(f):
    with open(os.path.join(ROOT, f), encoding="utf-8") as fh:
        return fh.read()


def self_url(f):
    return HOST + "/" + re.sub(r"index\.html$", "", f)


def canonical(s):
    m = re.search(r'<link rel="canonical" href="([^"]*)"', s)
    return m.group(1) if m else None


def is_noindex(s):
    return bool(re.search(r'<meta name="robots"[^>]*noindex', s, re.I))


def indexable(f, s):
    return (canonical(s) is not None and not f.startswith(NOT_INDEXED_DIRS)
            and not is_noindex(s) and not f.startswith("audit/engine"))


def title(s):
    m = re.search(r"<title>(.*?)</title>", s, re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""


def description(s):
    m = re.search(r'<meta name="description" content="(.*?)"', s, re.S)
    return m.group(1).strip() if m else ""


def hreflangs(s):
    return dict(re.findall(r'hreflang="([^"]+)" href="([^"]+)"', s))
