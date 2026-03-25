import { z } from 'zod';

export const seriesSchema = z.enum(['A', 'B', 'C', 'D']);
export const langSchema = z.enum(['en', 'ru', 'th']);

export const geminiTranslationSchema = z.object({
  id: z.string(),
  title_en: z.string(),
  title_ru: z.string(),
  relevance_score: z.number().int().min(1).max(5),
  relevance_tags: z.array(z.string()),
  summary_en: z.string().nullable(),
  summary_ru: z.string().nullable(),
});

export const geminiResponseSchema = z.array(geminiTranslationSchema);

export const sourceRecordSchema = z.object({
  date: z.string(),
  title: z.string(),
  volume: z.coerce.number(),
  section: z.string(),
  type: z.string(),
  page: z.coerce.number(),
  url: z.string().url().optional().default(''),
  id: z.string().optional(),
});
