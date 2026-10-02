import * as THREE from 'three';
import type { Vf1Builder as Builder } from '../materials';
import { ellipse, loft, move, rot } from '../../../core/geometry/shapes';

/** Pod axis offset from the grip (in front of the palm). */
export const GUN_AXIS_Z = 0.55;

/** Howard GU-11 55 mm three-barrel gun pod. Local: grip at origin, muzzle toward -Y. */
export function buildGunPod(b: Builder) {
  const z = GUN_AXIS_Z;
  b.ext('gun-pod', 'gunPod', loft([
    { y: -2.45, pts: ellipse(0.5, 0.5, 10, 0, z) },
    { y: -2.2, pts: ellipse(0.66, 0.66, 10, 0, z) },
    { y: 0.9, pts: ellipse(0.7, 0.7, 10, 0, z) },
    { y: 1.25, pts: ellipse(0.56, 0.56, 10, 0, z) },
  ]), 'gunpod', { edges: 35 });
  // Boxy receiver / drum housing at the rear.
  b.ext('gun-pod', 'gunPod', move(new THREE.BoxGeometry(0.78, 1.15, 0.78), 0, 0.62, z), 'gunpod');
  // Three barrels and the flash hider.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.ext('gun-pod', 'gunPod', new THREE.CylinderGeometry(0.075, 0.075, 0.95, 8), 'black', {
      pos: [Math.cos(a) * 0.12, -2.85, z + Math.sin(a) * 0.12], edges: false,
    });
  }
  b.ext('gun-pod', 'gunPod', move(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12), 0, -3.25, z), 'black', { edges: false });
  // Grip (inside the fist) and the orange sight/cable detail.
  b.ext('gun-pod', 'gunPod', move(new THREE.BoxGeometry(0.22, 0.36, 0.32), 0, 0, 0.18), 'black', { edges: false });
  b.ext('gun-pod', 'gunPod', rot(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), 0, 0, 90), 'red', { pos: [0, 0.9, z - 0.38], edges: false });
  b.marker('gunMuzzle', 'gunPod', [0, -3.33, z]);
  b.marker('gunStock', 'gunPod', [0, 1.25, z]);
}
