// Flight-lab smoke run: enters the lab, flies a few manoeuvres with the keyboard
// and on-screen controls, screenshots each and reports the HUD and console.
// Usage: node scripts/flightcheck.mjs [baseUrl] [--w=1440 --h=900]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const W = Number(args.w ?? 1440);
const H = Number(args.h ?? 900);
const tag = args.tag ?? `${W}x${H}`;

mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(base);
await page.waitForFunction(() => window.__variable?.ready, null, { timeout: 30000 });

const hud = async () => (await page.locator('[data-testid=flight-hud]').innerText()).replace(/\s+/g, ' ');
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
const shot = async (name) => { await page.screenshot({ path: `shots/flight-${tag}-${name}.png` }); console.log('shot', name, '|', await hud()); };

if (W < 900) await page.getByTestId('tab-flight').click();
await page.getByTestId('flight-toggle').click();
await page.getByTestId('hud-speed').waitFor({ timeout: 20000 });
await page.waitForTimeout(1800);
await shot('level');

await page.mouse.move(5, 5);
await hold('d', 700);
await page.waitForTimeout(400);
await shot('bank');

await hold('s', 1500);
await shot('pull');

await page.getByTestId('flight-throttle').fill('100');
await hold('a', 500);
await page.waitForTimeout(2500);
await shot('overboost');

await page.getByTestId('flight-throttle').fill('10');
await page.getByTestId('flight-airbrake').click();
await page.getByRole('button', { name: 'Landing' }).click();
await page.waitForTimeout(6000);
await shot('slow-config');

console.log(errors.length ? errors.join('\n') : 'console: clean');
await browser.close();
