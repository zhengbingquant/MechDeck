import * as THREE from 'three';
import type { V3 } from '../../../core/builder';
import type { Vf1Builder as Builder } from '../materials';
import { move, rot } from '../../../core/geometry/shapes';
import { D } from '../dims';
import { link, piston, type Piston } from './internals';

/**
 * Shoulder transfer arm: a folding two-link arm hinged under the glove's trailing edge, outboard
 * of the nacelle. Folded flat under the wing root it clears everything; during the conversion to
 * GERWALK it reaches in behind the dropped legs, picks up the shoulder block once it has slid aft
 * out of the belly bay, carries it out and forward under the wing root, and lets go once the
 * shoulder lock has clamped the block into the glove (the Bandai DX's arm sliders: "move the
 * shoulders back, swing the arms out and around, slide them back in").
 */
export interface TransferArm {
  /** Base hinge (on the torso). */
  base: THREE.Object3D;
  /** Elbow and end effector (torso children the controller places each frame). */
  elbow: THREE.Object3D;
  hand: THREE.Object3D;
  /** Pick-up socket on the shoulder block. */
  coupling: THREE.Object3D;
  /** End effector when folded (torso frame). */
  stow: THREE.Vector3;
  /**
   * Points the elbow bends toward (torso frame): folded it trails aft under the wing root;
   * carrying, it hangs aft and down, behind the dropped leg and clear of the wing and the block.
   */
  poleStow: THREE.Vector3;
  poleCarry: THREE.Vector3;
  l1: number;
  l2: number;
}

/** Link lengths, and the base hinge (port, torso frame) just under the glove, outboard of the nacelle. */
export const TRANSFER = { l1: 1.3, l2: 1.3, base: [2.28, 2.35, -0.5] as V3, socket: [-0.52, 0.55, 0] as V3 };

export function buildTransferArms(b: Builder): { arms: TransferArm[]; pistons: Piston[] } {
  const arms: TransferArm[] = [];
  const pistons: Piston[] = [];
  const m = b.mats;
  for (const [side, S, s] of [['port', 'L', 1], ['starboard', 'R', -1]] as const) {
    const id = `arm-transfer-${side}`;
    const torso = b.bone('torso');
    const at = (p: V3) => {
      const o = new THREE.Object3D();
      o.position.set(...p);
      torso.add(o);
      return o;
    };
    const base = at([s * TRANSFER.base[0], TRANSFER.base[1], TRANSFER.base[2]]);
    const elbow = at([0, 0, 0]);
    const hand = at([0, 0, 0]);
    const coupling = new THREE.Object3D();
    coupling.position.set(s * TRANSFER.socket[0], TRANSFER.socket[1], TRANSFER.socket[2]);
    b.bone(`shoulder${S}`).add(coupling);
    // The links (re-aimed each frame like the rams): the upper one from the base hinge, the lower
    // one from the elbow to the gripper.
    const l1 = link(b, id, 'torso', [0, 0, 0], 'torso', [0, 0, 0], TRANSFER.l1, 0.075);
    const l2 = link(b, id, 'torso', [0, 0, 0], 'torso', [0, 0, 0], TRANSFER.l2, 0.06);
    l1.a = base;
    l1.b = elbow;
    l2.a = elbow;
    l2.b = hand;
    pistons.push(l1, l2);
    // Base hinge bracket hanging from the glove, the elbow knuckle and the gripper.
    const [bx, by, bz] = TRANSFER.base;
    const glove = D.glove.z + D.glove.thickness / 2;
    b.int(id, 'torso', move(new THREE.BoxGeometry(0.22, 0.26, bz + 0.05 - glove), 0, 0, (glove + bz + 0.05) / 2 - 0.005), 'actuators', m.casing, { pos: [s * bx, by, 0], always: true });
    const knuckle = b.int(id, 'torso', rot(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 14), 0, 0, 90), 'actuators', m.casing, { always: true });
    elbow.add(knuckle);
    const grip = b.int(id, 'torso', new THREE.SphereGeometry(0.09, 12, 8), 'actuators', m.chrome, { always: true });
    hand.add(grip);
    // Pick-up socket on the block's inboard face.
    b.ext(`shoulder-${side}`, `shoulder${S}`, rot(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 14), 0, 0, 90), 'navy', { pos: [s * (TRANSFER.socket[0] + 0.025), TRANSFER.socket[1], TRANSFER.socket[2]], edges: false });
    arms.push({
      base,
      elbow,
      hand,
      coupling,
      // Folded flat forward under the glove, clear of the wing root that sweeps inside it.
      stow: new THREE.Vector3(s * (bx - 0.05), by, bz),
      poleStow: new THREE.Vector3(s * bx, by + 4, bz),
      // (both in the arm's own plane, the gap between the thigh and the shoulder block)
      poleCarry: new THREE.Vector3(s * bx, by - 1.5, bz + 1.5),
      l1: TRANSFER.l1,
      l2: TRANSFER.l2,
    });
  }
  return { arms, pistons };
}

