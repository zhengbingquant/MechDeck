import * as THREE from 'three';
import type { Vf1Builder as Builder } from '../materials';
import { faceLines } from '../../../core/builder';
import { D } from '../dims';
import { cbox, ccw, chamferRect, loft, mirrorX, move, plate, rot, type P2 } from '../../../core/geometry/shapes';
import { INTAKE, NOZZLE, intakeLipY } from '../surfaces';

const L = D.leg;
const F = L.foot;
/** Shin centre line relative to the knee hinge (the hinge sits on the leg's front face). */
export const SHIN_AXIS_Z = -L.kneeFront;
/** Radius of the opening in the shin's top where the knee bellows enters the engine's inlet. */
const BELLOWS_OPENING = 0.38;
/** Shin centre line relative to the ankle pivot. */
export const ANKLE_TO_AXIS_Z = -L.kneeFront - L.ankleBack;

/** Thin plate on the leg's outer side face (normal ±X), polygon as [y, z]. */
function sidePlate(poly: P2[], t = 0.02, bevel = 0): THREE.BufferGeometry {
  return rot(plate(ccw(poly.map(([y, z]) => [z, y] as P2)), t, bevel), 0, -90, 0);
}

function band(y0: number, y1: number, w: number, d: number, cz = 0): THREE.BufferGeometry {
  return loft([
    { y: y0, pts: chamferRect(w, d, 0.2, 0, cz) },
    { y: y1, pts: chamferRect(w, d, 0.2, 0, cz) },
  ]);
}

