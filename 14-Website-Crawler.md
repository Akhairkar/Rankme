# Session 14 — WEBSITE AUDIT ENGINE

Implement the first real website audit engine.

Analyze a submitted public website for basic signals:
- HTTPS
- title
- meta description
- H1
- headings
- phone/address/city signals
- services
- contact page
- Google Maps link
- LocalBusiness structured data
- image alt text
- internal links
- obvious broken links where safely testable
- basic mobile/performance signals where feasible

Use deterministic rules first. Avoid unsafe arbitrary URL fetching or SSRF vulnerabilities.
Validate and sanitize URLs.
Do not add AI yet.
Do not add Google APIs yet.

## SESSION CONTROL
- Do ONLY this session's task.
- Do NOT start future roadmap modules.
- Inspect the existing project before changing files.
- Preserve working functionality.
- Do not invent APIs, credentials, rankings, data, reviews, or business facts.
- Never expose secrets or API keys.
