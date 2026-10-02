import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A point in a cross-section plane: [x, z]. */
export type P2 = [number, number];

export interface Section {
  y: number;
  pts: P2[];
}

/**
 * Rectangle with chamfered corners, 8 points in counter-clockwise order
 * (increasing atan2(z, x)), centred on (cx, cz).
 */
export function chamferRect(w: number, d: number, c: number, cx = 0, cz = 0): P2[] {
  const hw = w / 2;
  const hd = d / 2;
  const k = Math.max(0, Math.min(c, hw * 0.95, hd * 0.95));
  return [
    [cx + hw - k, cz - hd],
    [cx + hw, cz - hd + k],
    [cx + hw, cz + hd - k],
    [cx + hw - k, cz + hd],
    [cx - hw + k, cz + hd],
    [cx - hw, cz + hd - k],
    [cx - hw, cz - hd + k],
    [cx - hw + k, cz - hd],
  ];
}

/** Ellipse sampled at n points, counter-clockwise. */
export function ellipse(w: number, d: number, n: number, cx = 0, cz = 0): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + (w / 2) * Math.cos(a), cz + (d / 2) * Math.sin(a)]);
  }
  return pts;
}

/**
 * Hard-surface fuselage section: flat-ish belly, chined sides, rounded spine.
 * `belly` and `spine` are z-offsets of the bottom and top relative to the centre.
 * Always 12 points so fuselage sections can be lofted together.
 */
export function hullSection(w: number, zTop: number, zBot: number, chine = 0.35, crown = 0.3): P2[] {
  const hw = w / 2;
  const h = zBot - zTop;
  const zc = zTop + h * chine; // chine line height (from top)
  // z grows toward the belly in section space; points listed counter-clockwise.
  return [
    [hw * 0.55, zBot],
    [hw * 0.92, zBot - h * 0.12],
    [hw, zc + h * 0.18],
    [hw, zc],
    [hw * 0.8, zTop + h * crown * 0.35],
    [hw * 0.35, zTop],
    [-hw * 0.35, zTop],
    [-hw * 0.8, zTop + h * crown * 0.35],
    [-hw, zc],
    [-hw, zc + h * 0.18],
    [-hw * 0.92, zBot - h * 0.12],
    [-hw * 0.55, zBot],
  ].map(([x, z]) => [x, z] as P2)
    .sort((a, b) => Math.atan2(a[1] - (zTop + zBot) / 2, a[0]) - Math.atan2(b[1] - (zTop + zBot) / 2, b[0]));
}

function centroid(pts: P2[]): P2 {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return [x / pts.length, z / pts.length];
}

function area(pts: P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
}

export interface LoftOptions {
  capStart?: boolean;
  capEnd?: boolean;
}

/**
 * Loft counter-clockwise cross-sections stacked along +Y into a closed solid.
 * Non-indexed with flat normals: the stylised hard-surface look we want.
 */
export function loft(sections: Section[], opts: LoftOptions = {}): THREE.BufferGeometry {
  const { capStart = true, capEnd = true } = opts;
  if (sections.length < 2) throw new Error('loft needs at least two sections');
  const n = sections[0].pts.length;
  for (const s of sections) {
    if (s.pts.length !== n) throw new Error(`loft section point counts differ (${s.pts.length} vs ${n})`);
  }
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);

  for (let s = 0; s < sections.length - 1; s++) {
    const s0 = sections[s];
    const s1 = sections[s + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const A = [s0.pts[i][0], s0.y, s0.pts[i][1]];
      const B = [s0.pts[j][0], s0.y, s0.pts[j][1]];
      const C = [s1.pts[j][0], s1.y, s1.pts[j][1]];
      const D = [s1.pts[i][0], s1.y, s1.pts[i][1]];
      tri(A, C, B);
      tri(A, D, C);
    }
  }
  const cap = (s: Section, up: boolean) => {
    if (area(s.pts) < 1e-6) return;
    const [mx, mz] = centroid(s.pts);
    const M = [mx, s.y, mz];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const P = [s.pts[i][0], s.y, s.pts[i][1]];
      const Q = [s.pts[j][0], s.y, s.pts[j][1]];
      if (up) tri(M, Q, P);
      else tri(M, P, Q);
    }
  };
  if (capStart) cap(sections[0], false);
  if (capEnd) cap(sections[sections.length - 1], true);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Chamfered box tapering from (w0 × d0) at y=0 to (w1 × d1) at y=h, top offset by (dx, dz). */
export function taperBox(
  w0: number,
  d0: number,
  w1: number,
  d1: number,
  h: number,
  opts: { chamfer?: number; dx?: number; dz?: number; y0?: number } = {},
): THREE.BufferGeometry {
  const { chamfer = 0.08, dx = 0, dz = 0, y0 = 0 } = opts;
  return loft([
    { y: y0, pts: chamferRect(w0, d0, chamfer) },
    { y: y0 + h, pts: chamferRect(w1, d1, chamfer, dx, dz) },
  ]);
}

