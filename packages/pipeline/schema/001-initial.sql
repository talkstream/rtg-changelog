-- Raw records from source (immutable)
CREATE TABLE IF NOT EXISTS raw_records (
  id TEXT PRIMARY KEY,
  source_hash TEXT NOT NULL UNIQUE,
  published_date TEXT NOT NULL,
  title_th TEXT NOT NULL,
  volume INTEGER NOT NULL,
  section TEXT NOT NULL,
  series TEXT NOT NULL CHECK(series IN ('A','B','C','D')),
  page INTEGER,
  pdf_url TEXT,
  source TEXT NOT NULL DEFAULT 'gdcatalog',
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed INTEGER NOT NULL DEFAULT 0
) STRICT;

-- AI translations per language
CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id TEXT NOT NULL REFERENCES raw_records(id),
  lang TEXT NOT NULL CHECK(lang IN ('en','ru','th')),
  title TEXT NOT NULL,
  summary TEXT,
  relevance_score INTEGER CHECK(relevance_score BETWEEN 1 AND 5),
  relevance_tags TEXT,
  tokens_used INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(record_id, lang)
) STRICT;

-- Daily digest groupings
CREATE TABLE IF NOT EXISTS digests (
  id TEXT PRIMARY KEY,
  published_date TEXT NOT NULL UNIQUE,
  record_count INTEGER NOT NULL DEFAULT 0,
  high_relevance_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

-- Pipeline execution log
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  records_fetched INTEGER NOT NULL DEFAULT 0,
  records_new INTEGER NOT NULL DEFAULT 0,
  records_processed INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  status TEXT NOT NULL DEFAULT 'running'
) STRICT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_raw_date ON raw_records(published_date);
CREATE INDEX IF NOT EXISTS idx_raw_series ON raw_records(series);
CREATE INDEX IF NOT EXISTS idx_raw_processed ON raw_records(processed);
CREATE INDEX IF NOT EXISTS idx_trans_record_lang ON translations(record_id, lang);
CREATE INDEX IF NOT EXISTS idx_digests_status ON digests(status);
