// Pilot-mode screenshots: GERWALK skimming, Battroid walking / running / jumping, phone layout.
// Usage: node scripts/pilotshots.mjs [baseUrl]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4173';
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];

async function open(viewport, mobile = false) {
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(base);
  await page.waitForFunction(() => window.__mechdeck?.ready && window.__mechdeck?.setCameraView, null, { timeout: 30000 });
  return page;
}
const settle = (page, t) => page.waitForFunction((t) => Math.abs(window.__mechdeck.store.getState().progress - t) < 1e-6, t, { timeout: 20000 });

const page = await open({ width: 1440, height: 900 });
await page.getByTestId('pilot-toggle').click();
await settle(page, 0.5);
await page.waitForTimeout(1500);
await page.keyboard.down('Shift');
await page.keyboard.down('w');
await page.waitForTimeout(1400);
await page.keyboard.down('a');
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/pilot-gerwalk-skim.png' });
await page.keyboard.up('a');
await page.keyboard.up('w');
await page.keyboard.up('Shift');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/pilot-gerwalk-landed.png' });
await page.keyboard.press('3');
await settle(page, 1);
await page.waitForTimeout(1500);
await page.keyboard.down('w');
await page.waitForTimeout(1300);
await page.screenshot({ path: 'shots/pilot-battroid-walk.png' });
await page.keyboard.down('Shift');
await page.waitForTimeout(1800);
await page.screenshot({ path: 'shots/pilot-battroid-run.png' });
await page.keyboard.down(' ');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/pilot-battroid-jump.png' });
await page.keyboard.up(' ');
await page.keyboard.up('Shift');
await page.keyboard.up('w');
await page.waitForTimeout(2000);
// Side view of a walking stride.
await page.keyboard.down('w');
await page.waitForTimeout(900);
await page.evaluate(() => {
  const d = window.__mechdeck;
  const t = d.cameraTarget();
  d.controls.enabled = true;
  const h = window.__mechdeck.store.getState();
  void h;
});
await page.screenshot({ path: 'shots/pilot-battroid-walk2.png' });
await page.keyboard.up('w');
await page.close();

const phone = await open({ width: 390, height: 844 }, true);
await phone.getByTestId('tab-pilot').click();
await phone.getByTestId('pilot-toggle').click();
await settle(phone, 0.5);
await phone.waitForTimeout(1500);
await phone.screenshot({ path: 'shots/pilot-phone.png' });
await phone.close();

console.log(errors.length ? errors.join('\n') : 'console: clean');
await browser.close();
