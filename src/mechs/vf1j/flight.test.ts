import { describe, it, expect } from 'vitest';
import type { FlightControls } from '../../core/types';
import { atmosphere, G0 } from '../../core/flight/atmosphere';
import { aero, alphaForCl, initialState, stepFlight, thrustAt, type FlightOutputs, type FlightState } from '../../core/flight/model';
import { VF1J_AIRFRAME as AF } from './airframe';

const W = AF.mass * G0;
const DT = 1 / 120;
const KT = 0.514444;

const controls = (patch: Partial<FlightControls> = {}): FlightControls => ({
  throttle: 0.5,
  pitch: 0,
  roll: 0,
  yaw: 0,
  flaps: 0,
  airbrake: false,
  sweep: null,
  ...patch,
});

/** Run the sim for `seconds`, calling `each` after every step. */
function fly(s: FlightState, c: FlightControls, seconds: number, each?: (o: FlightOutputs) => void): FlightOutputs {
  let out!: FlightOutputs;
  for (let t = 0; t < seconds; t += DT) {
    out = stepFlight(AF, s, c, DT);
    each?.(out);
  }
  return out;
}

/** Highest Mach at which available thrust still balances drag in level 1 g flight. */
function maxLevelMach(altitude: number): number {
  const atm = atmosphere(altitude);
  let best = 0;
  for (let mach = 0.3; mach <= 5; mach += 0.002) {
    const v = mach * atm.speedOfSound;
    const qS = 0.5 * atm.density * v * v * AF.wingArea;
    const cfg = { mach, sweep: AF.sweepSchedule(mach), flaps: 0, slats: 0, airbrake: 0, spoilers: 0 };
    const alpha = alphaForCl(AF, W / qS, cfg);
    const drag = aero(AF, { ...cfg, alpha }).cd * qS;
    if (thrustAt(AF, 1, altitude) >= drag) best = mach;
  }
  return best;
}

function stallSpeed(flaps: number, slats: number): number {
  const c = aero(AF, { mach: 0.2, alpha: 0, sweep: AF.sweep.min, flaps, slats, airbrake: 0, spoilers: 0 });
  return Math.sqrt((2 * W) / (1.225 * AF.wingArea * c.clMax));
}

