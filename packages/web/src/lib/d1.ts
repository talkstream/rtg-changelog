import type { Lang } from '@rtg/shared';

interface DigestRow {
  id: string;
  published_date: string;
  record_count: number;
  high_relevance_count: number;
}

interface EntryRow {
  record_id: string;
  published_date: string;
  title_th: string;
  volume: number;
  section: string;
  series: string;
  page: number | null;
  pdf_url: string | null;
  title: string;
  summary: string | null;
  relevance_score: number | null;
  relevance_tags: string | null;
}

export interface DigestSummary {
  date: string;
  recordCount: number;
  highRelevanceCount: number;
}

export interface DigestEntryView {
  recordId: string;
  publishedDate: string;
  titleTh: string;
  title: string;
  summary: string | null;
  series: string;
  volume: number;
  section: string;
  page: number | null;
  pdfUrl: string | null;
  relevanceScore: number | null;
  relevanceTags: string[];
}

/**
 * Get the latest digest dates
 */
export async function getLatestDigests(
  db: D1Database,
  limit = 5,
): Promise<DigestSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT id, published_date, record_count, high_relevance_count
       FROM digests
       WHERE status = 'published'
       ORDER BY published_date DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<DigestRow>();

  return (results ?? []).map((r) => ({
    date: r.published_date,
    recordCount: r.record_count,
    highRelevanceCount: r.high_relevance_count,
  }));
}

/**
 * Get all entries for a specific date and language
 */
export async function getDigestEntries(
  db: D1Database,
  date: string,
  lang: Lang,
): Promise<DigestEntryView[]> {
  const { results } = await db
    .prepare(
      `SELECT
         r.id as record_id,
         r.published_date,
         r.title_th,
         r.volume,
         r.section,
         r.series,
         r.page,
         r.pdf_url,
         t.title,
         t.summary,
         t.relevance_score,
         t.relevance_tags
       FROM raw_records r
       JOIN translations t ON t.record_id = r.id AND t.lang = ?
       WHERE r.published_date = ? AND r.processed = 1
       ORDER BY t.relevance_score DESC NULLS LAST, r.series, r.page`,
    )
    .bind(lang, date)
    .all<EntryRow>();

  return (results ?? []).map((r) => ({
    recordId: r.record_id,
    publishedDate: r.published_date,
    titleTh: r.title_th,
    title: r.title,
    summary: r.summary,
    series: r.series,
    volume: r.volume,
    section: r.section,
    page: r.page,
    pdfUrl: r.pdf_url,
    relevanceScore: r.relevance_score,
    relevanceTags: r.relevance_tags ? JSON.parse(r.relevance_tags) : [],
  }));
}

/**
 * Get all published digest dates
 */
export async function getAllDigestDates(
  db: D1Database,
): Promise<DigestSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT id, published_date, record_count, high_relevance_count
       FROM digests
       WHERE status = 'published'
       ORDER BY published_date DESC`,
    )
    .all<DigestRow>();

  return (results ?? []).map((r) => ({
    date: r.published_date,
    recordCount: r.record_count,
    highRelevanceCount: r.high_relevance_count,
  }));
}

/**
 * Full-text search across translations
 */
export async function searchEntries(
  db: D1Database,
  query: string,
  lang: Lang,
  limit = 50,
): Promise<DigestEntryView[]> {
  const { results } = await db
    .prepare(
      `SELECT
         r.id as record_id,
         r.published_date,
         r.title_th,
         r.volume,
         r.section,
         r.series,
         r.page,
         r.pdf_url,
         t.title,
         t.summary,
         t.relevance_score,
         t.relevance_tags
       FROM translations_fts fts
       JOIN translations t ON t.id = fts.rowid
       JOIN raw_records r ON r.id = t.record_id
       WHERE translations_fts MATCH ? AND t.lang = ?
       ORDER BY rank
       LIMIT ?`,
    )
    .bind(query, lang, limit)
    .all<EntryRow>();

  return (results ?? []).map((r) => ({
    recordId: r.record_id,
    publishedDate: r.published_date,
    titleTh: r.title_th,
    title: r.title,
    summary: r.summary,
    series: r.series,
    volume: r.volume,
    section: r.section,
    page: r.page,
    pdfUrl: r.pdf_url,
    relevanceScore: r.relevance_score,
    relevanceTags: r.relevance_tags ? JSON.parse(r.relevance_tags) : [],
  }));
}
