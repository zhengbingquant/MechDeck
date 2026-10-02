import { describe, it, expect } from 'vitest';
import { evaluatePose, KEYS, plantWeight, smooth } from './poses';

describe('smooth', () => {
  it('eases 0→1 with zero slope at both ends and clamps outside', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBeCloseTo(0.5);
    expect(smooth(-3)).toBe(0);
    expect(smooth(7)).toBe(1);
    expect(smooth(0.01)).toBeLessThan(0.01);
  });
});

describe('evaluatePose', () => {
  it('returns the Fighter, GERWALK and Battroid keyframes exactly at 0, 0.5 and 1', () => {
    for (const [t, key] of [[0, KEYS.fighter], [0.5, KEYS.gerwalk], [1, KEYS.battroid]] as const) {
      const pose = evaluatePose(t);
      for (const [bone, jp] of Object.entries(key)) {
        if (jp.r) jp.r.forEach((v, i) => expect(pose[bone].r[i], `${bone}.r[${i}] @${t}`).toBeCloseTo(v, 6));
        if (jp.p) jp.p.forEach((v, i) => expect(pose[bone].p![i], `${bone}.p[${i}] @${t}`).toBeCloseTo(v, 6));
      }
    }
  });

  it('holds a joint still until its timing window opens', () => {
    // The nose section only folds late in the GERWALK → Battroid segment.
    const early = evaluatePose(0.6);
    expect(early.nose.r[0]).toBeCloseTo(KEYS.gerwalk.nose?.r?.[0] ?? 0, 6);
    const late = evaluatePose(0.95);
    expect(late.nose.r[0]).toBeGreaterThan(90);
  });

  it('supports waypoints: the arms slide aft out of the bay, spread and untwist before swinging forward', () => {
    // Official sheet: 腕全体が後ろにスライド → 左右に分かれて広がる → 90°ひねって → 90°下に回転.
    const fighter = KEYS.fighter.shoulderL.p!;
    const slid = evaluatePose(0.5 * 0.3); // end of the first waypoint: still between the engines
    expect(slid.shoulderL.p![0]).toBeCloseTo(fighter[0], 3);
    expect(slid.shoulderL.p![1]).toBeLessThan(fighter[1] - 0.9);
    expect(slid.shoulderL.r[1]).toBeCloseTo(KEYS.fighter.shoulderL.r![1], 3); // still twisted on edge
    const spread = evaluatePose(0.5 * 0.45); // spread outboard, still aft
    expect(spread.shoulderL.p![0]).toBeCloseTo(KEYS.gerwalk.shoulderL.p![0], 3);
    expect(spread.shoulderR.p![0]).toBeCloseTo(-KEYS.gerwalk.shoulderL.p![0], 3);
    expect(spread.shoulderL.p![1]).toBeCloseTo(slid.shoulderL.p![1], 3);
    const untwisted = evaluatePose(0.5 * 0.55);
    expect(untwisted.shoulderL.r[1]).toBeCloseTo(0, 3);
    const end = evaluatePose(0.5);
    expect(end.shoulderL.p![1]).toBeCloseTo(KEYS.gerwalk.shoulderL.p![1], 6);
  });

  it('is continuous across the GERWALK boundary', () => {
    const a = evaluatePose(0.4999);
    const b = evaluatePose(0.5001);
    for (const bone of Object.keys(a)) {
      a[bone].r.forEach((v, i) => expect(Math.abs(v - b[bone].r[i]), bone).toBeLessThan(0.5));
    }
  });
});

describe('plantWeight', () => {
  it('is 0 while flying, 1 once landed in GERWALK and Battroid', () => {
    expect(plantWeight(0)).toBe(0);
    expect(plantWeight(0.2)).toBe(0);
    expect(plantWeight(0.5)).toBe(1);
    expect(plantWeight(0.8)).toBe(1);
    expect(plantWeight(1)).toBe(1);
    const mid = plantWeight(0.42);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
