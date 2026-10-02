import type { Airframe } from '../../core/flight/model';
import { G0 } from '../../core/flight/atmosphere';
import { D } from './dims';

const D2R = Math.PI / 180;
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * VF-1J flight-model parameters.
 *
 * Published (Macross Compendium / MAHQ): 18.5 t standard take-off mass; two
 * FF-2001 thermonuclear turbines at 11,500 kgf each, 23,000 kgf in overboost;
 * Mach 2.71 at 10,000 m and Mach 3.87 at 30,000+ m; +7 g; 20°–72° wing sweep.
 * The VF-1 has no ailerons and no tailplane: pitch comes from its
 * two-dimensional vectored-thrust nozzles, roll from spoilers plus wingtip
 * roll-control thrusters, and it carries two-section and Fowler flaps,
 * leading-edge slats, rudders and a dorsal airbrake.
 *
 * Estimated (not published): reference wing area (the F-14's 52.5 m² scaled
 * by span²), the aerodynamic coefficients, and the thrust lapse, which is
 * calibrated so the model reproduces both published top speeds.
 */
export const VF1J_AIRFRAME: Airframe = {
  mass: 18_500,
  wingArea: 30,
  // The model's own geometry: wing pivot outboard of the centreline plus the panel length.
  span: (sweep) => 2 * (D.wing.pivot[0] + D.wing.length * Math.cos(sweep * D2R)),
  sweep: { min: 20, max: 72, rate: 7.5 },
  sweepSchedule: (mach) => 20 + 52 * smooth((mach - 0.7) / 0.7),
  thrust: {
    idle: 0.05 * 2 * 11_500 * G0,
    mil: 2 * 11_500 * G0,
    max: 2 * 23_000 * G0,
    lapse: 0.5825,
    spoolUp: 0.9,
    spoolDown: 0.7,
  },
  aero: {
    cl0: 0.05,
    clAlpha: [4.3, 2.6],
    clMax: [1.25, 0.95],
    cd0: 0.038,
    wavePeak: [0.08, 0.044],
    oswald: 0.8,
    kSuper: 0.01,
    flap: { cl: 0.45, clMax: 0.55, cd: 0.05 },
    slat: { clMax: 0.3, cd: 0.008 },
    airbrakeCd: 0.06,
    spoilerCd: 0.02,
  },
  control: {
    gMax: 7,
    gMin: -3,
    alphaTau: 0.35,
    rollRcs: 70,
    rollSpoiler: 160,
    spoilerLockout: 57,
    betaMax: 6,
    rudderMax: 25,
    nozzleMax: 20,
    flapLimitEas: 250 * 0.514444,
  },
};
