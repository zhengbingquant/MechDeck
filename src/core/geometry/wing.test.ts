import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { chordY, halfThickness, nacaHalf, surfaceLine, wingSlice, type Planform } from './wing';

const P: Planform = {
  le: (x) => 1 - 0.1 * x,
  te: (x) => -1 + 0.1 * x,
  t: (x) => 0.2 - 0.02 * x,
};

const bounds = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

describe('NACA 4-digit thickness', () => {
  it('is zero at the leading edge, t/2 near 30 % chord and nearly closed at the trailing edge', () => {
    expect(nacaHalf(0)).toBe(0);
    expect(5 * nacaHalf(0.3)).toBeCloseTo(0.5, 2);
    expect(5 * nacaHalf(1)).toBeLessThan(0.02);
    expect(halfThickness(P, 0, 0.3)).toBeCloseTo(0.1, 2);
  });
});

describe('wingSlice', () => {
  it('spans the requested stations and chord fractions, within the airfoil thickness', () => {
    const g = wingSlice(P, [0, 5], 0.2, 0.7);
    const b = bounds(g);
    expect(b.min.x).toBeCloseTo(0, 5);
    expect(b.max.x).toBeCloseTo(5, 5);
    expect(b.max.y).toBeCloseTo(chordY(P, 0, 0.2), 5);
    expect(b.min.y).toBeCloseTo(chordY(P, 0, 0.7), 5);
    expect(b.max.z).toBeLessThanOrEqual(0.1 + 1e-6);
    expect(b.min.z).toBeGreaterThanOrEqual(-0.1 - 1e-6);
  });

  it('wraps round the leading edge when it starts at 0 % chord', () => {
    const b = bounds(wingSlice(P, [0, 1], 0, 0.15));
    expect(b.max.y).toBeCloseTo(P.le(0), 5);
  });

  it('produces outward-facing normals', () => {
    const g = wingSlice(P, [0, 2, 5], 0, 1);
    const pos = g.getAttribute('position');
    const center = bounds(g).getCenter(new THREE.Vector3());
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let outward = 0;
    let total = 0;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (n.lengthSq() < 1e-14) continue;
      const mid = a.clone().add(b).add(c).divideScalar(3).sub(center);
      total++;
      if (n.dot(mid) > 0) outward++;
    }
    expect(outward / total).toBeGreaterThan(0.95);
  });

  it('recesses the upper surface and builds thin skins that sit flush on it', () => {
    const recessed = bounds(wingSlice(P, [0, 1], 0.5, 0.7, { upperInset: 0.03 }));
    const full = bounds(wingSlice(P, [0, 1], 0.5, 0.7));
    expect(recessed.min.z).toBeCloseTo(full.min.z + 0.03, 5);
    const skin = bounds(wingSlice(P, [0, 1], 0.5, 0.7, { skin: { side: 'upper', thickness: 0.02 } }));
    expect(skin.min.z).toBeCloseTo(full.min.z, 5);
    expect(skin.max.z).toBeLessThan(0);
  });
});

describe('surfaceLine', () => {
  it('follows the upper surface just above it', () => {
    const pts = surfaceLine(P, [[1, 0], [1, -0.5]], 'upper', 0.005, 4);
    expect(pts.length).toBe(4 * 2 * 3);
    for (let i = 0; i < pts.length; i += 3) {
      const [x, y, z] = [pts[i], pts[i + 1], pts[i + 2]];
      const s = (P.le(x) - y) / (P.le(x) - P.te(x));
      expect(z).toBeCloseTo(-halfThickness(P, x, s) - 0.005, 5);
    }
  });
});
