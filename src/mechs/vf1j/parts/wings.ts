import * as THREE from 'three';
import type { Vf1Builder as Builder } from '../materials';
import { D } from '../dims';
import { mirrorX, move, rot } from '../../../core/geometry/shapes';
import { chordFraction, chordY, halfThickness, surfaceLine, wingSlice } from '../../../core/geometry/wing';
import { CHORD, HINGES, SPAN, TIP_TE_X, WING } from '../surfaces';

const W = D.wing;
type V3 = readonly [number, number, number];

const pivotOf = (bone: string) => HINGES.find((h) => h.bone === bone)!.pivot;
/** Express wing-frame geometry in a control-surface bone's frame (bone sits on its hinge). */
const onHinge = (g: THREE.BufferGeometry, p: V3) => move(g, -p[0], -p[1], -p[2]);
const upperZ = (x: number, y: number) => -halfThickness(WING, x, chordFraction(WING, x, y));
const lowerZ = (x: number, y: number) => halfThickness(WING, x, chordFraction(WING, x, y));

/** Wingtip roll-control thruster ports (upper and lower), wing frame. */
export const RCS_PORT = { x: W.length - 0.2, s: 0.3 };
export const rcsPortPos = (side: 'upper' | 'lower'): V3 => {
  const y = chordY(WING, RCS_PORT.x, RCS_PORT.s);
  return [RCS_PORT.x, y, side === 'upper' ? upperZ(RCS_PORT.x, y) - 0.012 : lowerZ(RCS_PORT.x, y) + 0.012];
};

/**
 * Variable-geometry main wings (20°–72° sweep, stowed in Battroid).
 * NACA-section wing box with the VF-1's high-lift and roll devices on their
 * own hinge bones: leading-edge slat, inboard Fowler flap, two-section
 * outboard flap and the spoilers ahead of it; roll thrusters in the tips.
 */
