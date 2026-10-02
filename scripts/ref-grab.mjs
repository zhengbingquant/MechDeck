// Reference research helper: opens a page in real Chrome, lists its images and
// saves the large ones to shots/ref/ (for side-by-side comparison only). The images
// belong to their owners: keep them for personal comparison, out of the repository
// (shots/ is git-ignored), and follow the source site's terms.
// Usage: node scripts/ref-grab.mjs <url> [prefix]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const url = process.argv[2];
const prefix = process.argv[3] ?? 'ref';
mkdirSync('shots/ref', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
console.log('title:', await page.title());
const imgs = await page.evaluate(() =>
  [...document.images].map((i) => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight, alt: i.alt })),
);
const links = await page.evaluate(() =>
  [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(h)),
);
let n = 0;
for (const src of [...new Set([...imgs.filter((i) => i.w >= 250 && i.h >= 180).map((i) => i.src), ...links])]) {
  try {
    const res = await ctx.request.get(src, { timeout: 30000 });
    if (!res.ok()) continue;
    const buf = await res.body();
    if (buf.length < 15000) continue;
    const ext = (src.match(/\.(jpe?g|png|gif|webp)/i)?.[1] ?? 'jpg').toLowerCase();
    const file = `shots/ref/${prefix}-${String(++n).padStart(2, '0')}.${ext}`;
    writeFileSync(file, buf);
    console.log(file, buf.length, src);
  } catch (e) {
    console.log('skip', src, e.message);
  }
}
for (const i of imgs) console.log('img', i.w, i.h, i.alt, i.src);
await browser.close();
