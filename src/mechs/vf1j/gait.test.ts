import { describe, it, expect } from 'vitest';
import { initialDrive, type DriveState } from '../../core/drive/locomotion';
import { drivePose, gaitTiming, PILOT_PARAMS } from './gait';

const B = PILOT_PARAMS.battroid;
const G = PILOT_PARAMS.gerwalk;
const at = (patch: Partial<DriveState>): DriveState => ({ ...initialDrive(), ...patch });
const x = (pose: ReturnType<typeof drivePose>, bone: string) => pose.joints[bone]?.[0] ?? 0;
const flex = (pose: ReturnType<typeof drivePose>, bone: string) => pose.flex?.[bone] ?? 0;

describe('Battroid gait', () => {
  it('leaves the keyframe pose untouched when standing still', () => {
    const pose = drivePose('battroid', at({}), B);
    for (const [bone, r] of Object.entries(pose.joints)) for (const v of r) expect(Math.abs(v), bone).toBeLessThan(1e-9);
    expect(pose.lean).toBe(0);
    expect(pose.hover).toBe(0);
    expect(pose.exhaust).toBeNull();
  });

  it('steps the legs half a cycle apart: stance sweeps the leg back, swing brings it forward', () => {
    const { duty } = gaitTiming(at({ forward: B.walkSpeed }), B);
    // Walking: each foot is down well over half the cycle (double support between steps).
    expect(duty).toBeGreaterThan(0.55);
    for (const phase of [0.05, 0.3, 0.55, 0.8]) {
      const now = drivePose('battroid', at({ forward: B.walkSpeed, phase }), B);
      const later = drivePose('battroid', at({ forward: B.walkSpeed, phase: (phase + 0.5) % 1 }), B);
      expect(x(now, 'thighSwingR')).toBeCloseTo(x(later, 'thighSwingL'), 6);
    }
    // Left heel-strike (phase 0): leg forward (negative pitch); toe-off (phase = duty): leg back.
    const strike = drivePose('battroid', at({ forward: B.walkSpeed, phase: 0 }), B);
    const toeOff = drivePose('battroid', at({ forward: B.walkSpeed, phase: duty - 1e-6 }), B);
    expect(x(strike, 'thighSwingL')).toBeLessThan(-8);
    expect(x(toeOff, 'thighSwingL')).toBeGreaterThan(8);
    // The level boot only clears the shin within ~19° of ankle bend.
    for (const pose of [strike, toeOff]) expect(Math.abs(x(pose, 'thighSwingL'))).toBeLessThanOrEqual(18);
    // The intake boxes flanking the waist do not swing.
    expect(strike.joints.hipL).toBeUndefined();
  });

  it('folds the swinging leg at the knee (about its rear pivot) while the stance knee stays nearly straight', () => {
    const { duty } = gaitTiming(at({ forward: B.walkSpeed }), B);
    // Early swing of the left leg, the right leg in stance.
    const pose = drivePose('battroid', at({ forward: B.walkSpeed, phase: duty + (1 - duty) * 0.35 }), B);
    expect(flex(pose, 'kneeL')).toBeGreaterThan(30);
    expect(flex(pose, 'kneeR')).toBeLessThan(12);
    // …and straightens it again before the heel strikes.
    const late = drivePose('battroid', at({ forward: B.walkSpeed, phase: 0.999 }), B);
    expect(flex(late, 'kneeL')).toBeLessThan(5);
  });

  it('rolls the foot from heel to toe through the stance', () => {
    const { duty } = gaitTiming(at({ forward: B.walkSpeed }), B);
    const strike = drivePose('battroid', at({ forward: B.walkSpeed, phase: 0.001 }), B);
    const toeOff = drivePose('battroid', at({ forward: B.walkSpeed, phase: duty - 0.001 }), B);
    // Ankle pitch after levelling: − lifts the toe (heel strike), + lifts the heel (toe-off).
    expect(strike.feet!.ankleL).toBeLessThan(-4);
    expect(toeOff.feet!.ankleL).toBeGreaterThan(8);
  });

  it('runs with an airborne phase between steps, the planted leg sweeping no wider than walking', () => {
    const run = at({ forward: B.runSpeed });
    const { duty } = gaitTiming(run, B);
    expect(duty).toBeLessThan(0.3);
    const flight = drivePose('battroid', { ...run, phase: (duty + 0.5) / 2 }, B);
    // A real hop, as high as the flight time allows (g t² / 8: a few centimetres at a sprint).
    expect(flight.lift).toBeGreaterThan(0.03);
    const stance = drivePose('battroid', { ...run, phase: duty / 2 }, B);
    expect(stance.lift ?? 0).toBeLessThan(1e-9);
    // The planted boot stays level, so the stance leg keeps inside the ankle's clearance; the
    // swinging leg drives further forward.
    for (let i = 0; i < 20; i++) {
      const phase = (duty * i) / 20;
      const pose = drivePose('battroid', { ...run, phase }, B);
      expect(Math.abs(x(pose, 'thighSwingL'))).toBeLessThanOrEqual(18);
    }
    const drive = drivePose('battroid', { ...run, phase: duty + (1 - duty) * 0.5 }, B);
    expect(x(drive, 'thighSwingL')).toBeLessThan(-20);
  });

  it('counter-swings the arms: the left arm goes back as the left leg goes forward', () => {
    // Left heel strike: the left leg is forward.
    const pose = drivePose('battroid', at({ forward: B.walkSpeed, phase: 0 }), B);
    expect(x(pose, 'thighSwingL')).toBeLessThan(0);
    expect(x(pose, 'upperArmL')).toBeGreaterThan(0);
    // The gun arm swings less.
    expect(Math.abs(x(pose, 'upperArmR'))).toBeLessThan(Math.abs(x(pose, 'upperArmL')));
  });

  it('leans into a run more than a walk, and strides the other way walking backward', () => {
    const walk = drivePose('battroid', at({ forward: B.walkSpeed, phase: 0.25 }), B);
    const run = drivePose('battroid', at({ forward: B.runSpeed, phase: 0.25 }), B);
    expect(run.lean).toBeGreaterThan(walk.lean + 3);
    expect(Math.abs(x(run, 'thighSwingL'))).toBeGreaterThan(Math.abs(x(walk, 'thighSwingL')));
    const back = drivePose('battroid', at({ forward: -B.backSpeed, phase: 0.25 }), B);
    expect(Math.sign(x(back, 'thighSwingL'))).toBe(-Math.sign(x(walk, 'thighSwingL')));
  });

  it('tucks both knees in the air, fires the jets on the way up, and crouches on landing', () => {
    const air = drivePose('battroid', at({ grounded: false, y: 2, vy: 4 }), B);
    expect(x(air, 'kneeL')).toBeGreaterThan(10);
    expect(x(air, 'kneeR')).toBeGreaterThan(10);
    expect(air.exhaust).not.toBeNull();
    const land = drivePose('battroid', at({ landing: 1 }), B);
    expect(x(land, 'kneeL')).toBeGreaterThan(10);
    expect(x(land, 'thighSwingL')).toBeLessThan(-5);
  });
});

describe('GERWALK gait', () => {
  it('strides the hanging shins at walking pace without lifting off', () => {
    const pose = drivePose('gerwalk', at({ forward: G.walkSpeed, phase: 0.25 }), G);
    expect(x(pose, 'kneeL') + x(pose, 'kneeR')).toBeCloseTo(0, 6);
    expect(Math.abs(x(pose, 'kneeL'))).toBeGreaterThan(5);
    expect(pose.hover).toBe(0);
    expect(pose.exhaust).toBeNull();
  });

  it('hover-skims on the foot jets: legs trail, nozzles down, exhaust lit, nose down', () => {
    const pose = drivePose('gerwalk', at({ forward: G.hover!.speed, hover: 1, y: G.hover!.height, grounded: false }), G);
    expect(pose.hover).toBe(1);
    expect(x(pose, 'kneeL')).toBeGreaterThan(10);
    expect(x(pose, 'kneeR')).toBeGreaterThan(10);
    expect(pose.exhaust!.spool).toBeGreaterThan(0.6);
    expect(pose.lean).toBeGreaterThan(0);
  });
});
