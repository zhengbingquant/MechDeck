import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createMecha } from './build';
import { MechaController } from './controller';
import { CollisionWorld } from '../../core/collisions';
import { VF1J_COLLISION_RULES } from './collisionRules';
import { DOFS } from './dofs';

const MODE_T: Record<string, number> = { gerwalk: 0.5, battroid: 1 };

describe('joint control (GERWALK / Battroid degrees of freedom)', () => {
  it('lists every limb joint for both modes, with the head, lasers and canopy shield in Battroid', () => {
    const ids = new Set(DOFS.map((d) => d.id));
    expect(ids.size).toBe(DOFS.length);
    for (const S of ['L', 'R']) {
      for (const j of ['shoulder.rock', 'upperArm.swing', 'upperArm.raise', 'upperArm.twist', 'elbow.bend', 'wrist.twist', 'wrist.bend',
        'thighSwing.swing', 'hip.spread', 'hip.twist', 'knee.bend', 'ankle.pitch', 'ankle.roll', 'toe.flap', 'heel.flap']) {
        const d = DOFS.find((x) => x.id === `${j.split('.')[0]}${S}.${j.split('.')[1]}`);
        expect(d, `${j} ${S}`).toBeDefined();
        expect(d!.modes).toEqual(expect.arrayContaining(['gerwalk', 'battroid']));
      }
    }
    for (const id of ['head.yaw', 'head.pitch', 'laserL.fold', 'laserR.fold', 'canopyShield.open']) {
      expect(DOFS.find((d) => d.id === id)?.modes, id).toContain('battroid');
    }
    for (const S of ['L', 'R']) expect(DOFS.find((d) => d.id === `wing${S}.sweep`)?.modes).toContain('gerwalk');
    for (const d of DOFS) {
      expect(d.min, d.id).toBeLessThanOrEqual(0);
      expect(d.max, d.id).toBeGreaterThanOrEqual(0);
      expect(d.max - d.min, d.id).toBeGreaterThan(0);
    }
  });

  it('moves the joint by the offset when the way is clear, and back exactly on reset', () => {
    const mecha = createMecha();
    const ctl = new MechaController(mecha);
    const fresh = new MechaController(createMecha());
    ctl.setProgress(1);
    fresh.setProgress(1);
    const before = mecha.bones.elbowL.rotation.x;
    const r = ctl.setDof('elbowL.bend', -20);
    expect(r.value).toBeCloseTo(-20, 6);
    expect(r.blockedBy).toBeUndefined();
    expect(THREE.MathUtils.radToDeg(mecha.bones.elbowL.rotation.x - before)).toBeCloseTo(-20, 4);
    // The GU-11 stays in the right fist when the right arm moves.
    const grip = () => ctl.markerWorld('gunStock').distanceTo(ctl.markerWorld('handR'));
    const g0 = grip();
    ctl.setDof('upperArmR.swing', -15);
    expect(Math.abs(grip() - g0)).toBeLessThan(1e-3);
    ctl.resetDofs();
    for (const id of fresh.markerIds()) expect(ctl.markerWorld(id).distanceTo(fresh.markerWorld(id)), id).toBeLessThan(1e-6);
  });

  it('stops every joint at first contact: no degree of freedom can drive one part through another', () => {
    const mecha = createMecha();
    const ctl = new MechaController(mecha);
    const world = new CollisionWorld(mecha, VF1J_COLLISION_RULES, true);
    let blocked = 0;
    for (const d of DOFS) {
      for (const mode of d.modes) {
        ctl.setProgress(MODE_T[mode]);
        for (const end of [d.min, d.max]) {
          ctl.resetDofs();
          const r = ctl.setDof(d.id, end);
          if (r.blockedBy) blocked++;
          expect(world.check().map((c) => `${c.a} ⟷ ${c.b}`), `${d.id} → ${end} in ${mode}`).toEqual([]);
          if (!r.blockedBy) expect(r.value, `${d.id} → ${end} in ${mode}`).toBeCloseTo(end, 6);
        }
      }
    }
    ctl.resetDofs();
    // The limits are real: some joints do run into their neighbours before the end of their range.
    expect(blocked).toBeGreaterThan(3);
  }, 240_000);

  it('reports what stopped a blocked joint', () => {
    const mecha = createMecha();
    const ctl = new MechaController(mecha);
    ctl.setProgress(1);
    // The left arm swung inboard runs into the chest.
    const r = ctl.setDof('upperArmL.raise', -40);
    expect(r.blockedBy).toBeDefined();
    expect(r.value).toBeGreaterThan(-40);
    expect(r.blockedBy!.join(' ')).toMatch(/port|chest|fuselage|shoulder/);
  });
});
