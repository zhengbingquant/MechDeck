// Smoke test of a deployed build: loads the page on desktop and phone, parks the
// Fighter on its gear, transforms, drives in pilot mode and checks sound + console.
// Usage: node scripts/livecheck.mjs https://variable-liard.vercel.app
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4173';
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);

for (const [label, opts] of [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  const page = await browser.newPage(opts);
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.__variable?.ready, null, { timeout: 45000 });
  const wheels = await page.evaluate(() => ['wheelNose', 'wheelL', 'wheelR'].map((id) => window.__variable.runtime.markerWorld(id).y));
  check(`${label}: Fighter parked on its gear`, wheels.every((y) => Math.abs(y) < 0.03), wheels.map((y) => y.toFixed(3)).join(', '));
  const narrow = label === 'phone';
  if (narrow) await page.getByTestId('tab-pilot').click();
  await page.getByTestId('pilot-toggle').click();
  await page.waitForFunction(() => Math.abs(window.__variable.store.getState().progress - 0.5) < 1e-6, null, { timeout: 20000 });
  check(`${label}: pilot mode converts to GERWALK`, true);
  await page.getByTestId('mode-battroid').click();
  await page.waitForFunction(() => Math.abs(window.__variable.store.getState().progress - 1) < 1e-6, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const at = () => page.evaluate(() => window.__variable.runtime.markerWorld('torsoBase').toArray());
  const a = await at();
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  await page.keyboard.up('w');
  const b = await at();
  const walked = Math.hypot(b[0] - a[0], b[2] - a[2]);
  check(`${label}: Battroid walks`, walked > 3, `${walked.toFixed(1)} m`);
  const snd = await page.evaluate(() => window.__variable.sound());
  check(`${label}: sound engine running after interaction`, snd.state === 'running', `${snd.state}, ${snd.oneShots} cues`);
  check(`${label}: console clean`, problems.length === 0, problems.slice(0, 3).join(' | '));
  await page.screenshot({ path: `shots/live-${label}.png` });
  await page.close();
}
console.log(results.join('\n'));
await browser.close();