/** Annular sector around the X axis (the knee hinge), angles from +Z toward +Y, as a [y, z] polygon. */
function sector(r0: number, r1: number, a0: number, a1: number, n = 8): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([r1 * Math.sin(a), r1 * Math.cos(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([r0 * Math.sin(a), r0 * Math.cos(a)]);
  }
  return pts;
}

/**
 * Shin sections below the knee hinge as [y, inner half-width, outer half-width, depth, corner radius]
 * (port side: outboard = +X). Narrow under the knee, then the calf bulges outboard to ~1.6 m, its
 * outer edge 2.6 m off the centre line in Battroid as in the front schematic (which draws ~1.9 m;
 * the inner face can't grow: the stowed shoulder blocks lie against it in Fighter). The Fighter front
 * view shows the same bulge outboard of each intake. The outer side is two planes (−0.6→−2.4 flaring
 * out, −3.1→−4.18 tapering in) either side of the upright calf, so markings can lie flush on it.
 */
const SHIN: [number, number, number, number, number][] = [
  [-0.08, 0.54, 0.54, 1.18, 0.26],
  [-0.6, 0.565, 0.62, 1.26, 0.28],
  [-1.5, 0.62, 0.79, 1.38, 0.34],
  [-2.4, 0.66, 0.96, 1.46, 0.4],
  [-3.1, 0.66, 0.96, 1.46, 0.4],
  [-3.7, 0.65, 0.816, 1.42, 0.34],
  [-L.shinLen + 0.12, 0.62, 0.7, 0.92, 0.24],
];
/**
 * Battroid knee pivot (knee frame): on the shin's back-top edge. Bending back about it swings the
 * shin down and back, clear of the thigh (the front hinge alone lifts the calf into the thigh).
 */
export const KNEE_BACK = [0, -0.1, -L.kneeFront - 0.55] as const;

/**
 * Hip rail: the track the hip carriages run on between the Fighter / GERWALK mount (beside the
 * intakes' mouths) and the Battroid hips below the waist. It follows the carriage's path exactly
 * (per metre of y: RAIL_DIR), flush against the inboard face of the carriage's navy block.
 */
const RAIL_B = L.railBattroid;
const RAIL_F = L.railFighter;
export const RAIL_DIR = [0, 1, 2].map((i) => (RAIL_F[i] - RAIL_B[i]) / (RAIL_F[1] - RAIL_B[1])) as unknown as readonly [number, number, number];
/**
 * Track section relative to the carriage path (port): 6 cm wide inboard of the block, 20 cm deep,
 * in the gap between the stowed arm and the nacelle's calf in Fighter mode.
 */
const RAIL_X = [-0.7, -0.64] as const;
const RAIL_Z = [-0.1, 0.1] as const;

/**
 * A block along the hip rail (port, torso frame) from y0 to y1, with the cross-section offsets
 * x0..x1 / z0..z1 relative to the carriage path: a sheared box following the rail's slight drift.
 */
function railPiece(y0: number, y1: number, [x0, x1]: readonly number[], [z0, z1]: readonly number[]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const at = (y: number) => [0, 1, 2].map((i) => RAIL_B[i] + RAIL_DIR[i] * (y - RAIL_B[1]));
  const c = at((y0 + y1) / 2);
  const m = new THREE.Matrix4().set(
    x1 - x0, RAIL_DIR[0] * (y1 - y0), 0, c[0] + (x0 + x1) / 2,
    0, y1 - y0, 0, c[1],
    0, RAIL_DIR[2] * (y1 - y0), z1 - z0, c[2] + (z0 + z1) / 2,
    0, 0, 0, 1,
  );
  return g.applyMatrix4(m);
}

/** The hip rails: the fixed section on the torso (with its hangers), the chest section on the nose, and the telescoping extension. */
export function buildHipRails(b: Builder) {
  const hinge = D.nose.hinge;
  // Torso section: from the nose hinge down to just below the keel slab (1.45 m), hung from the
  // cheeks and on two hangers from the keel slab (clear of the folded swing-bar lock beside it).
  const torso = railPiece(1.45, hinge[1], RAIL_X, RAIL_Z);
  const hangers = [2.45, 3.0].map((y) => {
    const g = new THREE.BoxGeometry(0.065, 0.16, 0.47);
    return g.translate(0.8725, y, -0.47 + 0.235);
  });
  // Chest section, on the chest plate's keel and the cockpit side (its web is the intakes'
  // boundary-layer splitter): continuous with the torso section while the nose is down.
  const chest = [railPiece(hinge[1], 6.85, RAIL_X, RAIL_Z), railPiece(hinge[1], 6.85, [-0.95, RAIL_X[0]], [-0.06, 0.06])]
    .map((g) => g.translate(-hinge[0], -hinge[1], -hinge[2]));
  // Telescoping lower section, stowed inside the torso section.
  const ext = railPiece(1.45, hinge[1], [RAIL_X[0] + 0.005, RAIL_X[1] - 0.005], [RAIL_Z[0] + 0.005, RAIL_Z[1] - 0.005]);
  for (const side of ['port', 'starboard'] as const) {
    const S = side === 'port' ? 'L' : 'R';
    const m = (g: THREE.BufferGeometry) => (side === 'port' ? g : mirrorX(g));
    const id = `hip-rail-${side}`;
    b.ext(id, 'torso', m(torso), 'gunmetal', { edges: 30, collide: true });
    for (const h of hangers) b.ext(id, 'torso', m(h), 'gunmetal', { edges: 30, collide: true });
    for (const g of chest) b.ext(id, 'nose', m(g), 'gunmetal', { edges: 30, collide: true });
    b.ext(id, `hipRailExt${S}`, m(ext), 'steel', { edges: 30, collide: true });
  }
}
/** Outer-side slopes (dx/dy) of the flaring upper and tapering lower calf planes. */
export const CALF_FLARE = (0.96 - 0.62) / (2.4 - 0.6);
export const CALF_TAPER = (0.96 - 0.7) / (L.shinLen - 0.12 - 3.1);
/** The lowest sections are shallower at the front (bevelled back toward the ankle pivot). */
const shinBack = (y: number, d: number) => (y < -3.7 ? -(1.42 - d) / 2 : 0);
export const shinAt = (y: number) => {
  const row = (r: number[]) => ({ xin: r[1], xout: r[2], d: r[3], r: r[4], w: r[1] + r[2] });
  for (let i = 1; i < SHIN.length; i++) {
    const a = SHIN[i - 1];
    const b = SHIN[i];
    if (y <= a[0] && y >= b[0]) {
      const k = (a[0] - y) / (a[0] - b[0]);
      return row(a.map((v, j) => v + (b[j] - v) * k));
    }
  }
  return row(SHIN[SHIN.length - 1]);
};
/**
 * Rounded shin section, 16 points counter-clockwise: flat front, back and sides, three facets per
 * corner. Every point is linear in the parameters, so interpolated sections match the loft.
 */
function shinSection(xin: number, xout: number, d: number, r: number, cz: number): P2[] {
  const hd = d / 2;
  const corners: [number, number, number][] = [
    [xout - r, cz - hd + r, -90],
    [xout - r, cz + hd - r, 0],
    [-xin + r, cz + hd - r, 90],
    [-xin + r, cz - hd + r, 180],
  ];
  const pts: P2[] = [];
  for (const [x, z, a0] of corners) {
    for (let i = 0; i <= 3; i++) {
      const a = ((a0 + i * 30) * Math.PI) / 180;
      pts.push([x + r * Math.cos(a), z + r * Math.sin(a)]);
    }
  }
  return pts;
}

/**
 * Inlet walls between two matching section outlines ([x, z], counter-clockwise) from y0 up to the
 * raked lip at y = lipY(z): the shell (outer faces and the lip face) and the liner (inner faces).
 */
function rakedInlet(outer: P2[], inner: P2[], y0: number, lipY: (z: number) => number) {
  const shell: number[] = [];
  const liner: number[] = [];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // A quad a-b-c-d, wound so its normal faces `toward`.
  const quad = (out: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, toward: THREE.Vector3) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const tri = n.dot(toward) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    for (const p of tri) out.push(p.x, p.y, p.z);
  };
  const n = outer.length;
  for (let i = 0; i < n; i++) {
    const [ox0, oz0] = outer[i];
    const [ox1, oz1] = outer[(i + 1) % n];
    const [ix0, iz0] = inner[i];
    const [ix1, iz1] = inner[(i + 1) % n];
    const mid = v((ox0 + ox1) / 2, 0, (oz0 + oz1) / 2);
    quad(shell, v(ox0, y0, oz0), v(ox1, y0, oz1), v(ox1, lipY(oz1), oz1), v(ox0, lipY(oz0), oz0), mid);
    quad(liner, v(ix0, y0, iz0), v(ix1, y0, iz1), v(ix1, lipY(iz1), iz1), v(ix0, lipY(iz0), iz0), mid.clone().negate());
    quad(shell, v(ox0, lipY(oz0), oz0), v(ox1, lipY(oz1), oz1), v(ix1, lipY(iz1), iz1), v(ix0, lipY(iz0), iz0), v(0, 1, 0));
  }
  const geo = (a: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    g.computeVertexNormals();
    return g;
  };
  return { shell: geo(shell), liner: geo(liner) };
}

