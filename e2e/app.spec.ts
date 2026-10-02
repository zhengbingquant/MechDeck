import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end checks on desktop (1440×900) and mobile (390×844, touch). They
 * talk to the scene through window.__variable (see src/scene/debug.ts).
 */

let problems: string[] = [];

test.beforeEach(async ({ page }) => {
  problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__variable?.ready && window.__variable?.setCameraView, null, { timeout: 30_000 });
});

test.afterEach(() => {
  expect(problems, 'console must stay clean').toEqual([]);
});

const narrow = (page: Page) => (page.viewportSize()?.width ?? 1000) < 620;

async function openSheet(page: Page, tab: 'systems' | 'info' | 'flight' | 'pilot') {
  if (!narrow(page)) return;
  const t = page.getByTestId(`tab-${tab}`);
  if ((await t.getAttribute('aria-selected')) !== 'true') await t.click();
}

async function settle(page: Page, target: number) {
  await page.waitForFunction((t) => {
    const s = window.__variable!.store!.getState() as { progress: number };
    return Math.abs(s.progress - t) < 1e-6;
  }, target, { timeout: 20_000 });
  await page.waitForTimeout(1200); // camera follow catches up
}

/** Page-space bounds of the model's silhouette: every exterior vertex, projected through the live camera. */
async function modelRect(page: Page) {
  return page.evaluate(() => {
    const d = window.__variable!;
    const r = d.canvas!.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const v = d.camera!.position.clone();
    for (const meshes of d.runtime!.parts.values()) {
      for (const m of meshes) {
        if (m.userData.kind !== 'exterior' || !m.visible) continue;
        const pos = m.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i += 2) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).project(d.camera!);
          const px = r.left + ((v.x + 1) / 2) * r.width;
          const py = r.top + ((1 - v.y) / 2) * r.height;
          x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
        }
      }
    }
    return { x0, y0, x1, y1, canvas: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
  });
}

