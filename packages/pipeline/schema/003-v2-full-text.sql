-- V2: Full gazette text extraction and translation
-- Gazette issues (volume + section = one issue)
CREATE TABLE IF NOT EXISTS gazette_issues (
  id TEXT PRIMARY KEY,
  published_date TEXT NOT NULL,
  volume INTEGER NOT NULL,
  section TEXT NOT NULL,
  series TEXT NOT NULL CHECK(series IN ('A','B','C','D')),
  document_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

-- Individual gazette documents with full text
CREATE TABLE IF NOT EXISTS gazette_documents (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES gazette_issues(id),
  page INTEGER,
  pdf_url TEXT,
  r2_key TEXT,

  title_th TEXT NOT NULL,
  content_th TEXT,

  title_en TEXT,
  content_en TEXT,

  title_ru TEXT,
  content_ru TEXT,

  document_type TEXT,
  issuing_authority TEXT,
  effective_date TEXT,
  key_terms TEXT,

  relevance_score INTEGER CHECK(relevance_score BETWEEN 1 AND 5),
  relevance_tags TEXT,
  summary_en TEXT,
  summary_ru TEXT,

  processed INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER,
  source TEXT NOT NULL DEFAULT 'gdcatalog',
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_issues_date ON gazette_issues(published_date);
CREATE INDEX IF NOT EXISTS idx_issues_series ON gazette_issues(series);
CREATE INDEX IF NOT EXISTS idx_issues_status ON gazette_issues(status);
CREATE INDEX IF NOT EXISTS idx_docs_issue ON gazette_documents(issue_id);
CREATE INDEX IF NOT EXISTS idx_docs_processed ON gazette_documents(processed);

-- FTS on full translated content
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  title_en, content_en, title_ru, content_ru,
  content='gazette_documents', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS docs_fts_ai AFTER INSERT ON gazette_documents BEGIN
  INSERT INTO documents_fts(rowid, title_en, content_en, title_ru, content_ru)
  VALUES (new.rowid, new.title_en, new.content_en, new.title_ru, new.content_ru);
END;

CREATE TRIGGER IF NOT EXISTS docs_fts_ad AFTER DELETE ON gazette_documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title_en, content_en, title_ru, content_ru)
  VALUES ('delete', old.rowid, old.title_en, old.content_en, old.title_ru, old.content_ru);
END;

CREATE TRIGGER IF NOT EXISTS docs_fts_au AFTER UPDATE ON gazette_documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title_en, content_en, title_ru, content_ru)
  VALUES ('delete', old.rowid, old.title_en, old.content_en, old.title_ru, old.content_ru);
  INSERT INTO documents_fts(rowid, title_en, content_en, title_ru, content_ru)
  VALUES (new.rowid, new.title_en, new.content_en, new.title_ru, new.content_ru);
END;
