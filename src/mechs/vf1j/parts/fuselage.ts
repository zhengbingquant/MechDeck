import * as THREE from 'three';
import type { Vf1Builder as Builder } from '../materials';
import { faceLines } from '../../../core/builder';
import { D } from '../dims';
import { ccw, chamferRect, lathe, loft, mirrorX, move, plate, rot, stripe, taperBox, type P2 } from '../../../core/geometry/shapes';
import { AIRBRAKE } from '../surfaces';

const T = D.torso;
const N = D.nose;

/** Canopy cross-section: upper half-ellipse of width w and height h standing on zBase (toward -Z). */
function canopySection(w: number, h: number, zBase: number): P2[] {
  const pts: P2[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    pts.push([(w / 2) * Math.cos(a), zBase - h * Math.sin(a)]);
  }
  return ccw(pts);
}

/** Thin flat plate lying on a face whose normal is ±Z, polygon in (x, y). */
function zPlate(poly: P2[], z: number, t = 0.02): THREE.BufferGeometry {
  return move(plate(ccw(poly), t), 0, 0, z);
}

/*
 * Chest plate's upper section (nose frame, z < 0 dorsal): a spine flanked by lower sides.
 * Each side's top lies on one plane sloping down outboard, so markings lie flush on it.
 */
const SPINE_HW = 0.53;
/**
 * Spine top: 8 cm above the canopy's crown, which slides under it in Battroid; the canopy
 * shield's hoods stow inside it in flight.
 */
const SPINE_TOP = -1.67;
const SIDE_INNER_Z = -1.12;
const SIDE_SLOPE = 0.2;
/** Sections along the chest: hinge (Battroid chest top), level spine, widest, end of the level spine, cockpit. */
const SPINE_LEVEL_END = 1.35;
const CHEST_Y = [0, 0.6, 0.75, SPINE_LEVEL_END, N.rearLen];
const sideTop = (x: number) => SIDE_INNER_Z + SIDE_SLOPE * (Math.abs(x) - SPINE_HW);

/** Outer half-width: 1.8 m at the hinge (the Battroid chest top), narrowing to the cockpit's 1.34 m. */
function chestHalfWidth(y: number): number {
  if (y <= 0.75) return N.rearHalfWidth0 + ((1.5 - N.rearHalfWidth0) * y) / 0.75;
  return 1.5 + ((N.rearHalfWidth1 - 1.5) * (y - 0.75)) / (N.rearLen - 0.75);
}

/**
 * The spine starts level with the canopy's crown at the cockpit, rises over 25 cm to clear the
 * stowed canopy shield, stays level over the metre the canopy slides under, then ramps down to
 * 6 cm above the dorsal skin at the hinge.
 */
function spineTop(y: number): number {
  const aft = -1.16;
  const front = -1.6;
  if (y < 0.6) return aft + ((SPINE_TOP - aft) * y) / 0.6;
  if (y <= SPINE_LEVEL_END) return SPINE_TOP;
  return SPINE_TOP + ((front - SPINE_TOP) * (y - SPINE_LEVEL_END)) / (N.rearLen - SPINE_LEVEL_END);
}

function chestSection(y: number): P2[] {
  const hw = chestHalfWidth(y);
  const zt = spineTop(y);
  const zb = -N.keelDepth;
  // Spine edge chamfer, shrinking where the spine is barely proud of the sides.
  const c = Math.min(0.08, (SIDE_INNER_Z - zt) * 0.5);
  return ccw([
    [hw, zb], [hw, sideTop(hw)], [SPINE_HW, SIDE_INNER_Z], [SPINE_HW, zt + c], [SPINE_HW - c, zt],
    [-SPINE_HW + c, zt], [-SPINE_HW, zt + c], [-SPINE_HW, SIDE_INNER_Z], [-hw, sideTop(hw)], [-hw, zb],
  ]);
}

/** Thin plate lying on the port chest side's sloping top (polygon in nose-frame x, y), lifted off it. */
function onChestSide(poly: P2[], lift: number, t = 0.02): THREE.BufferGeometry {
  const ang = Math.atan(SIDE_SLOPE);
  const g = plate(ccw(poly.map(([x, y]) => [(x - SPINE_HW) / Math.cos(ang), y] as P2)), t);
  // plate() lies in XY with its thickness along Z: tilt about Y so +X runs down the slope.
  rot(g, 0, (-ang * 180) / Math.PI, 0);
  return move(g, SPINE_HW, 0, SIDE_INNER_Z - lift);
}