test('brands the page VARIABLE and lists the hangar', async ({ page }) => {
  await expect(page).toHaveTitle(/VARIABLE/);
  await expect(page.getByRole('heading', { name: 'VARIABLE' })).toBeVisible();
  await page.getByTestId('mech-switcher').click();
  await expect(page.getByRole('menuitemradio', { name: /VF-1J/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('More variable fighters')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('More variable fighters')).toBeHidden();
});

test('transforms smoothly between the three modes with the buttons and the slider', async ({ page }) => {
  const status = page.getByTestId('mode-status');
  await expect(status).toHaveText('Fighter');
  await page.getByTestId('mode-gerwalk').click();
  // Mid-transition the status shows the blend and a percentage.
  await expect(status).toContainText('→');
  await settle(page, 0.5);
  await expect(status).toHaveText('GERWALK');
  await page.getByTestId('mode-battroid').click();
  await settle(page, 1);
  await expect(status).toHaveText('Battroid');
  await page.getByTestId('mode-slider').fill('25');
  await settle(page, 0.25);
  await expect(status).toHaveText('Fighter → GERWALK');
});

test('keeps the whole model on the canvas, clear of the controls, in every mode', async ({ page }) => {
  for (const [mode, t] of [['fighter', 0], ['gerwalk', 0.5], ['battroid', 1]] as const) {
    await page.getByTestId(`mode-${mode}`).click();
    await settle(page, t);
    const m = await modelRect(page);
    const c = m.canvas;
    expect(m.x0, `${mode} left`).toBeGreaterThanOrEqual(c.left - 1);
    expect(m.x1, `${mode} right`).toBeLessThanOrEqual(c.right + 1);
    expect(m.y0, `${mode} top`).toBeGreaterThanOrEqual(c.top - 1);
    expect(m.y1, `${mode} bottom`).toBeLessThanOrEqual(c.bottom + 1);
    const panel = await page.getByTestId('panel').boundingBox();
    const overlaps = panel && m.x1 > panel.x && m.x0 < panel.x + panel.width && m.y1 > panel.y && m.y0 < panel.y + panel.height;
    expect(overlaps, `${mode}: model under the controls`).toBeFalsy();
  }
});

test('reveals the anatomy with at least six independently toggleable systems', async ({ page }) => {
  await openSheet(page, 'systems');
  await page.getByTestId('cutaway-toggle').click();
  const boxes = page.locator('[data-testid^="system-"]');
  expect(await boxes.count()).toBeGreaterThanOrEqual(6);
  await page.getByTestId('system-engines').uncheck();
  const systems = await page.evaluate(() => (window.__variable!.store!.getState() as { systems: Record<string, boolean> }).systems);
  expect(systems.engines).toBe(false);
  expect(systems.power).toBe(true);
  const visible = await page.evaluate(() => {
    const parts = window.__variable!.runtime!.parts;
    const vis = (id: string) => parts.get(id)!.some((m) => m.visible);
    return { turbine: vis('turbine-port'), core: vis('power-core') };
  });
  expect(visible).toEqual({ turbine: false, core: true });
});

test('inspects a part when it is tapped on the model', async ({ page }) => {
  await page.getByTestId('mode-battroid').click();
  await settle(page, 1);
  // Tap the centre of the chest plate, projected from the scene.
  const pt = await page.evaluate(() => {
    const d = window.__variable!;
    const box = d.runtime!.partBox('chest-plate');
    const v = box.getCenter(box.min.clone()).project(d.camera!);
    const r = d.canvas!.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  });
  if (narrow(page)) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
  await openSheet(page, 'info');
  await expect(page.getByTestId('part-name')).toHaveText(/Chest Plate|Dorsal Airbrake|Cockpit Canopy/);
});

test('search finds a part, opens the cutaway for internals and flies the camera to it', async ({ page }) => {
  const before = await page.evaluate(() => window.__variable!.camera!.position.toArray());
  const input = page.getByTestId('search-input');
  await input.click();
  await input.fill('starboard turbine');
  await expect(page.getByTestId('search-results')).toBeVisible();
  await input.press('Enter');
  await openSheet(page, 'info');
  await expect(page.getByTestId('part-name')).toHaveText('Starboard Turbine');
  expect(await page.evaluate(() => (window.__variable!.store!.getState() as { cutaway: boolean }).cutaway)).toBe(true);
  await page.waitForTimeout(1300);
  const after = await page.evaluate(() => window.__variable!.camera!.position.toArray());
  const moved = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
  expect(moved).toBeGreaterThan(2);
});

test('flies in the flight lab: HUD, controls and a clean exit', async ({ page }) => {
  await openSheet(page, 'flight');
  await page.getByTestId('flight-toggle').click();
  await expect(page.getByTestId('hud-speed')).toBeVisible({ timeout: 20_000 });
  const tel = () => page.evaluate(() => (window.__variable!.store!.getState() as { telemetry: { bank: number; altitude: number; mach: number } }).telemetry);
  const t0 = await tel();
  expect(t0.altitude).toBeGreaterThan(2500);
  expect(t0.mach).toBeGreaterThan(0.5);
  await page.keyboard.down('d');
  await page.waitForTimeout(600);
  await page.keyboard.up('d');
  await page.waitForTimeout(300);
  expect(Math.abs((await tel()).bank)).toBeGreaterThan(10);
  // Transformation is locked while flying: disabled in the sidebar, folded away in the phone sheet.
  if (narrow(page)) await expect(page.getByTestId('mode-battroid')).toBeHidden();
  else await expect(page.getByTestId('mode-battroid')).toBeDisabled();
  await page.getByTestId('flight-toggle').click();
  await expect(page.getByTestId('flight-hud')).toBeHidden();
  await expect(page.getByTestId('mode-battroid')).toBeEnabled();
});

test('pilot mode: skims the GERWALK and walks and jumps the Battroid; the camera keeps up', async ({ page }) => {
  type Tel = { mode: string | null; speed: number; hover: number; airborne: boolean };
  const tel = () => page.evaluate(() => (window.__variable!.store!.getState() as { pilotTelemetry: Tel | null }).pilotTelemetry);
  const where = () => page.evaluate(() => window.__variable!.runtime!.markerWorld('torsoBase').toArray());
  const moved = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[2] - a[2]);
  /** Hold the stick forward (the on-screen stick on phones, W on desktop) with boost / jump held for `ms`. */
  const drive = async (ms: number, opts: { boost?: boolean; during?: () => Promise<void> } = {}) => {
    if (narrow(page)) {
      if (opts.boost) await page.getByTestId('pilot-boost').dispatchEvent('pointerdown');
      const stick = (await page.getByTestId('pilot-stick').boundingBox())!;
      await page.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2);
      await page.mouse.down();
      await page.mouse.move(stick.x + stick.width / 2, stick.y + 3);
      await page.waitForTimeout(ms);
      await opts.during?.();
      await page.mouse.up();
      if (opts.boost) await page.getByTestId('pilot-boost').dispatchEvent('pointerup');
    } else {
      if (opts.boost) await page.keyboard.down('Shift');
      await page.keyboard.down('w');
      await page.waitForTimeout(ms);
      await opts.during?.();
      await page.keyboard.up('w');
      if (opts.boost) await page.keyboard.up('Shift');
    }
  };

  if (narrow(page)) await page.getByTestId('tab-pilot').click();
  await page.getByTestId('pilot-toggle').click();
  await expect(page.getByTestId('pilot-hud')).toBeVisible();
  // From Fighter, pilot mode converts to GERWALK.
  await settle(page, 0.5);

  // GERWALK: skim forward on the foot jets.
  const g0 = await where();
  await drive(2600, {
    boost: true,
    during: async () => {
      const t = (await tel())!;
      expect(t.mode).toBe('gerwalk');
      expect(t.hover).toBeGreaterThan(0.9);
      expect(t.speed).toBeGreaterThan(8);
    },
  });
  expect(moved(g0, await where()), 'GERWALK skimmed').toBeGreaterThan(10);
  await expect(page.getByTestId('pilot-speed')).not.toHaveText('0');

  // Battroid: walk, then jump.
  await page.getByTestId('mode-battroid').click();
  await settle(page, 1);
  await page.waitForTimeout(1500); // coasts to a stop after the conversion
  const b0 = await where();
  await drive(1800);
  expect(moved(b0, await where()), 'Battroid walked').toBeGreaterThan(3);
  if (narrow(page)) await page.getByTestId('pilot-jump').dispatchEvent('pointerdown');
  else await page.keyboard.down(' ');
  await page.waitForTimeout(350);
  expect((await tel())!.airborne, 'jumped').toBe(true);
  if (narrow(page)) await page.getByTestId('pilot-jump').dispatchEvent('pointerup');
  else await page.keyboard.up(' ');
  await page.waitForTimeout(2500);

  // The chase camera kept the mech on screen.
  const r = await modelRect(page);
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  expect(cx).toBeGreaterThan(r.canvas.left);
  expect(cx).toBeLessThan(r.canvas.right);
  expect(cy).toBeGreaterThan(r.canvas.top);
  expect(cy).toBeLessThan(r.canvas.bottom);

  // Leaving pilot mode keeps the mech where it was driven and hides the HUD.
  const b1 = await where();
  await page.getByTestId('pilot-toggle').click();
  await expect(page.getByTestId('pilot-hud')).toBeHidden();
  await page.waitForTimeout(600);
  expect(moved(b1, await where())).toBeLessThan(0.5);
});

