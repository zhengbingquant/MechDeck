import * as THREE from 'three';
import type { FlightControls, FlightSurfaces, FlightTelemetry } from '../types';
import { atmosphere, G0 } from './atmosphere';

/**
 * Point-mass flight model with a fly-by-wire control law, for variable-sweep
 * fighters. The flight path is integrated as vectors (velocity direction and
 * lift axis), so loops and inverted flight need no special cases.
 *
 * Aerodynamics: linear lift up to CLmax with a post-stall drop, Prandtl–Glauert
 * / Ackeret lift-slope corrections, parabolic polar with transonic wave drag,
 * and high-lift / drag devices. Thrust lapses with density.
 */

export interface Airframe {
  mass: number; // kg
  wingArea: number; // m², reference
  /** Wingspan (m) at a given sweep (degrees). */
  span(sweep: number): number;
  sweep: { min: number; max: number; rate: number }; // degrees, degrees/s
  /** Automatic wing-sweep schedule (degrees) against Mach. */
  sweepSchedule(mach: number): number;
  thrust: {
    idle: number; // N, sea-level static, all engines
    mil: number; // N at 90 % throttle (maximum continuous)
    max: number; // N at 100 % (overboost)
    lapse: number; // thrust ∝ σ^lapse
    spoolUp: number; // s
    spoolDown: number; // s
  };
  aero: {
    cl0: number;
    clAlpha: [number, number]; // per rad, incompressible, at min / max sweep
    clMax: [number, number]; // clean, at min / max sweep
    cd0: number;
    wavePeak: [number, number]; // transonic ΔCD0 peak at min / max sweep
    oswald: number;
    kSuper: number; // supersonic drag-due-to-lift growth, × √(M² − 1)
    flap: { cl: number; clMax: number; cd: number };
    slat: { clMax: number; cd: number };
    airbrakeCd: number;
    spoilerCd: number;
  };
  control: {
    gMax: number;
    gMin: number;
    alphaTau: number; // s, pitch response at full nozzle authority
    rollRcs: number; // deg/s from wingtip reaction-control thrusters
    rollSpoiler: number; // deg/s from spoilers at full dynamic pressure
    spoilerLockout: number; // degrees sweep above which the spoilers are locked out
    betaMax: number; // degrees of sideslip at full rudder
    rudderMax: number; // degrees
    nozzleMax: number; // degrees of thrust vectoring
    flapLimitEas: number; // m/s EAS above which the flaps blow back
  };
}

export interface AeroInput {
  mach: number;
  alpha: number; // rad
  sweep: number; // degrees
  flaps: number;
  slats: number;
  airbrake: number;
  spoilers: number; // 0…1 average deployment
}

export interface AeroCoeffs {
  cl: number;
  cd: number;
  cl0: number;
  clAlpha: number;
  clMax: number;
  alphaStall: number;
  alphaStallNeg: number;
  cd0: number;
  k: number;
  stalled: boolean;
}

export interface FlightState {
  position: THREE.Vector3; // x, y = altitude, z (m)
  dir: THREE.Vector3; // unit velocity direction
  up: THREE.Vector3; // unit lift axis, ⟂ dir
  speed: number; // true airspeed, m/s
  alpha: number; // rad
  beta: number; // rad (+ = nose right of the flight path)
  rollRate: number; // rad/s
  spool: number; // 0…1
  sweep: number; // degrees
  flaps: number;
  slats: number;
  airbrake: number;
  time: number;
}

export interface FlightOutputs {
  telemetry: FlightTelemetry;
  surfaces: FlightSurfaces;
}

const D2R = Math.PI / 180;
const MIN_SPEED = 15;
const FLOOR = 20; // m: the sim skims instead of crashing
const CEILING = 45_000;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const approach = (cur: number, target: number, step: number) => cur + clamp(target - cur, -step, step);
const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const follow = (cur: number, target: number, dt: number, tau: number) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

