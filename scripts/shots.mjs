// Screenshot tool: renders the craft at given progress values and camera angles.
// Usage: node scripts/shots.mjs [baseUrl] [--w=1280 --h=800] [--only=name1,name2]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const W = Number(args.w ?? 1280);
const H = Number(args.h ?? 800);
const only = args.only ? args.only.split(',') : null;

// name: [progress, cameraPos, target]
const SHOTS = {
  fighter34: [0, [13, 5.5, 13], [0, 1.8, 0]],
  fighterSide: [0, [20, 2.2, 0], [0, 1.9, 0]],
  fighterTop: [0, [0, 30, 0.01], [0, 1.8, 0]],
  fighterBelow: [0, [7, 0.6, 9], [0, 1.4, 0]],
  fighterRear: [0, [-6, 5, -17], [0, 1.8, 0]],
  // Matching the MAHQ line-art angles for side-by-side comparison.
  refGerwalkFront: [0.5, [-13, 9, 13], [0, 4.2, 1]],
  refGerwalkRear: [0.5, [-12, 7, -13], [0, 4.2, 1]],
  refBattroidFront: [1, [-4, 6.8, 22], [0, 6.2, -1]],
  refBattroidRear: [1, [3, 7.5, -22], [0, 6.4, -1]],
  refFighterTop: [0, [-9, 12, 12], [0, 4.2, 0]],
  orthoSide: [0, [60, 4.4, 0.3], [0, 4.4, 0.3]],
  orthoTop: [0, [0, 60, 0.31], [0, 4.4, 0.3]],
  orthoFront: [0, [0.01, 4.4, 60], [0, 4.4, 0]],
  legCloseG: [0.5, [9, 4, 9], [2.5, 3, 1]],
  engineClose: [0, [9, 6.5, -4], [2, 4.2, -2]],
  gerwalk34: [0.5, [14, 8, 17], [0, 4.5, 1]],
  gerwalkSide: [0.5, [22, 5, 1], [0, 4.5, 1]],
  gerwalkFront: [0.5, [0, 6, 22], [0, 4.5, 1]],
  battroidFront: [1, [0, 6.5, 24], [0, 6.2, -1]],
  battroid34: [1, [14, 8, 18], [0, 6.2, -1]],
  battroidSide: [1, [24, 6.5, -1], [0, 6.2, -1]],
  battroidBack: [1, [-8, 8, -22], [0, 6.2, -1]],
  mid25: [0.25, [15, 8, 16], [0, 4.5, 0]],
  mid75: [0.75, [15, 8, 17], [0, 5.5, 0]],
  mid65: [0.65, [15, 8, 17], [0, 5.5, 0]],
  mid88: [0.88, [15, 8, 17], [0, 5.5, 0]],
  headClose: [1, [2.2, 12.4, 4.2], [0, 11.9, -0.4]],
  fighterChest: [0, [-8, 5.2, 7.5], [0, 2.3, 0.2]],
  fighterLeg: [0, [9, 2.2, 0.8], [1.5, 1.6, 0.4]],
  gerwalkBack: [0.5, [-10, 9, -9], [0, 5.5, -1]],
  battroidRear: [1, [-5, 8, -20], [0, 7, -1]],
  kitGerwalkSide: [0.5, [15, 7.5, 11], [0, 4.6, 0.5]],
  battroidOrtho: [1, [0, 6.5, 60], [0, 6.5, 0]],
  kitGerwalkFront: [0.5, [7, 6.2, 16], [0, 4.6, 0.5]],
  // Split-nozzle feet close up: closed in flight, spread into toe and heel on the ground.
  footFighter: [0, [6, 2.6, -10], [1.55, 1.5, -6.4]],
  footGerwalk: [0.5, [6.5, 2.2, 4], [1.6, 0.7, -1]],
  footBattroid: [1, [7, 2.4, 4.5], [1.8, 0.8, -1]],
  footBattroidSide: [1, [10, 1.1, -1], [1.8, 0.8, -1]],
  // Canopy shield: stowed (glazing clear) in flight, run out over the canopy in Battroid.
  canopyFighter: [0, [4.5, 5.4, 1.2], [0, 2.9, 3.0]],
  canopyShieldMid: [0.66, [8, 12, 10], [0, 10, 2.5]],
  chestShield: [1, [3.5, 10.4, 8.5], [0, 9.3, 1.2]],
  // Mounting close-ups (connectivity): shoulder carriage in Battroid / GERWALK, hip carriage in GERWALK.
  shoulderMountB: [1, [5.5, 12.5, -3.5], [2.2, 10.8, -0.3]],
  shoulderMountB2: [1, [6.5, 11, 3.5], [2.2, 10.8, -0.3]],
  shoulderMountG: [0.5, [7, 9, -2], [2.4, 7.4, 0.5]],
  hipMountG: [0.5, [6.5, 8.5, 5], [1.4, 6.9, 2.2]],
};

// --seq=0.1,0.2,… adds a 3/4-view sequence through the transformation (shots/seq-<p>.png).
if (args.seq) {
  for (const p of args.seq.split(',').map(Number)) SHOTS[`seq-${p}`] = [p, [15, 8, 17], [0, 5, 0]];
}

mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(base);
await page.waitForFunction(() => window.__mechdeck?.ready && window.__mechdeck?.setCameraView, null, { timeout: 30000 });
for (const [name, [t, pos, tgt]] of Object.entries(SHOTS)) {
  if (only && !only.includes(name)) continue;
  await page.evaluate(({ t, pos, tgt, cutaway }) => {
    window.__mechdeck.store.setState({ cutaway });
    window.__mechdeck.setProgressNow(t);
    window.__mechdeck.setCameraView(pos, tgt);
  }, { t, pos, tgt, cutaway: !!args.cutaway });
  await page.waitForTimeout(Number(args.wait ?? 250));
  await page.screenshot({ path: `shots/${name}${args.cutaway ? '-cut' : ''}.png` });
  console.log('shot', name);
}
console.log(errors.length ? errors.join('\n') : 'console: clean');
await browser.close();
