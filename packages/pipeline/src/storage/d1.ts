import type { SourceRecord, GeminiTranslation, Series } from '@rtg/shared';

// Use Web Crypto API available in Workers
async function hashRecord(record: SourceRecord): Promise<string> {
  const raw = `${record.date}:${record.title}:${record.volume}:${record.section}:${record.type}:${record.page}`;
  const encoded = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Insert new raw records, skipping duplicates. Returns IDs of newly inserted records.
 */
export async function insertRawRecords(
  db: D1Database,
  records: SourceRecord[],
  source: string,
): Promise<Array<{ id: string; title_th: string; series: string; published_date: string }>> {
  const newRecords: Array<{ id: string; title_th: string; series: string; published_date: string }> = [];

  for (const record of records) {
    const sourceHash = await hashRecord(record);
    const id = sourceHash.substring(0, 16);

    try {
      await db
        .prepare(
          `INSERT INTO raw_records (id, source_hash, published_date, title_th, volume, section, series, page, pdf_url, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          sourceHash,
          record.date,
          record.title,
          record.volume,
          record.section,
          record.type as Series,
          record.page || null,
          record.url || null,
          source,
        )
        .run();

      newRecords.push({
        id,
        title_th: record.title,
        series: record.type,
        published_date: record.date,
      });
    } catch (e: unknown) {
      // UNIQUE constraint violation = duplicate, skip
      if (e instanceof Error && e.message.includes('UNIQUE')) continue;
      throw e;
    }
  }

  return newRecords;
}

/**
 * Insert translations for a batch of records
 */
export async function insertTranslations(
  db: D1Database,
  translations: GeminiTranslation[],
  tokensPerRecord: number,
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];

  for (const t of translations) {
    // English translation
    stmts.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO translations (record_id, lang, title, summary, relevance_score, relevance_tags, tokens_used)
           VALUES (?, 'en', ?, ?, ?, ?, ?)`,
        )
        .bind(
          t.id,
          t.title_en,
          t.summary_en,
          t.relevance_score,
          JSON.stringify(t.relevance_tags),
          tokensPerRecord,
        ),
    );

    // Russian translation
    stmts.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO translations (record_id, lang, title, summary, relevance_score, relevance_tags, tokens_used)
           VALUES (?, 'ru', ?, ?, ?, ?, ?)`,
        )
        .bind(
          t.id,
          t.title_ru,
          t.summary_ru,
          t.relevance_score,
          JSON.stringify(t.relevance_tags),
          tokensPerRecord,
        ),
    );

    // Thai "translation" (original title, no summary needed)
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO translations (record_id, lang, title, summary, relevance_score, relevance_tags, tokens_used)
           SELECT ?, 'th', title_th, NULL, NULL, NULL, 0
           FROM raw_records WHERE id = ?`,
        )
        .bind(t.id, t.id),
    );
  }

  // D1 batch limit is 100 statements
  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }
}

/**
 * Mark raw records as processed
 */
export async function markProcessed(
  db: D1Database,
  ids: string[],
  status: 0 | 1 | 2 = 1,
): Promise<void> {
  const stmts = ids.map((id) =>
    db.prepare('UPDATE raw_records SET processed = ? WHERE id = ?').bind(status, id),
  );

  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100));
  }
}

/**
 * Upsert digest entries for affected dates
 */
export async function upsertDigests(db: D1Database, dates: string[]): Promise<void> {
  for (const date of [...new Set(dates)]) {
    await db
      .prepare(
        `INSERT INTO digests (id, published_date, record_count, high_relevance_count, updated_at)
         VALUES (?, ?,
           (SELECT COUNT(*) FROM raw_records WHERE published_date = ? AND processed = 1),
           (SELECT COUNT(*) FROM translations WHERE record_id IN (SELECT id FROM raw_records WHERE published_date = ?) AND relevance_score >= 4 AND lang = 'en'),
           datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           record_count = excluded.record_count,
           high_relevance_count = excluded.high_relevance_count,
           updated_at = excluded.updated_at`,
      )
      .bind(date, date, date, date)
      .run();
  }
}

/**
 * Log a pipeline run
 */
export async function logPipelineRun(
  db: D1Database,
  data: {
    records_fetched: number;
    records_new: number;
    records_processed: number;
    tokens_used: number;
    errors: string | null;
    status: 'success' | 'error';
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO pipeline_runs (completed_at, records_fetched, records_new, records_processed, tokens_used, errors, status)
       VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.records_fetched,
      data.records_new,
      data.records_processed,
      data.tokens_used,
      data.errors,
      data.status,
    )
    .run();
}
