import type { APIContext } from 'astro';
import { getAllDigestDates, getAllPublishedIds } from '../lib/d1.ts';
import { SUPPORTED_LANGS } from '@rtg/shared';
import { env } from 'cloudflare:workers';

export async function GET(_context: APIContext): Promise<Response> {
  const db = env.DB;

  const [dates, { documentIds }] = await Promise.all([
    getAllDigestDates(db),
    getAllPublishedIds(db),
  ]);

  let urls = '';

  // Static pages
  for (const lang of SUPPORTED_LANGS) {
    urls += url(`https://rtg.center/${lang}/`, 'daily', '1.0');
    urls += url(`https://rtg.center/${lang}/archive`, 'daily', '0.6');
    urls += url(`https://rtg.center/${lang}/search`, 'weekly', '0.5');
    urls += url(`https://rtg.center/${lang}/about`, 'monthly', '0.3');
  }

  // Date digest pages
  for (const d of dates) {
    for (const lang of SUPPORTED_LANGS) {
      urls += url(`https://rtg.center/${lang}/${d.date}`, 'weekly', '0.8');
    }
  }

  // Document pages
  for (const id of documentIds) {
    for (const lang of SUPPORTED_LANGS) {
      urls += url(`https://rtg.center/${lang}/doc/${encodeURIComponent(id)}`, 'weekly', '0.7');
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function url(loc: string, changefreq: string, priority: string): string {
  return `  <url>
    <loc>${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>\n`;
}
