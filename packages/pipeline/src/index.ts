import { fetchFromGdCatalog } from './fetchers/gdcatalog.js';
import { fetchFromCkan } from './fetchers/ckan.js';
import { translateBatch, extractAndTranslatePdf } from './processors/gemini.js';
import {
  insertRawRecords,
  insertTranslations,
  markProcessed,
  upsertDigests,
  logPipelineRun,
  upsertGazetteIssue,
  insertGazetteDocument,
  getNextUnprocessedDocument,
  updateDocumentWithTranslation,
  markDocumentError,
  updateIssueStatus,
} from './storage/d1.js';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  PDF_STORE: R2Bucket;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  BATCH_SIZE: string;
  CKAN_API_KEY?: string;
}

/**
 * Encode an ArrayBuffer as base64 string.
 * Uses built-in btoa available in Workers runtime.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const batchSize = parseInt(env.BATCH_SIZE) || 15;
    const startedAt = new Date().toISOString();
    let totalFetched = 0;
    let totalNew = 0;
    let totalProcessed = 0;
    let totalTokens = 0;
    const errors: string[] = [];

    try {
      // ========== Phase 1: Fetch metadata from sources ==========

      let sourceRecords = await fetchFromCkan(env.CKAN_API_KEY).catch((e: Error) => {
        errors.push(`CKAN fetch error: ${e.message}`);
        return [];
      });

      // Fallback to GD Catalog if CKAN returned nothing
      if (sourceRecords.length === 0) {
        sourceRecords = await fetchFromGdCatalog().catch((e: Error) => {
          errors.push(`GD Catalog fetch error: ${e.message}`);
          return [];
        });
      }

      totalFetched = sourceRecords.length;

      // ========== Phase 2: Ingest into V1 tables (backward compat) ==========

      if (sourceRecords.length > 0) {
        const newRecords = await insertRawRecords(env.DB, sourceRecords, 'gdcatalog');
        totalNew = newRecords.length;

        if (newRecords.length > 0) {
          // V1 title-only translation in batches
          for (let i = 0; i < newRecords.length; i += batchSize) {
            const batch = newRecords.slice(i, i + batchSize);
            try {
              const { translations, tokensUsed } = await translateBatch(
                batch,
                env.GEMINI_API_KEY,
                env.GEMINI_MODEL,
              );

              const tokensPerRecord = Math.ceil(tokensUsed / batch.length);
              await insertTranslations(env.DB, translations, tokensPerRecord);
              await markProcessed(
                env.DB,
                batch.map((r) => r.id),
                1,
              );

              totalProcessed += batch.length;
              totalTokens += tokensUsed;
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              errors.push(`Gemini batch error: ${msg}`);
              await markProcessed(
                env.DB,
                batch.map((r) => r.id),
                2,
              );
            }
          }

          // Upsert digest entries for affected dates
          const affectedDates = [...new Set(newRecords.map((r) => r.published_date))];
          await upsertDigests(env.DB, affectedDates);

          // Invalidate KV cache for affected pages
          for (const date of affectedDates) {
            for (const lang of ['en', 'ru', 'th']) {
              await env.KV.delete(`page:${lang}:${date}`);
            }
          }
          for (const lang of ['en', 'ru', 'th']) {
            await env.KV.delete(`page:${lang}:latest`);
          }
        }

        // ========== Phase 3: Ingest into V2 tables ==========

        for (const record of sourceRecords) {
          try {
            const gazetteIssueId = await upsertGazetteIssue(env.DB, record);
            await insertGazetteDocument(env.DB, record, gazetteIssueId);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push(`V2 ingest error: ${msg}`);
          }
        }
      }

      // ========== Phase 4: Process one PDF document from R2 ==========
      // Process one document per cron tick to stay within 30s CPU limit

      const pendingDoc = await getNextUnprocessedDocument(env.DB);

      if (pendingDoc) {
        try {
          // Check if PDF exists in R2
          const r2Object = await env.PDF_STORE.get(pendingDoc.r2_key);

          if (r2Object) {
            const pdfBuffer = await r2Object.arrayBuffer();
            const pdfBase64 = arrayBufferToBase64(pdfBuffer);

            const { document: geminiResult, tokensUsed } = await extractAndTranslatePdf(
              pdfBase64,
              env.GEMINI_API_KEY,
              env.GEMINI_MODEL,
            );

            await updateDocumentWithTranslation(
              env.DB,
              pendingDoc.id,
              geminiResult,
              tokensUsed,
            );
            await updateIssueStatus(env.DB, pendingDoc.issue_id);

            totalProcessed += 1;
            totalTokens += tokensUsed;

            console.log(
              `V2: processed document ${pendingDoc.id} (${pendingDoc.r2_key}), tokens=${tokensUsed}`,
            );
          } else {
            // PDF not yet in R2 — skip for now, will retry next tick
            console.log(`V2: PDF not in R2 yet: ${pendingDoc.r2_key}`);
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`V2 PDF processing error (${pendingDoc.id}): ${msg}`);
          await markDocumentError(env.DB, pendingDoc.id);
          await updateIssueStatus(env.DB, pendingDoc.issue_id);
        }
      }

      // ========== Phase 5: Log pipeline run ==========

      if (totalFetched === 0 && !pendingDoc) {
        // Nothing happened — throttle logging to once per 10 minutes
        const lastLog = await env.KV.get('pipeline:last_empty_log');
        const now = Date.now();
        if (!lastLog || now - parseInt(lastLog) > 600_000) {
          await logPipelineRun(env.DB, {
            started_at: startedAt,
            records_fetched: 0,
            records_new: 0,
            records_processed: 0,
            tokens_used: 0,
            errors: errors.length > 0 ? JSON.stringify(errors) : null,
            status: errors.length > 0 ? 'error' : 'success',
          });
          await env.KV.put('pipeline:last_empty_log', String(now));
        }
        return;
      }

      const pipelineStatus = errors.length > 0 && totalProcessed > 0 ? 'partial' : errors.length > 0 ? 'error' : 'success';
      await logPipelineRun(env.DB, {
        started_at: startedAt,
        records_fetched: totalFetched,
        records_new: totalNew,
        records_processed: totalProcessed,
        tokens_used: totalTokens,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        status: pipelineStatus,
      });

      console.log(
        `Pipeline: fetched=${totalFetched} new=${totalNew} processed=${totalProcessed} tokens=${totalTokens}`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Pipeline fatal error: ${msg}`);
      await logPipelineRun(env.DB, {
        started_at: startedAt,
        records_fetched: totalFetched,
        records_new: totalNew,
        records_processed: totalProcessed,
        tokens_used: totalTokens,
        errors: JSON.stringify([...errors, `Fatal: ${msg}`]),
        status: 'error',
      });
    }
  },
};
