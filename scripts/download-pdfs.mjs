#!/usr/bin/env node
/**
 * Download PDFs from ratchakitcha.soc.go.th using Playwright
 * to bypass Cloudflare JS challenge. Saves to /tmp/rtg-pdfs/
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const NEEDED_FILE = '/tmp/rtg-pdfs-needed.json';
const OUTPUT_DIR = '/tmp/rtg-pdfs';
const MAX_DOWNLOADS = 20; // Limit per run to stay within GH Actions time

async function main() {
  if (!existsSync(NEEDED_FILE)) {
    console.log('No PDFs needed (file not found). Run fetch-new-records.mjs first.');
    process.exit(0);
  }

  const needed = JSON.parse(readFileSync(NEEDED_FILE, 'utf-8'));
  if (needed.length === 0) {
    console.log('No PDFs to download.');
    process.exit(0);
  }

  console.log(`${needed.length} PDFs needed, downloading up to ${MAX_DOWNLOADS}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  // First navigate to the main site to get CF cookies
  const page = await context.newPage();
  console.log('Navigating to ratchakitcha.soc.go.th to solve CF challenge...');
  await page.goto('https://ratchakitcha.soc.go.th/', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('CF challenge solved. Starting downloads...');

  let downloaded = 0;
  for (const item of needed.slice(0, MAX_DOWNLOADS)) {
    const filename = item.url.split('/').pop();
    const outputPath = join(OUTPUT_DIR, filename);

    if (existsSync(outputPath)) {
      console.log(`Skip (exists): ${filename}`);
      continue;
    }

    try {
      // Use the authenticated context to download PDF
      const response = await page.goto(item.url, { waitUntil: 'load', timeout: 15000 });
      if (response && response.ok()) {
        const buffer = await response.body();
        writeFileSync(outputPath, buffer);
        downloaded++;
        console.log(`Downloaded: ${filename} (${buffer.length} bytes)`);
      } else {
        console.error(`Failed: ${filename} (HTTP ${response?.status()})`);
      }
    } catch (e) {
      console.error(`Error downloading ${filename}: ${e.message}`);
    }

    // Small delay between downloads
    await page.waitForTimeout(1000);
  }

  await browser.close();
  console.log(`Done. Downloaded ${downloaded} PDFs.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
