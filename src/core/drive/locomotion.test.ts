import { describe, it, expect } from 'vitest';
import { initialDrive, stepDrive, type DriveInput, type DriveParams, type DriveState } from './locomotion';

const WALKER: DriveParams = {
  walkSpeed: 6,
  runSpeed: 30,
  backSpeed: 3,
  accel: 12,
  decel: 16,
  turnRate: Math.PI / 3,
  strideWalk: 6,
  strideRun: 16,
  jump: { speed: 9, gravity: 9.81 },
};
const HOVER: DriveParams = { ...WALKER, jump: undefined, hover: { height: 0.8, speed: 40, rise: 1.5 } };

const idle: DriveInput = { forward: 0, turn: 0, strafe: 0, boost: false, jump: false };
const DT = 1 / 60;

function run(s: DriveState, input: Partial<DriveInput>, p: DriveParams, seconds: number): DriveState {
  let cur = s;
  for (let t = 0; t < seconds - 1e-9; t += DT) cur = stepDrive(cur, { ...idle, ...input }, p, DT);
  return cur;
}

describe('stepDrive', () => {
  it('stays put without input', () => {
    const s = run(initialDrive(), {}, WALKER, 2);
    expect(s.x).toBe(0);
    expect(s.z).toBe(0);
    expect(s.forward).toBe(0);
    expect(s.phase).toBe(0);
    expect(s.grounded).toBe(true);
  });

  it('accelerates to walking speed along the heading (+Z at heading 0), not instantly', () => {
    const early = run(initialDrive(), { forward: 1 }, WALKER, 0.1);
    expect(early.forward).toBeGreaterThan(0);
    expect(early.forward).toBeLessThan(WALKER.walkSpeed);
    const s = run(initialDrive(), { forward: 1 }, WALKER, 3);
    expect(s.forward).toBeCloseTo(WALKER.walkSpeed, 6);
    expect(s.z).toBeGreaterThan(10);
    expect(Math.abs(s.x)).toBeLessThan(1e-9);
  });

  it('runs faster when boosting and backs up slower than it walks', () => {
    expect(run(initialDrive(), { forward: 1, boost: true }, WALKER, 5).forward).toBeCloseTo(WALKER.runSpeed, 6);
    const back = run(initialDrive(), { forward: -1 }, WALKER, 3);
    expect(back.forward).toBeCloseTo(-WALKER.backSpeed, 6);
    expect(back.z).toBeLessThan(0);
  });

  it('coasts to a stop when the stick is released', () => {
    const moving = run(initialDrive(), { forward: 1 }, WALKER, 3);
    const stopped = run(moving, {}, WALKER, 2);
    expect(stopped.forward).toBe(0);
    expect(stopped.z).toBeGreaterThan(moving.z);
  });

  it('turns right (clockwise seen from above) at the turn rate, then walks the new heading', () => {
    const s = run(initialDrive(), { turn: 1 }, WALKER, 1.5);
    expect(s.heading).toBeCloseTo(-Math.PI / 2, 6);
    const w = run(s, { forward: 1 }, WALKER, 3);
    // Facing the mech's right (-X): the robot's right hand is starboard, -X.
    expect(w.x).toBeLessThan(-10);
    expect(Math.abs(w.z - s.z)).toBeLessThan(1e-6);
  });

  it('jumps on a ballistic arc and lands with an impact that fades', () => {
    let s = stepDrive(initialDrive(), { ...idle, jump: true }, WALKER, DT);
    expect(s.grounded).toBe(false);
    let peak = 0;
    let t = DT;
    while (!s.grounded && t < 5) {
      // Holding jump in the air does not jump again.
      s = stepDrive(s, { ...idle, jump: true }, WALKER, DT);
      peak = Math.max(peak, s.y);
      t += DT;
    }
    const g = WALKER.jump!.gravity;
    const v = WALKER.jump!.speed;
    expect(peak).toBeCloseTo((v * v) / (2 * g), 1);
    expect(t).toBeCloseTo((2 * v) / g, 1);
    expect(s.y).toBe(0);
    expect(s.landing).toBeGreaterThan(0.5);
    expect(run(s, {}, WALKER, 1).landing).toBe(0);
  });

  it('advances the gait phase with distance travelled (one cycle per stride), only on the ground', () => {
    const s = run(initialDrive(), { forward: 1 }, WALKER, 4);
    const cycles = s.distance / WALKER.strideWalk;
    expect(s.phase).toBeCloseTo(cycles - Math.floor(cycles), 6);
    const air = stepDrive(s, { ...idle, forward: 1, jump: true }, WALKER, DT);
    const later = stepDrive(air, { ...idle, forward: 1 }, WALKER, DT);
    expect(later.phase).toBe(air.phase);
  });

  it('hover-skims when boosting a hover-capable mech: rises to hover height, faster top speed, settles when released', () => {
    const up = run(initialDrive(), { forward: 1, boost: true }, HOVER, 8);
    expect(up.hover).toBeCloseTo(1, 6);
    expect(up.y).toBeCloseTo(HOVER.hover!.height, 6);
    expect(up.forward).toBeCloseTo(HOVER.hover!.speed, 6);
    expect(up.phase).toBe(run(initialDrive(), { forward: 1, boost: true }, HOVER, 0.5).phase);
    const down = run(up, {}, HOVER, 6);
    expect(down.hover).toBe(0);
    expect(down.y).toBe(0);
    expect(down.grounded).toBe(true);
  });

  it('drops out of a hover and lands if it stops being a hover-capable mode (converting to Battroid)', () => {
    const up = run(initialDrive(), { boost: true }, HOVER, 3);
    expect(up.y).toBeGreaterThan(0.5);
    const walker = run(up, {}, WALKER, 2);
    expect(walker.hover).toBe(0);
    expect(walker.y).toBe(0);
    expect(walker.grounded).toBe(true);
  });
});
