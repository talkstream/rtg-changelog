import { SERIES_MAP, MIN_DATE } from '@rtg/shared';
import type { SourceRecord } from '@rtg/shared';

const CKAN_BASE = 'https://opend.data.go.th/api/v2';
const DATASET_ID = 'dataset_02_04';

interface CkanRecord {
  [key: string]: string | number;
}

/**
 * Parse CKAN date field to ISO format
 */
function parseDateField(val: string | number): string | null {
  const str = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const year = parseInt(str.substring(0, 4));
    const ceYear = year > 2500 ? year - 543 : year;
    return `${ceYear}-${str.substring(5, 10)}`;
  }
  return null;
}

/**
 * Map Thai series character to Latin letter
 */
function mapSeries(thaiType: string): string {
  for (const [thChar, latin] of Object.entries(SERIES_MAP)) {
    if (String(thaiType).includes(thChar)) return latin;
  }
  return 'D';
}

/**
 * Fetch latest RTG records from data.go.th CKAN API.
 * Requires API key stored in env.
 */
export async function fetchFromCkan(apiKey?: string): Promise<SourceRecord[]> {
  if (!apiKey) return [];

  const params = new URLSearchParams({
    resource_id: DATASET_ID,
    limit: '100',
    sort: 'วันที่ desc',
  });

  const res = await fetch(`${CKAN_BASE}/datastore_search?${params}`, {
    headers: {
      'api-key': apiKey,
    },
    signal: AbortSignal.timeout(25000),
  });

  if (!res.ok) return [];

  const data = await res.json() as { result: { records: CkanRecord[] } };
  if (!data?.result?.records) return [];

  const records: SourceRecord[] = [];
  for (const item of data.result.records) {
    const date = parseDateField(item['วันที่'] as string);
    if (!date || date < MIN_DATE) continue;

    records.push({
      date,
      title: String(item['เรื่อง'] || ''),
      volume: Number(item['เล่ม']) || 0,
      section: String(item['ตอน'] || ''),
      type: mapSeries(String(item['ประเภท'] || '')),
      page: Number(item['หน้า']) || 0,
      url: String(item['URL'] || item['url'] || ''),
    });
  }

  return records;
}
