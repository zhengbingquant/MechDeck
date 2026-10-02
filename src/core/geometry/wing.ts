import * as THREE from 'three';
import { ccw, loft, rot, type P2 } from './shapes';

/**
 * Wing planform in the wing's own frame: span along +X, chord along Y (+Y is
 * the leading edge side), thickness along Z with −Z the upper surface.
 */
export interface Planform {
  le(x: number): number;
  te(x: number): number;
  /** Maximum thickness (m) at span station x. */
  t(x: number): number;
}

/** NACA 4-digit symmetric half-thickness distribution; half-thickness = 5·t·nacaHalf(s). */
export function nacaHalf(s: number): number {
  const x = Math.min(1, Math.max(0, s));
  return 0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4;
}

/** Chordwise position (y) of chord fraction s at span station x. */
export const chordY = (p: Planform, x: number, s: number) => p.le(x) + (p.te(x) - p.le(x)) * s;

/** Chord fraction of chordwise position y at span station x. */
export const chordFraction = (p: Planform, x: number, y: number) => (p.le(x) - y) / (p.le(x) - p.te(x));

export const halfThickness = (p: Planform, x: number, s: number) => 5 * p.t(x) * nacaHalf(s);

export interface SliceOptions {
  /** Points per surface (cosine-spaced near the leading edge). */
  n?: number;
  /** Lower the upper surface by this much (a recess for a panel that sits in it). */
  upperInset?: number;
  lowerInset?: number;
  /** Only a skin of this thickness on one surface, `lift` above it (stripes, spoiler panels). */
  skin?: { side: 'upper' | 'lower'; thickness: number; lift?: number };
}

function sectionPoints(p: Planform, x: number, s0: number, s1: number, o: SliceOptions): P2[] {
  const n = o.n ?? 8;
  const at = (i: number) => {
    const k = i / n;
    return s0 + (s1 - s0) * (s0 === 0 ? 1 - Math.cos((k * Math.PI) / 2) : k);
  };
  // Section plane (px, pz) with px = −chord y: lofted along +Y then turned so Y becomes span.
  const pt = (s: number, z: number): P2 => [-chordY(p, x, s), z];
  const pts: P2[] = [];
  if (o.skin) {
    const sign = o.skin.side === 'upper' ? -1 : 1;
    const lift = o.skin.lift ?? 0;
    for (let i = 0; i <= n; i++) pts.push(pt(at(i), sign * (halfThickness(p, x, at(i)) + lift)));
    for (let i = n; i >= 0; i--) pts.push(pt(at(i), sign * (halfThickness(p, x, at(i)) + lift - o.skin.thickness)));
    return ccw(pts);
  }
  for (let i = 0; i <= n; i++) pts.push(pt(at(i), -halfThickness(p, x, at(i)) + (o.upperInset ?? 0)));
  for (let i = n; i >= (s0 === 0 ? 1 : 0); i--) pts.push(pt(at(i), halfThickness(p, x, at(i)) - (o.lowerInset ?? 0)));
  return ccw(pts);
}

/**
 * Solid chordwise slice of the airfoil between chord fractions s0…s1, lofted
 * across the span stations `xs` (geometry in the wing frame).
 */
export function wingSlice(p: Planform, xs: number[], s0: number, s1: number, o: SliceOptions = {}): THREE.BufferGeometry {
  const sections = xs.map((x) => ({ y: x, pts: sectionPoints(p, x, s0, s1, o) }));
  // −90° about Z maps (px, y, pz) → (y, −px, pz) = (span, chord, thickness).
  return rot(loft(sections), 0, 0, -90);
}

/**
 * Panel-line polyline segments lying on a wing surface: straight planform
 * segments [x, y] are resampled onto the airfoil, `lift` above it.
 */
export function surfaceLine(p: Planform, pts: [number, number][], side: 'upper' | 'lower', lift = 0.004, samples = 6): number[] {
  const out: number[] = [];
  const sign = side === 'upper' ? -1 : 1;
  const z = (x: number, y: number) => sign * (halfThickness(p, x, chordFraction(p, x, y)) + lift);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    for (let k = 0; k < samples; k++) {
      const a = k / samples;
      const b = (k + 1) / samples;
      const xa = x0 + (x1 - x0) * a;
      const ya = y0 + (y1 - y0) * a;
      const xb = x0 + (x1 - x0) * b;
      const yb = y0 + (y1 - y0) * b;
      out.push(xa, ya, z(xa, ya), xb, yb, z(xb, yb));
    }
  }
  return out;
}

/** Unit hinge axis between two points (wing frame), e.g. a control surface's hinge line. */
export function hingeAxis(a: readonly [number, number, number], b: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
}
