#!/usr/bin/env node
/**
 * Bulk download RTG 2026 (BE 2569) gazette PDFs via Playwright.
 * Solves Cloudflare challenge, scrapes document metadata,
 * downloads PDFs, and uploads to R2.
 *
 * Usage: node scripts/bulk-download-2026.mjs [--upload] [--limit N]
 *
 * Requires: npx playwright install chromium
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const OUTPUT_DIR = '/tmp/rtg-pdfs-2026';
const METADATA_FILE = join(OUTPUT_DIR, 'metadata.json');
const SITE_URL = 'https://ratchakitcha.soc.go.th';
const SEARCH_URL = `${SITE_URL}/search-result/`;

const DO_UPLOAD = process.argv.includes('--upload');
const LIMIT = parseInt(process.argv.find((a, i) => process.argv[i-1] === '--limit') || '0') || Infinity;

// Thai month abbreviations → month numbers
const THAI_MONTHS = {
  'ม.ค.': '01', 'ก.พ.': '02', 'มี.ค.': '03', 'เม.ย.': '04',
  'พ.ค.': '05', 'มิ.ย.': '06', 'ก.ค.': '07', 'ส.ค.': '08',
  'ก.ย.': '09', 'ต.ค.': '10', 'พ.ย.': '11', 'ธ.ค.': '12',
};
const SERIES_MAP = { 'ก': 'A', 'ข': 'B', 'ค': 'C', 'ง': 'D' };

function thaiToArabic(s) {
  if (!s) return s;
  return s.replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 3664));
}

function parseThaiDate(dateStr) {
  if (!dateStr) return null;
  const s = thaiToArabic(dateStr);
  for (const [th, num] of Object.entries(THAI_MONTHS)) {
    if (s.includes(th)) {
      const parts = s.replace(th, '').trim().split(/\s+/);
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

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Launching browser...');
  // Use headed mode — headless can't pass Cloudflare Turnstile
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Step 1: Solve Cloudflare challenge
  console.log('Solving Cloudflare challenge...');
  await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.title !== 'Just a moment...', { timeout: 30000 });
  console.log(`✓ Site loaded: ${await page.title()}`);

  // Step 2: Scrape document metadata from the search page
  // Use the monthly download feature — select each month and scrape
  console.log('Scraping document metadata...');

  const allDocs = [];

  // Navigate to search-result page to get a broader listing
  // Or use the main page's "ดูเพิ่ม" (load more) button to get more items
  // For now, scrape the homepage which has ~430 items visible
  const items = await page.evaluate(() => {
    const thaiToArabic = s => s ? s.replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 3664)) : s;

    const entries = [];
    const links = document.querySelectorAll('a[href*="/documents/"]');
    links.forEach(a => {
      const href = a.getAttribute('href') || '';
      const title = a.textContent?.trim() || '';
      if (!href.includes('.pdf') || title.length < 10) return;

      const idMatch = href.match(/documents\/(\d+)\.pdf/);
      if (!idMatch) return;

      const container = a.parentElement?.parentElement;
      const metaText = container?.textContent || '';

      const dateMatch = metaText.match(/([๐-๙\d]+)\s+(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s+([๐-๙\d]+)/);
      const volMatch = metaText.match(/เล่ม\s+([๐-๙\d]+)\s+ตอน(พิเศษ\s+)?([๐-๙\d]+)\s+(ก|ข|ค|ง)/);
      const pageMatch = metaText.match(/หน้า\s+([๐-๙\d]+)/);

      entries.push({
        docId: idMatch[1],
        title: title.substring(0, 500),
        url: href,
        dateRaw: dateMatch ? dateMatch[0] : null,
        volume: volMatch ? thaiToArabic(volMatch[1]) : null,
        section: volMatch ? thaiToArabic(volMatch[3]) : null,
        sectionType: volMatch ? (volMatch[2] ? 'พิเศษ' : '') : null,
        series: volMatch ? volMatch[4] : null,
        page: pageMatch ? thaiToArabic(pageMatch[1]) : null,
      });
    });

    const seen = new Set();
    return entries.filter(e => {
      if (seen.has(e.docId)) return false;
      seen.add(e.docId);
      return true;
    });
  });

  console.log(`Found ${items.length} unique documents on page`);

  // Parse dates and filter to 2026+
  for (const item of items) {
    const date = parseThaiDate(item.dateRaw);
    if (date && date >= '2026-01-01') {
      allDocs.push({
        ...item,
        date,
        series: item.series ? SERIES_MAP[item.series] || item.series : null,
      });
    }
  }

  console.log(`${allDocs.length} documents from 2026+`);

  // Save metadata
  writeFileSync(METADATA_FILE, JSON.stringify(allDocs, null, 2));
  console.log(`Metadata saved to ${METADATA_FILE}`);

  // Step 3: Download PDFs
  const toDownload = allDocs.slice(0, LIMIT);
  console.log(`Downloading ${toDownload.length} PDFs...`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of toDownload) {
    const pdfPath = join(OUTPUT_DIR, `${doc.docId}.pdf`);

    if (existsSync(pdfPath)) {
      skipped++;
      continue;
    }

    try {
      const response = await context.request.get(doc.url);
      const body = await response.body();

      if (body[0] === 0x25 && body[1] === 0x50) { // %PDF
        writeFileSync(pdfPath, body);
        downloaded++;

        if (downloaded % 10 === 0) {
          console.log(`  Downloaded ${downloaded}/${toDownload.length - skipped}...`);
        }

        // Step 4: Upload to R2 if --upload flag
        if (DO_UPLOAD) {
          const r2Key = `docs/${doc.docId}.pdf`;
          try {
            execSync(`wrangler r2 object put rtg-pdfs/${r2Key} --file="${pdfPath}" --content-type="application/pdf" --remote`, {
              stdio: 'pipe',
              timeout: 30000,
            });
          } catch (e) {
            console.error(`  R2 upload failed for ${doc.docId}: ${e.message}`);
          }
        }
      } else {
        failed++;
        console.error(`  Not a PDF: ${doc.docId} (${body.length} bytes)`);
      }

      // Rate limit: 500ms between downloads
      await page.waitForTimeout(500);
    } catch (e) {
      failed++;
      console.error(`  Failed: ${doc.docId}: ${e.message}`);
    }
  }

  await browser.close();

  console.log(`\nDone!`);
  console.log(`  Downloaded: ${downloaded}`);
  console.log(`  Skipped (exists): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Metadata: ${METADATA_FILE}`);
  console.log(`  PDFs: ${OUTPUT_DIR}/`);

  if (!DO_UPLOAD) {
    console.log(`\nTo upload to R2, run again with --upload flag`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
