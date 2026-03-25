# RTG.center — Royal Thai Gazette Multilingual Digest

## Critical Constants

- **Gemini model**: `gemini-3-flash-preview` — NEVER use any other model without explicit approval
- **Domain**: rtg.center (custom domain pending setup in CF Dashboard)
- **Workers**: rtg-web + rtg-pipeline on mommyslittlehelper.workers.dev
- **D1 database ID**: ee055099-632f-418a-a234-436e67af936b
- **KV namespace ID**: 96ca4301dd2e4170b193d2875abac959
- **R2 bucket**: rtg-pdfs
- **GitHub org**: talkstream (repo: rtg-changelog)

## Architecture

Monorepo with 3 packages:
- `packages/shared` — Types, constants, Zod schemas
- `packages/pipeline` — Cron Worker (every 1 min): fetches RTG metadata, downloads PDFs from R2, sends to Gemini for full text extraction + translation (TH→EN, TH→RU), stores in D1
- `packages/web` — Astro 6 SSR site with i18n (EN/TH/RU), issue-based navigation, full document text display

## Data Flow

1. PDFs uploaded to R2 (via Playwright GitHub Action or manually)
2. Pipeline picks up unprocessed documents from D1 (1 per cron tick)
3. Gemini `gemini-3-flash-preview` extracts full Thai text + translates to EN/RU
4. Astro SSR reads from D1, renders full text with language switching

## Translation Quality

Translations must be **complete and accurate** — no loss of facts, meaning, or message. This is official document translation, not summarization.

## Content Scope

- Only 2026 (BE 2569) content
- All 4 gazette series: A (legislation), B (titles), C (trade), D (announcements)
- Languages: Thai, English, Russian (Phase 1). Backlog: zh-CN, ja, ko, de, fr, es, ASEAN

## PDF Access

ratchakitcha.soc.go.th is behind Cloudflare. Direct curl returns 403. Use Playwright (real browser) to solve CF challenge and download PDFs. SOC API token request pending (letter at docs/soc-api-letter.md, send to rsrd@soc.go.th).