test('joint control: poses Battroid joints, stops a joint at its first contact, and resets', async ({ page }) => {
  const rotX = (bone: string) =>
    page.evaluate((b) => (window.__variable!.runtime as unknown as { mecha: { bones: Record<string, { rotation: { x: number } }> } }).mecha.bones[b].rotation.x, bone);
  await page.getByTestId('mode-battroid').click();
  await settle(page, 1);
  if (narrow(page)) await page.getByTestId('tab-pose').click();
  await expect(page.getByTestId('joint-controls')).toBeVisible();
  await page.locator('summary', { hasText: 'Left arm' }).click();

  // Swinging the arm inboard runs it into the body: it stops short and names the parts that met.
  await page.getByTestId('dof-upperArmL.raise').fill('-40');
  await expect(page.getByTestId('dof-note-upperArmL.raise')).toBeVisible();
  const raised = Number((await page.getByTestId('dof-value-upperArmL.raise').textContent())!.replace('°', ''));
  expect(raised).toBeGreaterThan(-40);

  // A free move: the elbow bends by exactly the requested offset.
  const x0 = await rotX('elbowL');
  await page.getByTestId('dof-elbowL.bend').fill('-20');
  await expect(page.getByTestId('dof-value-elbowL.bend')).toHaveText('-20°');
  expect(Math.abs((await rotX('elbowL')) - x0 + (20 * Math.PI) / 180)).toBeLessThan(1e-3);

  // Reset returns every joint to the keyframe pose.
  await page.getByTestId('joints-reset').click();
  await expect(page.getByTestId('dof-value-elbowL.bend')).toHaveText('0°');
  expect(Math.abs((await rotX('elbowL')) - x0)).toBeLessThan(1e-6);
});

