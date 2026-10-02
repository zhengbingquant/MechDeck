import type { DrivePose } from '../../core/types';
import { runFraction, type DriveParams, type DriveState } from '../../core/drive/locomotion';

export type PilotMode = 'gerwalk' | 'battroid';

/**
 * Pilot-mode handling (Macross Compendium performance figures): the Battroid
 * walks and runs up to 160 km/h and jumps on its leg and backpack verniers;
 * the GERWALK walks, and skims on its foot jets "like a hovercraft".
 */
export const PILOT_PARAMS: Record<PilotMode, DriveParams> = {
  battroid: {
    walkSpeed: 5,
    runSpeed: 44, // 160 km/h
    backSpeed: 2.5,
    accel: 9,
    decel: 14,
    turnRate: (60 * Math.PI) / 180,
    strideWalk: 5.8,
    strideRun: 26,
    jump: { speed: 11, gravity: 9.81 },
  },
  gerwalk: {
    walkSpeed: 4,
    runSpeed: 8,
    backSpeed: 2,
    accel: 7,
    decel: 9,
    turnRate: (45 * Math.PI) / 180,
    strideWalk: 5,
    strideRun: 7,
    hover: { height: 1.1, speed: 28, rise: 1.2 }, // 100 km/h skimming
  },
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const TAU = Math.PI * 2;
const R2D = 180 / Math.PI;
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
type R = [number, number, number];

/**
 * Battroid: the thigh-swing pivot is this far above the ankles. The planted boot stays level, so it
 * moves with its ankle: this is the stance leg's lever.
 */
const LEG = 5.4;
/** Widest stance sweep of the thigh (peak to peak): the level boot clears the shin within ~±17°. */
const MAX_SWEEP = (34 * Math.PI) / 180;

/**
 * Battroid stride timing for the current speed. Each leg is on the ground for `duty` of the cycle
 * and sweeps back through `sweep` (degrees) meanwhile, just as far as the body travels, so the
 * planted foot stays put: walking it is down 62 % of the time (both feet down between steps);
 * faster, the stance shortens until, running, both feet are off the ground between steps.
 */
export function gaitTiming(s: DriveState, p: DriveParams) {
  const v = Math.hypot(s.forward, s.side);
  const rf = runFraction(s, p);
  const stride = p.strideWalk + (p.strideRun - p.strideWalk) * rf;
  const duty = clamp((MAX_SWEEP * LEG) / stride, 0.12, 0.62);
  const sweep = ((duty * stride) / LEG) * R2D;
  return { v, rf, stride, duty, sweep };
}

/**
 * Joint offsets for the current drive state. Conventions (degrees, added to the
 * keyframe Euler X): hip − swings the leg forward (Battroid); knee + flexes the
 * shin back; upper arm − swings the arm forward.
 */
export function drivePose(mode: PilotMode, s: DriveState, p: DriveParams): DrivePose {
  const joints: Record<string, R> = {};
  const add = (bone: string, x: number, y = 0, z = 0) => {
    const r = joints[bone] ?? [0, 0, 0];
    joints[bone] = [r[0] + x, r[1] + y, r[2] + z];
  };
  const v = Math.hypot(s.forward, s.side);
  const dir = s.forward < -0.05 ? -1 : 1;
  const act = clamp(v / p.walkSpeed, 0, 1); // 0 at rest … 1 at walking pace and above
  const rf = runFraction(s, p);
  const sn = Math.sin(TAU * s.phase);
  const cs = Math.cos(TAU * s.phase);

  if (mode === 'battroid') {
    // Each leg: stance (heel strike → toe-off) sweeps the thigh back at the body's speed, rolling
    // the foot heel to toe; swing folds the knee about its rear pivot to lift the foot clear,
    // straightens it again and reaches forward for the next heel strike. The right leg runs half
    // a cycle behind the left. Running, the stance shortens and both feet leave the ground
    // between steps (a ballistic hop as long as the cadence allows).
    const { duty, sweep, stride } = gaitTiming(s, p);
    const flex: Record<string, number> = {};
    const feet: Record<string, number> = {};
    const norm: Record<string, number> = {};
    for (const [S, offset] of [['L', 0], ['R', 0.5]] as const) {
      const q = (((s.phase + offset) % 1) + 1) % 1;
      let hip: number;
      let knee: number;
      let ankle: number;
      if (q < duty) {
        const u = q / duty;
        hip = u - 0.5; // −½ (leg forward, heel strike) … +½ (leg back, toe-off)
        knee = 8 * Math.sin(Math.PI * clamp(u / 0.4, 0, 1)); // loading response
        ankle = -8 * (1 - smooth(u / 0.3)) + 14 * smooth((u - 0.55) / 0.45);
      } else {
        const u = (q - duty) / (1 - duty);
        // The thigh drives forward early (while the knee is folded), running further forward
        // (a knee drive: only the planted boot must stay level, the swinging one follows its shin).
        hip = 0.5 - smooth(u / 0.7) - ((18 * rf) / Math.max(1, sweep)) * Math.sin(Math.PI * u);
        knee = (45 + 45 * rf) * Math.sin(Math.PI * clamp(u / 0.72, 0, 1)); // fold, then reach
        ankle = 14 - 22 * smooth(u);
      }
      norm[S] = clamp(2 * hip * dir, -1, 1);
      add(`thighSwing${S}`, sweep * hip * dir * act);
      flex[`knee${S}`] = knee * act;
      feet[`ankle${S}`] = ankle * dir * act;
    }
    // Arms swing with the opposite leg (the left arm forward as the right leg reaches forward; the
    // gun arm less), elbows bending as the pace rises.
    const armAmp = (12 + 10 * rf) * act;
    add('upperArmL', armAmp * norm.R);
    add('upperArmR', 0.35 * armAmp * norm.L);
    add('elbowL', -(6 + 50 * rf) * act);
    add('elbowR', -12 * rf * act);
    // Airborne between running steps: a hop timed by the cadence (g t² / 8 for flight time t).
    let lift = 0;
    const q2 = s.phase % 0.5;
    if (duty < 0.5 && q2 >= duty && s.grounded) {
      const flight = ((0.5 - duty) * stride) / Math.max(1e-6, Math.hypot(s.forward, s.side));
      lift = ((9.81 * flight * flight) / 8) * Math.sin((Math.PI * (q2 - duty)) / (0.5 - duty));
    }
    // The pelvis turns with the legs: the side whose leg is forward leads.
    const pose = { flex, feet, yaw: (1.5 + rf) * act * norm.L, lift };
    // Airborne: thighs forward, knees tucked; landing: a crouch that fades.
    if (!s.grounded) {
      const rising = clamp(s.vy / 6, 0, 1);
      for (const S of ['L', 'R']) {
        add(`thighSwing${S}`, -12);
        add(`knee${S}`, 16);
      }
      add('upperArmL', -10);
      return { joints, lean: 4 + 4 * rf, hover: 0, exhaust: { spool: 0.55 + 0.35 * rising, overboost: 0.6 * rising } };
    }
    if (s.landing > 0) {
      for (const S of ['L', 'R']) {
        add(`thighSwing${S}`, -12 * s.landing);
        add(`knee${S}`, 17 * s.landing);
      }
    }
    const lean = (2 * act + 6 * rf) * dir + 3 * s.landing;
    return { joints, lean, hover: 0, exhaust: null, ...pose };
  }

  // GERWALK: shins stride under the level thighs at walking pace; skimming, they trail on the jets.
  const h = s.hover;
  const stride = 14 * act * (1 - h) * dir;
  add('kneeL', -stride * sn);
  add('kneeR', stride * sn);
  const lift = 6 * act * (1 - h);
  add('hipL', lift * Math.max(0, cs));
  add('hipR', lift * Math.max(0, -cs));
  add('kneeL', 26 * h);
  add('kneeR', 26 * h);
  // Skimming, the toe and heel close in (from 80° to 35°) into the nozzle's divergent flaps.
  for (const S of ['L', 'R']) {
    add(`toe${S}`, 45 * h);
    add(`heel${S}`, -45 * h);
  }
  const lean = h * (2 + 6 * rf) * dir;
  const exhaust = h > 0.01 ? { spool: 0.45 + 0.4 * h + 0.15 * rf, overboost: 0.7 * rf * h } : null;
  return { joints, lean, hover: h, exhaust };
}