/** Square plate (the inlet's inner outline) with the round duct's mouth cut out, at height y. */
function fanFrame(outline: P2[], r: number, y: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  const hole = new THREE.Path();
  hole.absarc(0, 0, r, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false, curveSegments: 24 }).rotateX(Math.PI / 2).translate(0, y, 0);
}

/**
 * Legs = the FF-2001 engine nacelles, proportioned from the official line
 * art: a 2.2 m intake box (an F-14-style raked 2-D inlet with variable ramps, the fan face deep
 * inside, louvred shutters in front), a short thigh, a knee hinged on its front face (so the shin
 * can drop 90° under the level thigh in GERWALK and flex back in Battroid), a
 * long shin that flares at the calf, and the nozzle boot that becomes the foot.
 * Frame (Battroid stance): +Y up the leg, +Z front, +X port. Joints: hip
 * carriage → hip → hip slide → thigh → knee → ankle → foot slide.
 */
export function buildLegs(b: Builder) {
  const W = L.width;
  const Dp = L.depth;
  for (const side of ['port', 'starboard'] as const) {
    const S = side === 'port' ? 'L' : 'R';
    const s = side === 'port' ? 1 : -1;
    const m = (g: THREE.BufferGeometry) => (s > 0 ? g : mirrorX(g));
    const legs = `legSlide${S}`;

    /* hip swing-bar carriage: a plate running on the rail's outboard face (bone hipRail), and the
       hub the leg turns on (bone hip) between it and the intake box's inboard face, which slides
       past on its rack (Fighter: hub at the lip; Battroid: at the thigh). All of it beside the
       intake, clear of the mouth and the air duct. */
    b.ext(`hip-joint-${side}`, `hipRail${S}`, new THREE.BoxGeometry(0.04, 0.62, 0.9), 'navy', { pos: [-s * L.hipIn, 0, 0.15], joint: `torso,hip${S},${legs}` });
    b.ext(`hip-joint-${side}`, `hip${S}`, rot(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 20), 0, 0, 90), 'navy', { edges: false, joint: `hipRail${S},${legs},torso` });
    // Swing-bar lock (bone hipLock): the carriage's arm into the fuselage side in Fighter and
    // GERWALK, which holds the leg to the airframe; it retracts into the carriage to slide.
    b.ext(`hip-lock-${side}`, `hipLock${S}`, move(new THREE.BoxGeometry(0.64, 0.26, 0.17), -s * 0.34, 0, 0), 'navy', { joint: `hipRail${S},hip${S},legSlide${S},nose,cockpit` });
    b.ext(`hip-lock-${side}`, `hipLock${S}`, rot(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 14), 90, 0, 0), 'gunmetal', { edges: false, joint: `hipRail${S},hip${S},legSlide${S}` });

    /* intake: the solid box up to the fan's second stage, then the raked inlet's four walls (the
       upper, ramp-side lip leading), dark inside, with the square-to-round frame at the fan face */
    const intake = `intake-${side}`;
    const I = INTAKE;
    const outline = chamferRect(W, Dp, 0.2);
    // (a near-square duct inside, so the ramps span it right under the upper wall)
    const inner = chamferRect(W - 2 * I.wall, Dp - 2 * I.wall, 0.04);
    b.ext(intake, legs, loft([
      { y: 0.02, pts: outline },
      { y: I.solidTop, pts: outline },
    ]), 'white');
    b.ext(intake, legs, move(new THREE.BoxGeometry(W - 2 * I.wall - 0.02, 0.012, Dp - 2 * I.wall - 0.02), 0, I.solidTop + 0.006, 0), 'intake', { edges: false });
    const inlet = rakedInlet(outline, inner, I.solidTop - 0.02, intakeLipY);
    b.ext(intake, legs, inlet.shell, 'white', { edges: 30 });
    b.ext(intake, legs, inlet.liner, 'intake', { edges: false });
    b.ext(intake, legs, fanFrame(inner, 0.47, I.frameY), 'intake', { edges: false });
    // Variable ramps under the upper wall: ramp 1 from its hinge behind the lip, ramp 2 back to its
    // hinge at the throat, meeting at their free edges; hinge barrels across the duct.
    const rw = I.rampHalfWidth * 2;
    const r1 = I.ramp1[0] - I.ramp1[1];
    const r2 = I.ramp2[0] - I.ramp2[1];
    const rampPart = `intake-ramps-${side}`;
    b.ext(rampPart, `ramp1${S}`, new THREE.BoxGeometry(rw, r1, 0.04).translate(0, -r1 / 2, -0.02), 'gunmetal', { joint: legs });
    b.ext(rampPart, `ramp2${S}`, new THREE.BoxGeometry(rw, r2, 0.04).translate(0, r2 / 2, -0.02), 'gunmetal', { joint: legs });
    for (const bone of [`ramp1${S}`, `ramp2${S}`]) {
      b.ext(rampPart, bone, rot(new THREE.CylinderGeometry(0.03, 0.03, W - 2 * I.wall, 10), 0, 0, 90), 'navy', { edges: false, joint: legs });
    }
    // Bypass door in the outboard wall, hinged at its forward edge; the dark opening behind it.
    const bp = I.bypass;
    const bpLen = bp.y0 - bp.y1;
    const bpH = bp.z1 - bp.z0;
    b.ext(intake, legs, move(new THREE.BoxGeometry(0.01, bpLen - 0.02, bpH - 0.02), s * (W / 2 - 0.002), (bp.y0 + bp.y1) / 2, (bp.z0 + bp.z1) / 2), 'black', { edges: false });
    b.ext(`bypass-door-${side}`, `bypass${S}`, new THREE.BoxGeometry(0.024, bpLen, bpH).translate(s * 0.006, -bpLen / 2, bpH / 2), 'offWhite', { joint: legs });
    b.ext(`bypass-door-${side}`, `bypass${S}`, new THREE.CylinderGeometry(0.02, 0.02, bpH, 8).rotateX(Math.PI / 2).translate(s * 0.006, 0, bpH / 2), 'navy', { edges: false, joint: legs });
    // The hip slide rack along the box's inboard face (the hub's pinion runs on it).
    b.ext(intake, legs, new THREE.BoxGeometry(0.012, 2.0, 0.1), 'gunmetal', { pos: [-s * (W / 2 + 0.006), 1.02, 0], edges: false });
    // Louvred intake shutters on the front face (seen beside the Battroid waist).
    b.ext(intake, legs, move(new THREE.BoxGeometry(W - 0.28, 1.38, 0.03), 0, 1.06, Dp / 2 - 0.005), 'gunmetal', { edges: false });
    for (const y of [0.52, 0.8, 1.08, 1.36, 1.64]) {
      b.ext(intake, legs, move(new THREE.BoxGeometry(W - 0.34, 0.07, 0.035), 0, y, Dp / 2 + 0.012), 'black', { edges: false });
    }
    b.ext(intake, legs, m(sidePlate([[1.5, -0.1], [1.9, -0.1], [1.7, 0.32]])), 'red', { pos: [s * (W / 2 + 0.005), 0, 0], edges: false });
    b.panelLines(legs, faceLines('x', s * (W / 2 + 0.004), [[0.3, -Dp / 2 + 0.12, 0.3, Dp / 2 - 0.12], [1.42, -Dp / 2 + 0.12, 1.42, Dp / 2 - 0.12]]));
    // Side cheeks carry the nacelle's flanks down past the hip-swing pivot: the thigh swings
    // (about the side-to-side axis) between them, so the nacelle reads unbroken from the side.
    const cheek = sidePlate([[0.3, -0.61], [0.3, 0.61], [-0.36, 0.61], [-0.42, 0.55], [-0.42, -0.55], [-0.36, -0.61]], 0.075);
    b.ext(intake, legs, m(cheek), 'white', { pos: [s * (W / 2 + 0.0375), 0, 0] });

    /*
     * thigh (bone thighSwing: the walking hip pivot at its top, under the intake box).
     * The top corners are cut so it swings ±20° clear of the intake; the lower back is
     * cut away so the shin can flex back ~25° at the knee.
     */
    const thigh = `thigh-${side}`;
    const swing = `thighSwing${S}`;
    const kz = L.kneeFront;
    const ky = -L.thighLen + L.thighPivot;
    b.ext(thigh, swing, sidePlate([
      [-0.2, -0.55], [-0.03, -0.3], [-0.03, 0.3], [-0.2, 0.55], [ky + 0.1, 0.55], [ky + 0.06, 0.5], [ky + 0.45, -0.55],
    ], 1.06, 0.05), 'white');
    // Full-height side walls down to the knee: they close the cut-away knee pit from the side,
    // and the shin's top flexes back between them. The upper edge tucks under the intake's cheeks.
    const sideWall = sidePlate([[-0.1, -0.54], [-0.1, 0.54], [-0.14, 0.58], [ky - 0.03, 0.58], [ky - 0.07, 0.54], [ky - 0.07, -0.54], [ky - 0.03, -0.58], [-0.14, -0.58]], 0.04);
    b.ext(thigh, swing, m(sideWall), 'white', { pos: [s * 0.62, 0, 0] });
    // Each wall is carried on a web from the thigh casing, above the knee pit the shin flexes into.
    b.ext(thigh, swing, new THREE.BoxGeometry(0.09, 0.38, 0.8), 'white', { pos: [s * 0.565, -0.31, 0], edges: false });
    // Hip-swing trunnions either side of the engine duct's swivel, seated in the intake box.
    for (const x of [0.44, -0.44]) {
      b.ext(`hip-joint-${side}`, legs, rot(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 18), 0, 0, 90), 'navy', { pos: [x, -L.thighPivot, 0], joint: swing });
    }
    // Navigation light on the thigh front: red to port, blue to starboard.
    b.ext(thigh, swing, move(new THREE.BoxGeometry(0.2, 0.22, 0.05), 0, -0.34, 0.57), s > 0 ? 'navRed' : 'navBlue', { edges: false });
    b.panelLines(swing, faceLines('x', s * 0.645, [[-0.62, -0.5, -0.62, 0.5]]));

    /* knee: hinge barrel on the leg's front face and the knee-cap armour over it (thigh side) */
    b.ext(`knee-joint-${side}`, `thighExt${S}`, rot(new THREE.CylinderGeometry(0.16, 0.16, 0.96, 18), 0, 0, 90), 'navy', { pos: [0, 0, kz], joint: `thighExt${S},knee${S}` });
    b.ext(`knee-joint-${side}`, `thighExt${S}`, sidePlate(sector(0.18, 0.3, 10, 95), 0.9, 0.03), 'white', { pos: [0, 0, kz] });
    // Rear knee pivot (Battroid bend): hinge barrel across the back of the knee, its knuckles on
    // the shin, seated in the thigh's lower back.
    b.ext(`knee-joint-${side}`, `knee${S}`, rot(new THREE.CylinderGeometry(0.11, 0.11, 0.86, 16), 0, 0, 90), 'navy', { pos: [...KNEE_BACK], edges: false, joint: `thighExt${S},thighSwing${S}` });
    // Dark joint block at the back of the knee pit, behind the engine duct (visible from behind).
    b.ext(`knee-joint-${side}`, `thighExt${S}`, move(new THREE.BoxGeometry(0.7, 0.2, 0.14), 0, 0.3, -0.44), 'navy', { edges: false, joint: `thighExt${S},knee${S}` });

    /* shin = engine nacelle: narrow under the knee, calf bulging outboard, behind the front hinge */
    const shin = `shin-${side}`;
    const zc = SHIN_AXIS_Z;
    b.ext(shin, `knee${S}`, m(loft(SHIN.map(([y, xin, xout, d, r]) => ({ y, pts: shinSection(xin, xout, d, r, zc + shinBack(y, d)) })).reverse(), { capEnd: false })), 'white');
    // The shin's top, open round the engine's inlet: the knee bellows runs in through it.
    {
      const [y0, xin, xout, d, r] = SHIN[0];
      const top = new THREE.Shape(shinSection(xin, xout, d, r, zc).map(([x, z]) => new THREE.Vector2(x, z)));
      const hole = new THREE.Path();
      hole.absarc(0, zc, BELLOWS_OPENING, 0, Math.PI * 2, true);
      top.holes.push(hole);
      b.ext(shin, `knee${S}`, m(new THREE.ExtrudeGeometry(top, { depth: 0.03, bevelEnabled: false, curveSegments: 24 }).rotateX(Math.PI / 2).translate(0, y0, 0)), 'white');
      b.ext(shin, `knee${S}`, rot(new THREE.TorusGeometry(BELLOWS_OPENING, 0.018, 6, 28), 90, 0, 0), 'navy', { pos: [0, y0 - 0.012, zc], edges: false });
    }
    const front = (y: number) => zc + shinAt(y).d / 2;
    // Vermilion band round the calf, following its section.
    const bandAt = (y: number) => {
      const c = shinAt(y);
      return { y, pts: shinSection(c.xin + 0.015, c.xout + 0.015, c.d + 0.03, c.r, zc) };
    };
    b.ext(shin, `knee${S}`, m(loft([bandAt(-2.12), bandAt(-1.9)])), 'red', { edges: false });
    // Knee pad on the front of the shin top.
    b.ext(shin, `knee${S}`, loft([
      { y: -0.95, pts: chamferRect(0.84, 0.1, 0.04, 0, front(-0.95) + 0.04) },
      { y: -0.3, pts: chamferRect(0.74, 0.1, 0.04, 0, front(-0.3) + 0.04) },
    ]), 'white');
    // Main-gear bay in the shin's belly-side face (the wheel folds aft into it).
    b.ext(shin, `knee${S}`, move(new THREE.BoxGeometry(0.5, 1.15, 0.02), 0, -2.15, front(-2.15) + 0.004), 'intake', { edges: false });
    // Small black intake slot below the knee (line art).
    b.ext(shin, `knee${S}`, move(plate(ccw([[-0.14, -1.1], [0.14, -1.1], [0.1, -1.5], [-0.1, -1.5]]), 0.03), 0, 0, front(-1.3) + 0.01), 'black', { edges: false });
    // Leg fin with a red tip on the outer-front calf edge: points down and outboard in flight
    // (the short spikes in the five-view rear view), forward-out in Battroid.
    const legFin = rot(plate(ccw([[0, 0], [0.6, -0.14], [0.6, -0.66], [0, -1.12]]), 0.1, 0.02), 0, -45, 0);
    const legFinTip = rot(plate(ccw([[0.42, -0.1], [0.6, -0.14], [0.6, -0.66], [0.42, -0.8]]), 0.12), 0, -45, 0);
    // Root on the middle facet of the calf's front-outer corner (constant ±1 cm over the fin's length).
    const calf = shinAt(-2.75);
    const finAt: [number, number, number] = [s * (calf.xout - 0.317 * calf.r - 0.02), -2.2, zc + calf.d / 2 - 0.317 * calf.r - 0.02];
    b.ext(shin, `knee${S}`, m(legFin), 'white', { pos: finAt });
    b.ext(shin, `knee${S}`, m(legFinTip), 'red', { pos: finAt, edges: false });
    // Red warning triangle on the lower outer calf, laid on its tapering plane (tilted about Z).
    const sideX = (y: number) => calf.xout - CALF_TAPER * Math.max(0, -3.1 - y);
    const taperDeg = (Math.atan(CALF_TAPER) * 180) / Math.PI;
    const tri = sidePlate([[-0.1, zc + 0.26], [-0.1, zc - 0.28], [0.28, zc - 0.01]]);
    b.ext(shin, `knee${S}`, m(move(rot(tri, 0, 0, -taperDeg), sideX(-3.7) + 0.005, -3.7, 0)), 'red', { edges: false });
    // Access panel round it (on the flat of the side, clear of the rounded corners).
    const px = (y: number) => s * (sideX(y) + 0.006);
    const panel: [number, number][] = [[-3.8, -0.3], [-2.9, -0.3], [-2.9, 0.26], [-3.8, 0.26]];
    const panelPts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const [y0, z0] = panel[i];
      const [y1, z1] = panel[(i + 1) % 4];
      // Split the long edges at the calf's kink so they follow both planes.
      const cuts = y0 !== y1 && Math.min(y0, y1) < -3.1 ? [y0, -3.1, y1] : [y0, y1];
      for (let k = 0; k < cuts.length - 1; k++) {
        const za = z0 + ((z1 - z0) * k) / (cuts.length - 1);
        const zb = z0 + ((z1 - z0) * (k + 1)) / (cuts.length - 1);
        panelPts.push(px(cuts[k]), cuts[k], zc + za, px(cuts[k + 1]), cuts[k + 1], zc + zb);
      }
    }
    b.panelLines(`knee${S}`, [...panelPts, ...faceLines('z', front(-3.3) + 0.006, [[-0.42, -3.3, 0.42, -3.3]])]);

    /* ankle: collar at the shin's end, and a spherical bearing (bone ankle, centred on the gimbal
       point) that the nozzle hangs from; the exhaust runs through the ball, so any pitch or roll
       turns the ball in its socket without sweeping into the collar */
    const za = ANKLE_TO_AXIS_Z;
    b.ext(shin, `shinExt${S}`, band(0.12, 0.3, 1.22, 0.9, za - 0.21), 'white');
    const ankleSeat = `shinExt${S},knee${S},foot${S}`;
    b.ext(`ankle-joint-${side}`, `ankle${S}`, new THREE.SphereGeometry(F.ball, 20, 12), 'navy', { joint: ankleSeat });
    // Gimbal ring round the ball's equator with its pitch trunnions (the roll pins are front and back).
    b.ext(`ankle-joint-${side}`, `ankle${S}`, rot(new THREE.TorusGeometry(F.ball + 0.02, 0.05, 8, 24), 90, 0, 0), 'gunmetal', { edges: false, joint: ankleSeat });
    for (const x of [-1, 1]) {
      b.ext(`ankle-joint-${side}`, `ankle${S}`, rot(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 12), 0, 0, 90), 'gunmetal', { pos: [x * (F.ball + 0.1), 0, 0], edges: false, joint: ankleSeat });
    }
    for (const z of [-1, 1]) {
      b.ext(`ankle-joint-${side}`, `ankle${S}`, rot(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 12), 90, 0, 0), 'gunmetal', { pos: [0, 0, z * (F.ball + 0.07)], edges: false, joint: ankleSeat });
    }
    // Gimbal duct: the tube below the ball that the nozzle body telescopes over.
    b.ext(`ankle-joint-${side}`, `ankle${S}`, move(new THREE.CylinderGeometry(F.duct, F.duct, 0.5, 18), 0, -F.ball - 0.2, 0), 'gunmetal', { joint: ankleSeat });

    /*
     * foot = split 2-D nozzle (bone foot, axis along −Y, toe side +Z). The body is the convergent
     * section; the throat is the slot under its end between two fixed side walls; the toe and heel
     * flaps (their own bones) are the divergent section in flight and the foot on the ground.
     */
    const foot = `foot-${side}`;
    const top = -F.ball + 0.02;
    b.ext(foot, `foot${S}`, loft([
      { y: F.bodyEnd, pts: chamferRect(F.bodyWidth - 0.04, F.bodyDepth - 0.04, 0.12) },
      { y: F.bodyEnd + 0.1, pts: chamferRect(F.bodyWidth, F.bodyDepth, 0.16) },
      { y: top - 0.16, pts: chamferRect(F.bodyWidth, F.bodyDepth, 0.16) },
      { y: top, pts: chamferRect(0.84, 0.66, 0.14) },
    ]), 'gunmetal');
    // Dark throat liner across the body end, and the throat walls: clevis plates either side that
    // carry the flap pins and close the throat's sides.
    b.ext(foot, `foot${S}`, move(new THREE.BoxGeometry(F.bodyWidth - 0.16, 0.02, F.bodyDepth - 0.3), 0, F.bodyEnd - 0.005, 0), 'intake', { edges: false });
    const hw = F.bodyDepth / 2 - 0.02;
    const wallEnd = F.bodyEnd - F.throatWall;
    const throatWall = sidePlate([[F.bodyEnd + 0.02, -hw], [F.bodyEnd + 0.02, hw], [wallEnd + 0.06, hw], [wallEnd, hw - 0.08], [wallEnd, -hw + 0.08], [wallEnd + 0.06, -hw]], 0.04);
    for (const x of [-1, 1]) b.ext(foot, `foot${S}`, throatWall.clone(), 'gunmetal', { pos: [x * (F.bodyWidth / 2 + 0.02), 0, 0] });
    // Flap pins through the walls (bolt heads outside), toe in front and heel behind.
    for (const [z, flapBone] of [[NOZZLE.toeZ, `toe${S}`], [NOZZLE.heelZ, `heel${S}`]] as const) {
      b.ext(foot, `foot${S}`, rot(new THREE.CylinderGeometry(0.07, 0.07, F.bodyWidth + 0.14, 14), 0, 0, 90), 'navy', { pos: [0, NOZZLE.hingeY, z], edges: false, joint: flapBone });
    }
    b.panelLines(`foot${S}`, [
      ...faceLines('x', F.bodyWidth / 2 + 0.004, [[top - 0.3, -0.36, F.bodyEnd + 0.12, -0.36], [top - 0.3, 0.36, F.bodyEnd + 0.12, 0.36]]),
      ...faceLines('x', -F.bodyWidth / 2 - 0.004, [[top - 0.3, -0.36, F.bodyEnd + 0.12, -0.36], [top - 0.3, 0.36, F.bodyEnd + 0.12, 0.36]]),
    ]);

    // Toe (front) and heel (back) flaps: wedges on their pins, roots rounded about the pin. Closed,
    // their flat inner faces run parallel a slot apart and the outer faces carry the nacelle's taper
    // to the tail; opened 80° the inner faces are the soles and the tapered outer faces the sloping tops.
    const t0 = F.flapRoot;
    const t1 = F.flapTip;
    const len = F.flapLen;
    const r0 = t0 / 2;
    const wedge = (k: 1 | -1) => {
      const pts: P2[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI;
        pts.push([r0 * Math.sin(a), k * r0 * Math.cos(a)]);
      }
      pts.push([-len, -k * r0], [-len, k * (r0 - (t0 - t1))]);
      return sidePlate(pts, 2 * NOZZLE.halfWidth, 0.03);
    };
    const liner = (k: 1 | -1) => move(new THREE.BoxGeometry(2 * NOZZLE.halfWidth - 0.16, len - 0.24, 0.012), 0, -len / 2 - 0.08, -k * (r0 + 0.001));
    // Lighter panel inlaid in the tapered outer face (the feet's grey panels in the line art).
    const face = (y: number, k: number) => k * (r0 + ((t0 - t1) * y) / len);
    const topPanel = (k: 1 | -1) => {
      const [ya, yb] = [-0.14, -len + 0.14];
      return sidePlate([[ya, face(ya, k) + k * 0.012], [yb, face(yb, k) + k * 0.012], [yb, face(yb, k) - k * 0.01], [ya, face(ya, k) - k * 0.01]], 2 * NOZZLE.halfWidth - 0.3);
    };
    for (const [flapId, bone, k] of [[`foot-toe-${side}`, `toe${S}`, 1], [`foot-heel-${side}`, `heel${S}`, -1]] as const) {
      b.ext(flapId, bone, wedge(k), 'gunmetal');
      b.ext(flapId, bone, liner(k), 'black', { edges: false });
      b.ext(flapId, bone, topPanel(k), 'steel', { edges: false });
      const c = k > 0 ? 'toe' : 'heel';
      b.marker(`sole${S}_${c}In`, bone, [-s * (NOZZLE.halfWidth - 0.05), -len + 0.02, -k * r0]);
      b.marker(`sole${S}_${c}Out`, bone, [s * (NOZZLE.halfWidth - 0.05), -len + 0.02, -k * r0]);
    }
    b.marker(`ankle${S}`, `ankle${S}`, [0, 0, 0]);
    b.marker(`nozzle${S}`, `foot${S}`, [0, NOZZLE.exitY, NOZZLE.axisZ]);

    /* verniers: the counter-reverse thruster on the intake's outer side (Compendium) and the aft
       nacelle verniers, a pair of ports low on the back of the calf (rear art) */
    const vern = `leg-vernier-${side}`;
    b.ext(vern, legs, cbox(0.12, 0.42, 0.36, 0.03), 'gunmetal', { pos: [s * (W / 2 + 0.06), 1.12, 0.14] });
    b.ext(vern, legs, move(new THREE.BoxGeometry(0.08, 0.02, 0.26), 0, 0.212, 0), 'black', { pos: [s * (W / 2 + 0.06), 1.12, 0.14], edges: false });
    const calfV = `calf-vernier-${side}`;
    const vy = -3.88;
    const back = zc + shinBack(vy, shinAt(vy).d) - shinAt(vy).d / 2;
    const vx = s * (shinAt(vy).xout - shinAt(vy).xin) / 2;
    b.ext(calfV, `knee${S}`, move(new THREE.BoxGeometry(0.56, 0.3, 0.03), vx, vy, back + 0.006), 'black', { edges: false });
    for (const dx of [-0.13, 0.13]) {
      b.ext(calfV, `knee${S}`, rot(new THREE.CylinderGeometry(0.085, 0.1, 0.06, 14), 90, 0, 0), 'gunmetal', { pos: [vx + dx, vy, back - 0.02], edges: false });
    }
    b.marker(`intakeTop${S}`, legs, [0, L.intakeLen, 0]);
    b.marker(`hipJoint${S}`, `hip${S}`, [0, 0, 0]);
    b.marker(`knee${S}`, `knee${S}`, [0, 0, 0]);
    b.marker(`calfOut${S}`, `knee${S}`, [s * calf.xout, -2.75, zc]);
    b.marker(`calfIn${S}`, `knee${S}`, [-s * calf.xin, -2.75, zc]);
  }
}
