# RTG.center — Design System Reference

> **For AI assistants:** read this file before modifying any UI component in `packages/web/`.
> **CSS source of truth:** `packages/web/src/styles/global.css` (639 lines)
> **Visual reference:** `docs/design/screenshots/` (11 screenshots, desktop + mobile + Thai)

---

## Design Principles

1. **Zero JavaScript** — CSP enforces `script-src 'none'`. All interactivity via HTML forms and `<a>` links. No JS frameworks, no client-side rendering.
2. **Content-first readability** — 720px max-width, generous line-height (1.65 base, 1.85 Thai), fluid typography via `clamp()`. Optimized for reading legal documents.
3. **Accessible by default** — Semantic HTML (`<article>`, `<nav>`, `<main>`), skip-to-content link, `aria-label` on navigations, `aria-current="page"` on active language, `.sr-only` utility class.
4. **Trilingual** — EN/TH/RU with URL prefixes (`/en/`, `/th/`, `/ru/`). Thai requires specific font stack and increased line-height. Russian uses standard Latin metrics.
5. **Government clarity** — Minimal, utilitarian UI. No decorative elements, no animations, no gradients. Information density over aesthetics.
6. **Responsive without breakpoints** — No `@media (min-width)` queries. Fluid type with `clamp()`, flexbox wrapping, and `max-width: 720px` handle all screen sizes.
7. **Light/dark via OS preference** — `@media (prefers-color-scheme: dark)` toggles all CSS variables. No user toggle (zero JS constraint).

---

## Visual Language

### Color Palette

CSS variables defined in `:root` (global.css lines 4-21, dark mode 23-38):

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--color-bg` | `#fff` | `#0f1117` | Page background |
| `--color-bg-subtle` | `#f8f9fa` | `#1a1d2e` | Cards, highlights, tags |
| `--color-text` | `#1a1a2e` | `#e5e7eb` | Primary text |
| `--color-text-muted` | `#6b7280` | `#9ca3af` | Secondary text, metadata |
| `--color-border` | `#e5e7eb` | `#2d3748` | Dividers, card borders |
| `--color-primary` | `#1e3a5f` | `#60a5fa` | Buttons, active states |
| `--color-link` | `#1e40af` | `#93c5fd` | Links |
| `--color-series-a` | `#3730a3` | `#818cf8` | Series A: Legislation (indigo) |
| `--color-series-b` | `#b45309` | `#fcd34d` | Series B: Title Registers (amber) |
| `--color-series-c` | `#0f766e` | `#5eead4` | Series C: Trade Registers (teal) |
| `--color-series-d` | `#475569` | `#94a3b8` | Series D: General Announcements (slate) |

### Relevance Score Colors (hardcoded, not CSS variables)

| Level | Color | Label |
|-------|-------|-------|
| 5 (Critical) | `#c0392b` | Red |
| 4 (High) | `#e67e22` | Orange |
| 3 (Medium) | `#2980b9` | Blue |

### Typography

- **Font stack:** `Inter, Segoe UI, Roboto, Noto Sans Thai, Leelawadee UI, Tahoma, system-ui, -apple-system, sans-serif`
- **Base:** 16px / line-height 1.65
- **Thai text (`:lang(th)`):** line-height 1.85 — critical for readability of Thai script
- **Fluid headings:** `clamp(1.5rem, 3vw, 2rem)` for page titles, `clamp(1.25rem, 2.5vw, 1.75rem)` for document titles
- **No external fonts loaded** — CSP `font-src 'self'`, relies on system fonts

### Layout

- **Container:** `max-width: 720px`, centered, `padding: 0 1rem`
- **Sticky header:** `position: sticky; top: 0; z-index: 10` with border-bottom
- **Body:** `display: flex; flex-direction: column; min-height: 100dvh` — footer sticks to bottom
- **Document cards:** left `border-left: 3px solid` in series color — primary visual identifier

---

## Component Catalog

All components live in `packages/web/src/components/`. All paths relative to `packages/web/src/`.

| Component | File | Purpose | Key CSS Classes |
|-----------|------|---------|-----------------|
| Base | `layouts/Base.astro` | Root HTML layout, CSP meta tag, OG tags, hreflang, JSON-LD | `.container`, `.skip-link` |
| Header | `components/Header.astro` | Sticky header: logo + Search/Archive/About nav + LanguageSwitcher | `.site-header`, `.site-logo`, `.site-nav` |
| Footer | `components/Footer.astro` | Source attribution, legal disclaimer, RSS link | `.site-footer` |
| LanguageSwitcher | `components/LanguageSwitcher.astro` | EN/TH/RU toggle with `aria-current="page"` on active lang | `.lang-switch` |
| SeriesBadge | `components/SeriesBadge.astro` | Uppercase badge showing gazette series (A/B/C/D) | `.badge`, `.badge-a` through `.badge-d` |
| DocumentCard | `components/DocumentCard.astro` | Compact document listing with series border-left accent | `.doc-card`, `.doc-card-title`, `.doc-card-meta` |
| DocumentView | `components/DocumentView.astro` | Full document: title, Thai original, metadata, AI disclaimer, sanitized HTML content, relevance, key terms, PDF link | `.document-view`, `.document-content`, `.document-meta`, `.ai-disclaimer` |
| Highlights | `components/Highlights.astro` | Homepage featured documents section (relevance >= 4) | `.highlights-section`, `.highlight-card` |
| DigestDay | `components/DigestDay.astro` | Homepage daily digest preview: date + 5 doc titles + "View full digest" link | `.digest-day`, `.digest-preview` |

---

