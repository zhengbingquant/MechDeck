import * as THREE from 'three';
import { D } from './dims';
import { SHIN_AXIS_Z } from './parts/legs';
import { INTAKE, NOZZLE } from './surfaces';

const L = D.leg;

/** The knee bellows: an arc about the front-face knee hinge, from the thigh duct to the shin duct. */
export const BELLOWS = { radius: L.kneeFront, segments: 10, ductRadius: 0.33 } as const;

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s1 = new THREE.Vector3();
const _t1 = new THREE.Vector3();

/**
 * Duct centre line in the thigh-extension frame at fraction f from the thigh duct's end to the
 * shin's inlet, wherever the knee (front hinge in GERWALK, rear pivot in Battroid) has put it: a
 * cubic Bézier leaving the thigh along its axis and entering the shin along its axis. For a pure
 * front-hinge bend it follows the arc about the hinge. `tangent` (optional) gets the flow direction.
 */
export function bellowsPoint(knee: THREE.Object3D, f: number, out = new THREE.Vector3(), tangent?: THREE.Vector3): THREE.Vector3 {
  // Shin inlet on the shin axis at the hinge level, and the shin axis direction (down the shin).
  _q.copy(knee.quaternion);
  _s1.set(0, 0, SHIN_AXIS_Z).applyQuaternion(_q).add(knee.position);
  _t1.set(0, -1, 0).applyQuaternion(_q);
  const chord = _s1.length();
  // Handle length: the circular-arc value for the bend angle, which a front-hinge bend reproduces.
  const bend = Math.acos(Math.min(1, Math.max(-1, -_t1.y)));
  const k = bend < 1e-4 ? chord / 3 : (4 / 3) * Math.tan(bend / 4) * (chord / (2 * Math.sin(bend / 2)));
  const u = 1 - f;
  // P0 = origin, P1 = (0, -k, 0), P2 = s1 - t1·k, P3 = s1.
  const b1 = 3 * u * u * f;
  const b2 = 3 * u * f * f;
  const b3 = f * f * f;
  out.set(0, -k * b1, 0).addScaledVector(_s1, b2 + b3).addScaledVector(_t1, -k * b2);
  if (tangent) {
    // dB/df = 3u²(P1-P0) + 6uf(P2-P1) + 3f²(P3-P2)
    _p.copy(_s1).addScaledVector(_t1, -k);
    tangent.set(0, -k * 3 * u * u, 0)
      .addScaledVector(_p.clone().sub(new THREE.Vector3(0, -k, 0)), 6 * u * f)
      .addScaledVector(_t1, 3 * f * f * k);
    if (tangent.lengthSq() < 1e-12) tangent.set(0, -1, 0);
    tangent.normalize();
  }
  return out;
}

/** Length of the bellows curve (for sizing its sleeves). */
export function bellowsLength(knee: THREE.Object3D, n = 12): number {
  let len = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  bellowsPoint(knee, 0, a);
  for (let i = 1; i <= n; i++) {
    bellowsPoint(knee, i / n, b);
    len += a.distanceTo(b);
    a.copy(b);
  }
  return len;
}

/**
 * The FF-2001's air path through one leg, as bone-local waypoints: intake face → fan →
 * intake duct → hip-swing swivel → thigh duct → knee bellows (an arc about the knee hinge) →
 * compressor → reaction chamber → turbine → through the ankle's ball joint into the split nozzle.
 * `ducted` marks the stretch that must be enclosed by duct walls (fan to compressor face).
 */
export interface AirPoint {
  bone: string;
  pos: [number, number, number];
  /** Knee-bellows point: its position follows the knee angle. */
  bellows?: number;
  ducted?: boolean;
  /** Downstream of the reaction chamber (the air is hot from here on). */
  hot?: boolean;
}

export function airPathPoints(S: 'L' | 'R'): AirPoint[] {
  const pts: AirPoint[] = [
    // In at the raked mouth, down the inlet past the ramps to the fan face deep in the box.
    { bone: `legSlide${S}`, pos: [0, INTAKE.lipBottom + 0.12, 0] },
    { bone: `legSlide${S}`, pos: [0, INTAKE.igvY + 0.06, 0], ducted: true },
    { bone: `legSlide${S}`, pos: [0, 1.0, 0], ducted: true },
    { bone: `legSlide${S}`, pos: [0, 0.2, 0], ducted: true },
    { bone: `thighSwing${S}`, pos: [0, 0, 0], ducted: true },
    { bone: `thighSwing${S}`, pos: [0, -0.5, 0], ducted: true },
  ];
  for (let i = 0; i <= BELLOWS.segments; i++) pts.push({ bone: `thighExt${S}`, pos: [0, 0, 0], bellows: i / BELLOWS.segments, ducted: true });
  pts.push(
    { bone: `knee${S}`, pos: [0, -0.4, SHIN_AXIS_Z], ducted: true },
    { bone: `knee${S}`, pos: [0, -2.0, SHIN_AXIS_Z], hot: true },
    { bone: `knee${S}`, pos: [0, -3.4, SHIN_AXIS_Z], hot: true },
    { bone: `ankle${S}`, pos: [0, 0, 0], hot: true },
    { bone: `foot${S}`, pos: [0, -0.6, NOZZLE.axisZ], hot: true },
    { bone: `foot${S}`, pos: [0, NOZZLE.exitY, NOZZLE.axisZ], hot: true },
  );
  return pts;
}

export interface AirPathPoint {
  p: THREE.Vector3;
  ducted: boolean;
  hot: boolean;
}

/** World (or `frame`-local) positions of the air path for the current pose. */
export function airPath(bones: Record<string, THREE.Bone>, S: 'L' | 'R', frame?: THREE.Object3D): AirPathPoint[] {
  const knee = bones[`knee${S}`];
  return airPathPoints(S).map((a) => {
    const p = a.bellows !== undefined ? bellowsPoint(knee, a.bellows) : new THREE.Vector3(...a.pos);
    bones[a.bone].localToWorld(p);
    if (frame) frame.worldToLocal(p);
    return { p, ducted: !!a.ducted, hot: !!a.hot };
  });
}
