import type { SourceRecord, GeminiTranslation, GeminiDocumentResponse, Series } from '@rtg/shared';

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
 * Generate a deterministic ID from document coordinates
 */
function documentId(volume: number, section: string, series: string, page: number): string {
  const raw = `${volume}:${section}:${series}:${page}`;
  // Simple hash: use first 16 hex chars of a sync-friendly hash
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  }
  // Combine with raw string for uniqueness
  return `doc_${Math.abs(h).toString(16).padStart(8, '0')}_${volume}_${series}_${page}`;
}

/**
 * Generate an issue ID from volume + section + series
 */
function issueId(volume: number, section: string, series: string): string {
  return `${volume}_${section}_${series}`;
}

// ===================== V1 Operations (kept for backward compatibility) =====================

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

// ===================== V2 Operations (gazette_issues + gazette_documents) =====================

/**
 * Upsert a gazette issue from source record metadata.
 * Returns the issue ID.
 */
export async function upsertGazetteIssue(
  db: D1Database,
  record: SourceRecord,
): Promise<string> {
  const id = issueId(record.volume, record.section, record.type);

  await db
    .prepare(
      `INSERT INTO gazette_issues (id, published_date, volume, section, series, document_count, status)
       VALUES (?, ?, ?, ?, ?, 0, 'pending')
       ON CONFLICT(id) DO UPDATE SET
         updated_at = datetime('now')`,
    )
    .bind(id, record.date, record.volume, record.section, record.type as Series)
    .run();

  return id;
}

/**
 * Insert a gazette document stub from source metadata.
 * Returns the document ID and R2 key, or null if duplicate.
 */
export async function insertGazetteDocument(
  db: D1Database,
  record: SourceRecord,
  gazetteIssueId: string,
): Promise<{ docId: string; r2Key: string } | null> {
  const docId = documentId(record.volume, record.section, record.type, record.page);
  const r2Key = `${record.volume}/${record.section}/${record.type}/${record.page}.pdf`;

  try {
    await db
      .prepare(
        `INSERT INTO gazette_documents (id, issue_id, page, pdf_url, r2_key, title_th, source)
         VALUES (?, ?, ?, ?, ?, ?, 'gdcatalog')`,
      )
      .bind(
        docId,
        gazetteIssueId,
        record.page || null,
        record.url || null,
        r2Key,
        record.title,
      )
      .run();

    return { docId, r2Key };
  } catch (e: unknown) {
    // UNIQUE constraint violation = already exists
    if (e instanceof Error && e.message.includes('UNIQUE')) return null;
    throw e;
  }
}

/**
 * Get unprocessed gazette documents that have an R2 key assigned.
 * Returns one document at a time to stay within CPU limits.
 */
export async function getNextUnprocessedDocument(
  db: D1Database,
): Promise<{ id: string; r2_key: string; title_th: string; issue_id: string } | null> {
  const result = await db
    .prepare(
      `SELECT id, r2_key, title_th, issue_id
       FROM gazette_documents
       WHERE processed = 0 AND r2_key IS NOT NULL
       ORDER BY fetched_at ASC
       LIMIT 1`,
    )
    .first<{ id: string; r2_key: string; title_th: string; issue_id: string }>();

  return result ?? null;
}

/**
 * Store full Gemini extraction result into a gazette document.
 */
export async function updateDocumentWithTranslation(
  db: D1Database,
  docId: string,
  geminiResult: GeminiDocumentResponse,
  tokensUsed: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE gazette_documents SET
         title_th = ?,
         title_en = ?,
         title_ru = ?,
         content_th = ?,
         content_en = ?,
         content_ru = ?,
         document_type = ?,
         issuing_authority = ?,
         effective_date = ?,
         key_terms = ?,
         relevance_score = ?,
         relevance_tags = ?,
         summary_en = ?,
         summary_ru = ?,
         processed = 1,
         tokens_used = ?
       WHERE id = ?`,
    )
    .bind(
      geminiResult.title_th,
      geminiResult.title_en,
      geminiResult.title_ru,
      geminiResult.content_th,
      geminiResult.content_en,
      geminiResult.content_ru,
      geminiResult.document_type,
      geminiResult.issuing_authority,
      geminiResult.effective_date,
      JSON.stringify(geminiResult.key_terms),
      geminiResult.relevance_score,
      JSON.stringify(geminiResult.relevance_tags),
      geminiResult.summary_en,
      geminiResult.summary_ru,
      tokensUsed,
      docId,
    )
    .run();
}

/**
 * Mark a gazette document as failed (processed = 2)
 */
export async function markDocumentError(
  db: D1Database,
  docId: string,
): Promise<void> {
  await db
    .prepare('UPDATE gazette_documents SET processed = 2 WHERE id = ?')
    .bind(docId)
    .run();
}

/**
 * Update gazette_issues document_count and status after processing
 */
export async function updateIssueStatus(
  db: D1Database,
  gazetteIssueId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE gazette_issues SET
         document_count = (
           SELECT COUNT(*) FROM gazette_documents WHERE issue_id = ? AND processed = 1
         ),
         status = CASE
           WHEN (SELECT COUNT(*) FROM gazette_documents WHERE issue_id = ? AND processed = 0) = 0
             THEN 'complete'
           ELSE 'processing'
         END,
         updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(gazetteIssueId, gazetteIssueId, gazetteIssueId)
    .run();
}
