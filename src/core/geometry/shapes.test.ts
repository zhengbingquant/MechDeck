import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ccw, chamferRect, ellipse, finPlate, hullSection, loft, mirrorX, move, plate, stripe, taperBox, type P2, gear, bladeDisc } from './shapes';

function bbox(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  return g.boundingBox!;
}

function hasNaN(g: THREE.BufferGeometry) {
  for (const name of ['position', 'normal'] as const) {
    const a = g.getAttribute(name).array as Float32Array;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return true;
  }
  return false;
}

describe('section generators', () => {
  it('chamferRect gives 8 symmetric points inside its bounds', () => {
    const pts = chamferRect(2, 1, 0.2);
    expect(pts).toHaveLength(8);
    for (const [x, z] of pts) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(z)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    const sx = pts.reduce((s, p) => s + p[0], 0);
    expect(Math.abs(sx)).toBeLessThan(1e-9);
  });

  it('ellipse gives n points on the ellipse', () => {
    const pts = ellipse(4, 2, 16);
    expect(pts).toHaveLength(16);
    for (const [x, z] of pts) expect((x / 2) ** 2 + z ** 2).toBeCloseTo(1, 6);
  });
});

describe('loft', () => {
  it('builds a closed, capped solid spanning its sections', () => {
    const g = loft([
      { y: 0, pts: chamferRect(2, 1, 0.1) },
      { y: 3, pts: chamferRect(1, 0.5, 0.05) },
    ]);
    const b = bbox(g);
    expect(b.min.y).toBeCloseTo(0);
    expect(b.max.y).toBeCloseTo(3);
    expect(b.max.x).toBeCloseTo(1);
    expect(b.min.z).toBeCloseTo(-0.5);
    // 8 side quads + two 8-triangle caps, non-indexed
    expect(g.getAttribute('position').count).toBe(8 * 6 + 2 * 8 * 3);
    expect(hasNaN(g)).toBe(false);
  });

  it('rejects sections with mismatched point counts', () => {
    expect(() => loft([{ y: 0, pts: chamferRect(1, 1, 0.1) }, { y: 1, pts: ellipse(1, 1, 12) }])).toThrow();
  });

  it('produces outward-facing normals', () => {
    const g = taperBox(2, 2, 2, 2, 2);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const c = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).sub(c);
      n.fromBufferAttribute(nor, i);
      expect(p.dot(n)).toBeGreaterThan(0);
    }
  });
});

describe('hullSection', () => {
  it('gives 12 counter-clockwise points spanning the requested width and depth', () => {
    const pts = hullSection(2, -1, 0.5);
    expect(pts).toHaveLength(12);
    let signed = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[(i + 1) % pts.length];
      signed += x0 * z1 - x1 * z0;
    }
    expect(signed).toBeGreaterThan(0);
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(1);
    expect(Math.min(...pts.map((p) => p[1]))).toBeCloseTo(-1);
    expect(Math.max(...pts.map((p) => p[1]))).toBeCloseTo(0.5);
  });
});

describe('mirrorX', () => {
  it('mirrors across x=0 and keeps normals pointing outward', () => {
    const g = mirrorX(move(taperBox(2, 2, 2, 2, 2), 3, 0, 0));
    const b = bbox(g);
    expect(b.min.x).toBeCloseTo(-4);
    expect(b.max.x).toBeCloseTo(-2);
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const c = new THREE.Vector3(-3, 1, 0);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).sub(c);
      n.fromBufferAttribute(nor, i);
      expect(p.dot(n)).toBeGreaterThan(0);
    }
  });
});

describe('plate', () => {
  it('extrudes a planform to the requested thickness, centred on z=0', () => {
    const g = plate([[0, 0], [4, 0], [4, 1], [0, 2]], 0.3);
    const b = bbox(g);
    expect(b.max.z - b.min.z).toBeCloseTo(0.3, 5);
    expect(b.min.z).toBeCloseTo(-0.15, 5);
    expect(b.max.x).toBeCloseTo(4, 5);
    expect(hasNaN(g)).toBe(false);
  });
});

describe('ccw', () => {
  it('returns points with positive signed area, reversing clockwise input', () => {
    const cw: P2[] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    const out = ccw(cw);
    let s = 0;
    for (let i = 0; i < out.length; i++) {
      const [x0, z0] = out[i];
      const [x1, z1] = out[(i + 1) % out.length];
      s += x0 * z1 - x1 * z0;
    }
    expect(s).toBeGreaterThan(0);
    expect(ccw(out)).toEqual(out);
  });
});

describe('stripe', () => {
  it('offsets a straight polyline into a band of the given width', () => {
    const poly = stripe([[0, 0], [4, 0]], 0.5);
    expect(poly).toHaveLength(4);
    const ys = poly.map((p) => p[1]);
    expect(Math.max(...ys)).toBeCloseTo(0.25);
    expect(Math.min(...ys)).toBeCloseTo(-0.25);
  });

  it('mitres a bent polyline so the band keeps its width at the corner', () => {
    const poly = stripe([[0, 0], [2, 0], [2, 2]], 0.4);
    expect(poly).toHaveLength(6);
    // The outer mitre corner sits at (2.2, -0.2), the inner one at (1.8, 0.2).
    const has = (x: number, y: number) => poly.some((p) => Math.abs(p[0] - x) < 1e-6 && Math.abs(p[1] - y) < 1e-6);
    expect(has(2.2, -0.2)).toBe(true);
    expect(has(1.8, 0.2)).toBe(true);
  });
});

describe('finPlate', () => {
  it('stands a (height, chord) planform up along -Z with thickness along X', () => {
    const g = finPlate([[0, 1], [0, -1], [2, -1.5], [2, -0.5]], 0.1);
    const b = bbox(g);
    expect(b.min.z).toBeCloseTo(-2, 5);
    expect(b.max.z).toBeCloseTo(0, 5);
    expect(b.max.x - b.min.x).toBeCloseTo(0.1, 5);
    expect(b.max.y).toBeCloseTo(1, 5);
    expect(b.min.y).toBeCloseTo(-1.5, 5);
  });
});

describe('gear', () => {
  it('builds a toothed disc of the requested radius and thickness around the Z axis', () => {
    const g = gear(0.2, 16, 0.05, 0.03);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.x).toBeCloseTo(0.2, 2);
    expect(b.min.x).toBeCloseTo(-0.2, 1);
    expect(b.max.z - b.min.z).toBeCloseTo(0.05, 3);
  });

  it('has a bore when asked', () => {
    const solid = gear(0.2, 16, 0.05, 0.03).getAttribute('position').count;
    const bored = gear(0.2, 16, 0.05, 0.03, 0.06).getAttribute('position').count;
    expect(bored).toBeGreaterThan(solid);
  });
});

describe('bladeDisc', () => {
  it('fans n blades out to the tip radius around the Y axis', () => {
    const g = bladeDisc(0.5, 0.15, 12, 0.08);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(Math.max(b.max.x, b.max.z)).toBeGreaterThan(0.45);
    expect(Math.max(b.max.x, b.max.z)).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(b.max.y - b.min.y).toBeLessThan(0.2);
  });
});
