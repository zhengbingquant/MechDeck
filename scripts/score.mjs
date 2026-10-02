// Accuracy score: silhouette overlap (IoU) between the model and the official line art.
// The model is drawn flat black in a near-orthographic view; the reference outline is filled
// (everything the page border can't reach without crossing ink). Both are registered by the
// published overall dimension, then compared pixel by pixel. Writes shots/score-<view>.png:
// grey = both, red = only the line art (model missing there), blue = only the model (excess).
// Needs `npm run preview` (http://localhost:4173) and shots/ref/.
// Usage: node scripts/score.mjs [view ...]
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const VIEWS = {
  // Five-view side view at its measured 74.14 px/m, registered on the nose tip.
  'fighter-side': { t: 0, gear: 0, eye: [1, 0, 0], up: [0, 1, 0], ref: 'shots/ref/m3-vf1a-15.png', crop: [405, 790, 1490, 1082], mask: [[405, 790, 560, 850]], kind: 'line', align: 'tip', pxPerM: 74.14 },
  // Five-view rear view (drawn turned 90°, the top of the craft to the right) at 74.14 px/m,
  // centred on the fuselage centre line (y 568); the view label and the centre-line dashes are masked.
  'fighter-rear': { t: 0, gear: 0, eye: [0, 0, -1], up: [1, 0, 0], ref: 'shots/ref/m3-vf1a-15.png', crop: [1474, 90, 1790, 1045], mask: [[1555, 345, 1655, 405], [1474, 558, 1482, 578]], kind: 'line', align: 'rear', pxPerM: 74.14, centreY: 568 },
  // Colour front view (no published scale): registered on the span.
  'fighter-front': { t: 0, gear: 0, eye: [0, 0, 1], up: [0, 1, 0], ref: 'shots/ref/m3-vf1a-09.png', crop: [10, 225, 850, 495], mask: [[760, 420, 850, 495]], kind: 'line', align: 'bbox' },
  // Battroid front schematic at 67.4 px/m, feet on the ground line (y 975), centre line x 327. The
  // VF-1A's single head laser is masked; the hand-held GU-11 isn't drawn, so it isn't scored, and
  // the right arm hangs like the left as drawn (joint control, collision-guarded: `pose`).
  'battroid-front': { t: 1, eye: [0, 0, 1], up: [0, 1, 0], ref: 'shots/ref/m3-vf1a-14.png', crop: [40, 60, 620, 990], mask: [[300, 60, 355, 112]], kind: 'line', align: 'ground', pxPerM: 67.4, ground: 975, centreX: 327, hide: ['gun-pod'], pose: { 'upperArmR.swing': 20, 'elbowR.bend': 38 }, scan: [12.0, 11.0, 10.2, 9.5, 8.8, 8.0, 7.2, 6.4, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5] },
};

const args = process.argv.slice(2);
const names = args.length ? args : Object.keys(VIEWS);
const W = 1400;
const H = 1000;
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto('http://localhost:4173');
await page.waitForFunction(() => window.__mechdeck?.ready && window.__mechdeck?.silhouette, null, { timeout: 30000 });
// Only the canvas: the page's buttons and hints overlay it and would read as model pixels.
await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });

