# RTG.center — Royal Thai Gazette Multilingual Digest

## Critical Constants

- **Gemini model**: `gemini-3-flash-preview` — NEVER use any other model without explicit approval
- **Domain**: rtg.center (custom domain pending CF Dashboard setup)
- **Workers**: rtg-web + rtg-pipeline on mommyslittlehelper.workers.dev
- **D1 database ID**: ee055099-632f-418a-a234-436e67af936b
- **KV namespace ID**: 96ca4301dd2e4170b193d2875abac959
- **R2 bucket**: rtg-pdfs
- **GitHub**: talkstream/rtg-changelog

## Architecture

Monorepo with 3 packages:
- `packages/shared` — Types, constants, Zod schemas
- `packages/pipeline` — Cron Worker (every 1 min): picks unprocessed docs from D1, fetches PDF from R2, sends to Gemini for full text extraction + translation (TH→EN, TH→RU), stores result in D1. Processes 1 doc per tick.
- `packages/web` — Astro 6 SSR, zero JS, i18n (EN/TH/RU), date-based daily digest navigation

## Data Flow

1. PDFs uploaded to R2 (via Playwright MCP session, GitHub Actions, or manually)
2. Pipeline picks up unprocessed documents from D1 (1 per cron tick)
3. Gemini `gemini-3-flash-preview` extracts full Thai text + translates to EN/RU
4. Astro SSR reads from D1, renders full text with language switching

## Site Navigation

- `/{lang}/` — Homepage: onboarding text + highlights (relevance≥4) + latest dates
- `/{lang}/{YYYY-MM-DD}` — Daily digest: all documents for that date, grouped by series
- `/{lang}/doc/{id}` — Single document: full translated text + AI disclaimer badge
- `/{lang}/search` — Search page (SSR form, zero JS)
- `/{lang}/archive` — Calendar-style archive grouped by month
- `/{lang}/about` — About page (prerendered)

## Translation Quality

Translations must be **complete and accurate** — no loss of facts, meaning, or message. Full document text, not summaries. AI disclaimer badge shown on all translated pages.

## Content Scope

- Only 2026 (BE 2569) content
- All 4 gazette series: A (legislation), B (titles), C (trade), D (announcements)
- Languages: Thai, English, Russian (Phase 1). Backlog: zh-CN, ja, ko, de, fr, es, ASEAN

## PDF Access

ratchakitcha.soc.go.th behind Cloudflare (403 for curl/headless). Use Playwright MCP (with Chrome) or GitHub Actions to solve CF challenge and download PDFs. SOC API token request sent to rsrd@soc.go.th (2026-03-25).

## D1 Tables

- `gazette_issues` — grouped by vol+section+series, has published_date. Website groups by date.
- `gazette_documents` — full text in title_th/content_th, title_en/content_en, title_ru/content_ru. processed: 0=pending, 1=done, 2=error.
- `pipeline_runs` — execution log
- `raw_records` / `translations` / `digests` — v1 tables (backward compat, not used by web v3)

## GitHub Actions

- `fetch-pdfs.yml` — cron every 4 hours. Fetches metadata from GD Catalog (with retry), downloads PDFs via Playwright, uploads to R2.
