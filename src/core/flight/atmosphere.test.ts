import { describe, it, expect } from 'vitest';
import { atmosphere } from './atmosphere';

describe('ISA atmosphere', () => {
  it('matches the standard sea-level values', () => {
    const a = atmosphere(0);
    expect(a.temperature).toBeCloseTo(288.15, 2);
    expect(a.pressure).toBeCloseTo(101325, 0);
    expect(a.density).toBeCloseTo(1.225, 3);
    expect(a.speedOfSound).toBeCloseTo(340.29, 1);
  });

  it('matches the US Standard Atmosphere 1976 tables (geometric altitude)', () => {
    const at10 = atmosphere(10_000);
    expect(at10.temperature).toBeCloseTo(223.25, 1);
    expect(at10.density).toBeCloseTo(0.4135, 3);
    expect(at10.speedOfSound).toBeCloseTo(299.5, 0);
    const at20 = atmosphere(20_000);
    expect(at20.temperature).toBeCloseTo(216.65, 1);
    expect(at20.density).toBeCloseTo(0.08891, 4);
    const at30 = atmosphere(30_000);
    expect(at30.temperature).toBeCloseTo(226.51, 1);
    expect(at30.density).toBeCloseTo(0.01841, 4);
    expect(at30.speedOfSound).toBeCloseTo(301.8, 0);
  });

  it('thins out monotonically with altitude and clamps below sea level', () => {
    let prev = Infinity;
    for (let h = 0; h <= 45_000; h += 500) {
      const rho = atmosphere(h).density;
      expect(rho).toBeLessThan(prev);
      prev = rho;
    }
    expect(atmosphere(-200).density).toBeCloseTo(1.225, 3);
  });
});
