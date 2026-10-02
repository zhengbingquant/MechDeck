import * as THREE from 'three';
import type { Vf1Builder as Builder } from '../materials';
import { faceLines } from '../../../core/builder';
import { D } from '../dims';
import { ccw, chamferRect, loft, mirrorX, move, plate, rot, type P2 } from '../../../core/geometry/shapes';
import { SHOULDER_CLEVIS } from '../poses';

const A = D.arm;

function sidePlate(poly: P2[], t = 0.02): THREE.BufferGeometry {
  return rot(plate(ccw(poly.map(([y, z]) => [z, y] as P2)), t), 0, -90, 0);
}

/**
 * Shoulder armour blocks, upper arms, big forearms and manipulator hands,
 * sized from the Battroid schematic. The shoulder and elbow pivots are exposed
 * (navy housings) with enough gap that the armour never swings through itself:
 * the upper arm narrows at the top so it can swing 135° forward under the block.
 */
export function buildArms(b: Builder) {
  const bw = A.blockWidth;
  const bd = A.blockDepth;
  const fw = A.foreWidth;
  const fd = A.foreDepth;
  for (const side of ['port', 'starboard'] as const) {
    const S = side === 'port' ? 'L' : 'R';
    const s = side === 'port' ? 1 : -1;
    const m = (g: THREE.BufferGeometry) => (s > 0 ? g : mirrorX(g));

    /* shoulder block (slide carriage): tall armour box, bevelled top */
    const shoulder = `shoulder-${side}`;
    b.ext(shoulder, `shoulder${S}`, loft([
      { y: A.blockBottom, pts: chamferRect(bw - 0.06, bd - 0.06, 0.12) },
      { y: A.blockBottom + 0.12, pts: chamferRect(bw, bd, 0.12) },
      { y: A.blockTop - 0.28, pts: chamferRect(bw, bd, 0.14) },
      { y: A.blockTop, pts: chamferRect(bw - 0.22, bd - 0.16, 0.14) },
    ]), 'white');
    const ox = s * (bw / 2 + 0.005);
    // Red triangle on the front face pointing outboard, in an inset panel (Battroid schematic, VF-1J art).
    b.ext(shoulder, `shoulder${S}`, m(plate(ccw([[-0.1, 0.02], [0.2, 0.22], [-0.1, 0.42]]), 0.02)), 'red', { pos: [0, 0, bd / 2 + 0.005], edges: false });
    b.ext(shoulder, `shoulder${S}`, m(sidePlate([[-0.5, -0.26], [-0.5, 0.08], [-0.4, 0.08], [-0.4, -0.26]])), 'black', { pos: [ox, 0, 0], edges: false });
    const px = bw / 2 - 0.16;
    b.panelLines(`shoulder${S}`, [
      ...faceLines('z', bd / 2 + 0.004, [[-px, -0.62, px, -0.62], [-px, 0.44, px, 0.44], [-px, -0.62, -px, 0.44], [px, -0.62, px, 0.44]]),
      ...faceLines('x', s * (bw / 2 + 0.004), [[-0.75, -bd / 2 + 0.08, -0.75, bd / 2 - 0.08]]),
    ]);
    // Exposed shoulder joint: a yoke of two cheeks down from the block, straddling the
    // upper arm's narrow top, and the pivot housing across them.
    const gap = A.pivotDrop + A.blockBottom;
    for (const x of [-0.34, 0.34]) {
      b.ext(shoulder, `shoulder${S}`, move(new THREE.BoxGeometry(0.1, gap + 0.08, 0.44), x, A.blockBottom - (gap - 0.08) / 2, 0), 'navy', { edges: false, joint: `upperArm${S}` });
    }
    b.ext(shoulder, `shoulder${S}`, rot(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 14), 0, 0, 90), 'navy', { pos: [0, -A.pivotDrop, 0], joint: `upperArm${S}` });

    // Hinge pin along the top-back edge: it seats in the clevis under the glove (GERWALK).
    b.ext(shoulder, `shoulder${S}`, rot(new THREE.CylinderGeometry(0.055, 0.055, 0.56, 12), 0, 0, 90), 'navy', { pos: [...A.hingePin], edges: false, joint: 'torso' });
    // …through a lug hanging from the glove's underside into a slot between the block's knuckles.
    const [cx, cy, cz] = SHOULDER_CLEVIS;
    const gloveUnder = D.glove.z + D.glove.thickness / 2;
    b.ext(`glove-${side}`, 'torso', new THREE.BoxGeometry(0.24, 0.2, cz + 0.08 - gloveUnder), 'navy', { pos: [s * cx, cy, (gloveUnder + cz + 0.08) / 2 - 0.005], edges: false, joint: `shoulder${S}` });

    /* shoulder lock (bone shoulderLock): a saddle that runs out of the block's back into the glove
       on the torso, locking the arm's carriage in GERWALK and Battroid (retracted in Fighter) */
    const lock = `shoulder-lock-${side}`;
    b.ext(lock, `shoulderLock${S}`, move(new THREE.BoxGeometry(0.5, 0.95, 0.56), -s * 0.12, -0.34, -bd / 2 - 0.24), 'navy', { joint: `shoulder${S},torso` });
    b.ext(lock, `shoulderLock${S}`, move(new THREE.BoxGeometry(0.32, 0.7, 0.04), -s * 0.12, -0.34, -bd / 2 - 0.5), 'gunmetal', { edges: false, joint: `shoulder${S},torso` });

    /* upper arm (bone origin = shoulder pivot); the narrow top swings under the block */
    const upper = `upper-arm-${side}`;
    // The lower front edge is cut back so the forearm can fold up in front of it.
    b.ext(upper, `upperArm${S}`, loft([
      { y: -A.upperLen + 0.3, pts: chamferRect(0.74, 0.48, 0.12, 0, -0.13) },
      { y: -A.upperLen + 0.5, pts: chamferRect(0.74, 0.74, 0.1) },
      { y: -0.42, pts: chamferRect(0.74, 0.74, 0.1) },
      // The narrow top runs up round the shoulder axle (inside its housing).
      { y: -0.2, pts: chamferRect(0.52, 0.46, 0.1) },
    ]), 'white');
    // Elbow clevis: two cheeks carry the pivot either side of the forearm's knuckle, leaving the
    // middle open for the forearm to fold up into.
    for (const x of [-1, 1]) {
      b.ext(upper, `upperArm${S}`, move(new THREE.BoxGeometry(0.06, 0.38, 0.5), x * 0.35, -A.upperLen + 0.15, 0), 'navy', { edges: false, joint: `elbow${S}` });
    }
    b.ext(upper, `upperArm${S}`, rot(new THREE.CylinderGeometry(0.27, 0.27, 0.76, 12), 0, 0, 90), 'navy', { pos: [0, -A.upperLen, 0], joint: `elbow${S}` });

    /* forearm (bone origin = elbow pivot); narrow top gives the elbow room to bend */
    const fore = `forearm-${side}`;
    b.ext(fore, `elbow${S}`, loft([
      { y: -A.foreLen, pts: chamferRect(fw - 0.06, fd - 0.06, 0.12, 0, 0.02) },
      { y: -0.55, pts: chamferRect(fw, fd, 0.14, 0, 0.02) },
      // Rounded top (the elbow knuckle) so the forearm can fold up in front of the upper arm.
      { y: -0.24, pts: chamferRect(0.6, 0.44, 0.16) },
    ]), 'white');
    b.ext(fore, `elbow${S}`, loft([
      { y: -1.78, pts: chamferRect(fw - 0.02, fd - 0.02, 0.12, 0, 0.02) },
      { y: -1.62, pts: chamferRect(fw - 0.01, fd - 0.01, 0.12, 0, 0.02) },
    ]), 'black', { edges: false });
    // Outer shield: a thick plate on the forearm's outer face rising past the elbow to a swept point
    // (Battroid schematic: the forearm reads ~1.4 m wide with it). Outboard of the upper arm and
    // the elbow housing, so the elbow bends freely inside it.
    const shieldT = 0.24;
    const shieldX = fw / 2 + shieldT / 2 - 0.01;
    b.ext(fore, `elbow${S}`, m(sidePlate([[-2.06, -0.3], [-2.06, 0.3], [0.2, 0.3], [0.85, -0.05], [0.85, -0.3]], shieldT)), 'white', { pos: [s * shieldX, 0, 0] });
    b.ext(fore, `elbow${S}`, m(sidePlate([[-0.6, 0.1], [-1.5, 0.1], [-1.5, 0.26], [-0.6, 0.26]])), 'red', { pos: [s * (shieldX + shieldT / 2 + 0.005), 0, 0], edges: false });
    b.ext(fore, `elbow${S}`, move(new THREE.BoxGeometry(fw - 0.12, 0.12, fd - 0.08), 0, -A.foreLen + 0.02, 0.02), 'navy', { edges: false });
    b.panelLines(`elbow${S}`, faceLines('z', fd / 2 + 0.024, [[-0.36, -0.7, 0.36, -0.7], [-0.36, -1.4, 0.36, -1.4]]));

    /* hand (bone wrist; retracts fully into the forearm in Fighter mode) */
    const hand = `hand-${side}`;
    b.ext(hand, `wrist${S}`, move(new THREE.BoxGeometry(0.54, 0.44, 0.3), 0, -0.26, 0.02), 'grey');
    if (S === 'R') {
      // Right hand: fingers curled round the GU-11's grip.
      for (const x of [-0.19, -0.063, 0.063, 0.19]) {
        b.ext(hand, `wrist${S}`, move(new THREE.BoxGeometry(0.11, 0.34, 0.14), 0, -0.15, 0), 'grey', { pos: [x, -0.5, 0.04], rot: [-75, 0, 0], edges: false });
      }
      b.ext(hand, `wrist${S}`, move(new THREE.BoxGeometry(0.12, 0.28, 0.14), 0, -0.13, 0), 'grey', { pos: [s * 0.29, -0.18, 0.14], rot: [-60, 0, s * -35], edges: false });
    } else {
      // Left hand: a closed fist (line art): four curled fingers under the knuckle line, the thumb
      // wrapped across them.
      for (const x of [-0.19, -0.063, 0.063, 0.19]) {
        b.ext(hand, `wrist${S}`, new THREE.BoxGeometry(0.115, 0.22, 0.3), 'grey', { pos: [x, -0.56, 0.05], edges: false });
      }
      b.ext(hand, `wrist${S}`, new THREE.BoxGeometry(0.34, 0.12, 0.12), 'grey', { pos: [s * 0.08, -0.5, 0.24], rot: [0, 0, s * 12], edges: false });
    }
    b.marker(`hand${S}`, `wrist${S}`, [0, -A.handLen, 0]);
  }
}