// Experiments: HIDE=part,part hides extra parts (e.g. to see which ones cause a mismatch).
const extraHide = (process.env.HIDE ?? '').split(',').filter(Boolean);
const results = [];
for (const name of names) {
  const v = { ...VIEWS[name], hide: [...(VIEWS[name].hide ?? []), ...extraHide] };
  const geo = await page.evaluate(({ v }) => {
    const d = window.__mechdeck;
    d.store.setState({ showJoints: false });
    d.setProgressNow(v.t);
    const posed = {};
    for (const [id, val] of Object.entries(v.pose ?? {})) posed[id] = d.runtime.setDof?.(id, val)?.value;
    if (v.gear !== undefined) d.runtime.setGear?.(v.gear);
    d.silhouette(true);
    const cam = d.camera;
    const box = d.runtime.exteriorBox();
    const c = box.getCenter(box.min.clone());
    d.controls.enabled = false;
    d.controls.maxDistance = 5000;
    cam.fov = 1.2;
    cam.near = 100;
    cam.far = 3000;
    cam.up.set(...v.up);
    cam.position.set(c.x + v.eye[0] * 900, c.y + v.eye[1] * 900, c.z + v.eye[2] * 900);
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    for (const id of v.hide ?? []) for (const m of d.runtime.parts.get(id) ?? []) m.visible = false;
    const r = d.canvas.getBoundingClientRect();
    const px = (p) => { const q = p.clone().project(cam); return [((q.x + 1) / 2) * r.width, ((1 - q.y) / 2) * r.height]; };
    const a = px(c);
    const b = px(c.clone().add(cam.up.clone().normalize()));
    // Centre line: the craft's own root (the stage nests it in groups, so world 0 isn't it).
    const origin = px(d.runtime.root.getWorldPosition(c.clone()));
    return { pxPerM: Math.hypot(b[0] - a[0], b[1] - a[1]), centreX: origin[0], centreY: origin[1], posed };
  }, { v });
  await page.waitForTimeout(600);
  // Measure the registration again from the camera as it is now, right before the capture (the
  // stage's camera rig may still have been settling since the first measurement).
  const now = await page.evaluate(() => {
    const d = window.__mechdeck;
    const cam = d.camera;
    cam.updateMatrixWorld();
    const r = d.canvas.getBoundingClientRect();
    const px = (p) => { const q = p.clone().project(cam); return [((q.x + 1) / 2) * r.width, ((1 - q.y) / 2) * r.height]; };
    const o = d.runtime.root.getWorldPosition(cam.position.clone());
    const a = px(o);
    const b = px(o.clone().add(cam.up.clone().normalize()));
    return { pxPerM: Math.hypot(b[0] - a[0], b[1] - a[1]), centreX: a[0], centreY: a[1] };
  });
  if (process.env.DEBUG) console.log(name, JSON.stringify(geo), JSON.stringify(now));
  Object.assign(geo, now);
  const render = await page.locator('canvas').first().screenshot();
  if (process.env.DEBUG) writeFileSync(`shots/score-raw-${name}.png`, render);
  const refB64 = readFileSync(v.ref).toString('base64');
  const out = await page.evaluate(async ({ renderB64, refB64, v, geo }) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const [rimg, fimg] = await Promise.all([load('data:image/png;base64,' + renderB64), load('data:image/png;base64,' + refB64)]);
    const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Model mask from the black silhouette render.
    const mw = rimg.width, mh = rimg.height;
    const mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
    const mg = mc.getContext('2d'); mg.drawImage(rimg, 0, 0);
    const md = mg.getImageData(0, 0, mw, mh).data;
    const model = new Uint8Array(mw * mh);
    let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity, mtip = 0;
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      if (lum(md, (y * mw + x) * 4) < 128) {
        model[y * mw + x] = 1;
        if (x < mx0) { mx0 = x; mtip = y; }
        mx1 = Math.max(mx1, x); my0 = Math.min(my0, y); my1 = Math.max(my1, y);
      }
    }
    // Reference mask: filled outline (line art) or non-white pixels (colour art).
    const [cx0, cy0, cx1, cy1] = v.crop;
    const cw = cx1 - cx0, ch = cy1 - cy0;
    const rc = document.createElement('canvas'); rc.width = cw; rc.height = ch;
    const rg = rc.getContext('2d');
    rg.fillStyle = '#fff'; rg.fillRect(0, 0, cw, ch);
    rg.drawImage(fimg, -cx0, -cy0);
    rg.fillStyle = '#fff';
    for (const [x0, y0, x1, y1] of v.mask ?? []) rg.fillRect(x0 - cx0, y0 - cy0, x1 - x0, y1 - y0);
    const rd = rg.getImageData(0, 0, cw, ch).data;
    const ref = new Uint8Array(cw * ch);
    if (v.kind === 'colour') {
      for (let i = 0; i < cw * ch; i++) ref[i] = lum(rd, i * 4) < 235 ? 1 : 0;
    } else {
      const ink = new Uint8Array(cw * ch);
      for (let i = 0; i < cw * ch; i++) ink[i] = lum(rd, i * 4) < 150 ? 1 : 0;
      // Close 1-2 px breaks in the outline, then flood the outside in from the border.
      const wall = new Uint8Array(cw * ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        let on = 0;
        for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < cw && yy < ch && ink[yy * cw + xx]) on = 1;
        }
        wall[y * cw + x] = on;
      }
      const outside = new Uint8Array(cw * ch);
      const q = new Int32Array(cw * ch);
      let qh = 0, qt = 0;
      const push = (i) => { if (!wall[i] && !outside[i]) { outside[i] = 1; q[qt++] = i; } };
      for (let x = 0; x < cw; x++) { push(x); push((ch - 1) * cw + x); }
      for (let y = 0; y < ch; y++) { push(y * cw); push(y * cw + cw - 1); }
      while (qh < qt) {
        const i = q[qh++], x = i % cw, y = (i / cw) | 0;
        if (x > 0) push(i - 1);
        if (x < cw - 1) push(i + 1);
        if (y > 0) push(i - cw);
        if (y < ch - 1) push(i + cw);
      }
      for (let i = 0; i < cw * ch; i++) ref[i] = outside[i] ? 0 : 1;
    }
    let fx0 = Infinity, fy0 = Infinity, fx1 = -Infinity, fy1 = -Infinity, ftip = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (!ref[y * cw + x]) continue;
      if (x < fx0) { fx0 = x; ftip = y; }
      fx1 = Math.max(fx1, x); fy0 = Math.min(fy0, y); fy1 = Math.max(fy1, y);
    }
    // Register the reference onto the model render by the published overall dimension.
    let s, ox, oy;
    const MW = mx1 - mx0, MH = my1 - my0, FW = fx1 - fx0, FH = fy1 - fy0;
    if (v.align === 'tip') { s = geo.pxPerM / v.pxPerM; ox = mx0 - fx0 * s; oy = mtip - ftip * s; }
    // Feet on the ground: the silhouettes' lowest pixels coincide.
    else if (v.align === 'rear') { s = geo.pxPerM / v.pxPerM; oy = geo.centreY - (v.centreY - cy0) * s; ox = (mx0 + mx1) / 2 - ((fx0 + fx1) / 2) * s; }
    else if (v.align === 'ground') { s = geo.pxPerM / v.pxPerM; ox = geo.centreX - (v.centreX - cx0) * s; oy = my1 - (v.ground - cy0) * s; }
    else { s = MW / FW; ox = mx0 - fx0 * s; oy = (my0 + my1) / 2 - ((fy0 + fy1) / 2) * s; }
    let both = 0, onlyRef = 0, onlyModel = 0;
    const img = mg.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const rx = Math.round((x - ox) / s), ry = Math.round((y - oy) / s);
      const r = rx >= 0 && ry >= 0 && rx < cw && ry < ch ? ref[ry * cw + rx] : 0;
      const m = model[y * mw + x];
      const i = (y * mw + x) * 4;
      img.data[i + 3] = 255;
      if (r && m) { both++; img.data[i] = img.data[i + 1] = img.data[i + 2] = 150; }
      else if (r) { onlyRef++; img.data[i] = 230; img.data[i + 1] = 40; img.data[i + 2] = 60; }
      else if (m) { onlyModel++; img.data[i] = 40; img.data[i + 1] = 110; img.data[i + 2] = 235; }
      else { img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; }
    }
    mg.putImageData(img, 0, 0);
    // Scanlines (ground-registered views): solid spans of each silhouette at set heights, metres.
    const lines = [];
    if (v.align === 'ground' && v.scan) {
      for (const h of v.scan) {
        const y = Math.round(my1 - h * geo.pxPerM);
        const spans = (get) => { const out = []; let a = null; for (let x = 0; x <= mw; x++) { const on = x < mw && get(x); if (on && a === null) a = x; if (!on && a !== null) { out.push([(a - geo.centreX) / geo.pxPerM, (x - 1 - geo.centreX) / geo.pxPerM]); a = null; } } return out.filter(([p, q]) => q - p > 0.05).map(([p, q]) => p.toFixed(2) + '..' + q.toFixed(2)).join(' '); };
        const refAt = (x) => { const rx = Math.round((x - ox) / s), ry = Math.round((y - oy) / s); return rx >= 0 && ry >= 0 && rx < cw && ry < ch && ref[ry * cw + rx]; };
        lines.push(`h ${h.toFixed(1)}  ref:   ${spans(refAt)}`, `       model: ${spans((x) => model[y * mw + x])}`);
      }
    }
    return { lines, png: mc.toDataURL('image/png').split(',')[1], iou: both / (both + onlyRef + onlyModel), missing: onlyRef / (both + onlyRef), excess: onlyModel / (both + onlyModel) };
  }, { renderB64: render.toString('base64'), refB64, v, geo });
  writeFileSync(`shots/score-${name}.png`, Buffer.from(out.png, 'base64'));
  if (process.env.SCAN) console.log(out.lines.join('\n'));
  results.push(`${name.padEnd(15)} IoU ${(out.iou * 100).toFixed(1)}%  (line art the model misses ${(out.missing * 100).toFixed(1)}%, model beyond the line art ${(out.excess * 100).toFixed(1)}%)`);
  if (v.pose) console.log(`${name}  posed ${JSON.stringify(geo.posed)}`);
  await page.evaluate(({ v }) => { const d = window.__mechdeck; d.runtime.resetDofs?.(); for (const id of v.hide ?? []) for (const m of d.runtime.parts.get(id) ?? []) m.visible = true; d.silhouette(false); d.runtime.setGear?.(1); d.controls.enabled = true; d.controls.maxDistance = 120; d.camera.fov = 34; d.camera.near = 0.3; d.camera.far = 400; d.camera.up.set(0, 1, 0); d.camera.updateProjectionMatrix(); }, { v });
}
console.log(results.join('\n'));
await browser.close();
