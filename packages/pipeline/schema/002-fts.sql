-- Full-text search for translated titles and summaries
CREATE VIRTUAL TABLE IF NOT EXISTS translations_fts USING fts5(
  title,
  summary,
  content='translations',
  content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS translations_ai AFTER INSERT ON translations BEGIN
  INSERT INTO translations_fts(rowid, title, summary)
  VALUES (new.id, new.title, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS translations_ad AFTER DELETE ON translations BEGIN
  INSERT INTO translations_fts(translations_fts, rowid, title, summary)
  VALUES ('delete', old.id, old.title, old.summary);
END;

CREATE TRIGGER IF NOT EXISTS translations_au AFTER UPDATE ON translations BEGIN
  INSERT INTO translations_fts(translations_fts, rowid, title, summary)
  VALUES ('delete', old.id, old.title, old.summary);
  INSERT INTO translations_fts(rowid, title, summary)
  VALUES (new.id, new.title, new.summary);
END;
