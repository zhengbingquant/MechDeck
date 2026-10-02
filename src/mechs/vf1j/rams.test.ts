import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { initialDrive, type DriveState } from '../../core/drive/locomotion';
import type { FlightSurfaces } from '../../core/types';
import { createMecha } from './build';
import { MechaController } from './controller';
import { drivePose, PILOT_PARAMS, type PilotMode } from './gait';
import { DOFS } from './dofs';

/** Nested tubes keep at least this share of a tube's length inside the next (the seals engaged). */
const ENGAGE = 0.15;
const state = (patch: Partial<DriveState>): DriveState => ({ ...initialDrive(), ...patch });
const PROGRESS: Record<PilotMode, number> = { gerwalk: 0.5, battroid: 1 };
const surfaces = (sweep: number, airbrake: number): FlightSurfaces => ({
  sweep, flaps: 0, slats: 0, spoilerL: 0, spoilerR: 0, rudder: 0, airbrake,
  nozzlePitch: 0, nozzleOpen: 0.25, rcsL: 0, rcsR: 0, spool: 0.5, overboost: 0,
});

describe('rams and links', () => {
  it('keeps every ram engaged and every link rigid: through the transformation, the gaits, the flight controls and every joint range', () => {
    const mecha = createMecha();
    const ctl = new MechaController(mecha);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const bad = new Map<string, string>();
    const check = (label: string) => {
      mecha.root.updateMatrixWorld(true);
      for (const p of mecha.pistons) {
        const d = p.a.getWorldPosition(a).distanceTo(p.b.getWorldPosition(b));
        const L = p.length;
        let why = '';
        if (p.rigid) {
          if (Math.abs(d - L) > 0.02) why = `link stretched to ${d.toFixed(3)} m (length ${L} m)`;
        } else {
          // Barrel, intermediate tubes and rod, each L long, share the extension evenly.
          const gaps = p.stages.length + 1;
          const max = L + (1 - ENGAGE) * L * gaps;
          if (d > max) why = `pulled apart: ${d.toFixed(3)} m > ${max.toFixed(3)} m`;
          else if (d < L - 0.01) why = `rod through its barrel: ${d.toFixed(3)} m < ${L} m`;
        }
        if (why && !bad.has(p.partId)) bad.set(p.partId, `${p.partId} ${label}: ${why}`);
      }
    };
    for (let i = 0; i <= 200; i++) {
      ctl.setProgress(i / 200);
      check(`@${(i / 2).toFixed(1)}%`);
    }
    for (let i = 0; i < 12; i++) {
      const phase = i / 12;
      for (const [mode, s] of [
        ['battroid', state({ forward: PILOT_PARAMS.battroid.walkSpeed, phase })],
        ['battroid', state({ forward: PILOT_PARAMS.battroid.runSpeed, phase })],
        ['gerwalk', state({ forward: PILOT_PARAMS.gerwalk.walkSpeed, phase })],
      ] as [PilotMode, DriveState][]) {
        ctl.setProgress(PROGRESS[mode]);
        ctl.setDrive(drivePose(mode, s, PILOT_PARAMS[mode]));
        check(`${mode} stride ${phase.toFixed(2)}`);
      }
    }
    ctl.setDrive(null);
    ctl.setProgress(0);
    for (const sweep of [20, 45, 72]) {
      ctl.setFlightSurfaces(surfaces(sweep, 1));
      check(`flight sweep ${sweep}`);
    }
    ctl.setFlightSurfaces(null);
    for (const d of DOFS) {
      for (const mode of d.modes) {
        ctl.setProgress(PROGRESS[mode as PilotMode]);
        for (const end of [d.min, d.max]) {
          ctl.resetDofs();
          ctl.setDof(d.id, end);
          check(`${d.id} ${end} (${mode})`);
        }
      }
    }
    ctl.resetDofs();
    expect([...bad.values()]).toEqual([]);
  }, 240_000);
});
