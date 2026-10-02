import { D } from './dims';
import { chordY, halfThickness, type Planform } from '../../core/geometry/wing';

type V3 = readonly [number, number, number];

/**
 * Flight-control surfaces of the VF-1 (Macross Compendium): leading-edge
 * slats, an inboard Fowler flap and a two-section outboard flap with
 * spoilers ahead of it (no ailerons), rudders on the canted fins, the large
 * dorsal airbrake behind the canopy and two-dimensional vectoring nozzles.
 * Shared by the rig (bone pivots), the geometry and the controller.
 */

const W = D.wing;
const L = D.leg;

/** Where the straight trailing edge meets the raked tip. */
export const TIP_TE_X = W.length - 0.25;
const ROOT_X = 0.05;

/** Port wing planform in the wing-bone frame (span +X, chord ±Y, upper surface −Z). */
export const WING: Planform = {
  le: (x) => W.rootLE + ((W.tipLE - W.rootLE) * (x - ROOT_X)) / (W.length - ROOT_X),
  te: (x) =>
    x <= TIP_TE_X
      ? W.rootTE + ((W.tipTE - W.rootTE) * (x - ROOT_X)) / (TIP_TE_X - ROOT_X)
      : W.tipTE + ((-0.3 - W.tipTE) * (x - TIP_TE_X)) / (W.length - TIP_TE_X),
  // 10 % thick at the root thinning to the tip.
  t: (x) => W.thickness - (0.1 * (x - ROOT_X)) / (W.length - ROOT_X),
};

export const SPAN = {
  root: ROOT_X,
  tip: W.length,
  slat: [0.55, 4.85] as const,
  /** Starts outboard of the engine nacelle so it can drop without fouling the leg. */
  fowler: [1.1, 2.6] as const,
  /** The two sections of the outboard flap. */
  outer: [[2.66, 3.66], [3.72, 4.72]] as const,
  spoiler: [[2.72, 3.6], [3.78, 4.66]] as const,
};

/** Chord fractions of the section breaks. */
export const CHORD = {
  slatTE: 0.115,
  boxLE: 0.125,
  spoilerLE: 0.52,
  spoilerTE: 0.69,
  boxTE: 0.7,
  flapLE: 0.72,
};

const onLower = (x: number, s: number): V3 => [x, chordY(WING, x, s), halfThickness(WING, x, s)];
const onUpper = (x: number, s: number): V3 => [x, chordY(WING, x, s), -halfThickness(WING, x, s)];

export interface HingeDef {
  bone: string;
  parent: string;
  /** Hinge point in the parent bone's frame (the bone's rest position). */
  pivot: V3;
  /** Second point on the hinge line: axis = normalize(to − pivot). */
  to: V3;
  /**
   * Starboard copies mirror the port motion (flaps, slats, spoilers, nozzles).
   * Rudders instead deflect the same way on both fins.
   */
  antisymmetric?: boolean;
  label: string;
}

const T = D.tail;
const H = T.finHeight;
/**
 * Fin planform from the five-view side view (fin frame: height along −Z from the
 * root, chord aft along −Y from the root leading edge): root chord 2.35 m, the
 * leading edge swept 57° to a 0.77 m tip chord 2.86 m further aft, the trailing
 * edge cranked at 0.62 m.
 */
export const FIN = { rootChord: 2.35, tipLE: -2.86, tipTE: -3.63, kinkH: 0.62, kinkTE: -3.18 };
const finLE = (h: number) => (FIN.tipLE * h) / H;
const finTE = (h: number) =>
  h <= FIN.kinkH
    ? -FIN.rootChord + ((FIN.kinkTE + FIN.rootChord) * h) / FIN.kinkH
    : FIN.kinkTE + ((FIN.tipTE - FIN.kinkTE) * (h - FIN.kinkH)) / (H - FIN.kinkH);
export const RUDDER = { h0: 0.3, h1: 1.5, chord: 0.3 };
/** Rudder hinge line position (chord y) at fin height h. */
export const rudderHingeY = (h: number) => finTE(h) + RUDDER.chord * (finLE(h) - finTE(h));
export { finLE, finTE };

/** Dorsal face of the chest plate (nose-bone frame). */
const top = -D.nose.depth;

const F = L.foot;

/**
 * The split 2-D nozzle (foot-bone frame: nozzle axis along −Y at z = 0, toe side +Z). Below the
 * body end the flow passes between the flaps' rounded roots (the throat slot); the toe and heel
 * pivot on pins at mid-thickness. Closed (0°) their inner faces run parallel a slot's width apart;
 * opened 90° those faces lie on the ground and the slot fires straight down.
 */
export const NOZZLE = {
  /** Flap pin line. */
  hingeY: F.bodyEnd - F.hingeDrop,
  /** Throat exit between the flap roots (where the plume starts). */
  exitY: F.bodyEnd - F.hingeDrop,
  /** Just under the body end, where the throat glows. */
  throatY: F.bodyEnd - 0.02,
  axisZ: 0,
  /** Half the slot between the closed flaps' inner faces. */
  slot: F.bodyDepth / 2 - F.flapRoot,
  toeZ: F.bodyDepth / 2 - F.flapRoot / 2,
  heelZ: -(F.bodyDepth / 2 - F.flapRoot / 2),
  halfWidth: F.bodyWidth / 2 - 0.01,
};

