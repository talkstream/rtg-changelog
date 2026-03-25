import type { Lang } from '@rtg/shared';

// -- Row types returned from D1 --

interface IssueRow {
  id: number;
  published_date: string;
  volume: number;
  section: string;
  series: string;
  document_count: number;
  status: string;
}

interface DocumentRow {
  id: number;
  issue_id: number;
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
  id: number;
  publishedDate: string;
  volume: number;
  section: string;
  series: string;
  documentCount: number;
}

export interface DocumentView {
  id: number;
  issueId: number;
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
    keyTerms: row.key_terms ? JSON.parse(row.key_terms) : [],
    relevanceScore: row.relevance_score,
    relevanceTags: row.relevance_tags ? JSON.parse(row.relevance_tags) : [],
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

/**
 * Get the latest gazette issues
 */
export async function getLatestIssues(
  db: D1Database,
  limit = 10,
): Promise<IssueView[]> {
  const { results } = await db
    .prepare(
      `SELECT id, published_date, volume, section, series, document_count, status
       FROM gazette_issues
       WHERE status = 'published'
       ORDER BY published_date DESC, volume DESC, section
       LIMIT ?`,
    )
    .bind(limit)
    .all<IssueRow>();

  return (results ?? []).map(mapIssue);
}

/**
 * Get all published gazette issues (for archive)
 */
export async function getAllIssues(db: D1Database): Promise<IssueView[]> {
  const { results } = await db
    .prepare(
      `SELECT id, published_date, volume, section, series, document_count, status
       FROM gazette_issues
       WHERE status = 'published'
       ORDER BY published_date DESC, volume DESC, section`,
    )
    .all<IssueRow>();

  return (results ?? []).map(mapIssue);
}

/**
 * Get a single issue by ID
 */
export async function getIssueById(
  db: D1Database,
  id: number,
): Promise<IssueView | null> {
  const row = await db
    .prepare(
      `SELECT id, published_date, volume, section, series, document_count, status
       FROM gazette_issues
       WHERE id = ? AND status = 'published'`,
    )
    .bind(id)
    .first<IssueRow>();

  return row ? mapIssue(row) : null;
}

/**
 * Get all documents for a given issue
 */
export async function getDocumentsByIssue(
  db: D1Database,
  issueId: number,
  lang: Lang,
): Promise<DocumentView[]> {
  const { results } = await db
    .prepare(
      `SELECT d.*, i.published_date, i.volume, i.section, i.series
       FROM gazette_documents d
       JOIN gazette_issues i ON i.id = d.issue_id
       WHERE d.issue_id = ? AND d.processed = 1
       ORDER BY d.page ASC NULLS LAST`,
    )
    .bind(issueId)
    .all<DocumentWithIssueRow>();

  return (results ?? []).map((r) => mapDocumentWithIssue(r, lang));
}

/**
 * Get a single document by ID
 */
export async function getDocumentById(
  db: D1Database,
  id: number,
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
    .bind(`%${query}%`, `%${query}%`, `%${query}%`, limit)
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
 * Get all published issue IDs and document IDs (for sitemap)
 */
export async function getAllPublishedIds(
  db: D1Database,
): Promise<{ issueIds: number[]; documentIds: number[] }> {
  const [issues, docs] = await Promise.all([
    db
      .prepare(
        `SELECT id FROM gazette_issues WHERE status = 'published' ORDER BY published_date DESC`,
      )
      .all<{ id: number }>(),
    db
      .prepare(
        `SELECT d.id FROM gazette_documents d
         JOIN gazette_issues i ON i.id = d.issue_id
         WHERE d.processed = 1 AND i.status = 'published'`,
      )
      .all<{ id: number }>(),
  ]);

  return {
    issueIds: (issues.results ?? []).map((r) => r.id),
    documentIds: (docs.results ?? []).map((r) => r.id),
  };
}
