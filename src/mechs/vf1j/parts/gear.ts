import * as THREE from 'three';
import type { Vf1Builder as Builder } from '../materials';
import { rot } from '../../../core/geometry/shapes';

/**
 * Landing gear (five-view side view; landing-gear sheet): a twin-wheel nose gear
 * under the cockpit ~3.6 m aft of the nose tip, with oleo, steering collar,
 * torque links and a landing light, and a single-wheel main gear under each
 * engine nacelle ~9.7 m aft. Gear frames: the strut hangs along +Z (down in
 * Fighter mode) from a pivot deep in its bay; the controller swings the nose
 * gear forward under the cockpit floor and the main gears aft into the shins.
 */
export const NOSE_GEAR = { pivot: [0, 1.6, -0.25] as const, strut: 1.36, wheelR: 0.24, wheelW: 0.13, track: 0.13 };
export const MAIN_GEAR = { depth: 0.35, alongShin: -1.79, strut: 0.8, wheelR: 0.3, wheelW: 0.22 };
/** Nose-gear doors, hinged along the bay's outer edges in the cockpit belly (cockpit frame). */
export const NOSE_DOOR = { halfWidth: 0.2, y0: 1.45, y1: 3.2, z: 0.012 };

/** Tyre + hub with the axle along X, centred on the origin. */
function wheel(r: number, w: number) {
  return {
    tyre: rot(new THREE.CylinderGeometry(r, r, w, 22, 1), 0, 0, 90),
    hub: rot(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w + 0.02, 16), 0, 0, 90),
    cap: rot(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w + 0.05, 10), 0, 0, 90),
  };
}

/** Cylinder along the gear's Z axis from z0 to z1. */
const strutSeg = (r: number, z0: number, z1: number) => rot(new THREE.CylinderGeometry(r, r, z1 - z0, 14), 90, 0, 0).translate(0, 0, (z0 + z1) / 2);

export function buildGear(b: Builder) {
  /* nose gear (bone noseGear, hinged under the cockpit floor) */
  const N = NOSE_GEAR;
  const ng = 'noseGear';
  // Oleo: outer cylinder (navy) and the chrome piston telescoping out of it.
  b.ext('nose-gear', ng, strutSeg(0.1, 0, 0.78), 'navy', { joint: 'cockpit' });
  b.ext('nose-gear', ng, strutSeg(0.062, 0.74, N.strut - 0.04), 'grey', { edges: false });
  // Steering collar and the torque-link scissor ahead of the piston.
  b.ext('nose-gear', ng, strutSeg(0.13, 0.8, 0.88), 'gunmetal', { edges: false });
  b.ext('nose-gear', ng, new THREE.BoxGeometry(0.05, 0.05, 0.28), 'gunmetal', { pos: [0, 0.1, 0.98], rot: [-26, 0, 0], edges: false });
  b.ext('nose-gear', ng, new THREE.BoxGeometry(0.05, 0.05, 0.28), 'gunmetal', { pos: [0, 0.1, 1.2], rot: [26, 0, 0], edges: false });
  // Axle yoke and twin wheels.
  b.ext('nose-gear', ng, new THREE.BoxGeometry(0.34, 0.1, 0.12), 'gunmetal', { pos: [0, 0, N.strut - 0.03], edges: false });
  const nw = wheel(N.wheelR, N.wheelW);
  for (const s of [1, -1]) {
    b.ext('nose-gear', ng, nw.tyre.clone(), 'black', { pos: [s * N.track, 0, N.strut], edges: 45 });
    b.ext('nose-gear', ng, nw.hub.clone(), 'grey', { pos: [s * N.track, 0, N.strut], edges: false });
    b.ext('nose-gear', ng, nw.cap.clone(), 'gunmetal', { pos: [s * (N.track + 0.01), 0, N.strut], edges: false });
  }
  // Landing / taxi light on the front of the strut.
  b.ext('nose-gear', ng, new THREE.BoxGeometry(0.14, 0.05, 0.1), 'amber', { pos: [0, 0.11, 0.62], edges: false });
  b.marker('wheelNose', ng, [0, 0, N.strut + N.wheelR]);

  /* nose-gear doors (bones noseDoorL / R, hinged along the bay's outer edges) */
  const D = NOSE_DOOR;
  const len = D.y1 - D.y0;
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    b.ext('nose-gear-doors', `noseDoor${S}`, new THREE.BoxGeometry(D.halfWidth - 0.01, len, 0.025), 'white', { pos: [-s * (D.halfWidth / 2), len / 2, 0], joint: 'cockpit' });
  }

  /* main gear (bones mainGearL / R, hinged deep in the front face of each shin) */
  const M = MAIN_GEAR;
  const mw = wheel(M.wheelR, M.wheelW);
  for (const [side, S, s] of [['port', 'L', 1], ['starboard', 'R', -1]] as const) {
    const g = `mainGear${S}`;
    const id = `main-gear-${side}`;
    b.ext(id, g, strutSeg(0.085, 0, 0.5), 'navy', { joint: `knee${S}` });
    b.ext(id, g, strutSeg(0.055, 0.46, M.strut - 0.02), 'grey', { edges: false });
    // Fork on the outboard side, wheel inboard of it.
    b.ext(id, g, new THREE.BoxGeometry(0.06, 0.16, 0.22), 'gunmetal', { pos: [s * 0.145, 0, M.strut - 0.06], edges: false });
    b.ext(id, g, mw.tyre.clone(), 'black', { pos: [0, 0, M.strut], edges: 45 });
    b.ext(id, g, mw.hub.clone(), 'grey', { pos: [0, 0, M.strut], edges: false });
    b.ext(id, g, mw.cap.clone(), 'gunmetal', { pos: [0, 0, M.strut], edges: false });
    b.marker(`wheel${S}`, g, [0, 0, M.strut + M.wheelR]);
  }
}
