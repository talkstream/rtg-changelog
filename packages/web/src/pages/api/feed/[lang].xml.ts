import type { APIContext } from 'astro';
import { getLatestDocuments } from '../../../lib/d1.ts';
import type { Lang } from '@rtg/shared';
import { SUPPORTED_LANGS } from '@rtg/shared';
import { env } from 'cloudflare:workers';

export async function GET(context: APIContext): Promise<Response> {
  const lang = context.params.lang as Lang;
  if (!SUPPORTED_LANGS.includes(lang)) {
    return new Response('Not found', { status: 404 });
  }

  const db = env.DB;

  const documents = await getLatestDocuments(db, lang, 50);

  let items = '';
  for (const doc of documents) {
    const docUrl = `https://rtg.center/${lang}/doc/${doc.id}`;
    // Build summary: first 500 chars of content, or summary, or title
    const excerpt = doc.content
      ? escapeXml(stripHtml(doc.content).slice(0, 500))
      : doc.summary
        ? escapeXml(doc.summary)
        : escapeXml(doc.title);

    items += `
    <entry>
      <title>${escapeXml(doc.title)}</title>
      <link href="${docUrl}" rel="alternate" type="text/html"/>
      <id>urn:rtg:doc:${doc.id}</id>
      <updated>${doc.publishedDate ?? new Date().toISOString().split('T')[0]}T00:00:00Z</updated>
      <summary type="html">${excerpt}</summary>${doc.series ? `\n      <category term="${escapeXml(doc.series)}"/>` : ''}${doc.documentType ? `\n      <category term="${escapeXml(doc.documentType)}"/>` : ''}
    </entry>`;
  }

  const latestDate = documents[0]?.publishedDate ?? new Date().toISOString().split('T')[0];

  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang}">
  <title>RTG Digest (${lang.toUpperCase()})</title>
  <subtitle>Royal Thai Gazette — full document translations</subtitle>
  <link href="https://rtg.center/${lang}/" rel="alternate" type="text/html"/>
  <link href="https://rtg.center/api/feed/${lang}.xml" rel="self" type="application/atom+xml"/>
  <id>urn:rtg:feed:${lang}</id>
  <updated>${latestDate}T00:00:00Z</updated>
  <author><name>rtg.center</name></author>
  <rights>Government documents are public domain under Thai law</rights>
  ${items}
</feed>`;

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Strip HTML tags for plain-text excerpts */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
