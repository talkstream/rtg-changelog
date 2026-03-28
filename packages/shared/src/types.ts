// Series mapping: Thai → Latin
export type Series = 'A' | 'B' | 'C' | 'D';
export type Lang = 'en' | 'ru' | 'th';
export type ProcessedStatus = 0 | 1 | 2; // 0=pending, 1=done, 2=error

export interface RawRecord {
  id: string;
  source_hash: string;
  published_date: string; // YYYY-MM-DD
  title_th: string;
  volume: number;
  section: string;
  series: Series;
  page: number | null;
  pdf_url: string | null;
  source: string;
  fetched_at: string;
  processed: ProcessedStatus;
}

export interface Translation {
  id: number;
  record_id: string;
  lang: Lang;
  title: string;
  summary: string | null;
  relevance_score: number | null;
  relevance_tags: string | null; // JSON array string
  tokens_used: number | null;
  created_at: string;
}

export interface Digest {
  id: string; // YYYY-MM-DD
  published_date: string;
  record_count: number;
  high_relevance_count: number;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface PipelineRun {
  id: number;
  started_at: string;
  completed_at: string | null;
  records_fetched: number;
  records_new: number;
  records_processed: number;
  tokens_used: number;
  errors: string | null;
  status: 'running' | 'success' | 'error';
}

// Gemini API response per record
export interface GeminiTranslation {
  id: string;
  title_en: string;
  title_ru: string;
  relevance_score: number;
  relevance_tags: string[];
  summary_en: string | null;
  summary_ru: string | null;
}

// Source record from GD Catalog / CKAN
export interface SourceRecord {
  date: string;      // วันที่
  title: string;     // เรื่อง
  volume: number;    // เล่ม
  section: string;   // ตอน
  type: string;      // ประเภท (ก/ข/ค/ง)
  page: number;      // หน้า
  url: string;       // PDF URL
  id?: string;       // Existing ID if available
}

// Digest entry with all translations for rendering
export interface DigestEntry {
  record: RawRecord;
  translations: Record<Lang, Translation | null>;
}

// V2: Full-text gazette types

export type IssueStatus = 'pending' | 'processing' | 'published' | 'error';
export type DocumentType = 'law' | 'decree' | 'regulation' | 'announcement' | 'order';

export interface GazetteIssue {
  id: string;
  published_date: string;
  volume: number;
  section: string;
  series: Series;
  document_count: number;
  status: IssueStatus;
  created_at: string;
  updated_at: string;
}

export interface GazetteDocument {
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

  document_type: DocumentType | null;
  issuing_authority: string | null;
  effective_date: string | null;
  key_terms: string | null; // JSON array string

  relevance_score: number | null;
  relevance_tags: string | null; // JSON array string
  summary_en: string | null;
  summary_ru: string | null;

  processed: ProcessedStatus;
  tokens_used: number | null;
  source: string;
  fetched_at: string;
}

// Gemini multimodal response for full document extraction
export interface GeminiDocumentResponse {
  title_th: string;
  title_en: string;
  title_ru: string;
  content_th: string;
  content_en: string;
  content_ru: string;
  document_type: DocumentType;
  issuing_authority: string;
  effective_date: string | null;
  key_terms: string[];
  relevance_score: number;
  relevance_tags: string[];
  summary_en: string | null;
  summary_ru: string | null;
}