export function buildWings(b: Builder) {
  const { root, tip } = SPAN;
  const C = CHORD;

  /* fixed wing box (wing bone) */
  const box = [
    wingSlice(WING, [root, SPAN.slat[0]], 0, C.boxLE),
    wingSlice(WING, [SPAN.slat[1], TIP_TE_X, tip], 0, C.boxLE),
    wingSlice(WING, [root, TIP_TE_X, tip], C.boxLE, C.spoilerLE),
    wingSlice(WING, [root, SPAN.spoiler[0][0]], C.spoilerLE, C.boxTE),
    // Spoiler well: the upper skin is recessed where the spoiler panels lie.
    wingSlice(WING, [SPAN.spoiler[0][0], SPAN.spoiler[1][1]], C.spoilerLE, C.boxTE, { upperInset: 0.03 }),
    wingSlice(WING, [SPAN.spoiler[1][1], TIP_TE_X, tip], C.spoilerLE, C.boxTE),
    wingSlice(WING, [root, SPAN.fowler[0]], C.boxTE, 1),
    wingSlice(WING, [SPAN.outer[1][1], TIP_TE_X, tip], C.boxTE, 1),
  ];
  // Vermilion stripe just aft of the slats, on the upper skin.
  const stripe = wingSlice(WING, [0.75, 4.85], 0.17, 0.32, { skin: { side: 'upper', thickness: 0.008, lift: 0.004 }, n: 6 });
  const pivot = rot(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 16), 90, 0, 0);
  const tipLight = move(new THREE.BoxGeometry(0.06, 0.22, 0.07), W.length + 0.02, chordY(WING, W.length, 0.3), 0);

  /* moving surfaces, each in its hinge bone's frame */
  const slat = onHinge(wingSlice(WING, [...SPAN.slat], 0, C.slatTE), pivotOf('slat'));
  const fowler = onHinge(wingSlice(WING, [...SPAN.fowler], C.flapLE, 1), pivotOf('flapIn'));
  const outer = SPAN.outer.map(([x0, x1]) => onHinge(wingSlice(WING, [x0, x1], C.flapLE, 1), pivotOf('flapOut')));
  // Hinge pins on the outboard flap's hinge line, bridging the gap to the wing box (two per section).
  const onLowerAt = (x: number) => new THREE.Vector3(x, chordY(WING, x, C.flapLE), halfThickness(WING, x, C.flapLE));
  const h0 = onLowerAt(SPAN.outer[0][0]);
  const hAxis = onLowerAt(SPAN.outer[1][1]).sub(h0).normalize();
  const flapPins = SPAN.outer.flatMap(([x0, x1]) => [x0 + 0.25, x1 - 0.25]).map((x) => {
    const at = h0.clone().addScaledVector(hAxis, (x - SPAN.outer[0][0]) / hAxis.x).sub(h0);
    const g = new THREE.CylinderGeometry(0.055, 0.055, 0.22, 12);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hAxis));
    return g.translate(at.x, at.y, at.z);
  });
  const spoilers = SPAN.spoiler.map(([x0, x1]) =>
    onHinge(wingSlice(WING, [x0, x1], C.spoilerLE, C.spoilerTE, { skin: { side: 'upper', thickness: 0.022 }, n: 6 }), pivotOf('spoiler')),
  );

  /* store pylons: short enough to clear the flaps and slats */
  const pylon = (x: number, yc: number, len: number) => {
    const z = Math.max(lowerZ(x, yc + len / 2), lowerZ(x, yc), lowerZ(x, yc - len / 2)) + 0.035;
    return move(new THREE.BoxGeometry(0.14, len, 0.07), x, yc, z);
  };
  const pylons = [pylon(1.7, -0.38, 0.9), pylon(3.3, -0.25, 0.6)];

  /* wingtip roll-control thruster ports */
  const port = (side: 'upper' | 'lower') => {
    const [x, y, z] = rcsPortPos(side);
    return [
      move(rot(new THREE.CylinderGeometry(0.075, 0.075, 0.024, 14), 90, 0, 0), x, y, z),
      move(rot(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 12), 90, 0, 0), x, y, z + (side === 'upper' ? -0.004 : 0.004)),
    ];
  };
  const rcs = [...port('upper'), ...port('lower')];

  const lines = [
    ...surfaceLine(WING, [[0.6, chordY(WING, 0.6, 0.45)], [4.6, chordY(WING, 4.6, 0.45)]], 'upper'),
    ...surfaceLine(WING, [[2.2, chordY(WING, 2.2, 0.14)], [2.2, chordY(WING, 2.2, 0.5)]], 'upper', 0.004, 2),
    ...surfaceLine(WING, [[3.7, chordY(WING, 3.7, 0.14)], [3.7, chordY(WING, 3.7, 0.5)]], 'upper', 0.004, 2),
  ];

  for (const side of ['port', 'starboard'] as const) {
    const S = side === 'port' ? 'L' : 'R';
    const sx = side === 'port' ? 1 : -1;
    const m = (g: THREE.BufferGeometry) => (side === 'port' ? g : mirrorX(g));
    const wing = `wing${S}`;
    const id = `wing-${side}`;
    for (const g of box) b.ext(id, wing, m(g), 'white', { edges: 40 });
    b.ext(id, wing, m(stripe), 'red', { edges: false });
    // Sweep bearing, seated in the wing-root carriage.
    b.ext(id, wing, pivot.clone(), 'navy', { edges: false, joint: `wingRoot${S}` });
    b.ext(id, wing, m(tipLight), 'wingtip', { edges: false });
    for (const p of pylons) b.ext(id, wing, m(p), 'gunmetal');
    b.panelLines(wing, side === 'port' ? lines : lines.map((v, i) => (i % 3 === 0 ? -v : v)));

    b.ext(`wing-slat-${side}`, `slat${S}`, m(slat), 'offWhite', { edges: 40 });
    b.ext(`wing-flap-${side}`, `flapIn${S}`, m(fowler), 'offWhite', { edges: 40 });
    for (const g of outer) b.ext(`wing-outer-flap-${side}`, `flapOut${S}`, m(g), 'offWhite', { edges: 40 });
    for (const g of flapPins) b.ext(`wing-outer-flap-${side}`, `flapOut${S}`, m(g), 'navy', { edges: false, joint: `wing${S}` });
    for (const g of spoilers) b.ext(`wing-spoiler-${side}`, `spoiler${S}`, m(g), 'grey', { edges: 40 });
    rcs.forEach((g, i) => b.ext(`wingtip-rcs-${side}`, wing, m(g), i % 2 ? 'black' : 'navy', { edges: false }));

    b.marker(`wingRoot${S}`, wing, [0, 0, 0]);
    b.marker(`wingTip${S}`, wing, [sx * W.length, W.tipLE, 0]);
    b.marker(`wingTrail${S}`, wing, [sx * (W.length - 0.25), W.tipTE, 0]);
  }
}
