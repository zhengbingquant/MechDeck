import { describe, it, expect } from 'vitest';
import { guardedMove } from './jointGuard';

describe('guardedMove', () => {
  const wall = (lo: number, hi: number) => (v: number) => !(v > lo && v < hi);

  it('goes straight to the target when the way is clear', () => {
    let calls = 0;
    const r = guardedMove(0, 12, 5, () => (calls++, true));
    expect(r).toEqual({ value: 12, blocked: false });
    expect(calls).toBe(3);
  });

  it('stops just short of the first obstacle on the way instead of tunnelling through it', () => {
    const r = guardedMove(0, 90, 5, wall(30, 40));
    expect(r.blocked).toBe(true);
    expect(r.value).toBeLessThanOrEqual(30);
    expect(r.value).toBeGreaterThan(29.5);
  });

  it('works backwards too, and stays put when the first step is already blocked', () => {
    const back = guardedMove(0, -50, 5, wall(-22, -10));
    expect(back.blocked).toBe(true);
    expect(back.value).toBeGreaterThanOrEqual(-10);
    expect(back.value).toBeLessThan(-9.5);
    const stuck = guardedMove(10, 20, 5, (v) => v <= 10);
    expect(stuck).toEqual({ value: 10, blocked: true });
  });
});