export const sweepFraction = (af: Airframe, sweep: number) => clamp((sweep - af.sweep.min) / (af.sweep.max - af.sweep.min), 0, 1);

/** Lift-curve slope with compressibility: Prandtl–Glauert below M0.9, Ackeret above M1.2. */
function liftSlope(incompressible: number, mach: number): number {
  const sub = (m: number) => incompressible / Math.sqrt(1 - 0.6 * m * m);
  const sup = (m: number) => Math.min(incompressible, 4.2 / Math.sqrt(m * m - 1));
  if (mach <= 0.9) return sub(mach);
  if (mach >= 1.2) return sup(mach);
  return lerp(sub(0.9), sup(1.2), (mach - 0.9) / 0.3);
}

/** Transonic drag rise, peaking at M1.15 and decaying as (M² − 1)^-¼. Sweep delays divergence. */
function waveDrag(peak: number, mach: number, f: number): number {
  const mdd = 0.85 + 0.1 * f;
  if (mach <= mdd) return 0;
  if (mach <= 1.15) return peak * smoothstep((mach - mdd) / (1.15 - mdd));
  return peak * Math.pow((1.15 * 1.15 - 1) / (mach * mach - 1), 0.25);
}

export function aero(af: Airframe, i: AeroInput): AeroCoeffs {
  const A = af.aero;
  const f = sweepFraction(af, i.sweep);
  const clAlpha = liftSlope(lerp(A.clAlpha[0], A.clAlpha[1], f), i.mach);
  const cl0 = A.cl0 + A.flap.cl * i.flaps;
  const machLoss = i.mach < 0.4 ? 1 : Math.max(0.55, 1 - 0.45 * (i.mach - 0.4));
  const clMax = (lerp(A.clMax[0], A.clMax[1], f) + A.flap.clMax * i.flaps + A.slat.clMax * i.slats) * machLoss;
  const clMin = -0.6 * clMax;
  const alphaStall = (clMax - cl0) / clAlpha;
  const alphaStallNeg = (clMin - cl0) / clAlpha;

  let cl = cl0 + clAlpha * i.alpha;
  let stalled = false;
  if (i.alpha > alphaStall) {
    stalled = true;
    cl = Math.max(0.6 * clMax, clMax - 2 * (i.alpha - alphaStall));
  } else if (i.alpha < alphaStallNeg) {
    stalled = true;
    cl = Math.min(0.6 * clMin, clMin + 2 * (alphaStallNeg - i.alpha));
  }

  const span = af.span(i.sweep);
  const aspect = (span * span) / af.wingArea;
  const kSub = 1 / (Math.PI * aspect * A.oswald);
  const k = i.mach <= 1 ? kSub : kSub + A.kSuper * Math.sqrt(i.mach * i.mach - 1);
  const cd0 =
    A.cd0 +
    waveDrag(lerp(A.wavePeak[0], A.wavePeak[1], f), i.mach, f) +
    A.flap.cd * i.flaps * i.flaps +
    A.slat.cd * i.slats +
    A.airbrakeCd * i.airbrake +
    A.spoilerCd * i.spoilers;
  // Separated flow past the stall: flat-plate-like pressure drag.
  const sep = stalled ? 1.2 * Math.max(0, Math.sin(Math.abs(i.alpha)) ** 2 - Math.sin(Math.abs(i.alpha > 0 ? alphaStall : alphaStallNeg)) ** 2) : 0;
  return { cl, cd: cd0 + k * cl * cl + sep, cl0, clAlpha, clMax, alphaStall, alphaStallNeg, cd0, k, stalled };
}

/** Angle of attack (rad) giving a lift coefficient on the linear part of the lift curve. */
export function alphaForCl(af: Airframe, cl: number, i: Omit<AeroInput, 'alpha'>): number {
  const c = aero(af, { ...i, alpha: 0 });
  return (cl - c.cl0) / c.clAlpha;
}

