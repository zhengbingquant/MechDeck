// Contact sheet of images: node scripts/montage.mjs out.png cols cellW cellH img1 img2 ...
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const [out, cols, cw, ch, ...imgs] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const data = imgs.map((f) => ({ name: f.split('/').pop(), b64: readFileSync(f).toString('base64'), mime: f.endsWith('.jpg') ? 'jpeg' : 'png' }));
const png = await page.evaluate(async ({ data, cols, cw, ch }) => {
  const rows = Math.ceil(data.length / cols);
  const c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * (ch + 16);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.font = '12px sans-serif'; g.fillStyle = '#c00';
  for (const [i, d] of data.entries()) {
    const im = await new Promise((res) => { const x = new Image(); x.onload = () => res(x); x.src = `data:image/${d.mime};base64,` + d.b64; });
    const k = Math.min(cw / im.width, ch / im.height);
    const x = (i % cols) * cw, y = Math.floor(i / cols) * (ch + 16);
    g.drawImage(im, x, y + 16, im.width * k, im.height * k);
    g.fillText(d.name, x + 4, y + 12);
  }
  return c.toDataURL('image/png').split(',')[1];
}, { data, cols: +cols, cw: +cw, ch: +ch });
writeFileSync(out, Buffer.from(png, 'base64'));
console.log(out);
await browser.close();
