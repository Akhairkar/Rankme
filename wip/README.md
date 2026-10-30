# Work in progress (not deployed, not wired into any page)

These files were written by engineers whose session was cut off by a usage limit. They are kept so the work is not lost. They are excluded from the deploy (`scripts/build_dist.py`) and are NOT referenced by any live page.

- `dashboard-app/`: partial vanilla-JS dashboard app (API client, shell, i18n, forms, UI helpers, and page controllers for overview, business, audit, rank). The dashboard HTML pages in `dashboard/` do not use it yet. Contract: `docs/API-CONTRACT.md`.
- `public-shell/`: `apply_shell.py`, `header.html`, `footer.html`, `public-shell.css`: a script meant to make header/footer identical on all public pages. Never run in write mode over the site. Test with `--dry-run` and `--check` first.

See `docs/HANDOFF.md` for exactly what is finished and what remains.