/** Installed thrust (N, all engines) for a throttle/spool setting at an altitude. */
export function thrustAt(af: Airframe, command: number, altitude: number): number {
  const T = af.thrust;
  const c = clamp(command, 0, 1);
  const seaLevel = c <= 0.9 ? lerp(T.idle, T.mil, c / 0.9) : lerp(T.mil, T.max, (c - 0.9) / 0.1);
  const sigma = atmosphere(altitude).density / 1.225;
  return seaLevel * Math.pow(sigma, T.lapse);
}

/** Angle of attack and throttle for steady, level 1 g flight. */
export function trim(af: Airframe, altitude: number, speed: number): { alpha: number; throttle: number; sweep: number } {
  const atm = atmosphere(altitude);
  const mach = speed / atm.speedOfSound;
  const qS = 0.5 * atm.density * speed * speed * af.wingArea;
  const sweep = af.sweepSchedule(mach);
  const cfg = { mach, sweep, flaps: 0, slats: 0, airbrake: 0, spoilers: 0 };
  const W = af.mass * G0;
  let alpha = 0;
  let thrust = 0;
  for (let i = 0; i < 40; i++) {
    alpha = alphaForCl(af, (W - thrust * Math.sin(alpha)) / qS, cfg);
    thrust = (aero(af, { ...cfg, alpha }).cd * qS) / Math.cos(alpha);
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (thrustAt(af, mid, altitude) < thrust) lo = mid;
    else hi = mid;
  }
  return { alpha, throttle: hi, sweep };
}

/** Trimmed straight-and-level flight heading +Z (world), wings level. */
export function initialState(af: Airframe, altitude: number, speed: number): { state: FlightState; throttle: number } {
  const t = trim(af, altitude, speed);
  return {
    throttle: t.throttle,
    state: {
      position: new THREE.Vector3(0, altitude, 0),
      dir: new THREE.Vector3(0, 0, 1),
      up: new THREE.Vector3(0, 1, 0),
      speed,
      alpha: t.alpha,
      beta: 0,
      rollRate: 0,
      spool: t.throttle,
      sweep: t.sweep,
      flaps: 0,
      slats: 0,
      airbrake: 0,
      time: 0,
    },
  };
}

const _right = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _bodyUp = new THREE.Vector3();
const _left = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qh = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

/** Bank angle (rad, + = right wing down) of a lift axis about a flight path. */
function bankOf(dir: THREE.Vector3, up: THREE.Vector3): number {
  _right.crossVectors(dir, up);
  return Math.atan2(-_right.y, up.y);
}

/** Heading (rad, 0 = +Z, + = turning right towards -X) of a direction. */
export function headingOf(dir: THREE.Vector3): number {
  return Math.atan2(-dir.x, dir.z);
}

/**
 * Advance the simulation by dt seconds (mutates `s`) and report telemetry plus
 * the control-surface positions to draw.
 */
