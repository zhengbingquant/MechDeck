import type { DofInfo } from '../../core/types';
import { D } from './dims';

type Axis = 'x' | 'y' | 'z';

/** One bone motion driven by a degree of freedom: value × scale, in degrees (rot) or metres (pos). */
export interface DofTarget {
  bone: string;
  /** 'kneeFlex': a knee bent about its rear pivot (Battroid). */
  kind: 'rot' | 'pos' | 'kneeFlex';
  axis: Axis;
  scale: number;
}

export interface DofDef extends DofInfo {
  targets: DofTarget[];
  /** Battroid drives these instead (a different mechanism for the same joint). */
  battroidTargets?: DofTarget[];
  /** 'foot': applied after the ankles are levelled on the ground (a tilt relative to level). */
  stage: 'body' | 'foot';
}

const BOTH = ['gerwalk', 'battroid'];
const rot = (bone: string, axis: Axis, scale = 1): DofTarget => ({ bone, kind: 'rot', axis, scale });

function dof(id: string, label: string, group: string, min: number, max: number, modes: string[], targets: DofTarget[], stage: 'body' | 'foot' = 'body'): DofDef {
  return { id, label, group, min, max, step: 1, unit: '°', modes, targets, stage };
}

/**
 * Posable degrees of freedom in GERWALK and Battroid ("joint control"). Each value is an offset
 * from the mode's keyframe pose about the joint's own axis (Euler, XYZ) or along its slide.
 * Starboard Y / Z rotations are mirrored, so one value moves both sides the same way ("out" is
 * outboard on either side). The ranges are the mechanisms' travel; the collision guard stops a
 * joint earlier wherever it would touch another part.
 */
export const DOFS: DofDef[] = (() => {
  const out: DofDef[] = [
    dof('head.yaw', 'Head turn', 'Head', -75, 75, ['battroid'], [rot('head', 'y')]),
    dof('head.pitch', 'Head nod', 'Head', -20, 25, ['battroid'], [rot('head', 'x')]),
    dof('laserL.fold', 'Left laser elevation', 'Head', -40, 25, ['battroid'], [rot('laserL', 'x')]),
    dof('laserR.fold', 'Right laser elevation', 'Head', -40, 25, ['battroid'], [rot('laserR', 'x')]),
  ];
  for (const [S, s, name] of [['L', 1, 'Left'], ['R', -1, 'Right']] as const) {
    const arm = `${name} arm`;
    out.push(
      dof(`shoulder${S}.rock`, 'Shoulder block rock', arm, -30, 30, BOTH, [rot(`shoulder${S}`, 'x')]),
      dof(`upperArm${S}.swing`, 'Shoulder swing (− forward)', arm, -150, 60, BOTH, [rot(`upperArm${S}`, 'x')]),
      dof(`upperArm${S}.raise`, 'Arm raise (+ out)', arm, -40, 95, BOTH, [rot(`upperArm${S}`, 'z', s)]),
      dof(`upperArm${S}.twist`, 'Upper-arm twist', arm, -90, 90, BOTH, [rot(`upperArm${S}`, 'y', s)]),
      dof(`elbow${S}.bend`, 'Elbow (− bend)', arm, -130, 30, BOTH, [rot(`elbow${S}`, 'x')]),
      dof(`wrist${S}.twist`, 'Wrist twist', arm, -90, 90, BOTH, [rot(`wrist${S}`, 'y', s)]),
      dof(`wrist${S}.bend`, 'Wrist bend', arm, -45, 45, BOTH, [rot(`wrist${S}`, 'x')]),
    );
    const leg = `${name} leg`;
    out.push(
      dof(`thighSwing${S}.swing`, 'Hip swing (− forward)', leg, -75, 40, BOTH, [rot(`thighSwing${S}`, 'x')]),
      // In Battroid the intake box stands beside its rail, so the leg spreads and twists at the
      // thigh joint under it (in GERWALK the whole leg turns at the hip carriage).
      { ...dof(`hip${S}.spread`, 'Hip spread (+ out)', leg, -10, 35, BOTH, [rot(`hip${S}`, 'z', s)]), battroidTargets: [rot(`thighSwing${S}`, 'z', s)] },
      { ...dof(`hip${S}.twist`, 'Hip twist', leg, -30, 30, BOTH, [rot(`hip${S}`, 'y', s)]), battroidTargets: [rot(`thighSwing${S}`, 'y', s)] },
      // GERWALK swings the shin on the knee's front hinge; Battroid bends it back on the rear pivot.
      { ...dof(`knee${S}.bend`, 'Knee (+ flex back)', leg, -40, 95, BOTH, [rot(`knee${S}`, 'x')]), battroidTargets: [{ bone: `knee${S}`, kind: 'kneeFlex', axis: 'x', scale: 1 }] },
      dof(`ankle${S}.pitch`, 'Ankle pitch', leg, -35, 35, BOTH, [rot(`ankle${S}`, 'x')], 'foot'),
      dof(`ankle${S}.roll`, 'Ankle roll (+ out)', leg, -20, 20, BOTH, [rot(`ankle${S}`, 'z', s)], 'foot'),
      dof(`toe${S}.flap`, 'Toe flap (+ up)', leg, -10, 60, BOTH, [rot(`toe${S}`, 'x')]),
      dof(`heel${S}.flap`, 'Heel flap (+ up)', leg, -10, 60, BOTH, [rot(`heel${S}`, 'x', -1)]),
    );
    // GERWALK keeps the wings spread for lift: 20° as keyframed, up to the 72° high-speed sweep.
    out.push(dof(`wing${S}.sweep`, `${name} wing sweep (+ aft)`, 'Wings', 0, 52, ['gerwalk'], [rot(`wing${S}`, 'z', -s)]));
  }
  const sh = D.nose.shield;
  out.push({
    id: 'canopyShield.open',
    label: 'Canopy shield open',
    group: 'Cockpit',
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    modes: ['battroid'],
    stage: 'body',
    targets: [
      { bone: 'shieldA', kind: 'pos', axis: 'y', scale: sh.stowA / 100 },
      { bone: 'shieldB', kind: 'pos', axis: 'y', scale: sh.stowB / 100 },
    ],
  });
  return out;
})();

export const DOF_BY_ID: Record<string, DofDef> = Object.fromEntries(DOFS.map((d) => [d.id, d]));

/** The UI's view of the table (no rig internals). */
export const DOF_INFO: DofInfo[] = DOFS.map(({ id, label, group, min, max, step, unit, modes }) => ({ id, label, group, min, max, step, unit, modes }));
