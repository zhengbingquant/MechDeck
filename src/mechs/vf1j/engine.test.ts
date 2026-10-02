import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createMecha, type Mecha } from './build';
import { MechaController } from './controller';
import { airPath } from './airpath';
import type { DrivePose, FlightSurfaces } from '../../core/types';

let mecha: Mecha;
let ctl: MechaController;
let ducts: THREE.Mesh[];

beforeAll(() => {
  mecha = createMecha();
  ctl = new MechaController(mecha);
  // Raycast both faces of the duct walls (the real materials render one side).
  const both = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  ducts = mecha.internal.filter((m) => /^(intake-duct|duct-bellows)-/.test(m.userData.partId as string));
  for (const m of ducts) m.material = both;
});

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

/** Enclosed by a duct: rays from 0.8 m outside, square to the flow, all meet a duct wall before the point. */
function enclosed(p: THREE.Vector3, along: THREE.Vector3): boolean {
  const u0 = new THREE.Vector3().crossVectors(along, Math.abs(along.x) < 0.9 ? X : Y).normalize();
  const v0 = new THREE.Vector3().crossVectors(along, u0).normalize();
  // Turned off the axes, so no ray runs exactly along a facet edge of the lathed and spherical walls.
  const a = 0.37;
  const u = u0.clone().multiplyScalar(Math.cos(a)).addScaledVector(v0, Math.sin(a));
  const v = v0.clone().multiplyScalar(Math.cos(a)).addScaledVector(u0, -Math.sin(a));
  for (const d of [u, v, u.clone().negate(), v.clone().negate()]) {
    const ray = new THREE.Raycaster(p.clone().addScaledVector(d, 0.8), d.clone().negate(), 0, 0.8);
    if (!ray.intersectObjects(ducts, false).length) return false;
  }
  return true;
}

const stride = (thigh: number, knee: number): DrivePose => ({
  joints: { thighSwingL: [thigh, 0, 0], kneeL: [knee, 0, 0], thighSwingR: [-thigh / 2, 0, 0], kneeR: [knee / 2, 0, 0] },
  lean: 0,
  hover: 0,
  exhaust: null,
});

const POSES: [string, number, DrivePose | null][] = [
  ['Fighter', 0, null],
  ['25%', 0.25, null],
  ['GERWALK', 0.5, null],
  ['75%', 0.75, null],
  ['Battroid', 1, null],
  ['Battroid landing crouch', 1, stride(-22, 17)],
  ['Battroid stride', 1, stride(10, 12)],
  ['GERWALK skimming', 0.5, { joints: { kneeL: [26, 0, 0], kneeR: [26, 0, 0] }, lean: 0, hover: 1, exhaust: null }],
];

const NEUTRAL: FlightSurfaces = {
  sweep: 20, flaps: 0, slats: 0, spoilerL: 0, spoilerR: 0, rudder: 0, airbrake: 0,
  nozzlePitch: 0, nozzleOpen: 0.25, rcsL: 0, rcsR: 0, spool: 0, overboost: 0,
};

describe('engine airflow in the cutaway', () => {
  it('streams air through the engines, faster as they spool up', () => {
    ctl.setDrive(null);
    ctl.setProgress(0);
    ctl.setCutaway(true);
    expect(mecha.flow.points.visible).toBe(true);
    const moved = (spool: number) => {
      ctl.setFlightSurfaces({ ...NEUTRAL, spool });
      const d0 = mecha.flow.distance;
      ctl.tick(0.5);
      return mecha.flow.distance - d0;
    };
    const idle = moved(0.2);
    const full = moved(1);
    expect(idle).toBeGreaterThan(0.5);
    expect(full).toBeGreaterThan(idle * 2.5);
    // Every particle rides the air path, i.e. stays inside the leg (never out in the open).
    const box = new THREE.Box3();
    for (const id of ['intake-port', 'shin-port', 'foot-port', 'intake-starboard', 'shin-starboard', 'foot-starboard', 'thigh-port', 'thigh-starboard', 'foot-toe-port', 'foot-toe-starboard', 'foot-heel-port', 'foot-heel-starboard']) box.union(ctl.partBox(id));
    const pos = mecha.flow.points.geometry.getAttribute('position');
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mecha.flow.points.matrixWorld);
      expect(box.containsPoint(p), `particle ${i}`).toBe(true);
    }
    ctl.setFlightSurfaces(null);
    ctl.setCutaway(false);
    expect(mecha.flow.points.visible).toBe(false);
  });
});

describe('engine air path', () => {
  it('is ducted from the fan to the compressor face in every mode, mid-conversion and mid-stride', () => {
    for (const [name, t, drive] of POSES) {
      ctl.setDrive(drive);
      ctl.setProgress(t);
      mecha.root.updateMatrixWorld(true);
      for (const S of ['L', 'R'] as const) {
        const path = airPath(mecha.bones, S);
        for (let i = 1; i < path.length; i++) {
          if (!path[i - 1].ducted || !path[i].ducted) continue;
          const a = path[i - 1].p;
          const b = path[i].p;
          const along = b.clone().sub(a);
          if (along.length() < 1e-4) continue; // a straight knee folds the bellows points together
          // Every 5 cm (mid-step, off the facet rings at the joints): any gap wider than that shows.
          const n = Math.max(1, Math.ceil(along.length() / 0.05));
          along.normalize();
          for (let k = 0; k < n; k++) {
            const f = (k + 0.5) / n;
            expect(enclosed(a.clone().lerp(b, f), along), `${name}, ${S} leg, stretch ${i} at ${f.toFixed(2)}`).toBe(true);
          }
        }
      }
    }
    ctl.setDrive(null);
  });
});