export function stepFlight(af: Airframe, s: FlightState, c: FlightControls, dt: number): FlightOutputs {
  const C = af.control;
  const m = af.mass;
  const W = m * G0;
  const atm = atmosphere(s.position.y);
  const V = Math.max(s.speed, MIN_SPEED);
  const mach = V / atm.speedOfSound;
  const q = 0.5 * atm.density * V * V;
  const qS = q * af.wingArea;
  const eas = V * Math.sqrt(atm.density / 1.225);
  const alphaDeg = s.alpha / D2R;

  /* actuators */
  const sweepCmd = clamp(c.sweep ?? af.sweepSchedule(mach), af.sweep.min, af.sweep.max);
  s.sweep = approach(s.sweep, sweepCmd, af.sweep.rate * dt);
  // Flaps blow back above their placard speed and are interlocked with the sweep (wings forward only).
  const flapLimit = clamp(1 - (eas - C.flapLimitEas) / 15, 0, 1) * (1 - smoothstep((s.sweep - 25) / 10));
  const manoeuvreFlap = mach < 0.8 && s.sweep < 50 ? clamp((alphaDeg - 8) / 10, 0, 0.5) : 0;
  s.flaps = approach(s.flaps, Math.min(Math.max(clamp(c.flaps, 0, 1), manoeuvreFlap), flapLimit), 0.5 * dt);
  const slatCmd = mach < 0.9 && s.sweep < 50 ? Math.max(s.flaps > 0.05 ? 1 : 0, clamp((alphaDeg - 8) / 4, 0, 1)) : 0;
  s.slats = approach(s.slats, slatCmd, 1.5 * dt);
  s.airbrake = approach(s.airbrake, c.airbrake ? 1 : 0, 1.2 * dt);
  const throttle = clamp(c.throttle, 0, 1);
  s.spool = follow(s.spool, throttle, dt, throttle > s.spool ? af.thrust.spoolUp : af.thrust.spoolDown);
  const thrust = thrustAt(af, s.spool, s.position.y);

  /* fly-by-wire pitch: stick commands load factor; centred, it holds the flight path (bank-compensated) */
  const gamma = Math.asin(clamp(s.dir.y, -1, 1));
  const bank = bankOf(s.dir, s.up);
  const cosG = Math.cos(gamma);
  const cosB = Math.cos(bank);
  const hold = lerp(cosG / Math.max(cosB, 0.26), cosG * cosB, smoothstep((Math.abs(bank) - 60 * D2R) / (15 * D2R)));
  const nNeutral = clamp(hold, C.gMin, C.gMax);
  const stick = clamp(c.pitch, -1, 1);
  const nCmd = stick >= 0 ? lerp(nNeutral, C.gMax, stick) : lerp(nNeutral, C.gMin, -stick);

  const cfg = { mach, sweep: s.sweep, flaps: s.flaps, slats: s.slats, airbrake: s.airbrake };
  const pre = aero(af, { ...cfg, alpha: s.alpha, spoilers: 0 });
  const clReq = (nCmd * W - thrust * Math.sin(s.alpha)) / qS;
  // α limiter: centred stick stays 1° below the stall; full aft stick may pull 3° past it.
  const alphaMax = pre.alphaStall + (-1 + 4 * smoothstep((stick - 0.6) / 0.4)) * D2R;
  const alphaMin = pre.alphaStallNeg + 1 * D2R;
  const alphaCmd = clamp((clReq - pre.cl0) / pre.clAlpha, alphaMin, alphaMax);
  // No tailplane: pitch authority comes from the vectoring nozzles, so it fades with thrust.
  const authority = clamp(thrust / af.thrust.mil + q / 30_000, 0.3, 1);
  const alphaErr = alphaCmd - s.alpha;
  s.alpha = follow(s.alpha, alphaCmd, dt, C.alphaTau / authority);

  /* roll: spoilers (locked out at high sweep) plus wingtip reaction-control thrusters */
  const lockout = 1 - smoothstep((s.sweep - (C.spoilerLockout - 5)) / 5);
  const rollStick = clamp(c.roll, -1, 1);
  const spoilerRate = C.rollSpoiler * clamp(q / 20_000, 0, 1) * lockout;
  s.rollRate = follow(s.rollRate, rollStick * (C.rollRcs + spoilerRate) * D2R, dt, 0.15);
  const spoilerL = lockout * Math.max(0, -rollStick);
  const spoilerR = lockout * Math.max(0, rollStick);

  /* rudder → sideslip */
  const yaw = clamp(c.yaw, -1, 1);
  s.beta = follow(s.beta, yaw * C.betaMax * D2R * clamp(q / 8000, 0.2, 1), dt, 0.5);

  /* forces */
  const co = aero(af, { ...cfg, alpha: s.alpha, spoilers: 0.5 * (spoilerL + spoilerR) });
  const lift = co.cl * qS;
  const drag = co.cd * qS;
  const side = 0.9 * qS * s.beta;
  const liftTotal = lift + thrust * Math.sin(s.alpha);
  const vdot = (thrust * Math.cos(s.alpha) - drag) / m - G0 * s.dir.y;

  _right.crossVectors(s.dir, s.up);
  _acc.copy(s.up).multiplyScalar(liftTotal / m).addScaledVector(_right, side / m);
  _acc.y -= G0;
  _acc.addScaledVector(s.dir, G0 * s.dir.y); // keep only gravity's component across the path
  s.dir.addScaledVector(_acc, dt / V).normalize();
  s.up.applyAxisAngle(s.dir, s.rollRate * dt);
  s.up.addScaledVector(s.dir, -s.up.dot(s.dir)).normalize();

  s.speed = Math.max(MIN_SPEED, s.speed + vdot * dt);
  s.position.addScaledVector(s.dir, s.speed * dt);
  if (s.position.y < FLOOR) {
    s.position.y = FLOOR;
    if (s.dir.y < 0) {
      s.dir.y = 0;
      s.dir.normalize();
      s.up.addScaledVector(s.dir, -s.up.dot(s.dir)).normalize();
    }
  }
  s.position.y = Math.min(s.position.y, CEILING);
  s.time += dt;

  /* outputs */
  const overboost = clamp((s.spool - 0.9) / 0.1, 0, 1);
  const bankNow = bankOf(s.dir, s.up);
  _fwd.copy(s.dir).multiplyScalar(Math.cos(s.alpha)).addScaledVector(s.up, Math.sin(s.alpha));
  const heading = ((headingOf(s.dir) / D2R) % 360 + 360) % 360;
  return {
    telemetry: {
      airspeed: s.speed,
      eas,
      mach: s.speed / atm.speedOfSound,
      altitude: s.position.y,
      vs: s.speed * s.dir.y,
      aoa: s.alpha / D2R,
      gLoad: liftTotal / W,
      sweep: s.sweep,
      pitch: Math.asin(clamp(_fwd.y, -1, 1)) / D2R,
      bank: bankNow / D2R,
      heading,
      stall: co.stalled,
      afterburner: overboost > 0.05,
      spool: s.spool,
      forces: { lift, weight: W, thrust, drag },
    },
    surfaces: {
      sweep: s.sweep,
      flaps: s.flaps,
      slats: s.slats,
      spoilerL,
      spoilerR,
      rudder: yaw * C.rudderMax,
      airbrake: s.airbrake,
      nozzlePitch: clamp((alphaErr / D2R) * 1.5 + co.cl * 4, -C.nozzleMax, C.nozzleMax),
      nozzleOpen: clamp(0.25 + 0.35 * s.spool + 0.45 * overboost, 0, 1),
      rcsL: rollStick,
      rcsR: -rollStick,
      spool: s.spool,
      overboost,
    },
  };
}

/**
 * Body attitude for rendering: nose along the velocity pitched up by α and
 * yawed by β. With `headingUp` the heading is removed, so the craft keeps
 * facing the same way on screen while the world turns beneath it.
 */
export function attitude(s: FlightState, target: THREE.Quaternion, headingUp = false): THREE.Quaternion {
  _fwd.copy(s.dir).multiplyScalar(Math.cos(s.alpha)).addScaledVector(s.up, Math.sin(s.alpha));
  _bodyUp.copy(s.up).multiplyScalar(Math.cos(s.alpha)).addScaledVector(s.dir, -Math.sin(s.alpha));
  _fwd.applyAxisAngle(_bodyUp, -s.beta);
  _left.crossVectors(_bodyUp, _fwd).normalize();
  _m.makeBasis(_left, _bodyUp, _fwd);
  target.setFromRotationMatrix(_m);
  if (headingUp) target.premultiply(_qh.setFromAxisAngle(Y, headingOf(s.dir)));
  return target;
}