/** Thin plate on a face whose normal is ±X, polygon given as [y, z]. */
function xPlate(poly: P2[], t = 0.02): THREE.BufferGeometry {
  // plate() extrudes along Z; rotating -90° about Y sends (a, b, t) → (-t, b, a).
  const g = plate(ccw(poly.map(([y, z]) => [z, y] as P2)), t);
  return rot(g, 0, -90, 0);
}

export function buildFuselage(b: Builder) {
  /* ---------------- centre fuselage / torso (bone: torso) ----------------
   * Built as a shell around two cavities so nothing has to pass through it:
   *  - the ventral arm bay (belly recessed to bayFront) the arms stow in, and
   *  - the head bay the head retracts into and rises out of.
   */
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c = 0.1) =>
    move(taperBox(x1 - x0, z1 - z0, x1 - x0, z1 - z0, y1 - y0, { chamfer: c }), (x0 + x1) / 2, y0, (z0 + z1) / 2);
  const sw = T.slotHalfWidth;
  const kw = T.keelHalfWidth;
  // Two layers: the full-width dorsal skin over the gloves, and the keel (±0.9 m)
  // below it that the engine nacelles tuck in beside.
  // Below the head bay: keel slab over the arm bay, and the dorsal layer's outer strips.
  b.ext('center-fuselage', 'torso', box(-kw, kw, T.waistTop, T.slotBottom, T.back, T.bayFront), 'white');
  for (const s of [1, -1]) {
    const [x0, x1] = s > 0 ? [kw, T.halfWidth] : [-T.halfWidth, -kw];
    // Only the dorsal skin here: below it the glove is the pocket the swing-wing root sweeps in.
    b.ext('center-fuselage', 'torso', box(x0, x1, T.waistTop, T.top, T.back, D.glove.z - D.glove.thickness / 2, 0.03), 'white');
    // Beside the head bay: the keel wall, and the cheek that closes the belly above the arm bay.
    const [c0, c1] = s > 0 ? [sw, kw] : [-kw, -sw];
    b.ext('center-fuselage', 'torso', box(c0, c1, T.slotBottom, T.top, T.back, T.bayFront, 0.03), 'white');
    b.ext('center-fuselage', 'torso', box(c0, c1, T.cheekBottom, T.top, T.bayFront, T.front, 0.03), 'white');
  }
  // Thin back plate behind the head bay.
  b.ext('center-fuselage', 'torso', box(-sw, sw, T.slotBottom, T.top, T.back, T.slotBack, 0.03), 'offWhite');
  // Narrow waist; its top sits under the tail module's channel in Fighter mode.
  b.ext('waist-keel', 'torso', box(-T.waistHalfWidth, T.waistHalfWidth, 0, T.waistTop + 0.02, T.back + 0.06, T.bayFront - 0.02), 'navy');
  // Dorsal skirt between the tail module's front edge and the dorsal slab.
  b.ext('center-fuselage', 'torso', loft([
    { y: D.tail.hinge[1] + 0.04, pts: chamferRect(2.3, 0.15, 0.05, 0, -0.855) },
    { y: T.waistTop + 0.1, pts: chamferRect(2.5, 0.15, 0.05, 0, -0.855) },
  ]), 'white');
  // Arm-bay liner on the recessed belly (visible between the arms in Fighter mode).
  b.ext('arm-bay', 'torso', zPlate([[-kw + 0.02, T.waistTop], [kw - 0.02, T.waistTop], [kw - 0.02, T.slotBottom], [-kw + 0.02, T.slotBottom]], T.bayFront + 0.006, 0.012), 'navy', { edges: false });
  b.ext('arm-bay', 'torso', zPlate([[-sw, T.slotBottom], [sw, T.slotBottom], [sw, T.top], [-sw, T.top]], T.slotBack + 0.012, 0.02), 'navy', { edges: false });
  // Nose-section fold hinge: two knuckles on the hinge line, at the top of the cheeks.
  for (const s of [1, -1]) {
    b.ext('center-fuselage', 'torso', rot(new THREE.CylinderGeometry(0.15, 0.15, 0.13, 14), 0, 0, 90), 'navy', {
      pos: [(s * (sw + kw)) / 2, D.nose.hinge[1], D.nose.hinge[2] - 0.02], joint: 'nose',
    });
  }
  // Tail-module fold hinge barrel on the dorsal skin (visible pivot).
  b.ext('center-fuselage', 'torso', rot(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 14), 0, 0, 90), 'navy', {
    pos: [0, D.tail.hinge[1], D.tail.hinge[2] + 0.02], joint: 'tailModule',
  });
  // Dorsal access hatches (gunmetal) and panel lines on the fighter's spine.
  b.ext('dorsal-hatch', 'torso', zPlate([[-0.55, 2.2], [0.55, 2.2], [0.55, 3.55], [-0.55, 3.55]], T.back - 0.012, 0.025), 'offWhite');
  b.panelLines('torso', [
    ...faceLines('z', T.back - 0.027, [
      [-0.55, 2.2, 0.55, 2.2], [0.55, 2.2, 0.55, 3.55], [0.55, 3.55, -0.55, 3.55], [-0.55, 3.55, -0.55, 2.2],
      [0, 1.5, 0, 2.2], [-1.25, 3.9, 1.25, 3.9], [-1.1, 1.6, -1.1, 3.9], [1.1, 1.6, 1.1, 3.9],
    ]),
  ]);

  // Wing gloves: fixed strakes carrying the sweep pivots, red leading-edge stripe.
  // The strake stops at the nose hinge line so the chest plate can fold away cleanly.
  const G = D.glove;
  // Five-view top view: the glove ends about 0.4 m aft of the sweep pivot (y 2.6); the wing’s
  // inboard trailing edge runs out behind it. (In Battroid this keeps the gloves above the waist.)
  const glovePoly: P2[] = [[G.innerX, 2.2], [2.98, 2.2], [2.98, 3.05], [1.86, 4.17], [G.innerX, 4.17]];
  const le0: P2 = [1.86, 4.17];
  const le1: P2 = [2.98, 3.05];
  const d = [le1[0] - le0[0], le1[1] - le0[1]];
  const dl = Math.hypot(d[0], d[1]);
  const inward: P2 = [d[1] / dl, -d[0] / dl]; // right-hand normal of the leading edge: points into the glove
  const off = (p: P2, k: number): P2 => [p[0] + inward[0] * k, p[1] + inward[1] * k];
  const gloveStripe = stripe([off([le0[0] + d[0] * 0.08 / dl, le0[1] + d[1] * 0.08 / dl], 0.2), off([le1[0] - d[0] * 0.05 / dl, le1[1] - d[1] * 0.05 / dl], 0.2)], 0.24);
  const gloveGeo = move(plate(ccw(glovePoly), G.thickness, 0.05), 0, 0, G.z);
  const stripeGeo = zPlate(gloveStripe, G.z - G.thickness / 2 - 0.01);
  b.ext('glove-port', 'torso', gloveGeo, 'white');
  b.ext('glove-port', 'torso', stripeGeo, 'red', { edges: false });
  b.ext('glove-starboard', 'torso', mirrorX(gloveGeo), 'white');
  b.ext('glove-starboard', 'torso', mirrorX(stripeGeo), 'red', { edges: false });

  b.marker('torsoBase', 'torso', [0, 0, -0.35]);
  b.marker('torsoTop', 'torso', [0, T.top, -0.35]);

  /* ---------------- chest plate / rear nose section (bone: nose) ---------------- */
  // Five-view side, top and front views: behind the canopy a ~1 m spine carries the
  // canopy's top line aft and slopes down to the dorsal skin, and the chest sides over the
  // intakes sit ~0.5 m lower, sloping down outboard. In Battroid the spine is the raised
  // centre of the chest (the airbrake's slats are its vents) with the sides swept back.
  // The ±0.9 m keel below leaves room for the intakes beside it in Fighter mode.
  // Nose frame: z < 0 is dorsal (the Battroid chest front); y runs from the fold hinge
  // (Battroid chest top) to the cockpit.
  b.ext('chest-plate', 'nose', loft(CHEST_Y.map((y) => ({ y, pts: chestSection(y) }))), 'white');
  b.ext('chest-plate', 'nose', loft([
    { y: 0, pts: chamferRect(N.keelHalfWidth * 2, N.keelDepth + 0.02, 0.14, 0, -N.keelDepth / 2 + 0.01) },
    { y: N.rearLen, pts: chamferRect(N.rearHalfWidth1 * 2 - 0.02, N.keelDepth - 0.04, 0.2, 0, -N.keelDepth / 2 - 0.02) },
  ]), 'white');
  const top = SPINE_TOP; // the chest's centre front in Battroid
  // Airbrake with its three black slats, on its own bone hinged at the forward edge, lying
  // on the level part of the spine; a dark well in the chest plate shows when it opens.
  const ab = AIRBRAKE.pivot;
  const onBrake = (g: THREE.BufferGeometry) => move(g, -ab[0], -ab[1], -ab[2]);
  b.ext('airbrake', 'airbrake', onBrake(zPlate([[-0.42, 0.63], [0.42, 0.63], [0.4, 1.36], [-0.4, 1.36]], top - 0.012, 0.03)), 'offWhite');
  for (const y of [0.74, 0.9, 1.06]) {
    b.ext('airbrake', 'airbrake', onBrake(zPlate([[-0.3, y], [0.3, y], [0.3, y + 0.08], [-0.3, y + 0.08]], top - 0.03, 0.012)), 'black', { edges: false });
  }
  b.ext('airbrake', 'nose', zPlate([[-0.38, 0.66], [0.38, 0.66], [0.36, 1.32], [-0.36, 1.32]], top - 0.003, 0.004), 'intake', { edges: false });
  // Vermilion chevrons ("\_  _/" on the Battroid chest) and black vents, on the sloping sides.
  for (const s of [1, -1]) {
    const chevron = onChestSide(stripe([[1.58, 0.1], [0.86, 0.72], [0.66, 0.72]], 0.26), 0.012);
    const vent = onChestSide(stripe([[1.05, 0.95], [0.82, 1.3]], 0.1), 0.012);
    b.ext('chest-plate', 'nose', s > 0 ? chevron : mirrorX(chevron), 'red', { edges: false });
    b.ext('chest-plate', 'nose', s > 0 ? vent : mirrorX(vent), 'black', { edges: false });
  }
  // Floodlights on the sides' rear faces: face up at the top of the Battroid chest.
  for (const s of [1, -1]) {
    b.ext('chest-lights', 'nose', move(new THREE.BoxGeometry(0.42, 0.06, 0.14), s * 1.12, -0.02, -0.9), 'amber', { edges: false });
  }
  b.panelLines('nose', faceLines('z', top - 0.004, [[-0.44, 1.5, 0.44, 1.5]]));

  /* ---------------- cockpit section (bone: cockpit) ---------------- */
  // Slim cockpit fuselage (five-view front and top views: ~1.3 m wide).
  const hw = (y: number) => N.cockpitHalfWidth0 + ((N.cockpitHalfWidth1 - N.cockpitHalfWidth0) * y) / N.cockpitLen;
  const body = [
    { y: 0, w: 2 * hw(0), d: 1.05 },
    { y: 1.3, w: 2 * hw(1.3), d: 1.02 },
    { y: 2.35, w: 2 * hw(2.35), d: 0.96 },
    { y: N.cockpitLen, w: 2 * hw(N.cockpitLen), d: 0.84 },
  ];
  b.ext('forward-fuselage', 'cockpit', loft(body.map((s) => ({ y: s.y, pts: chamferRect(s.w, s.d, s.d * 0.3, 0, -s.d / 2) }))), 'white');
  // Black band ring just ahead of the windscreen.
  b.ext('forward-fuselage', 'cockpit', loft([
    { y: 2.42, pts: chamferRect(2 * hw(2.42) + 0.03, 0.97, 0.29, 0, -0.475) },
    { y: 2.58, pts: chamferRect(2 * hw(2.58) + 0.03, 0.95, 0.28, 0, -0.465) },
  ]), 'black', { edges: false });
  // Anti-glare panel in front of the windscreen.
  b.ext('forward-fuselage', 'cockpit', zPlate([[-0.3, 2.02], [0.3, 2.02], [0.24, 2.42], [-0.24, 2.42]], -1.0, 0.03), 'black', { edges: false });
  // Canopy (green tint) and black sills. Its crown runs straight on into the chest's spine
  // (five-view side view), so the rear keeps its full height.
  b.ext('canopy', 'cockpit', loft([
    { y: 0.0, pts: canopySection(0.84, 0.6, -0.99) },
    { y: 0.7, pts: canopySection(0.92, 0.6, -0.99) },
    { y: 1.5, pts: canopySection(0.9, 0.6, -0.98) },
    { y: 2.08, pts: canopySection(0.76, 0.4, -0.97) },
    { y: 2.36, pts: canopySection(0.42, 0.08, -0.97) },
  ]), 'canopy');
  for (const s of [1, -1]) {
    b.ext('canopy', 'cockpit', move(new THREE.BoxGeometry(0.07, 2.2, 0.08), s * 0.44, 1.2, -1.0), 'black', { edges: false });
  }
  b.ext('canopy', 'cockpit', move(rot(new THREE.TorusGeometry(0.39, 0.035, 6, 16, Math.PI), -90, 0, 0), 0, 2.0, -0.99), 'black', { edges: false });
  // Red cockpit-side stripes (the roundel decal sits on these), following the side taper.
  const taperDeg = (Math.atan((N.cockpitHalfWidth0 - N.cockpitHalfWidth1) / N.cockpitLen) * 180) / Math.PI;
  for (const s of [1, -1]) {
    const g = xPlate([[0.1, -0.62], [2.25, -0.62], [2.25, -0.4], [0.1, -0.4]], 0.02);
    b.ext('forward-fuselage', 'cockpit', g, 'red', { pos: [s * (N.cockpitHalfWidth0 + 0.012), 0, 0], rot: [0, 0, s * taperDeg], edges: false });
  }
  b.panelLines('cockpit', [
    ...faceLines('z', 0.004, [[-0.4, 0.3, 0.4, 0.3], [0.4, 0.3, 0.4, 1.9], [0.4, 1.9, -0.4, 1.9], [-0.4, 1.9, -0.4, 0.3]]),
  ]);
  /* Canopy shield: two armoured hoods (bones shieldA / shieldB), arch-section shells built in
     their deployed place over the glazing; stowed, they sit nested in the chest spine. */
  const SH = N.shield;
  const hood = (w: number, h: number, y0: number, y1: number) => {
    const t = SH.wall;
    const ring = (): P2[] => {
      const outer = canopySection(w, h, SH.zBase);
      const inner = canopySection(w - 2 * t, h - t, SH.zBase);
      // Outer arch from +x over the top to −x, then the inner arch back: a closed ring.
      const o = outer[0][0] > 0 ? outer : [...outer].reverse();
      const i = inner[0][0] > 0 ? inner : [...inner].reverse();
      return ccw([...o, ...[...i].reverse()]);
    };
    return loft([{ y: y0, pts: ring() }, { y: y1, pts: ring() }], { capStart: false, capEnd: false });
  };
  b.ext('canopy-shield', 'shieldA', hood(1.06, 0.73, SH.a[0], SH.a[1]), 'white');
  b.ext('canopy-shield', 'shieldB', hood(1.01, 0.705, SH.b[0], SH.b[1]), 'white');
  // Black edge band across the front hood (the dark band below the chest in the Battroid art).
  b.ext('canopy-shield', 'shieldB', hood(1.02, 0.712, SH.b[1] - 0.16, SH.b[1] - 0.02), 'black', { edges: false });
  b.marker('canopyIn', 'cockpit', [0, 1.3, -1.0]);
  b.marker('canopyOut', 'cockpit', [0, 1.3, -1.6]);
  b.marker('noseBase', 'cockpit', [0, 2.6, -0.44]);

  /* ---------------- radome (bone: radome) ---------------- */
  const R = N.radomeLen;
  // Radome base matches the cockpit's front section (1.0 × 0.84 m).
  const rb = N.cockpitHalfWidth1;
  const radome = lathe([[0.02, -0.4], [rb, -0.4], [rb, 0], [rb * 0.97, 0.16 * R], [rb * 0.87, 0.37 * R], [rb * 0.71, 0.58 * R], [rb * 0.48, 0.78 * R], [rb * 0.23, 0.93 * R], [0.0, R]], 24);
  radome.scale(1, 1, 0.84);
  b.ext('radome', 'radome', move(radome, 0, 0, -0.44), 'white', { edges: 40 });
  for (const s of [1, -1]) {
    b.ext('radome', 'radome', new THREE.SphereGeometry(0.08, 10, 8), 'red', { pos: [s * rb * 0.87, 0.7, -0.42], edges: false });
  }
  b.marker('noseTip', 'radome', [0, N.radomeLen, -0.44]);
}