describe('VF-1J flight model: calibration against the published figures', () => {
  it('reaches Mach 2.71 at 10,000 m and Mach 3.87 at 30,000 m in level flight (overboost)', () => {
    expect(maxLevelMach(10_000)).toBeCloseTo(2.71, 1);
    expect(maxLevelMach(30_000)).toBeCloseTo(3.87, 1);
  });

  it('rates 2 × 11,500 kgf static thrust, 2 × 23,000 kgf in overboost', () => {
    expect(thrustAt(AF, 0.9, 0) / G0).toBeCloseTo(23_000, -1);
    expect(thrustAt(AF, 1, 0) / G0).toBeCloseTo(46_000, -1);
    expect(thrustAt(AF, 1, 10_000)).toBeLessThan(thrustAt(AF, 1, 0));
  });

  it('stalls at plausible F-14-class speeds: ~170 kt clean, ~130 kt with flaps and slats out', () => {
    expect(stallSpeed(0, 0) / KT).toBeGreaterThan(155);
    expect(stallSpeed(0, 0) / KT).toBeLessThan(190);
    expect(stallSpeed(1, 1) / KT).toBeGreaterThan(115);
    expect(stallSpeed(1, 1) / KT).toBeLessThan(145);
  });

  it('schedules the wing sweep with Mach like the F-14 CADC: 20° up to M0.7, 72° from M1.4', () => {
    expect(AF.sweepSchedule(0.3)).toBe(20);
    expect(AF.sweepSchedule(0.7)).toBe(20);
    expect(AF.sweepSchedule(1.4)).toBe(72);
    expect(AF.sweepSchedule(2.5)).toBe(72);
    let prev = 0;
    for (let m = 0.5; m <= 1.6; m += 0.01) {
      const s = AF.sweepSchedule(m);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe('VF-1J flight model: handling', () => {
  it('holds altitude and speed hands-off once trimmed', () => {
    const { state, throttle } = initialState(AF, 3000, 200);
    const out = fly(state, controls({ throttle }), 20);
    expect(Math.abs(out.telemetry.altitude - 3000)).toBeLessThan(15);
    expect(Math.abs(out.telemetry.airspeed - 200)).toBeLessThan(3);
    expect(out.telemetry.stall).toBe(false);
  });

  it('flies a level, bank-compensated 60° turn at 2 g with the stick centred', () => {
    const { state } = initialState(AF, 3000, 230);
    // Pilot rolls in smoothly (proportional to the bank still to go), then lets go.
    let out = fly(state, controls({ throttle: 0.9 }), 0.01);
    for (let t = 0; t < 3; t += DT) {
      out = stepFlight(AF, state, controls({ throttle: 0.9, roll: Math.max(-1, Math.min(1, (60 - out.telemetry.bank) / 25)) }), DT);
    }
    const h0 = out.telemetry.altitude;
    const hdg0 = out.telemetry.heading;
    fly(state, controls({ throttle: 0.9 }), 1);
    out = fly(state, controls({ throttle: 0.9 }), 8);
    expect(out.telemetry.bank).toBeGreaterThan(56);
    expect(out.telemetry.bank).toBeLessThan(66);
    expect(out.telemetry.gLoad).toBeCloseTo(2, 0);
    expect(Math.abs(out.telemetry.altitude - h0)).toBeLessThan(80);
    const turned = (out.telemetry.heading - hdg0 + 360) % 360;
    expect(turned).toBeGreaterThan(9 * 3);
  });

  it('limits the pull to +7 g where the wing could give more', () => {
    const { state } = initialState(AF, 1000, 330);
    let peak = 0;
    fly(state, controls({ throttle: 1, pitch: 1 }), 3, (o) => (peak = Math.max(peak, o.telemetry.gLoad)));
    expect(peak).toBeGreaterThan(6.5);
    expect(peak).toBeLessThanOrEqual(7.05);
  });

  it('stalls when hauled back at low speed, and recovers once the stick is released', () => {
    const { state } = initialState(AF, 3000, 95);
    let stalled = false;
    fly(state, controls({ throttle: 0, pitch: 1 }), 4, (o) => (stalled ||= o.telemetry.stall));
    expect(stalled).toBe(true);
    const out = fly(state, controls({ throttle: 1 }), 8);
    expect(out.telemetry.stall).toBe(false);
  });

  it('loops cleanly through the vertical and inverted without numerical blow-up', () => {
    const { state } = initialState(AF, 3000, 260);
    let inverted = false;
    const out = fly(state, controls({ throttle: 1, pitch: 1 }), 12, (o) => (inverted ||= Math.abs(o.telemetry.bank) > 150));
    expect(inverted).toBe(true);
    for (const v of Object.values(out.telemetry)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
  });

  it('accelerates harder in overboost, and the airbrake slows it down', () => {
    const run = (c: Partial<FlightControls>) => {
      const { state } = initialState(AF, 3000, 200);
      return fly(state, controls(c), 5).telemetry.airspeed;
    };
    expect(run({ throttle: 1 })).toBeGreaterThan(run({ throttle: 0.9 }) + 10);
    expect(run({ throttle: 0.3, airbrake: true })).toBeLessThan(run({ throttle: 0.3 }) - 3);
  });

  it('stays finite and supersonic high up', () => {
    const { state } = initialState(AF, 30_000, 3.5 * atmosphere(30_000).speedOfSound);
    const out = fly(state, controls({ throttle: 1 }), 10);
    expect(out.telemetry.mach).toBeGreaterThan(3.3);
    expect(Number.isFinite(out.telemetry.altitude)).toBe(true);
  });
});

describe('VF-1J flight model: control surfaces (VF-1 has no ailerons or tailplane)', () => {
  it('rolls right by raising the starboard spoiler and firing the wingtip thrusters', () => {
    const { state } = initialState(AF, 3000, 200);
    const out = fly(state, controls({ throttle: 0.6, roll: 1 }), 0.5);
    expect(out.surfaces.spoilerR).toBeGreaterThan(0.5);
    expect(out.surfaces.spoilerL).toBe(0);
    expect(out.surfaces.rcsL).toBeGreaterThan(0);
    expect(out.surfaces.rcsR).toBeLessThan(0);
    expect(out.telemetry.bank).toBeGreaterThan(20);
  });

  it('locks the spoilers out above 57° sweep and rolls on the wingtip thrusters alone', () => {
    const { state } = initialState(AF, 3000, 250);
    fly(state, controls({ throttle: 0.7, sweep: 72 }), 9);
    const out = fly(state, controls({ throttle: 0.7, sweep: 72, roll: 1 }), 0.6);
    expect(out.surfaces.sweep).toBeCloseTo(72, 0);
    expect(out.surfaces.spoilerR).toBe(0);
    expect(out.telemetry.bank).toBeGreaterThan(15);
  });

  it('pitches with the vectoring nozzles and yaws with the rudders', () => {
    const { state } = initialState(AF, 3000, 220);
    let out = fly(state, controls({ throttle: 0.7, pitch: 1 }), 0.2);
    expect(out.surfaces.nozzlePitch).toBeGreaterThan(5);
    out = fly(state, controls({ throttle: 0.7, yaw: 1 }), 0.5);
    expect(out.surfaces.rudder).toBeGreaterThan(10);
  });

  it('extends the flaps and slats at low speed but blows the flaps back above 250 kt', () => {
    const slow = initialState(AF, 1000, 110).state;
    let out = fly(slow, controls({ throttle: 0.8, flaps: 1 }), 3);
    expect(out.surfaces.flaps).toBeGreaterThan(0.95);
    expect(out.surfaces.slats).toBeGreaterThan(0.95);
    const fast = initialState(AF, 1000, 250).state;
    out = fly(fast, controls({ throttle: 0.8, flaps: 1 }), 3);
    expect(out.surfaces.flaps).toBeLessThan(0.05);
  });

  it('interlocks flaps and slats with the sweep: they stay stowed with the wings swept back', () => {
    // Slow enough (autothrottle holds ~120 m/s, below the 250 kt flap limit) that only the interlock can keep them in.
    const { state } = initialState(AF, 500, 120);
    let out = stepFlight(AF, state, controls({ flaps: 1, sweep: 72 }), DT);
    for (let t = 0; t < 12; t += DT) {
      const throttle = Math.max(0, Math.min(1, 0.5 + (120 - out.telemetry.airspeed) * 0.05));
      out = stepFlight(AF, state, controls({ throttle, flaps: 1, sweep: 72 }), DT);
    }
    expect(out.telemetry.eas).toBeLessThan(AF.control.flapLimitEas);
    expect(out.surfaces.sweep).toBeGreaterThan(70);
    expect(out.surfaces.flaps).toBeLessThan(0.02);
    expect(out.surfaces.slats).toBeLessThan(0.02);
  });

  it('opens the nozzles and lights the overboost glow at full throttle', () => {
    const { state } = initialState(AF, 3000, 200);
    const out = fly(state, controls({ throttle: 1 }), 4);
    expect(out.surfaces.overboost).toBeGreaterThan(0.8);
    expect(out.telemetry.afterburner).toBe(true);
    expect(out.surfaces.nozzleOpen).toBeGreaterThan(0.8);
  });
});