/**
 * Two-link IK: place the elbow and end effector so the end reaches `target` (clamped to the arm's
 * reach), the elbow bending toward `pole`. All points in one frame.
 */
export function solveTwoLink(
  base: THREE.Vector3,
  target: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
  outElbow: THREE.Vector3,
  outEnd: THREE.Vector3,
): void {
  const d = new THREE.Vector3().subVectors(target, base);
  let dist = d.length();
  const dir = dist > 1e-6 ? d.divideScalar(dist) : new THREE.Vector3(0, 1, 0);
  dist = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, dist));
  outEnd.copy(base).addScaledVector(dir, dist);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = new THREE.Vector3().subVectors(pole, base);
  perp.addScaledVector(dir, -perp.dot(dir));
  if (perp.lengthSq() < 1e-9) perp.set(1, 0, 0).addScaledVector(dir, -dir.x);
  perp.normalize();
  outElbow.copy(base).addScaledVector(dir, a).addScaledVector(perp, h);
}

/**
 * GU-11 mount strut: a six-stage telescopic strut from the starboard intake's underside to a lug on
 * the pod's flank. It holds the pod on the ventral mount in flight, follows it as the mount runs it
 * forward and down, swings it out under the intake (rolling it grip-up) into the right fist's hold,
 * and retracts once the fist has closed on the grip.
 */
export interface GunStrut {
  /** The intake's frame (legSlideR), the strut's free end, and the lug on the pod. */
  frame: THREE.Object3D;
  end: THREE.Object3D;
  lug: THREE.Object3D;
  /** Retracted end point (intake frame). */
  stow: THREE.Vector3;
  piston: Piston;
}

export function buildGunStrut(b: Builder): GunStrut {
  const frame = b.bone('legSlideR');
  const end = new THREE.Object3D();
  frame.add(end);
  const lug = new THREE.Object3D();
  lug.position.set(...D.gun.strutLug);
  b.bone('gunPod').add(lug);
  const p = piston(b, 'gun-mount-strut', 'legSlideR', D.gun.strutBase, 'legSlideR', [0, 0, 0], 0.8, 0.075, { stages: 6, always: true });
  p.b = end;
  // Lug on the pod's flank, and the strut's hinge block on the intake.
  b.ext('gun-pod', 'gunPod', rot(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 12), 0, 0, 90), 'gunmetal', { pos: [D.gun.strutLug[0] + 0.08, D.gun.strutLug[1], D.gun.strutLug[2]], edges: false });
  b.int('gun-mount-strut', 'legSlideR', new THREE.BoxGeometry(0.2, 0.22, 0.1), 'actuators', b.mats.casing, { pos: [D.gun.strutBase[0], D.gun.strutBase[1], D.gun.strutBase[2] - 0.04], always: true });
  const [bx, by, bz] = D.gun.strutBase;
  return { frame, end, lug, stow: new THREE.Vector3(bx, by - 0.86, bz + 0.22), piston: p };
}
