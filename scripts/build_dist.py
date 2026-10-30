#!/usr/bin/env python3
"""Copy only publishable site files into dist/ (used by the Cloudflare Pages deploy). Usage: python3 scripts/build_dist.py"""
import os, shutil
from site_lib import ROOT

EXCLUDE_DIRS = {".git", ".github", "backend", "docs", "scripts", "_templates", "node_modules", "dist", ".claude"}
EXCLUDE_EXT = {".md", ".py", ".sh"}
out = os.path.join(ROOT, "dist")
shutil.rmtree(out, ignore_errors=True)
n = 0
for d, dirs, files in os.walk(ROOT):
    dirs[:] = [x for x in dirs if x not in EXCLUDE_DIRS]
    for f in files:
        if os.path.splitext(f)[1] in EXCLUDE_EXT or f.startswith(".") and f != ".nojekyll":
            continue
        src = os.path.join(d, f); rel = os.path.relpath(src, ROOT); dst = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(src, dst); n += 1
print("dist/ built with", n, "files")
