import type { APIContext } from 'astro';
import { getLatestDigests, getDigestEntries } from '../../../lib/d1.ts';
import type { Lang } from '@rtg/shared';
import { SUPPORTED_LANGS } from '@rtg/shared';
import { env } from 'cloudflare:workers';

export async function GET(context: APIContext): Promise<Response> {
  const lang = context.params.lang as Lang;
  if (!SUPPORTED_LANGS.includes(lang)) {
    return new Response('Not found', { status: 404 });
  }

  const db = env.DB;

  const digests = await getLatestDigests(db, 20);

  let items = '';
  for (const d of digests) {
    const entries = await getDigestEntries(db, d.date, lang);
    for (const entry of entries) {
      const entryUrl = `https://rtg.center/${lang}/${d.date}`;
      items += `
    <entry>
      <title>${escapeXml(entry.title)}</title>
      <link href="${entryUrl}" rel="alternate" type="text/html"/>
      <id>urn:rtg:${entry.recordId}</id>
      <updated>${d.date}T00:00:00Z</updated>
      <summary type="html">${escapeXml(
        (entry.summary ? `<p>${entry.summary}</p>` : '') +
        `<p lang="th">${entry.titleTh}</p>` +
        `<p>Series ${entry.series} · Vol. ${entry.volume} · Sec. ${entry.section}</p>`
      )}</summary>
      <category term="${entry.series}"/>
    </entry>`;
    }
  }

  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang}">
  <title>RTG Digest (${lang.toUpperCase()})</title>
  <subtitle>Royal Thai Gazette multilingual digest</subtitle>
  <link href="https://rtg.center/${lang}/" rel="alternate" type="text/html"/>
  <link href="https://rtg.center/api/feed/${lang}.xml" rel="self" type="application/atom+xml"/>
  <id>urn:rtg:feed:${lang}</id>
  <updated>${digests[0]?.date ?? new Date().toISOString().split('T')[0]}T00:00:00Z</updated>
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
