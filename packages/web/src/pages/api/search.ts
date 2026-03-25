import type { APIContext } from 'astro';
import { searchDocuments } from '../../lib/d1.ts';
import type { Lang } from '@rtg/shared';
import { SUPPORTED_LANGS } from '@rtg/shared';
import { env } from 'cloudflare:workers';

export async function GET(context: APIContext): Promise<Response> {
  const url = new URL(context.request.url);
  const q = url.searchParams.get('q')?.trim();
  const lang = (url.searchParams.get('lang') || 'en') as Lang;

  if (!q || q.length < 2) {
    return Response.json({ error: 'Query too short', results: [] }, { status: 400 });
  }

  if (!SUPPORTED_LANGS.includes(lang)) {
    return Response.json({ error: 'Unsupported language', results: [] }, { status: 400 });
  }

  const db = env.DB;

  const results = await searchDocuments(db, q, lang);

  return Response.json(
    { query: q, lang, count: results.length, results },
    {
      headers: { 'Cache-Control': 'public, max-age=300' },
    },
  );
}