/** Chamfered box centred on the origin. */
export function cbox(w: number, h: number, d: number, chamfer = 0.08): THREE.BufferGeometry {
  return taperBox(w, d, w, d, h, { chamfer, y0: -h / 2 });
}

/**
 * Extrude a planform (x, y) polygon to `thickness` along z, centred on z=0,
 * with an optional chamfer that keeps the planform outline exact.
 */
export function plate(poly: P2[], thickness: number, bevel = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const b = Math.min(bevel, thickness * 0.45);
  const depth = thickness - 2 * b;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 1,
    curveSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g.index ? g.toNonIndexed() : g;
}

/** Surface of revolution around +Y from [radius, y] pairs. */
export function lathe(profile: P2[], segments = 16): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

const D2R = Math.PI / 180;

/** Rotate a geometry in place by Euler degrees (XYZ order) and return it. */
export function rot(g: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x * D2R, y * D2R, z * D2R)));
  return g;
}

/** Translate a geometry in place and return it. */
export function move(g: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  g.translate(x, y, z);
  return g;
}

/** Mirror a geometry across the YZ plane (x → -x), fixing winding. */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  m.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  const p = m.getAttribute('position');
  if (m.index) {
    const idx = m.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  } else {
    const a = p.array as Float32Array;
    for (let i = 0; i < p.count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const t = a[(i + 1) * 3 + k];
        a[(i + 1) * 3 + k] = a[(i + 2) * 3 + k];
        a[(i + 2) * 3 + k] = t;
      }
    }
  }
  m.computeVertexNormals();
  return m;
}

/** Ensure a polygon is counter-clockwise (positive signed area). */
export function ccw(pts: P2[]): P2[] {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    s += x0 * z1 - x1 * z0;
  }
  return s >= 0 ? pts : [...pts].reverse();
}

/** Band polygon of constant width following a polyline (mitred corners). */
export function stripe(path: P2[], width: number): P2[] {
  const h = width / 2;
  const normals: P2[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1][0] - path[i][0];
    const dy = path[i + 1][1] - path[i][1];
    const len = Math.hypot(dx, dy) || 1;
    normals.push([-dy / len, dx / len]);
  }
  const left: P2[] = [];
  const right: P2[] = [];
  for (let i = 0; i < path.length; i++) {
    let nx: number;
    let ny: number;
    let scale = h;
    if (i === 0) [nx, ny] = normals[0];
    else if (i === path.length - 1) [nx, ny] = normals[normals.length - 1];
    else {
      const [ax, ay] = normals[i - 1];
      const [bx, by] = normals[i];
      const mx = ax + bx;
      const my = ay + by;
      const ml = Math.hypot(mx, my) || 1;
      nx = mx / ml;
      ny = my / ml;
      scale = h / Math.max(0.2, nx * ax + ny * ay);
    }
    left.push([path[i][0] + nx * scale, path[i][1] + ny * scale]);
    right.push([path[i][0] - nx * scale, path[i][1] - ny * scale]);
  }
  return ccw([...left, ...right.reverse()]);
}

/**
 * Fin / blade: planform given as [height, chord] points is stood up so height
 * runs along -Z, chord along Y and thickness along X.
 */
export function finPlate(poly: P2[], thickness: number, bevel = 0): THREE.BufferGeometry {
  return rot(plate(ccw(poly), thickness, bevel), 0, 90, 0);
}

/**
 * Spur gear: `teeth` trapezoidal teeth on a disc of tip radius `radius`,
 * extruded `thickness` along Z (centred), with an optional bore.
 */
export function gear(radius: number, teeth: number, thickness: number, toothDepth: number, bore = 0): THREE.BufferGeometry {
  const root = radius - toothDepth;
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts: [number, number][] = [
      [root, a],
      [radius, a + step * 0.2],
      [radius, a + step * 0.5],
      [root, a + step * 0.7],
    ];
    pts.forEach(([r, ang], k) => {
      const x = r * Math.cos(ang);
      const y = r * Math.sin(ang);
      if (i === 0 && k === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  if (bore > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -thickness / 2);
  return g.index ? g.toNonIndexed() : g;
}

/**
 * Bladed rotor stage (fan, compressor or turbine) around the Y axis: a hub
 * plus `blades` twisted blades from the hub to the tip radius.
 */
export function bladeDisc(tipRadius: number, hubRadius: number, blades: number, chord: number, twist = 32): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(hubRadius, hubRadius, chord * 0.9, 16).toNonIndexed()];
  const span = tipRadius - hubRadius;
  for (let i = 0; i < blades; i++) {
    const blade = new THREE.BoxGeometry(span, chord, Math.max(0.012, chord * 0.14)).toNonIndexed();
    blade.rotateX((twist * Math.PI) / 180);
    blade.translate(hubRadius + span / 2, 0, 0);
    blade.rotateY((i / blades) * Math.PI * 2);
    parts.push(blade);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}
