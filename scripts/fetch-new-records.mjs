#!/usr/bin/env node
/**
 * Fetch latest gazette metadata from GD Catalog and output PDF URLs
 * that need to be downloaded. Writes to /tmp/rtg-pdfs-needed.json
 */

const GDCATALOG_API = 'https://soc.gdcatalog.go.th/api/3/action/package_show?id=dataset_02_04';
const MIN_DATE = '2025-01-01'; // Include recent data for testing

const SERIES_MAP = { 'ก': 'A', 'ข': 'B', 'ค': 'C', 'ง': 'D' };

function parseDate(dateStr) {
  // DD/MM/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const year = parseInt(dateStr.substring(0, 4));
    const ceYear = year > 2500 ? year - 543 : year;
    return `${ceYear}-${dateStr.substring(5)}`;
  }
  return null;
}

async function main() {
  console.log('Fetching GD Catalog metadata...');
  const res = await fetch(GDCATALOG_API);
  if (!res.ok) {
    console.error(`GD Catalog API error: ${res.status}`);
    process.exit(1);
  }

  const data = await res.json();
  const resources = data.result.resources
    .filter(r => r.format?.toUpperCase() === 'JSON')
    .reverse(); // Latest first

  const pdfUrls = [];

  // Process latest 2 resources
  for (const resource of resources.slice(0, 2)) {
    console.log(`Fetching: ${resource.name}`);
    const rRes = await fetch(resource.url);
    if (!rRes.ok) continue;

    const records = await rRes.json();
    for (const r of records) {
      const date = parseDate(r['วันที่'] || '');
      if (!date || date < MIN_DATE) continue;

      const series = SERIES_MAP[r['ประเภท']?.trim()] || 'D';
      const volume = parseInt(r['เล่ม']) || 0;
      const section = r['ตอน'] || '';
      const page = parseInt(r['หน้า']) || 0;
      const url = r['URL'] || '';

      if (url && url.includes('ratchakitcha.soc.go.th')) {
        pdfUrls.push({
          date,
          title: r['เรื่อง'] || '',
          volume,
          section,
          series,
          page,
          url,
          // R2 key format: docs/{docId}.pdf (extracted from URL)
          r2Key: `docs/${url.split('/').pop()}`,
        });
      }
    }
  }

  console.log(`Found ${pdfUrls.length} PDF URLs`);

  // Write to file for the download step
  const { writeFileSync, mkdirSync } = await import('fs');
  mkdirSync('/tmp/rtg-pdfs', { recursive: true });
  writeFileSync('/tmp/rtg-pdfs-needed.json', JSON.stringify(pdfUrls, null, 2));
  console.log('Written to /tmp/rtg-pdfs-needed.json');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
