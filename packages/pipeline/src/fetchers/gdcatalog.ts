import { SERIES_MAP, MIN_DATE } from '@rtg/shared';
import type { SourceRecord } from '@rtg/shared';

const GDCATALOG_BASE = 'https://soc.gdcatalog.go.th/dataset/dataset_02_04';
const RESOURCE_LIST_URL = 'https://soc.gdcatalog.go.th/api/3/action/package_show?id=dataset_02_04';

interface GdCatalogResource {
  id: string;
  name: string;
  url: string;
  format: string;
}

interface GdCatalogRawRecord {
  วันที่: string;
  เรื่อง: string;
  เล่ม: string | number;
  ตอน: string;
  ประเภท: string;
  หน้า: string | number;
  URL?: string;
  url?: string;
  id?: string;
}

/**
 * Fetch the latest JSON resource URLs from GD Catalog
 */
async function getResourceUrls(): Promise<string[]> {
  const res = await fetch(RESOURCE_LIST_URL);
  if (!res.ok) throw new Error(`GD Catalog API error: ${res.status}`);

  const data = await res.json() as { result: { resources: GdCatalogResource[] } };
  return data.result.resources
    .filter((r) => r.format?.toLowerCase() === 'json')
    .map((r) => r.url)
    .reverse(); // Latest first
}

/**
 * Parse a Thai date string to ISO format.
 * Thai dates may be in formats like "25 มีนาคม 2569" or "2569-03-25"
 */
function parseThaiDate(dateStr: string): string | null {
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const year = parseInt(dateStr.substring(0, 4));
    // Convert Buddhist Era to CE if needed
    const ceYear = year > 2500 ? year - 543 : year;
    return `${ceYear}-${dateStr.substring(5)}`;
  }

  // Try to parse Thai text date
  const thaiMonths: Record<string, string> = {
    'มกราคม': '01', 'กุมภาพันธ์': '02', 'มีนาคม': '03',
    'เมษายน': '04', 'พฤษภาคม': '05', 'มิถุนายน': '06',
    'กรกฎาคม': '07', 'สิงหาคม': '08', 'กันยายน': '09',
    'ตุลาคม': '10', 'พฤศจิกายน': '11', 'ธันวาคม': '12',
    'ม.ค.': '01', 'ก.พ.': '02', 'มี.ค.': '03',
    'เม.ย.': '04', 'พ.ค.': '05', 'มิ.ย.': '06',
    'ก.ค.': '07', 'ส.ค.': '08', 'ก.ย.': '09',
    'ต.ค.': '10', 'พ.ย.': '11', 'ธ.ค.': '12',
  };

  for (const [thMonth, num] of Object.entries(thaiMonths)) {
    if (dateStr.includes(thMonth)) {
      const parts = dateStr.replace(thMonth, '').trim().split(/\s+/);
      if (parts.length >= 2) {
        const day = parts[0].padStart(2, '0');
        let year = parseInt(parts[1]);
        if (year > 2500) year -= 543;
        return `${year}-${num}-${day}`;
      }
    }
  }

  return null;
}

/**
 * Map Thai series character to Latin letter
 */
function mapSeries(thaiType: string): string {
  // Extract the Thai character (ก, ข, ค, ง) from potentially longer strings
  for (const [thChar, latin] of Object.entries(SERIES_MAP)) {
    if (thaiType.includes(thChar)) return latin;
  }
  return 'D'; // Default to general announcements
}

/**
 * Fetch and parse records from a single GD Catalog JSON resource
 */
async function fetchResource(url: string): Promise<SourceRecord[]> {
  const res = await fetch(url);
  if (!res.ok) return [];

  const raw = await res.json() as GdCatalogRawRecord[];
  if (!Array.isArray(raw)) return [];

  const records: SourceRecord[] = [];
  for (const item of raw) {
    const date = parseThaiDate(item['วันที่'] || '');
    if (!date || date < MIN_DATE) continue;

    records.push({
      date,
      title: item['เรื่อง'] || '',
      volume: Number(item['เล่ม']) || 0,
      section: item['ตอน'] || '',
      type: mapSeries(item['ประเภท'] || ''),
      page: Number(item['หน้า']) || 0,
      url: item['URL'] || item['url'] || '',
      id: item.id,
    });
  }

  return records;
}

/**
 * Fetch all 2026+ records from GD Catalog
 */
export async function fetchFromGdCatalog(): Promise<SourceRecord[]> {
  const urls = await getResourceUrls();
  const allRecords: SourceRecord[] = [];

  // Fetch latest 3 resources (most likely to have 2026 data)
  for (const url of urls.slice(0, 3)) {
    const records = await fetchResource(url);
    allRecords.push(...records);
  }

  return allRecords;
}
