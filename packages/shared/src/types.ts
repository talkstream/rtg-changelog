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
