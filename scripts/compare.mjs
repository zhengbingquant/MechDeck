// Accuracy check: overlays official line art (red ink) on a near-orthographic
// render of the model at matched scale, so proportion errors are visible.
// Needs `npm run preview` (http://localhost:4173) and your own copies of the
// official line art in shots/ref/ (copyrighted, so not part of this repository;
// see scripts/ref-grab.mjs).
// Usage: node scripts/compare.mjs [view ...]   (default: all views)
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/**
 * View definitions. `eye` is the direction from the model to the camera,
 * `up` the screen-up direction, `crop` the reference region [x0, y0, x1, y1]
 * and `align` how the two are registered:
 *  - 'lengthTip': scale by the horizontal extent, place by the leftmost tip
 *  - 'bbox': scale by the horizontal extent, centre both boxes
 *  - 'bboxH': scale by the vertical extent, centre both boxes
 *  - 'bottom': scale by the vertical extent, align the bottoms and the horizontal centres
 */
const VIEWS = {
  'fighter-side': { t: 0, eye: [1, 0, 0], up: [0, 1, 0], ref: 'shots/ref/m3-vf1a-15.png', crop: [405, 790, 1490, 1082], align: 'lengthTip' },
  'fighter-top': { t: 0, eye: [0, 1, 0], up: [-1, 0, 0], ref: 'shots/ref/m3-vf1a-15.png', crop: [405, 95, 1490, 790], band: [440, 700], align: 'lengthTip' },
  'fighter-front': { t: 0, eye: [0, 0, 1], up: [0, 1, 0], ref: 'shots/ref/m3-vf1a-09.png', crop: [10, 225, 850, 495], align: 'bbox' },
  'battroid-front': { t: 1, eye: [0, 0, 1], up: [0, 1, 0], ref: 'shots/ref/m3-vf1a-14.png', crop: [40, 60, 620, 990], align: 'bottom' },
};

const args = process.argv.slice(2);
const names = args.length ? args : Object.keys(VIEWS);
const W = 1400;
const H = 1000;
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto('http://localhost:4173');
await page.waitForFunction(() => window.__mechdeck?.ready && window.__mechdeck?.controls, null, { timeout: 30000 });

for (const name of names) {
  const v = VIEWS[name];
  // Near-orthographic camera: 1° field of view from ~900 m.
  const shot = await page.evaluate(({ v }) => {
    const d = window.__mechdeck;
    d.setProgressNow(v.t);
    d.studio(true);
    const cam = d.camera;
    const box = d.runtime.exteriorBox();
    const c = box.getCenter(box.min.clone());
    d.controls.enabled = false;
    d.controls.maxDistance = 5000;
    d.controls.target?.copy?.(c);
    cam.fov = 1.2;
    cam.near = 100;
    cam.far = 3000;
    cam.up.set(...v.up);
    cam.position.set(c.x + v.eye[0] * 900, c.y + v.eye[1] * 900, c.z + v.eye[2] * 900);
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    return true;
  }, { v });
  void shot;
  await page.waitForTimeout(400);
  const render = await page.locator('canvas').first().screenshot();
  const proj = await page.evaluate(() => {
    const d = window.__mechdeck;
    const r = d.canvas.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, tipY = 0;
    const p = d.camera.position.clone();
    for (const meshes of d.runtime.parts.values()) {
      for (const m of meshes) {
        if (m.userData.kind !== 'exterior' || !m.visible) continue;
        const pos = m.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).project(d.camera);
          const px = ((p.x + 1) / 2) * r.width;
          const py = ((1 - p.y) / 2) * r.height;
          if (px < x0) { x0 = px; tipY = py; }
          x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
      }
    }
    return { x0, y0, x1, y1, tipY, w: r.width, h: r.height };
  });

  const refB64 = readFileSync(v.ref).toString('base64');
  const out = await page.evaluate(async ({ renderB64, refB64, crop, band, align, proj }) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const [rimg, fimg] = await Promise.all([load('data:image/png;base64,' + renderB64), load('data:image/png;base64,' + refB64)]);
    // Reference ink mask and silhouette extents inside the crop.
    const [cx0, cy0, cx1, cy1] = crop;
    const cw = cx1 - cx0, ch = cy1 - cy0;
    const rc = document.createElement('canvas'); rc.width = cw; rc.height = ch;
    const rg = rc.getContext('2d'); rg.drawImage(fimg, -cx0, -cy0);
    const data = rg.getImageData(0, 0, cw, ch);
    let fx0 = Infinity, fy0 = Infinity, fx1 = -Infinity, fy1 = -Infinity, ftip = 0;
    const ink = rg.createImageData(cw, ch);
    const [b0, b1] = band ? [band[0] - cy0, band[1] - cy0] : [0, ch];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      const lum = 0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2];
      if (lum < 235 && data.data[i + 3] > 0 && y >= b0 && y <= b1) {
        if (x < fx0) { fx0 = x; ftip = y; }
        fx1 = Math.max(fx1, x); fy0 = Math.min(fy0, y); fy1 = Math.max(fy1, y);
      }
      if (lum < 110) { ink.data[i] = 255; ink.data[i + 1] = 20; ink.data[i + 2] = 60; ink.data[i + 3] = 235; }
    }
    rg.putImageData(ink, 0, 0);
    let s, ox, oy;
    const mw = proj.x1 - proj.x0, mh = proj.y1 - proj.y0, fw = fx1 - fx0, fh = fy1 - fy0;
    if (align === 'lengthTip') { s = mw / fw; ox = proj.x0 - fx0 * s; oy = proj.tipY - ftip * s; }
    else if (align === 'bbox') { s = mw / fw; ox = proj.x0 - fx0 * s; oy = (proj.y0 + proj.y1) / 2 - ((fy0 + fy1) / 2) * s; }
    else if (align === 'bboxH') { s = mh / fh; oy = proj.y0 - fy0 * s; ox = (proj.x0 + proj.x1) / 2 - ((fx0 + fx1) / 2) * s; }
    else { s = mh / fh; oy = proj.y1 - fy1 * s; ox = (proj.x0 + proj.x1) / 2 - ((fx0 + fx1) / 2) * s; }
    const out = document.createElement('canvas'); out.width = proj.w; out.height = proj.h;
    const g = out.getContext('2d');
    g.drawImage(rimg, 0, 0, proj.w, proj.h);
    g.globalAlpha = 0.9;
    g.drawImage(rc, ox, oy, cw * s, ch * s);
    g.globalAlpha = 1;
    g.fillStyle = '#000'; g.font = '14px sans-serif';
    g.fillText(`model ${mw.toFixed(0)}×${mh.toFixed(0)} px · line art ${(fw * s).toFixed(0)}×${(fh * s).toFixed(0)} px (red, ${align})`, 12, proj.h - 12);
    return { png: out.toDataURL('image/png').split(',')[1], ratioH: (fh * s) / mh, ratioW: (fw * s) / mw };
  }, { renderB64: render.toString('base64'), refB64, crop: v.crop, band: v.band, align: v.align, proj });
  writeFileSync(`shots/compare-${name}.png`, Buffer.from(out.png, 'base64'));
  console.log(`${name}: line-art/model height ratio ${out.ratioH.toFixed(3)}, width ratio ${out.ratioW.toFixed(3)} → shots/compare-${name}.png`);
  await page.evaluate(() => { const d = window.__mechdeck; d.studio(false); d.controls.enabled = true; d.controls.maxDistance = 120; d.camera.fov = 34; d.camera.near = 0.3; d.camera.far = 400; d.camera.up.set(0, 1, 0); d.camera.updateProjectionMatrix(); });
}
await browser.close();