/**
 * F-14-style two-dimensional variable intake (leg-slide frame: +Y out of the mouth; −Z is the
 * upper wall in flight, under the glove). The upper lip leads and the lower lip is raked back.
 * Under the upper wall hang ramp 1 (hinged at its leading edge, behind the lip) and ramp 2
 * (hinged at its trailing edge, the throat), 9 cm down so their rams fit in the bay above them;
 * behind the throat the square duct turns round at the fan face, deep in the box (the subsonic
 * diffuser). A bypass door in the outboard wall spills the air the engine cannot take.
 */
export const INTAKE = {
  lipTop: L.intakeLen,
  lipBottom: L.intakeLen - 0.35,
  wall: 0.07,
  /** Top of the solid box, and the square-to-round frame at the fan face. */
  solidTop: 0.9,
  frameY: 1.42,
  igvY: 1.3,
  fanY: 1.15,
  /** The ramps' flow faces (Z) and their ends (Y: leading edge, trailing edge). */
  rampZ: -L.depth / 2 + 0.07 + 0.09,
  ramp1: [2.1, 1.77] as const,
  ramp2: [1.77, 1.47] as const,
  rampHalfWidth: 0.5,
  /** Bypass door on the outboard wall: hinge line (its forward edge) y, aft edge y, z span. */
  bypass: { y0: 1.8, y1: 1.52, z0: -0.42, z1: -0.14 },
};
/** Lip height (Y) of the raked intake at depth z (upper lip leading). */
export const intakeLipY = (z: number) => INTAKE.lipTop - ((z + L.depth / 2) / L.depth) * (INTAKE.lipTop - INTAKE.lipBottom);

/** Port-side hinge definitions (starboard ones are derived by mirroring). */
export const HINGES: HingeDef[] = [
  { bone: 'slat', parent: 'wing', pivot: onLower(SPAN.slat[0], CHORD.slatTE), to: onLower(SPAN.slat[1], CHORD.slatTE), label: 'leading-edge slat track' },
  { bone: 'flapIn', parent: 'wing', pivot: onLower(SPAN.fowler[0], CHORD.flapLE), to: onLower(SPAN.fowler[1], CHORD.flapLE), label: 'Fowler flap track' },
  { bone: 'flapOut', parent: 'wing', pivot: onLower(SPAN.outer[0][0], CHORD.flapLE), to: onLower(SPAN.outer[1][1], CHORD.flapLE), label: 'outboard flap hinge' },
  { bone: 'spoiler', parent: 'wing', pivot: onUpper(SPAN.spoiler[0][0], CHORD.spoilerLE), to: onUpper(SPAN.spoiler[1][1], CHORD.spoilerLE), label: 'spoiler hinge' },
  {
    bone: 'rudder',
    parent: 'fin',
    pivot: [0, rudderHingeY(RUDDER.h0), -RUDDER.h0],
    to: [0, rudderHingeY(RUDDER.h1), -RUDDER.h1],
    antisymmetric: true,
    label: 'rudder hinge',
  },
  // Intake ramps (both hinged across the duct) and the bypass door (hinged at its forward edge).
  { bone: 'ramp1', parent: 'legSlide', pivot: [0, INTAKE.ramp1[0], INTAKE.rampZ], to: [1, INTAKE.ramp1[0], INTAKE.rampZ], label: 'intake ramp 1 hinge' },
  { bone: 'ramp2', parent: 'legSlide', pivot: [0, INTAKE.ramp2[1], INTAKE.rampZ], to: [1, INTAKE.ramp2[1], INTAKE.rampZ], label: 'intake ramp 2 hinge' },
  {
    bone: 'bypass',
    parent: 'legSlide',
    pivot: [L.width / 2, INTAKE.bypass.y0, INTAKE.bypass.z0],
    to: [L.width / 2, INTAKE.bypass.y0, INTAKE.bypass.z1],
    label: 'intake bypass door hinge',
  },
];

/** Dorsal airbrake: hinged on its forward edge, just behind the canopy (nose-bone frame). */
export const AIRBRAKE = {
  bone: 'airbrake',
  parent: 'nose',
  pivot: [0, 1.38, top] as V3,
  to: [1, 1.38, top] as V3,
  label: 'airbrake hinge',
  maxDeg: 60,
};

/** Full-deflection travel of each surface. */
export const TRAVEL = {
  slatDeg: 20,
  slatSlide: [0, 0.07, 0.03] as V3,
  fowlerDeg: 35,
  fowlerSlide: [0, -0.15, 0.04] as V3,
  outerDeg: 30,
  spoilerDeg: 50,
  /**
   * Intake ramps and bypass door at full schedule (F-14 air-inlet control: the ramps lower with
   * Mach; here with the wing sweep, which the flight model schedules with speed). Ramp 2 turns a
   * little further so its leading edge stays on ramp 1's trailing edge.
   */
  ramp1Deg: 12,
  ramp2Deg: 12.8,
  bypassDeg: 30,
  /** Nozzle flap opening relative to the built (idle) shape: fully closed … fully open, degrees. */
  nozzleClosed: -4,
  nozzleOpen: 12,
};
