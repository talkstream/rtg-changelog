import type { Lang } from '@rtg/shared';

// -- Row types returned from D1 --

interface IssueRow {
  id: string;
  published_date: string;
  volume: number;
  section: string;
  series: string;
  document_count: number;
  status: string;
}

interface DocumentRow {
  id: string;
  issue_id: string;
  page: number | null;
  pdf_url: string | null;
  r2_key: string | null;
  title_th: string;
  content_th: string | null;
  title_en: string | null;
  content_en: string | null;
  title_ru: string | null;
  content_ru: string | null;
  document_type: string | null;
  issuing_authority: string | null;
  effective_date: string | null;
  key_terms: string | null;
  relevance_score: number | null;
  relevance_tags: string | null;
  summary_en: string | null;
  summary_ru: string | null;
  processed: number;
  source: string | null;
  fetched_at: string | null;
}

// Extended row that includes issue fields via JOIN
interface DocumentWithIssueRow extends DocumentRow {
  published_date: string;
  volume: number;
  section: string;
  series: string;
}

// -- View types for components --

export interface IssueView {
  id: string;
  publishedDate: string;
  volume: number;
  section: string;
  series: string;
  documentCount: number;
}

export interface DocumentView {
  id: string;
  issueId: string;
  page: number | null;
  pdfUrl: string | null;
  titleTh: string;
  title: string;
  content: string | null;
  documentType: string | null;
  issuingAuthority: string | null;
  effectiveDate: string | null;
  keyTerms: string[];
  relevanceScore: number | null;
  relevanceTags: string[];
  summary: string | null;
  // Issue context (populated in joined queries)
  publishedDate?: string;
  volume?: number;
  section?: string;
  series?: string;
}

// -- Helpers --

/** Pick the translated title for the given language */
function pickTitle(row: DocumentRow, lang: Lang): string {
  if (lang === 'th') return row.title_th;
  if (lang === 'ru') return row.title_ru || row.title_en || row.title_th;
  return row.title_en || row.title_th;
}

/** Pick the translated content for the given language */
function pickContent(row: DocumentRow, lang: Lang): string | null {
  if (lang === 'th') return row.content_th;
  if (lang === 'ru') return row.content_ru || row.content_en || row.content_th;
  return row.content_en || row.content_th;
}

/** Pick the translated summary for the given language */
function pickSummary(row: DocumentRow, lang: Lang): string | null {
  if (lang === 'th') return null; // No separate summary for Thai
  if (lang === 'ru') return row.summary_ru || row.summary_en;
  return row.summary_en;
}

function mapDocument(row: DocumentRow, lang: Lang): DocumentView {
  return {
    id: row.id,
    issueId: row.issue_id,
    page: row.page,
    pdfUrl: row.pdf_url,
    titleTh: row.title_th,
    title: pickTitle(row, lang),
    content: pickContent(row, lang),
    documentType: row.document_type,
    issuingAuthority: row.issuing_authority,
    effectiveDate: row.effective_date,
    keyTerms: (() => { try { return row.key_terms ? JSON.parse(row.key_terms) : []; } catch { return []; } })(),
    relevanceScore: row.relevance_score,
    relevanceTags: (() => { try { return row.relevance_tags ? JSON.parse(row.relevance_tags) : []; } catch { return []; } })(),
    summary: pickSummary(row, lang),
  };
}

function mapDocumentWithIssue(
  row: DocumentWithIssueRow,
  lang: Lang,
): DocumentView {
  const doc = mapDocument(row, lang);
  doc.publishedDate = row.published_date;
  doc.volume = row.volume;
  doc.section = row.section;
  doc.series = row.series;
  return doc;
}

function mapIssue(row: IssueRow): IssueView {
  return {
    id: row.id,
    publishedDate: row.published_date,
    volume: row.volume,
    section: row.section,
    series: row.series,
    documentCount: row.document_count,
  };
}

// -- Query functions --

// -- Date-based digest queries --

export interface DigestDate {
  date: string; // YYYY-MM-DD
  totalDocs: number;
  issueCount: number;
}

interface DigestDateRow {
  published_date: string;
  total_docs: number;
  issue_count: number;
}

/**
 * Get distinct dates with document counts (for homepage + archive)
 */
