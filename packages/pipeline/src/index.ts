import { fetchFromGdCatalog } from './fetchers/gdcatalog.js';
import { fetchFromCkan } from './fetchers/ckan.js';
import { translateBatch } from './processors/gemini.js';
import {
  insertRawRecords,
  insertTranslations,
  markProcessed,
  upsertDigests,
  logPipelineRun,
} from './storage/d1.js';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  BATCH_SIZE: string;
  CKAN_API_KEY?: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const batchSize = parseInt(env.BATCH_SIZE) || 15;
    let totalFetched = 0;
    let totalNew = 0;
    let totalProcessed = 0;
    let totalTokens = 0;
    const errors: string[] = [];

    try {
      // 1. Fetch from available sources
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

      if (sourceRecords.length === 0) {
        // Nothing new, log a quiet run only every 10 minutes to avoid log spam
        const lastLog = await env.KV.get('pipeline:last_empty_log');
        const now = Date.now();
        if (!lastLog || now - parseInt(lastLog) > 600_000) {
          await logPipelineRun(env.DB, {
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

      // 2. Insert raw records (dedup via UNIQUE constraint)
      const newRecords = await insertRawRecords(env.DB, sourceRecords, 'gdcatalog');
      totalNew = newRecords.length;

      if (newRecords.length === 0) {
        // All records already exist
        return;
      }

      // 3. Process in batches through Gemini
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

      // 4. Upsert digest entries for affected dates
      const affectedDates = [...new Set(newRecords.map((r) => r.published_date))];
      await upsertDigests(env.DB, affectedDates);

      // 5. Invalidate KV cache for affected pages
      for (const date of affectedDates) {
        for (const lang of ['en', 'ru', 'th']) {
          await env.KV.delete(`page:${lang}:${date}`);
        }
        // Also invalidate homepage cache
        await env.KV.delete(`page:${lang}:latest`);
      }
      // Invalidate all homepage caches
      for (const lang of ['en', 'ru', 'th']) {
        await env.KV.delete(`page:${lang}:latest`);
      }

      // 6. Log pipeline run
      await logPipelineRun(env.DB, {
        records_fetched: totalFetched,
        records_new: totalNew,
        records_processed: totalProcessed,
        tokens_used: totalTokens,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        status: errors.length > 0 ? 'error' : 'success',
      });

      console.log(
        `Pipeline: fetched=${totalFetched} new=${totalNew} processed=${totalProcessed} tokens=${totalTokens}`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Pipeline fatal error: ${msg}`);
      await logPipelineRun(env.DB, {
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