test('plays synthesised sound effects after the first interaction, and mutes', async ({ page }) => {
  const snd = () => page.evaluate(() => window.__variable!.sound!());
  // Nothing plays before the user interacts (browser autoplay rules).
  expect((await snd()).state).toBe('none');
  // The tap that starts a conversion also unlocks audio.
  await page.getByTestId('mode-gerwalk').click();
  await page.waitForFunction(() => window.__variable!.sound!().state === 'running', null, { timeout: 5000 });
  // Servos whine while it converts; clunks mark each assembly locking home.
  await page.waitForFunction(() => window.__variable!.sound!().servo > 0.5, null, { timeout: 5000 });
  await settle(page, 0.5);
  const done = await snd();
  expect(done.oneShots).toBeGreaterThan(3);
  expect(done.servo).toBe(0);
  // Mute with the button, back on with M.
  await page.getByTestId('sound-toggle').click();
  expect((await snd()).muted).toBe(true);
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('m');
  expect((await snd()).muted).toBe(false);
});

test('uses a bottom sheet on phones and a sidebar on desktop', async ({ page }) => {
  const panel = page.getByTestId('panel');
  const box = (await panel.boundingBox())!;
  const vp = page.viewportSize()!;
  if (narrow(page)) {
    expect(box.y + box.height).toBeGreaterThan(vp.height - 2);
    expect(box.width).toBeGreaterThan(vp.width - 2);
    await page.getByTestId('tab-systems').click();
    await expect(page.getByTestId('systems-list')).toBeVisible();
    // The search collapses to an icon and expands across the top bar in use.
    const search = page.getByTestId('search-input');
    const collapsed = (await search.boundingBox())!;
    expect(collapsed.width).toBeLessThan(60);
    await search.click();
    expect((await search.boundingBox())!.width).toBeGreaterThan(250);
  } else {
    expect(box.x).toBeGreaterThan(vp.width / 2);
    expect(box.height).toBeGreaterThan(vp.height * 0.8);
  }
});

test('lets the user zoom and pan freely; Home brings the craft back', async ({ page }) => {
  const view = () =>
    page.evaluate(() => {
      const d = window.__variable!;
      const t = d.cameraTarget!();
      const p = d.camera!.position;
      return { dist: Math.hypot(p.x - t[0], p.y - t[1], p.z - t[2]), target: t };
    });
  await page.waitForTimeout(800);
  const home = await view();
  const box = (await page.getByTestId('stage').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(1200);
  const zoomed = await view();
  expect(zoomed.dist, 'zoomed in').toBeLessThan(home.dist * 0.8);
  // Transforming must not yank the camera back out.
  await page.getByTestId('mode-gerwalk').click();
  await page.waitForTimeout(2500);
  const later = await view();
  expect(later.dist, 'zoom kept').toBeLessThan(home.dist * 0.85);
  await page.getByTestId('home-view').click();
  await page.waitForTimeout(1500);
  const back = await view();
  expect(back.dist, 'home distance').toBeGreaterThan(home.dist * 0.85);
});