export async function getLatestDigestDates(
  db: D1Database,
  limit = 10,
): Promise<DigestDate[]> {
  const { results } = await db
    .prepare(
      `SELECT published_date, SUM(document_count) as total_docs,
         COUNT(*) as issue_count
       FROM gazette_issues
       WHERE status IN ('published')
       GROUP BY published_date
       ORDER BY published_date DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<DigestDateRow>();

  return (results ?? []).map((r) => ({
    date: r.published_date,
    totalDocs: r.total_docs,
    issueCount: r.issue_count,
  }));
}

/**
 * Get all distinct dates for archive (no limit)
 */
export async function getAllDigestDates(
  db: D1Database,
): Promise<DigestDate[]> {
  const { results } = await db
    .prepare(
      `SELECT published_date, SUM(document_count) as total_docs,
         COUNT(*) as issue_count
       FROM gazette_issues
       WHERE status IN ('published')
       GROUP BY published_date
       ORDER BY published_date DESC`,
    )
    .all<DigestDateRow>();

  return (results ?? []).map((r) => ({
    date: r.published_date,
    totalDocs: r.total_docs,
    issueCount: r.issue_count,
  }));
}

/**
 * Get adjacent (prev/next) dates for navigation on daily digest pages
 */
export async function getAdjacentDates(db: D1Database, date: string): Promise<{ prev: string | null; next: string | null }> {
  const [prevResult, nextResult] = await Promise.all([
    db.prepare(`SELECT DISTINCT published_date FROM gazette_issues WHERE published_date < ? AND status IN ('published') ORDER BY published_date DESC LIMIT 1`).bind(date).first<{ published_date: string }>(),
    db.prepare(`SELECT DISTINCT published_date FROM gazette_issues WHERE published_date > ? AND status IN ('published') ORDER BY published_date ASC LIMIT 1`).bind(date).first<{ published_date: string }>(),
  ]);
  return {
    prev: prevResult?.published_date ?? null,
    next: nextResult?.published_date ?? null,
  };
}

/**
 * Get ALL documents for a specific date (for daily digest page)
 */
export async function getDocumentsByDate(
  db: D1Database,
  date: string,
  lang: Lang,
): Promise<DocumentView[]> {
  const { results } = await db
    .prepare(
      `SELECT d.*, i.published_date, i.volume, i.section, i.series
       FROM gazette_documents d
       JOIN gazette_issues i ON i.id = d.issue_id
       WHERE i.published_date = ? AND d.processed = 1
       ORDER BY i.series ASC, d.page ASC NULLS LAST`,
    )
    .bind(date)
    .all<DocumentWithIssueRow>();

  return (results ?? []).map((r) => mapDocumentWithIssue(r, lang));
}

/**
 * Get high-relevance documents (relevance_score >= 4) for highlights
 */
export async function getHighlights(
  db: D1Database,
  lang: Lang,
  limit = 10,
): Promise<DocumentView[]> {
  const { results } = await db
    .prepare(
      `SELECT d.*, i.published_date, i.volume, i.section, i.series
       FROM gazette_documents d
       JOIN gazette_issues i ON i.id = d.issue_id
       WHERE d.processed = 1 AND d.relevance_score >= 4
       ORDER BY i.published_date DESC, d.relevance_score DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<DocumentWithIssueRow>();

  return (results ?? []).map((r) => mapDocumentWithIssue(r, lang));
}

/**
 * Get a single document by ID
 */
export async function getDocumentById(
  db: D1Database,
  id: string,
  lang: Lang,
): Promise<DocumentView | null> {
  const row = await db
    .prepare(
      `SELECT d.*, i.published_date, i.volume, i.section, i.series
       FROM gazette_documents d
       JOIN gazette_issues i ON i.id = d.issue_id
       WHERE d.id = ? AND d.processed = 1`,
    )
    .bind(id)
    .first<DocumentWithIssueRow>();

  return row ? mapDocumentWithIssue(row, lang) : null;
}

/**
 * Full-text search across gazette documents
 */
export async function searchDocuments(
  db: D1Database,
  query: string,
  lang: Lang,
  limit = 50,
): Promise<DocumentView[]> {
  // Search across title and content columns for the target language
  const column =
    lang === 'th'
      ? 'title_th'
      : lang === 'ru'
        ? 'title_ru'
        : 'title_en';

  const contentCol =
    lang === 'th'
      ? 'content_th'
      : lang === 'ru'
        ? 'content_ru'
        : 'content_en';

  // Escape LIKE wildcards to prevent injection via user input
  const escaped = query.replace(/%/g, '\\%').replace(/_/g, '\\_');

  const { results } = await db
    .prepare(
      `SELECT d.*, i.published_date, i.volume, i.section, i.series
       FROM gazette_documents d
       JOIN gazette_issues i ON i.id = d.issue_id
       WHERE d.processed = 1
         AND (d.${column} LIKE ? OR d.${contentCol} LIKE ? OR d.title_th LIKE ?)
       ORDER BY i.published_date DESC, d.page ASC
       LIMIT ?`,
    )
    .bind(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`, limit)
    .all<DocumentWithIssueRow>();

  return (results ?? []).map((r) => mapDocumentWithIssue(r, lang));
}

/**
 * Get latest documents across all issues (for RSS feed)
 */
export async function getLatestDocuments(
  db: D1Database,
  lang: Lang,
  limit = 50,
): Promise<DocumentView[]> {
  const { results } = await db
    .prepare(
      `SELECT d.*, i.published_date, i.volume, i.section, i.series
       FROM gazette_documents d
       JOIN gazette_issues i ON i.id = d.issue_id
       WHERE d.processed = 1 AND i.status = 'published'
       ORDER BY i.published_date DESC, d.page ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all<DocumentWithIssueRow>();

  return (results ?? []).map((r) => mapDocumentWithIssue(r, lang));
}

/**
 * Get all published document IDs (for sitemap)
 */
export async function getAllPublishedIds(
  db: D1Database,
): Promise<{ documentIds: string[] }> {
  const docs = await db
    .prepare(
      `SELECT d.id FROM gazette_documents d
       JOIN gazette_issues i ON i.id = d.issue_id
       WHERE d.processed = 1 AND i.status = 'published'`,
    )
    .all<{ id: string }>();

  return {
    documentIds: (docs.results ?? []).map((r) => r.id),
  };
}
