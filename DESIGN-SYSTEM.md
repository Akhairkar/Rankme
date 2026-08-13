# DESIGN SYSTEM — Local Business Growth Platform

Defines the visual and interaction language for the platform. No homepage or code is built in this session — tokens and component specs only, ready for implementation in a future session.

---

## 1. Brand Direction

- **Feel:** modern, trustworthy, approachable — a knowledgeable local guide, not a corporate SEO agency.
- **Avoid:** overly dark "tech startup" themes and overly white/clinical "SaaS dashboard" sterility. Target a warm-neutral base with a confident accent color.
- **Tone in UI copy:** plain language, encouraging, never jargon-heavy or guilt-inducing about low scores (e.g., "3 quick wins to boost your visibility" rather than "Your business is failing on Google").
- **Bilingual-aware:** UI and type choices must support Latin + Devanagari script rendering cleanly for Hindi/Hinglish content.

---

## 2. Color Tokens

**Base (neutral, warm-leaning, not stark white/black):**
- `color-bg-base`: #FAF9F6 (warm off-white)
- `color-bg-surface`: #FFFFFF
- `color-bg-muted`: #F0EEE9
- `color-text-primary`: #1E1E1E
- `color-text-secondary`: #5A5A54
- `color-border`: #E2E0D9

**Brand / Primary (trust + growth association — blue-green direction):**
- `color-primary-600`: #0F766E (teal — trust + growth)
- `color-primary-500`: #14968C
- `color-primary-100`: #E0F5F2

**Accent (energy/action — warm accent for CTAs):**
- `color-accent-600`: #E8722C
- `color-accent-100`: #FCE8D9

**Status colors (for score/progress and alerts):**
- `color-success`: #1E8E5A
- `color-warning`: #C98A02
- `color-danger`: #C4402C
- `color-info`: #2563A6

All color pairs must meet WCAG AA contrast (4.5:1 for body text, 3:1 for large text/UI components).

---

## 3. Typography

- **Typeface direction:** a humanist sans-serif with strong Devanagari support (e.g., a system/Google Fonts pairing such as Inter or Manrope for Latin + Noto Sans Devanagari for Hindi), not a purely decorative or condensed face.
- **Scale (mobile-first base 16px):**
  - `text-xs`: 12px / line-height 1.4
  - `text-sm`: 14px / 1.5
  - `text-base`: 16px / 1.6
  - `text-lg`: 18px / 1.5
  - `text-xl`: 22px / 1.4
  - `text-2xl`: 28px / 1.3
  - `text-3xl`: 36px / 1.2 (desktop headline scale up to 44–48px)
- **Weight usage:** 400 body, 500 UI labels/buttons, 600–700 headings. Avoid weights below 400 for readability at small sizes.

---

## 4. Spacing

8px base unit scale:
- `space-1`: 4px
- `space-2`: 8px
- `space-3`: 12px
- `space-4`: 16px
- `space-5`: 24px
- `space-6`: 32px
- `space-7`: 48px
- `space-8`: 64px

Consistent use: card padding `space-4`–`space-5`, section vertical spacing `space-7`–`space-8` on desktop (reduced by ~half on mobile).

---

## 5. Buttons

- **Primary:** filled `color-accent-600` background, white text, `radius-md` (8px), used for the main CTA per screen only (e.g., "Check My Business").
- **Secondary:** outlined `color-primary-600` border/text, transparent background.
- **Tertiary/Text:** text-only link style, `color-primary-600`, underline on hover/focus.
- States: default, hover (8% darken), active (12% darken), disabled (40% opacity, no pointer), focus-visible (2px offset outline in `color-primary-500`).
- Minimum tap target: 44x44px (mobile-first, accessibility requirement).

---

## 6. Cards

- Background `color-bg-surface`, `radius-lg` (12px), subtle shadow (`0 1px 3px rgba(0,0,0,0.08)`), 1px `color-border` outline for definition on white backgrounds.
- Padding `space-5` desktop / `space-4` mobile.
- Card variants: content card (guides), score card (visibility score summary), action card (single "Fix" recommendation with priority tag).

---

## 7. Forms

- Inputs: `color-bg-surface` background, 1px `color-border`, `radius-md`, 44px min height, `space-3` horizontal padding.
- Focus state: border color `color-primary-600` + subtle glow, never color-only (also a border-width or icon change for colorblind accessibility).
- Labels always visible above the field (not placeholder-only) for accessibility and multilingual label length variance.
- Error state: `color-danger` border + inline message below field, not just a red asterisk.
- Helper text: `color-text-secondary`, `text-sm`.

---

## 8. Alerts

- Types: success, warning, danger, info — each using the respective status color at low-opacity background (`*-100` equivalent) with full-strength color for icon/left border (4px accent border).
- Always paired with an icon + short plain-language message, never color alone (accessibility).
- Dismissible alerts include a visible close control with adequate tap target.

---

## 9. Score / Progress Components

- **Visibility Score:** circular or arc progress indicator, 0–100 scale, using status color bands (danger <40, warning 40–70, success >70) — bands are visual guidance only, never framed as a guaranteed ranking metric (per Session 01 policy).
- **Checklist/Progress bar:** linear bar for "X of Y items fixed," `color-primary-600` fill on `color-bg-muted` track.
- Each score component must be paired with a plain-language one-line explanation, not a bare number.

---

## 10. Navigation

- **Mobile-first:** bottom or top simplified nav with a maximum of 4–5 primary destinations (Home/Learn, Check, Fix, Monitor — Automate nested under Monitor or Pro area).
- **Desktop:** top horizontal nav, sticky on scroll, with the primary CTA button always visible on the right.
- Active state indicated by `color-primary-600` text/icon + underline or background tint, not color alone.

---

## 11. Footer

- Sections: Product (Learn/Check/Fix/Monitor), Company, Legal/Privacy, Language switch (English/Hindi).
- Must include a clear, non-buried link to privacy/data-usage information (per Session 01 trust requirements) and a policy-compliance note (no ranking guarantees).
- Background `color-bg-muted`, text `color-text-secondary`.

---

## 12. Responsive Breakpoints

- `sm`: 360px (small mobile baseline)
- `md`: 768px (tablet)
- `lg`: 1024px (small desktop)
- `xl`: 1280px (desktop)
- `2xl`: 1536px (large desktop)

Mobile-first: base styles target `sm`, progressively enhanced upward. All interactive components must be tested down to 360px width given target users' device profile.

---

## 13. Accessibility Requirements

- WCAG 2.1 AA minimum across color contrast, focus states, and tap targets.
- All icons/status indicators paired with text or accessible labels — never color-only communication.
- Full keyboard navigability for all interactive components (forms, nav, dismissible alerts).
- Language toggling must not break screen-reader `lang` attribute handling.
- Support browser-level text resizing up to 200% without layout breakage.

---

## 14. Image & Illustration Style

- Prefer **original, simple line-art or flat-illustration style** (consistent stroke weight, limited palette drawn from brand tokens) over generic stock photography — reinforces the "guide, not agency" brand feel and avoids the generic-SaaS-stock-photo look.
- Illustrations used for: onboarding/empty states, Learn-stage guide headers, score/result summary screens.
- Where real photography is unavoidable (e.g., future case studies), only real, sourced, non-stock imagery should be used — no fabricated or generic "success" stock photos implying specific results.
- Icon set: consistent single style (outline or filled, not mixed) across the product.

---

## Status

This document defines design tokens and component specifications only. No homepage or UI code has been built in this session.
