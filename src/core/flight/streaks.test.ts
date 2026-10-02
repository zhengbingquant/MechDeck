import { describe, it, expect } from 'vitest';
import { streakMotion } from './streaks';

describe('airflow streaks', () => {
  it('drift past faster and trail longer in proportion to airspeed, across the whole envelope', () => {
    // From a slow GERWALK-style hover (15 m/s) to Mach 2.7 at altitude (~800 m/s).
    for (const v of [15, 40, 110, 220, 330, 450, 800]) {
      const a = streakMotion(v);
      const b = streakMotion(v * 1.1);
      expect(b.drift / a.drift, `drift at ${v} m/s`).toBeCloseTo(1.1, 3);
      expect(b.length / a.length, `trail at ${v} m/s`).toBeCloseTo(1.1, 3);
    }
  });

  it('moves visibly: the 220 m/s start crosses the 44 m streak field in about a second', () => {
    const { drift } = streakMotion(220);
    expect(44 / drift).toBeGreaterThan(0.8);
    expect(44 / drift).toBeLessThan(1.6);
  });
});