## Page Patterns

### Homepage `/{lang}/`
- `<h1>` site title + onboarding paragraph
- **Highlights section** (bordered box): top documents with relevance >= 4, showing badge + relevance label + date + title + summary
- **Latest digests**: last 5 dates, each showing 5 document titles with series badges
- "View all dates in Archive" navigation link

### Daily Digest `/{lang}/{YYYY-MM-DD}`
- Breadcrumb: "Back to digests"
- `<h1>` formatted date + document count
- **Prev/next day navigation** (top and bottom)
- Documents grouped by series (fixed order: A → B → C → D), each group with heading + count
- Each document rendered as full `DocumentView` (inline, not linked)

### Document Detail `/{lang}/doc/{id}`
- Breadcrumb: "Back to digest · {date}"
- `<h1>` translated title
- Original Thai title shown below (when not in Thai, with `lang="th"`)
- Metadata: series badge, type, authority, effective date
- `<hr>` divider
- **AI Translation disclaimer** (when not Thai): "AI Translation · Original language: Thai"
- Full sanitized HTML content
- **"Who this matters to"** section (if relevance >= 3): relevance badge + tags + summary
- **Key terms** as tag pills
- Original PDF link (external, `rel="noopener noreferrer"`, `hreflang="th"`)

### Archive `/{lang}/archive`
- Dates grouped by year-month (e.g., "January 2026")
- Each date: linked formatted date + document count

### Search `/{lang}/search`
- HTML form (`method="GET"`, `<input type="search">`, max 200 chars)
- Results displayed as highlight cards (same component as homepage highlights)
- `noindex` meta tag on search result pages

### About `/{lang}/about`
- Pre-rendered static page (`export const prerender = true`)
- Separate HTML content per language

---

## Hard Constraints

**DO NOT violate these — they are architectural decisions, not suggestions:**

- **NO `<script>` tags** — CSP `script-src 'none'` blocks all JavaScript execution
- **NO external fonts/CDNs** — CSP `font-src 'self'`; system fonts only
- **NO `<iframe>`** — CSP `frame-src 'none'`
- **NO width-based media queries** — use `clamp()` for fluid responsive design
- **Container max-width 720px** — do not change; optimized for legal document readability
- **All AI content through `sanitize-html`** — see `lib/sanitize.ts`; never use `set:html` on raw Gemini output
- **All external links:** `rel="noopener noreferrer"` + `target="_blank"`
- **Thai text:** always set `lang="th"` attribute and expect 1.85 line-height
- **Series colors** are part of the information architecture — A=indigo, B=amber, C=teal, D=slate; do not reassign
- **No new dependencies** without explicit approval — zero-JS site must stay zero-JS

---

## Multilingual Design Rules

- **URL structure:** `/{lang}/path` — all 3 languages mandatory: `en`, `th`, `ru`
- **Date formatting:** locale-aware via `toLocaleDateString()` — `en-US`, `th-TH`, `ru-RU`
- **Font stack** includes Thai glyphs: `Noto Sans Thai`, `Leelawadee UI` (fallback for Windows)
- **Translation strings:** `src/i18n/{lang}.json` — accessed via `t(lang, 'key')`
- **Title fallback chain:** `title_{lang}` → `title_en` → `title_th` (never empty)
- **Thai line-height:** `.document-content:lang(th) { line-height: 1.85 }` — do not override
- **Language switcher** preserves current path, swaps only the `/{lang}/` prefix

---

## Screenshots Reference

`docs/design/screenshots/` contains visual reference for all page types:

**Desktop (1280x800):**
- `homepage-desktop.png` — highlights + latest digests
- `digest-desktop.png` — daily digest with series grouping, prev/next navigation
- `document-desktop.png` — full document with AI disclaimer, relevance, key terms
- `archive-desktop.png` — calendar archive grouped by month
- `search-desktop.png` — search form with 5 results

**Mobile (390x844, iPhone 14 Pro):**
- `homepage-mobile.png` — responsive layout, stacked cards
- `digest-mobile.png` — single-column digest view
- `document-mobile.png` — document with wrapped metadata
- `archive-mobile.png` — compact archive
- `search-mobile.png` — search with results

**Thai typography reference:**
- `document-thai-desktop.png` — Thai text with 1.85 line-height, Thai UI labels, Buddhist Era dates

---

## File Map

```
packages/web/src/
├── styles/global.css          # ALL CSS (639 lines) — single source of truth
├── layouts/Base.astro         # Root HTML, CSP, meta, i18n
├── components/
│   ├── Header.astro           # Sticky nav
│   ├── Footer.astro           # Footer
│   ├── LanguageSwitcher.astro # EN/TH/RU toggle
│   ├── SeriesBadge.astro      # Series A-D badge
│   ├── DocumentCard.astro     # Compact doc listing
│   ├── DocumentView.astro     # Full document display
│   ├── Highlights.astro       # Featured docs section
│   └── DigestDay.astro        # Daily digest preview
├── pages/
│   ├── [lang]/index.astro     # Homepage
│   ├── [lang]/[date].astro    # Daily digest
│   ├── [lang]/doc/[id].astro  # Document detail
│   ├── [lang]/search.astro    # Search
│   ├── [lang]/archive.astro   # Archive
│   └── [lang]/about.astro     # About (prerendered)
├── lib/
│   ├── d1.ts                  # D1 database queries
│   └── sanitize.ts            # HTML sanitization
└── i18n/
    ├── index.ts               # i18n helpers
    ├── en.json                # English strings
    ├── th.json                # Thai strings
    └── ru.json                # Russian strings
```
