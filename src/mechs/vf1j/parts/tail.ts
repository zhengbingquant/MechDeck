import * as THREE from 'three';
import type { Vf1Builder as Builder } from '../materials';
import { faceLines } from '../../../core/builder';
import { D } from '../dims';
import { cbox, chamferRect, finPlate, loft, mirrorX, move, rot, stripe, type P2 } from '../../../core/geometry/shapes';
import { FIN, finLE, finTE, HINGES, RUDDER, rudderHingeY } from '../surfaces';

const TL = D.tail;

/**
 * Tail module (the Battroid backpack) with its two canted fins and antenna boom.
 * Local frame: fold hinge at the origin on the dorsal skin, the module runs aft
 * along -Y, the belly is +Z. Its front metre is an open channel that straddles
 * the waist keel in Fighter mode; the main body carries the vernier cluster on
 * its belly (the backpack's outer face once folded up the back).
 */
export function buildTail(b: Builder) {
  const hw = TL.halfWidth;
  const ch = TL.channelLen;
  const cw = TL.channelHalfWidth;
  const dp = TL.depth;
  /* front channel: top plate and two side skirts */
  const top = 0.07;
  b.ext('tail-module', 'tailModule', move(cbox(hw * 2, ch - 0.02, top, 0.02), 0, -ch / 2 - 0.01, top / 2), 'white');
  for (const s of [1, -1]) {
    b.ext('tail-module', 'tailModule', move(cbox(hw - cw, ch - 0.02, dp - top, 0.03), (s * (hw + cw)) / 2, -ch / 2 - 0.01, top + (dp - top) / 2), 'white');
  }
  b.ext('tail-module', 'tailModule', move(new THREE.BoxGeometry(cw * 2 - 0.02, ch - 0.06, 0.012), 0, -ch / 2, top + 0.006), 'navy', { edges: false });
  /* main body, tapering to the aft face (±0.67 × 0.4 m in the five-view rear view). The aft face is
     bevelled on its belly side, and the recessed vent with its three ports lies on the bevel: in
     GERWALK, with the block flipped flat onto the back, it is the sloping front face (the kit). */
  const L = TL.length;
  const aftH = 0.14;
  const bevel = 0.28;
  b.ext('tail-module', 'tailModule', loft([
    { y: -L, pts: chamferRect(1.34, aftH, 0.04, 0, aftH / 2) },
    { y: -L + bevel, pts: chamferRect(1.5, dp, 0.1, 0, dp / 2) },
    { y: -ch, pts: chamferRect(hw * 2, dp, 0.1, 0, dp / 2) },
  ]), 'white');
  // The bevel's mid-line and its outward normal (aft and toward the belly): things laid on it.
  const tilt = Math.atan2(dp - aftH, bevel);
  const onBevel = (g: THREE.BufferGeometry, x: number, lift: number) =>
    g.rotateX(Math.PI / 2).rotateX(Math.PI / 2 - tilt).translate(x, -L + bevel / 2 - Math.sin(tilt) * lift, (aftH + dp) / 2 + Math.cos(tilt) * lift);
  const bevelLen = Math.hypot(bevel, dp - aftH);
  // Recessed dark-blue vent panel with its three round ports, and a slotted disc beside it.
  b.ext('tail-module', 'tailModule', onBevel(new THREE.BoxGeometry(0.92, 0.012, bevelLen - 0.08), 0, 0.004), 'navy', { edges: false });
  for (const x of [-0.3, 0, 0.3]) {
    b.ext('tail-module', 'tailModule', onBevel(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 18), x, 0.012), 'gunmetal', { edges: false });
    b.ext('tail-module', 'tailModule', onBevel(new THREE.CylinderGeometry(0.075, 0.075, 0.034, 16), x, 0.014), 'black', { edges: false });
  }
  b.ext('tail-module', 'tailModule', onBevel(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 18), 0.585, 0.006), 'offWhite', { edges: false });
  b.ext('tail-module', 'tailModule', onBevel(new THREE.BoxGeometry(0.1, 0.016, 0.022), 0.585, 0.012), 'navy', { edges: false });
  // Tail lights on the aft face.
  for (const s of [1, -1]) {
    b.ext('tail-module', 'tailModule', move(new THREE.BoxGeometry(0.14, 0.05, 0.06), s * 0.56, -L - 0.02, aftH / 2), 'navRed', { edges: false });
  }
  // Belly (the backpack's outer face): the red disc, and toward the hinge end the vernier well:
  // a fixed port between the two pop-out nozzles (bones vernierL / vernierR).
  const belly = dp + 0.004;
  const vy = TL.vernier[1];
  b.ext('tail-thrusters', 'tailModule', move(new THREE.BoxGeometry(0.9, 0.6, 0.01), 0, vy - 0.12, belly - 0.004), 'black', { edges: false });
  b.ext('tail-thrusters', 'tailModule', rot(new THREE.CylinderGeometry(0.13, 0.14, 0.08, 16), 90, 0, 0), 'gunmetal', { pos: [0, vy - 0.27, belly - 0.028], edges: false });
  b.ext('tail-thrusters', 'tailModule', rot(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 14), 90, 0, 0), 'black', { pos: [0, vy - 0.27, belly - 0.034], edges: false });
  b.ext('tail-module', 'tailModule', rot(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), 90, 0, 0), 'red', { pos: [0, -1.82, belly], edges: false });
  for (const S of ['L', 'R'] as const) {
    const bone = `vernier${S}`;
    // Nozzle along its mount's +Z: flush with the belly at rest, standing out of the well for GERWALK.
    b.ext('tail-thrusters', bone, new THREE.CylinderGeometry(0.12, 0.15, 0.26, 16).translate(0, 0.13, 0).rotateX(Math.PI / 2), 'gunmetal', { edges: false, joint: 'tailModule' });
    b.ext('tail-thrusters', bone, new THREE.CylinderGeometry(0.085, 0.085, 0.02, 14).rotateX(Math.PI / 2).translate(0, 0, 0.255), 'black', { edges: false, joint: 'tailModule' });
    b.marker(`vernierBase${S}`, bone, [0, 0, 0]);
    b.marker(`vernierMouth${S}`, bone, [0, 0, 0.26]);
  }
  b.panelLines('tailModule', [
    ...faceLines('z', -0.004, [[-0.6, -1.2, 0.6, -1.2], [-0.6, -1.2, -0.6, -2.2], [0.6, -1.2, 0.6, -2.2], [-0.6, -2.2, 0.6, -2.2]]),
    ...faceLines('z', dp + 0.006, [[-0.7, -1.0, 0.7, -1.0], [-0.6, -2.1, 0.6, -2.1]]),
  ]);
  b.marker('tailEnd', 'tailModule', [0, -L, aftH / 2]);

  /* antenna boom (bone mast, hinged at the aft face) and the whip that extends from it */
  const mast = new THREE.CylinderGeometry(0.065, 0.065, TL.mastLen - 0.06, 12);
  b.ext('tail-antenna', 'mast', move(mast, 0, -(TL.mastLen - 0.06) / 2 - 0.02, 0), 'white');
  b.ext('tail-antenna', 'mast', move(new THREE.SphereGeometry(0.075, 12, 8), 0, -TL.mastLen + 0.06, 0), 'white', { edges: false });
  b.ext('tail-antenna', 'mast', rot(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12), 90, 0, 0), 'navy', { pos: [0, 0, 0], edges: false, joint: 'tailModule' });
  b.ext('tail-antenna', 'whip', move(new THREE.CylinderGeometry(0.022, 0.03, TL.whipLen, 8), 0, TL.whipLen / 2, 0), 'grey', { edges: false });
  b.ext('tail-antenna', 'whip', new THREE.SphereGeometry(0.045, 10, 8), 'red', { edges: false });
  b.marker('mastTip', 'whip', [0, 0, 0]);

  // Fins: planform [height, chord] with the root leading edge at the origin (the fold
  // hinge). Height runs along -Z (up in Fighter mode), chord aft along -Y.
  const h = TL.finHeight;
  // The rudder fills a notch in the trailing edge; the fin keeps 3.5 cm of clearance
  // ahead of the hinge line so the rudder can swing ±25°.
  const { h0, h1 } = RUDDER;
  const notch = (z: number) => rudderHingeY(z) + 0.035;
  const finPoly: P2[] = [[0, 0], [0, -FIN.rootChord], [h0, finTE(h0)], [h0, notch(h0)], [h1, notch(h1)], [h1, finTE(h1)], [h, FIN.tipTE], [h, FIN.tipLE]];
  const r0 = h0 + 0.02;
  const r1 = h1 - 0.02;
  const rudderPoly: P2[] = [[r0, rudderHingeY(r0)], [r0, finTE(r0)], [FIN.kinkH, finTE(FIN.kinkH)], [r1, finTE(r1)], [r1, rudderHingeY(r1)]];
  const rp = HINGES.find((x) => x.bone === 'rudder')!.pivot;
  const rudder = move(finPlate(rudderPoly, 0.1, 0.02), -rp[0], -rp[1], -rp[2]);
  const fin = finPlate(finPoly, 0.14, 0.04);
  // Hikaru's VF-1J: a vermilion band along the fin, parallel to the leading edge.
  const band = finPlate(stripe([[0.08, finLE(0.08) - 0.4], [h - 0.1, finLE(h - 0.1) - 0.4]], 0.24), 0.152);
  // Fold hinge barrel along the root chord (the fold axis), from the leading edge aft.
  const knuckle = move(new THREE.CylinderGeometry(0.075, 0.075, 0.7, 12), 0, -0.4, 0);
  for (const [side, boneId] of [['port', 'finL'], ['starboard', 'finR']] as const) {
    const mirror = side === 'starboard';
    b.ext(`tail-fin-${side}`, boneId, mirror ? mirrorX(fin) : fin, 'white');
    b.ext(`tail-fin-${side}`, boneId, mirror ? mirrorX(band) : band, 'red', { edges: false });
    b.ext(`rudder-${side}`, `rudder${side === 'port' ? 'L' : 'R'}`, mirror ? mirrorX(rudder) : rudder, 'offWhite');
    // Fold-hinge barrel along the fin root (visible pivot).
    b.ext(`tail-fin-${side}`, boneId, knuckle.clone(), 'navy', { edges: false, joint: 'tailModule' });
    const sfx = side === 'port' ? 'L' : 'R';
    b.marker(`finRoot${sfx}`, boneId, [0, 0, 0]);
    b.marker(`finTip${sfx}`, boneId, [0, (FIN.tipLE + FIN.tipTE) / 2, -h]);
    b.marker(`finTrail${sfx}`, boneId, [0, FIN.tipTE, -h]);
  }
}
