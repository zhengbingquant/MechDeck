// README media: renders the transformation GIF and the gallery images in docs/media/ from the
// running app (renders of the model only; no reference art). Needs `npm run preview`
// (http://localhost:4173) and ffmpeg on the PATH (it builds the GIF's palette).
// Usage: node scripts/readme-media.mjs [baseUrl] [--only=gif,gallery]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const base = argv.find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const only = (argv.find((a) => a.startsWith('--only=')) ?? '--only=gif,gallery').slice(7).split(',');
const OUT = 'docs/media';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });

/** A fresh desktop page with the usage hint and the viewport buttons hidden (the HUDs stay). */
async function openPage(scale) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: scale });
  await page.goto(base);
  await page.waitForFunction(() => window.__mechdeck?.ready && window.__mechdeck?.setCameraView, null, { timeout: 30000 });
  await page.addStyleTag({ content: '[data-testid=hint],[data-testid=home-view],[data-testid=sound-toggle]{display:none!important}' });
  return page;
}
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
async function pose(page, t, pos, tgt, cutaway = false) {
  await page.evaluate(({ t, pos, tgt, cutaway }) => {
    const d = window.__mechdeck;
    d.store.setState({ cutaway, showJoints: false });
    d.setProgressNow(t);
    d.setCameraView(pos, tgt);
  }, { t, pos, tgt, cutaway });
  await frame(page);
}
const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`;

if (only.includes('gif')) {
  // Fighter -> GERWALK -> Battroid from a 3/4 camera that rises with the craft, holding on each mode.
  const page = await openPage(1);
  const stage = page.getByTestId('stage');
  const dir = mkdtempSync(join(tmpdir(), 'mechdeck-frames-'));
  const ease = (x) => x * x * (3 - 2 * x);
  const ts = [
    ...Array(10).fill(0),
    ...Array.from({ length: 30 }, (_, i) => 0.5 * ease((i + 1) / 30)),
    ...Array(12).fill(0.5),
    ...Array.from({ length: 30 }, (_, i) => 0.5 + 0.5 * ease((i + 1) / 30)),
    ...Array(16).fill(1),
  ];
  const view = [15, 4.5, 17].map((v, _, a) => v / Math.hypot(...a));
  const aim = (t) => (t <= 0.5 ? 2.6 + 2.6 * (t / 0.5) : 5.2 + 1.2 * ((t - 0.5) / 0.5));
  for (const [i, t] of ts.entries()) {
    const y = aim(t);
    await pose(page, t, [view[0] * 27, y + view[1] * 27, view[2] * 27], [0, y, 0]);
    await stage.screenshot({ path: join(dir, `f${String(i).padStart(3, '0')}.png`) });
  }
  await page.close();
  const gif = join(OUT, 'transform.gif');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '15', '-i', join(dir, 'f%03d.png'), '-vf',
    'scale=600:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=112:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
    '-loop', '0', gif]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${gif}  ${ts.length} frames  ${kb(gif)}`);
}

if (only.includes('gallery')) {
  const page = await openPage(1.5);
  const stage = page.getByTestId('stage');
  const shot = async (name) => {
    const f = join(OUT, `${name}.jpg`);
    await stage.screenshot({ path: f, type: 'jpeg', quality: 84 });
    console.log(`${f}  ${kb(f)}`);
  };
  await pose(page, 0, [16.5, 6, 17.5], [1.2, 1.9, 0]);
  await shot('fighter');
  await pose(page, 0.5, [19.5, 9.8, 14.5], [0.8, 4.8, 0.5]);
  await shot('gerwalk');
  await pose(page, 1, [15.5, 9, 21.5], [0, 6.4, -1]);
  await shot('battroid');
  await pose(page, 0.5, [15.5, 8.8, 18.5], [0, 4.6, 1], true);
  await page.waitForTimeout(1500); // the airflow particles spread through the ducts
  await shot('anatomy');
  await pose(page, 0, [12.5, 4.6, 13.5], [0, 1.8, 0.5]);

  // Flight lab: a gentle bank, then pulling up (positive lift), with the HUD and force vectors on.
  await page.getByTestId('flight-toggle').click();
  await page.getByTestId('hud-speed').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.keyboard.down('d');
  await page.waitForTimeout(200);
  await page.keyboard.up('d');
  await page.keyboard.down('s');
  await page.waitForTimeout(450);
  await shot('flight-lab');
  await page.keyboard.up('s');
  await page.getByTestId('flight-toggle').click();
  await page.getByTestId('flight-hud').waitFor({ state: 'hidden' });

  // Pilot mode: the GERWALK skimming the hangar floor on its foot jets.
  await page.getByTestId('pilot-toggle').click();
  await page.getByTestId('pilot-hud').waitFor();
  await page.waitForFunction(() => Math.abs(window.__mechdeck.store.getState().progress - 0.5) < 1e-6, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(2200);
  await shot('pilot-mode');
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.close();
}
await browser.close();
