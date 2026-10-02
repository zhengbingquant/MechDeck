import * as THREE from 'three';
import type { Vf1Builder as Builder } from '../materials';
import { ccw, chamferRect, loft, move, plate, rot, type P2 } from '../../../core/geometry/shapes';

/** Laser barrel length (it must clear the head bay's floor folded down) and its offset behind the pivot. */
const LASER_LEN = 1.15;
const LASER_OFFSET = 0.05;

/**
 * VF-1J head: helmet with green visor, red crest stripe and twin Mauler RÖV-20
 * lasers. Sized to retract fully into the torso's head bay (≤ 0.95 m deep).
 */
export function buildHead(b: Builder) {
  // Neck post (joint hardware seated in the torso).
  b.ext('head-unit', 'head', move(new THREE.CylinderGeometry(0.26, 0.3, 0.3, 12), 0, 0.05, 0), 'navy', { edges: false, joint: true });
  // Helmet: narrow jaw, widest at the visor, rounded crown (VF-1J art); the front stays
  // behind the visor, which lies flush with the belly when the head is stowed.
  // The lower face is one plane sloping back to the chin, so the faceplate lies flush on it.
  const chinSlope = 0.163;
  const faceZ = (y: number) => 0.475 - chinSlope * (0.62 - y);
  b.ext('head-unit', 'head', loft([
    { y: 0.08, pts: chamferRect(0.84, 0.8, 0.14, 0, faceZ(0.08) - 0.4) },
    { y: 0.36, pts: chamferRect(1.02, 0.88, 0.16, 0, faceZ(0.36) - 0.44) },
    { y: 0.62, pts: chamferRect(1.18, 0.95, 0.18, 0, 0) },
    { y: 1.0, pts: chamferRect(1.14, 0.92, 0.22, 0, -0.02) },
    { y: 1.18, pts: chamferRect(0.98, 0.84, 0.26, 0, -0.04) },
    { y: 1.3, pts: chamferRect(0.66, 0.62, 0.2, 0, -0.06) },
  ]), 'white');
  // Visor: wider at the top, lower corners cut, in a black surround under the brow.
  const visor = (w: number, lo: number, y0: number, y1: number, cut: number): P2[] =>
    ccw([[-w / 2, y1], [-w / 2, y0 + cut], [-lo / 2, y0], [lo / 2, y0], [w / 2, y0 + cut], [w / 2, y1]]);
  b.ext('head-unit', 'head', move(plate(visor(0.9, 0.64, 0.6, 0.95, 0.12), 0.04), 0, 0, 0.475), 'black', { edges: false });
  b.ext('sensor-visor', 'head', move(plate(visor(0.76, 0.52, 0.66, 0.89, 0.1), 0.03), 0, 0, 0.495), 'visor', { edges: false });
  // V-shaped faceplate down to a pointed chin, with its centre seam and two vent slits.
  const face: P2[] = [[-0.3, 0.6], [0.3, 0.6], [0.19, 0.34], [0, 0.16], [-0.19, 0.34]];
  const tilt = (Math.atan(chinSlope) * 180) / Math.PI;
  const onFace = (g: THREE.BufferGeometry, y: number, lift: number) => move(rot(move(g, 0, -y, 0), tilt, 0, 0), 0, y, faceZ(y) + lift);
  b.ext('head-unit', 'head', onFace(plate(ccw(face), 0.05), 0.38, 0.01), 'grey');
  for (const s of [1, -1]) {
    const slit = rot(new THREE.BoxGeometry(0.13, 0.035, 0.02), 0, 0, s * 24).translate(s * 0.1, 0.44, 0);
    b.ext('head-unit', 'head', onFace(slit, 0.44, 0.035), 'black', { edges: false });
  }
  b.panelLines('head', [0, 0.18, faceZ(0.18) + 0.038, 0, 0.58, faceZ(0.58) + 0.038]);
  // Red crest stripe from the brow over the crown, following the helmet's centre line [y, z].
  const crest: P2[] = [[0.98, 0.442], [1.18, 0.38], [1.3, 0.25], [1.3, -0.32]];
  for (let i = 0; i < crest.length - 1; i++) {
    const [y0, z0] = crest[i];
    const [y1, z1] = crest[i + 1];
    const len = Math.hypot(y1 - y0, z1 - z0);
    const [ny, nz] = [-(z1 - z0) / len, (y1 - y0) / len]; // outward normal
    const strip = rot(new THREE.BoxGeometry(0.16, len + 0.02, 0.02), (Math.atan2(z1 - z0, y1 - y0) * 180) / Math.PI, 0, 0);
    b.ext('head-unit', 'head', move(strip, 0, (y0 + y1) / 2 + ny * 0.008, (z0 + z1) / 2 + nz * 0.008), 'red', { edges: false });
  }
  // Cheek housings that carry the laser turrets.
  for (const s of [1, -1]) {
    b.ext('head-unit', 'head', move(new THREE.BoxGeometry(0.18, 0.5, 0.52), s * 0.63, 0.78, -0.06), 'white');
    const bone = s > 0 ? 'laserL' : 'laserR';
    // Turret base on the housing's front edge; the barrel stands 5 cm behind the fold pivot, so
    // folded forward and down (for stowage) it hangs 5 cm in front of it, clear of the housing.
    b.ext('laser-cannons', bone, new THREE.CylinderGeometry(0.1, 0.11, 0.2, 10), 'navy', { pos: [0, 0, -LASER_OFFSET], edges: false, joint: true });
    b.ext('laser-cannons', bone, move(new THREE.CylinderGeometry(0.055, 0.07, LASER_LEN, 10), 0, LASER_LEN / 2, -LASER_OFFSET), 'black', { edges: false });
    b.marker(s > 0 ? 'laserTipL' : 'laserTipR', bone, [0, LASER_LEN, -LASER_OFFSET]);
  }
  b.marker('headBase', 'head', [0, 0, 0]);
  b.marker('headTop', 'head', [0, 1.3, -0.05]);
}
