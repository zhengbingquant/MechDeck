/**
 * Ground locomotion for the pilot modes: a walker (or hover-skimmer) driven by a
 * forward / turn / strafe stick with a boost button and jump. Pure and
 * framerate-independent enough to step at the display rate.
 *
 * World frame: +Y up, heading 0 faces +Z; turning right (positive `turn`) turns
 * clockwise seen from above, toward -X (the robot's right hand is starboard, -X).
 */

export interface DriveParams {
  /** Top speeds (m/s): walking, running (boost) and backing up. */
  walkSpeed: number;
  runSpeed: number;
  backSpeed: number;
  /** Acceleration toward a faster target, deceleration toward a slower one (m/s²). */
  accel: number;
  decel: number;
  /** Yaw rate at full stick (rad/s). */
  turnRate: number;
  /** Distance covered per full gait cycle (two steps) walking and running (m). */
  strideWalk: number;
  strideRun: number;
  /** Walkers can jump (vernier-assisted): take-off speed and gravity. */
  jump?: { speed: number; gravity: number };
  /** Hover-skimmers lift to `height` while boosting, with top speed `speed`; `rise` is the blend rate (1/s). */
  hover?: { height: number; speed: number; rise: number };
}

export interface DriveInput {
  /** −1 … 1: back … forward. */
  forward: number;
  /** −1 … 1: left … right. */
  turn: number;
  /** −1 … 1: sidestep left … right. */
  strafe: number;
  boost: boolean;
  jump: boolean;
}

export interface DriveState {
  x: number;
  z: number;
  heading: number;
  /** Body-frame speeds (m/s): forward and to the right. */
  forward: number;
  side: number;
  /** Height above the ground (jump or hover) and vertical speed. */
  y: number;
  vy: number;
  grounded: boolean;
  /** Hover blend 0 (standing) … 1 (skimming at hover height). */
  hover: number;
  /** Gait cycle position 0 … 1. */
  phase: number;
  /** Touchdown impact 1 → 0 over a third of a second (drives the landing crouch). */
  landing: number;
  /** Odometer (m). */
  distance: number;
}

export function initialDrive(): DriveState {
  return { x: 0, z: 0, heading: 0, forward: 0, side: 0, y: 0, vy: 0, grounded: true, hover: 0, phase: 0, landing: 0, distance: 0 };
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Move `cur` toward `target`, accelerating or braking at the given rates. */
function approach(cur: number, target: number, accel: number, decel: number, dt: number): number {
  const speedingUp = Math.abs(target) > Math.abs(cur) && Math.sign(target) !== -Math.sign(cur);
  const rate = (speedingUp ? accel : decel) * dt;
  return cur + clamp(target - cur, -rate, rate);
}

/** Fraction of the way from walking to running speed (0 … 1). */
export function runFraction(s: DriveState, p: DriveParams): number {
  const v = Math.hypot(s.forward, s.side);
  const top = p.hover ? p.hover.speed : p.runSpeed;
  return clamp((v - p.walkSpeed) / Math.max(1e-6, top - p.walkSpeed), 0, 1);
}

export function stepDrive(s: DriveState, i: DriveInput, p: DriveParams, dt: number): DriveState {
  const n = { ...s };
  const forward = clamp(i.forward, -1, 1);
  const strafe = clamp(i.strafe, -1, 1);

  // Hover-skimmers lift off while boosting; walkers run.
  n.hover = p.hover ? clamp(n.hover + (i.boost ? 1 : -1) * p.hover.rise * dt, 0, 1) : 0;
  const hovering = n.hover > 0;
  const fast = i.boost ? (p.hover ? p.hover.speed : p.runSpeed) : p.walkSpeed;
  const targetFwd = forward >= 0 ? forward * fast : forward * p.backSpeed;
  const targetSide = strafe * (i.boost ? fast * 0.5 : p.walkSpeed * 0.6);
  n.forward = approach(n.forward, targetFwd, p.accel, p.decel, dt);
  n.side = approach(n.side, targetSide, p.accel, p.decel, dt);
  if (Math.abs(n.forward) < 1e-9) n.forward = 0;
  if (Math.abs(n.side) < 1e-9) n.side = 0;

  n.heading -= clamp(i.turn, -1, 1) * p.turnRate * dt;

  const sin = Math.sin(n.heading);
  const cos = Math.cos(n.heading);
  n.x += (sin * n.forward - cos * n.side) * dt;
  n.z += (cos * n.forward + sin * n.side) * dt;

  // Vertical: hover height, or a ballistic jump.
  if (p.hover) {
    n.y = n.hover * p.hover.height;
    n.vy = 0;
    n.grounded = !hovering;
  } else if (p.jump) {
    if (n.grounded && i.jump) {
      n.vy = p.jump.speed;
      n.grounded = false;
    }
    if (!n.grounded) {
      // Exact for constant gravity, so the arc does not depend on the frame rate.
      n.y += n.vy * dt - 0.5 * p.jump.gravity * dt * dt;
      n.vy -= p.jump.gravity * dt;
      if (n.y <= 0) {
        n.landing = clamp(-n.vy / p.jump.speed, 0.5, 1);
        n.y = 0;
        n.vy = 0;
        n.grounded = true;
      }
    }
  }
  if (n.grounded && n.landing > 0 && s.grounded) n.landing = Math.max(0, n.landing - dt * 3);

  // Gait: one cycle per stride while stepping on the ground.
  const dist = Math.hypot(n.forward, n.side) * dt;
  n.distance += dist;
  if (n.grounded) {
    const stride = p.strideWalk + (p.strideRun - p.strideWalk) * runFraction(n, p);
    n.phase = (n.phase + dist / stride) % 1;
  }
  return n;
}
