/**
 * Captures Nimax demo dispute list + Dispute Detail modals for stakeholder sharing.
 * Requires: dashboard at http://localhost:3001, emulators seeded (npm run seed:nimax:emulator).
 * Run from repo root (Puppeteer must be resolvable, e.g. install once under /path/to/puppeteer-app/node_modules):
 *   NODE_PATH=/path/to/puppeteer-app/node_modules \
 *   NIMAX_SCREENSHOT_OUT_DIR="$PWD/docs/nimax-stakeholder-screenshots" \
 *   node scripts/capture-nimax-stakeholder-screenshots.cjs
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUT =
  process.env.NIMAX_SCREENSHOT_OUT_DIR ||
  path.join(__dirname, '..', 'docs', 'nimax-stakeholder-screenshots');
const BASE = process.env.NIMAX_SCREENSHOT_BASE_URL || 'http://localhost:3001';
const EMAIL = 'demo@nimaxtheatres.com';
const PASSWORD = 'nimax2026!';

async function closeTopModal(page) {
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;
    const btn = [...dialog.querySelectorAll('button')].find((b) => {
      const t = b.textContent?.trim() || '';
      return t === 'Close' || t === 'Save & Close';
    });
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--window-size=1440,900', '--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#email', { timeout: 60000 });
  await page.type('#email', EMAIL);
  await page.type('#password', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.waitForSelector('table tbody tr:nth-child(7)', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));

  await page.screenshot({ path: path.join(OUT, 'nimax-01-disputes-list.png'), fullPage: true });

  // Status column is td:nth-child(3) with default visible columns (see DisputeDashboard).
  const shots = [
    { row: 1, file: 'nimax-02-dispute-harry-potter-new.png' },
    { row: 2, file: 'nimax-03-dispute-producers-plan-ready.png' },
    { row: 3, file: 'nimax-04-dispute-hadestown-evidence.png' },
    { row: 4, file: 'nimax-05-dispute-six-argument-ready.png' },
    { row: 6, file: 'nimax-06-dispute-resolved-won.png' },
  ];

  for (const { row, file } of shots) {
    await page.$eval(`table tbody tr:nth-child(${row}) td:nth-child(3)`, (el) => el.click());
    await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    await closeTopModal(page);
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10000 });
  }

  await browser.close();
  console.log('Screenshots written to', OUT);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
