import { describe, it, expect } from 'vitest';
import { footfalls, LOCK_POINTS, locksCrossed, servoLevel } from './cues';

describe('footfalls', () => {
  it('counts a footfall each time the gait passes a foot strike (phase 0.25 and 0.75)', () => {
    expect(footfalls(0.1, 0.2)).toBe(0);
    expect(footfalls(0.2, 0.3)).toBe(1);
    expect(footfalls(0.7, 0.8)).toBe(1);
    expect(footfalls(0.2, 0.8)).toBe(2);
    // Wrapping past the end of the cycle.
    expect(footfalls(0.9, 0.3)).toBe(1);
    expect(footfalls(0.6, 0.3)).toBe(2);
    expect(footfalls(0.4, 0.4)).toBe(0);
  });
});

describe('locksCrossed', () => {
  it('reports the lock points passed in either direction, including arriving at a mode', () => {
    expect(locksCrossed(0.4, 0.5)).toEqual(LOCK_POINTS.filter((p) => p > 0.4 && p <= 0.5));
    expect(locksCrossed(0.4, 0.5)).toContain(0.5);
    expect(locksCrossed(0.6, 0.45)).toEqual(LOCK_POINTS.filter((p) => p >= 0.45 && p < 0.6).reverse());
    expect(locksCrossed(0.05, 0)).toContain(0);
    expect(locksCrossed(0.99, 1)).toContain(1);
    expect(locksCrossed(0.5, 0.5)).toEqual([]);
  });
});

describe('servoLevel', () => {
  it('is silent at rest and full at the normal conversion speed', () => {
    expect(servoLevel(0)).toBe(0);
    expect(servoLevel(0.005)).toBe(0);
    expect(servoLevel(0.34)).toBe(1);
    expect(servoLevel(-0.34)).toBe(1);
    const mid = servoLevel(0.12);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
