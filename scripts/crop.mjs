// Crop and enlarge part of a reference image, with a labelled pixel grid for measuring.
// Usage: node scripts/crop.mjs <image> <x0> <y0> <x1> <y1> [scale=2] [grid=50] [out]
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const [img, x0, y0, x1, y1, scale = '2', grid = '50', out = 'shots/crop.png'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const b64 = readFileSync(img).toString('base64');
const png = await page.evaluate(async ({ b64, x0, y0, x1, y1, scale, grid }) => {
  const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b64; });
  const w = x1 - x0, h = y1 - y0;
  const c = document.createElement('canvas'); c.width = w * scale + 40; c.height = h * scale + 20;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(im, x0, y0, w, h, 40, 0, w * scale, h * scale);
  g.strokeStyle = 'rgba(0,120,255,0.35)'; g.fillStyle = '#0060d0'; g.font = '11px sans-serif';
  for (let x = Math.ceil(x0 / grid) * grid; x <= x1; x += grid) {
    const px = 40 + (x - x0) * scale; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, h * scale); g.stroke(); g.fillText(String(x), px + 2, h * scale + 14);
  }
  for (let y = Math.ceil(y0 / grid) * grid; y <= y1; y += grid) {
    const py = (y - y0) * scale; g.beginPath(); g.moveTo(40, py); g.lineTo(40 + w * scale, py); g.stroke(); g.fillText(String(y), 2, py + 4);
  }
  return c.toDataURL('image/png').split(',')[1];
}, { b64, x0: +x0, y0: +y0, x1: +x1, y1: +y1, scale: +scale, grid: +grid });
writeFileSync(out, Buffer.from(png, 'base64'));
console.log(out);
await browser.close();
