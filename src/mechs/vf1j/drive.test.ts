import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { initialDrive, type DriveState } from '../../core/drive/locomotion';
import { findCollisions } from '../../core/collisions';
import { createMecha } from './build';
import { MechaController } from './controller';
import { VF1J_COLLISION_RULES } from './collisionRules';
import { drivePose, gaitTiming, PILOT_PARAMS, type PilotMode } from './gait';

const B = PILOT_PARAMS.battroid;
const G = PILOT_PARAMS.gerwalk;
const state = (patch: Partial<DriveState>): DriveState => ({ ...initialDrive(), ...patch });
const PROGRESS: Record<PilotMode, number> = { gerwalk: 0.5, battroid: 1 };

describe('driving the rig', () => {
  const low = (ctl: MechaController, S: string) => Math.min(...['toeIn', 'toeOut', 'heelIn', 'heelOut'].map((c) => ctl.markerWorld(`sole${S}_${c}`).y));
  const soleZ = (ctl: MechaController, S: string) => ['toeIn', 'toeOut', 'heelIn', 'heelOut'].reduce((z, c) => z + ctl.markerWorld(`sole${S}_${c}`).z, 0) / 4;

  it('lifts the swinging foot clear mid-stride while the stance foot stays planted (Battroid)', () => {
    const ctl = new MechaController(createMecha());
    ctl.setProgress(1);
    const { duty } = gaitTiming(state({ forward: B.walkSpeed }), B);
    ctl.setDrive(drivePose('battroid', state({ forward: B.walkSpeed, phase: duty + (1 - duty) * 0.4 }), B));
    expect(low(ctl, 'R')).toBeLessThan(0.02);
    expect(low(ctl, 'L')).toBeGreaterThan(0.3);
  });

  it('keeps the stance foot still on the ground while the body walks over it (no skating)', () => {
    const ctl = new MechaController(createMecha());
    ctl.setProgress(1);
    const walk = state({ forward: B.walkSpeed });
    const { duty, stride } = gaitTiming(walk, B);
    // Mid-stance of the right foot: over a small slice of the cycle the body (the rig's own frame,
    // carried forward by its parent) covers dq·stride, so the planted foot must move back as far.
    const q = 0.5 + duty / 2;
    const dq = 0.04;
    ctl.setDrive(drivePose('battroid', { ...walk, phase: q - dq / 2 }, B));
    const z0 = soleZ(ctl, 'R');
    expect(low(ctl, 'R')).toBeLessThan(0.02);
    ctl.setDrive(drivePose('battroid', { ...walk, phase: q + dq / 2 }, B));
    const z1 = soleZ(ctl, 'R');
    expect(low(ctl, 'R')).toBeLessThan(0.02);
    expect((z0 - z1) / (dq * stride)).toBeGreaterThan(0.85);
    expect((z0 - z1) / (dq * stride)).toBeLessThan(1.15);
  });

  it('runs with both feet off the ground between steps', () => {
    const ctl = new MechaController(createMecha());
    ctl.setProgress(1);
    const run = state({ forward: B.runSpeed });
    const { duty } = gaitTiming(run, B);
    ctl.setDrive(drivePose('battroid', { ...run, phase: (duty + 0.5) / 2 }, B));
    expect(low(ctl, 'L')).toBeGreaterThan(0.03);
    expect(low(ctl, 'R')).toBeGreaterThan(0.03);
  });

  it('hovers on the foot jets: nozzles trailing down, toe and heel closed in as divergent flaps', () => {
    const mecha = createMecha();
    const ctl = new MechaController(mecha);
    ctl.setProgress(0.5);
    ctl.setDrive(drivePose('gerwalk', state({ forward: G.hover!.speed, hover: 1, y: G.hover!.height, grounded: false }), G));
    const down = new THREE.Vector3();
    for (const S of ['L', 'R']) {
      const axis = ctl.markerWorld(`nozzle${S}`).sub(ctl.markerWorld(`ankle${S}`)).normalize();
      expect(axis.y, `nozzle axis ${S}`).toBeLessThan(-0.6);
      // The plume leaves along the nozzle axis.
      const plume = mecha.bones[`foot${S}`].getObjectByName(`fx:plume${S}`)!;
      plume.getWorldDirection(down);
      down.set(0, -1, 0).transformDirection(plume.matrixWorld);
      expect(down.dot(axis), `plume along the axis ${S}`).toBeGreaterThan(0.95);
      // Flaps part-closed from flat (±90°) toward the nozzle shape.
      expect(Math.abs(THREE.MathUtils.radToDeg(mecha.bones[`toe${S}`].rotation.x)), `toe ${S}`).toBeLessThan(60);
      expect(Math.abs(THREE.MathUtils.radToDeg(mecha.bones[`heel${S}`].rotation.x)), `heel ${S}`).toBeLessThan(60);
    }
  });

  it('plants the feet in its own frame, so a parent group can carry the mech across the floor', () => {
    const alone = new MechaController(createMecha());
    const carried = new MechaController(createMecha());
    const carrier = new THREE.Group();
    carrier.position.set(12, 1.1, -30);
    carrier.rotation.y = 0.6;
    carrier.add(carried.root);
    carrier.updateMatrixWorld(true);
    for (const t of [0.5, 1]) {
      alone.setProgress(t);
      carried.setProgress(t);
      for (const id of ['torsoBase', 'headTop', 'soleL_toeIn']) {
        const expected = alone.markerWorld(id).applyMatrix4(carrier.matrixWorld);
        expect(carried.markerWorld(id).distanceTo(expected), `${id} @${t}`).toBeLessThan(1e-6);
      }
    }
  });

  it('returns exactly to the keyframe pose when the drive is cleared', () => {
    const fresh = new MechaController(createMecha());
    const used = new MechaController(createMecha());
    for (const [mode, t] of Object.entries(PROGRESS) as [PilotMode, number][]) {
      fresh.setProgress(t);
      used.setProgress(t);
      used.setDrive(drivePose(mode, state({ forward: 20, phase: 0.3, landing: 0.5 }), PILOT_PARAMS[mode]));
      used.setDrive(null);
      for (const id of fresh.markerIds()) expect(used.markerWorld(id).distanceTo(fresh.markerWorld(id)), `${id} @${mode}`).toBeLessThan(1e-6);
    }
  });

  it('keeps every body clear of the others through walking, running, jumping and hovering strides', () => {
    const mecha = createMecha();
    const ctl = new MechaController(mecha);
    const cases: [PilotMode, DriveState][] = [];
    for (let i = 0; i < 12; i++) {
      const phase = i / 12;
      cases.push(['battroid', state({ forward: B.walkSpeed, phase })]);
      cases.push(['battroid', state({ forward: B.runSpeed, phase })]);
      cases.push(['battroid', state({ forward: -B.backSpeed, phase })]);
      cases.push(['gerwalk', state({ forward: G.walkSpeed, phase })]);
    }
    cases.push(['battroid', state({ grounded: false, y: 3, vy: 6 })]);
    cases.push(['battroid', state({ grounded: false, y: 3, vy: -6 })]);
    cases.push(['battroid', state({ landing: 1 })]);
    cases.push(['gerwalk', state({ forward: G.hover!.speed, hover: 1, y: G.hover!.height, grounded: false })]);
    for (const hover of [0.25, 0.5, 0.75]) cases.push(['gerwalk', state({ forward: G.walkSpeed, hover, y: G.hover!.height * hover, grounded: false })]);
    const subject = {
      ...mecha,
      setProgress: (i: number) => {
        const [mode, s] = cases[i];
        ctl.setProgress(PROGRESS[mode]);
        ctl.setDrive(drivePose(mode, s, PILOT_PARAMS[mode]));
      },
    };
    const hits = findCollisions(subject, cases.map((_, i) => i), VF1J_COLLISION_RULES, true);
    const report = hits.map((h) => `${h.a} [${h.boneA}] ⟷ ${h.b} [${h.boneB}] in ${h.at.map((i) => `${cases[i][0]} #${i}`).join(', ')}`);
    expect(report).toEqual([]);
  }, 120_000);
});
