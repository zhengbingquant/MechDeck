import * as THREE from 'three';
import type { V3 } from '../../../core/builder';
import type { Vf1Builder as Builder } from '../materials';
import { D } from '../dims';
import { gear, rot } from '../../../core/geometry/shapes';
import { gearset } from './internals';

const A = D.arm;
const L = D.leg;
type Axis = 'x' | 'y' | 'z';

/** Lay a Y-axis cylinder along the given joint axis. */
const along = (g: THREE.BufferGeometry, axis: Axis) => (axis === 'x' ? rot(g, 0, 0, 90) : axis === 'z' ? rot(g, 90, 0, 0) : g);

/**
 * Servo pack for a secondary joint axis, as on real robot joints: motor can, harmonic-drive
 * housing and output flange, lying along the axis at the joint (cutaway, 'actuators').
 */
function servo(b: Builder, partId: string, bone: string, pos: V3, axis: Axis, r: number, len: number) {
  const m = b.mats;
  b.int(partId, bone, along(new THREE.CylinderGeometry(r * 0.72, r * 0.72, len * 0.58, 14).translate(0, -len * 0.21, 0), axis), 'actuators', m.casing, { pos });
  b.int(partId, bone, along(new THREE.CylinderGeometry(r, r, len * 0.3, 18).translate(0, len * 0.23, 0), axis), 'actuators', undefined, { pos });
  b.int(partId, bone, along(new THREE.CylinderGeometry(r * 1.08, r * 1.08, len * 0.08, 18).translate(0, len * 0.44, 0), axis), 'actuators', m.chrome, { pos });
}

/** Slewing ring for a twist axis: a toothed bearing ring round the axis, and the motor that drives it. */
function slewing(b: Builder, partId: string, bone: string, pos: V3, axis: Axis, r: number) {
  const m = b.mats;
  const ring = gear(r, Math.round(r * 110), 0.06, r * 0.08, r * 0.8);
  const face = axis === 'x' ? rot(ring, 0, 90, 0) : axis === 'y' ? rot(ring, 90, 0, 0) : ring;
  b.int(partId, bone, face, 'actuators', m.chrome, { pos });
  const motor: V3 = [pos[0] + (axis === 'x' ? 0.06 : r * 0.62), pos[1] + (axis === 'y' ? 0.07 : 0), pos[2] + (axis === 'z' ? 0.06 : 0)];
  b.int(partId, bone, along(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.16, 12), axis), 'actuators', m.casing, { pos: motor });
}

/**
 * Drives for every posable axis that has no ram or gear set of its own: each arm's shoulder
 * (pitch gear set, raise servo, twist ring, block rock servo) and wrist (bend servo, twist ring),
 * the head turret (yaw ring, nod servo) and laser elevation servos, and each leg's walking hip
 * (pitch gear set on the trunnions) and swing-bar hip (spread servo, twist ring).
 */
export function buildDrives(b: Builder) {
  for (const side of ['port', 'starboard'] as const) {
    const S = side === 'port' ? 'L' : 'R';
    const s = side === 'port' ? 1 : -1;

    const shoulder = `shoulder-drive-${side}`;
    gearset(b, shoulder, `upperArm${S}`, `shoulder${S}`, [0, -A.pivotDrop, 0], 'x', [0.24, -0.24], 0.19, 0.07, [0, 1, 0]);
    servo(b, shoulder, `upperArm${S}`, [0, -0.36, 0], 'z', 0.12, 0.34);
    slewing(b, shoulder, `upperArm${S}`, [0, -0.52, 0], 'y', 0.27);
    servo(b, shoulder, `shoulder${S}`, [0, A.blockBottom + 0.3, 0], 'x', 0.16, 0.5);

    const wrist = `wrist-drive-${side}`;
    servo(b, wrist, `wrist${S}`, [0, -0.08, 0], 'x', 0.09, 0.36);
    slewing(b, wrist, `wrist${S}`, [0, 0.06, 0], 'y', 0.19);

    // Hip: the pitch gear set on the hub (its pinion in the carriage below the rail), and flat
    // pancake servos on the hub for the spread and twist (there is only the slot beside the
    // intake for them: the hub runs between the rail and the intake's inboard face).
    const hip = `hip-drive-${side}`;
    gearset(b, hip, `thighSwing${S}`, `legSlide${S}`, [0, -L.thighPivot, 0], 'x', [s * 0.56], 0.15, 0.06, [0, 1, 0]);
    gearset(b, hip, `hip${S}`, `hipRail${S}`, [-s * L.hipIn, 0, 0], 'x', [0], 0.2, 0.06, [0, 0, 1]);
    for (const [y, z] of [[0.3, 0.3], [-0.3, 0.3]]) {
      b.int(hip, `hip${S}`, along(new THREE.CylinderGeometry(0.12, 0.12, 0.034, 18), 'x'), 'actuators', b.mats.casing, { pos: [0, y, z] });
    }
  }

  servo(b, 'head-drives', 'head', [0, 0.22, -0.1], 'x', 0.1, 0.46);
  slewing(b, 'head-drives', 'head', [0, 0.04, -0.1], 'y', 0.4);
  for (const S of ['L', 'R']) servo(b, 'head-drives', `laser${S}`, [0, 0, 0], 'x', 0.055, 0.14);
}
