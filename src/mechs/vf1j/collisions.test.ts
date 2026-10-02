import { describe, it, expect } from 'vitest';
import type { FlightSurfaces } from '../../core/types';
import { createMecha } from './build';
import { MechaController } from './controller';
import { findCollisions } from '../../core/collisions';
import { VF1J_COLLISION_RULES } from './collisionRules';

const fmt = (t: number) => `${Math.round(t * 100)}%`;
const samples = Array.from({ length: 101 }, (_, i) => i / 100);

function subject() {
  const mecha = createMecha();
  const ctl = new MechaController(mecha);
  return { ...mecha, setProgress: (t: number) => ctl.setProgress(t) };
}

describe('no interpenetration', () => {
  it('keeps every rigid body clear of the others in all three modes and every step between', () => {
    const hits = findCollisions(subject(), samples, VF1J_COLLISION_RULES);
    const report = hits.map((h) => `${h.a} [${h.boneA}] ⟷ ${h.b} [${h.boneB}] at ${h.at.map(fmt).join(', ')}`);
    expect(report).toEqual([]);
  }, 120_000);

  it('keeps internal components (engines, rams, core, frame…) clear of every moving body too', () => {
    const hits = findCollisions(subject(), samples, VF1J_COLLISION_RULES, true);
    const report = hits.map((h) => `${h.a} [${h.boneA}] ⟷ ${h.b} [${h.boneB}] at ${h.at.map(fmt).join(', ')}`);
    expect(report).toEqual([]);
  }, 180_000);
});

const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Every sweep in the flight envelope, combined with full deflections the flight model can command there. */
function flightConfigs(): FlightSurfaces[] {
  const base: FlightSurfaces = {
    sweep: 20, flaps: 0, slats: 0, spoilerL: 0, spoilerR: 0, rudder: 0, airbrake: 0,
    nozzlePitch: 0, nozzleOpen: 0.25, rcsL: 0, rcsR: 0, spool: 0.5, overboost: 0,
  };
  const out: FlightSurfaces[] = [];
  for (const sweep of [20, 25, 30, 40, 50, 57, 65, 72]) {
    const flaps = 1 - smoothstep((sweep - 25) / 10); // flap / sweep interlock, as in the flight model
    const slats = sweep < 50 ? 1 : 0;
    const spoil = sweep <= 57 ? 1 : 0; // spoiler lockout
    out.push({ ...base, sweep });
    out.push({ ...base, sweep, flaps, slats, spoilerL: spoil, rudder: 25, airbrake: 1, nozzlePitch: 20, nozzleOpen: 1, rcsL: 1, rcsR: -1 });
    out.push({ ...base, sweep, flaps: flaps / 2, slats: slats / 2, spoilerR: spoil, rudder: -25, airbrake: 0.5, nozzlePitch: -20, nozzleOpen: 0 });
  }
  return out;
}

describe('flight controls', () => {
  it('keep every surface clear of the airframe and internals at every sweep and full deflection', () => {
    const configs = flightConfigs();
    const mecha = createMecha();
    const ctl = new MechaController(mecha);
    const subject = {
      ...mecha,
      setProgress: (i: number) => {
        ctl.setProgress(0);
        ctl.setFlightSurfaces(configs[i]);
      },
    };
    const hits = findCollisions(subject, configs.map((_, i) => i), VF1J_COLLISION_RULES, true);
    const report = hits.map((h) => `${h.a} [${h.boneA}] ⟷ ${h.b} [${h.boneB}] in configs ${h.at.join(', ')}`);
    expect(report).toEqual([]);
  }, 120_000);

  it('return to neutral when the flight lab hands back to the transformation', () => {
    const mecha = createMecha();
    const ctl = new MechaController(mecha);
    ctl.setProgress(0);
    const rest = mecha.bones.flapInL.quaternion.clone();
    ctl.setFlightSurfaces(flightConfigs()[1]);
    expect(mecha.bones.flapInL.quaternion.angleTo(rest)).toBeGreaterThan(0.3);
    expect(mecha.bones.wingL.rotation.z).toBeCloseTo((-20 * Math.PI) / 180, 5);
    ctl.setFlightSurfaces(null);
    expect(mecha.bones.flapInL.quaternion.angleTo(rest)).toBeLessThan(1e-6);
  });
});
