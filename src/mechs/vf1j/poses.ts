import { D } from './dims';

/** Joint pose: Euler rotation in degrees (XYZ order) and optional absolute position. */
export interface JointPose {
  r?: readonly number[];
  p?: readonly number[];
}
export type PoseKey = Record<string, JointPose>;
export interface EvaluatedJoint {
  r: number[];
  p?: number[];
}
export type EvaluatedPose = Record<string, EvaluatedJoint>;

const L = D.leg;
const A = D.arm;
/** The hip rail's lower section runs out along the rail below the waist for Battroid. */
const RAIL_EXT = [0, 1, 2].map((i) => (-(L.railFighter[i] - L.railBattroid[i]) / (L.railFighter[1] - L.railBattroid[1])) * 2.45);
const N = D.nose;
const TL = D.tail;

/** Mirror a port-side joint pose to starboard (x → -x, Y/Z rotations flip). */
function mirror(jp: JointPose): JointPose {
  return {
    r: jp.r ? [jp.r[0], -jp.r[1], -jp.r[2]] : undefined,
    p: jp.p ? [-jp.p[0], jp.p[1], jp.p[2]] : undefined,
  };
}

function sym(port: Record<string, JointPose>): PoseKey {
  const out: PoseKey = {};
  for (const [id, jp] of Object.entries(port)) {
    out[`${id}L`] = jp;
    out[`${id}R`] = mirror(jp);
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Keyframes                                                                 */
/* ------------------------------------------------------------------------- */

const TAIL_HINGE = [...TL.hinge];
const FIN_ROOT = [...TL.finRoot];
const MAST = [0, -TL.length, 0.15];
const WHIP_IN = [0, -TL.mastLen + 0.02, 0];
/** Pop-out vernier nozzles: flush in the belly's well, or stood up out of it (GERWALK). */
const VERNIER_IN = [TL.vernier[0], TL.vernier[1], TL.depth - 0.25];
const VERNIER_OUT = [TL.vernier[0], TL.vernier[1], TL.depth - 0.06];
const WING_PIVOT = [...D.wing.pivot];
const WING_PIVOT_R = [-WING_PIVOT[0], WING_PIVOT[1], WING_PIVOT[2]];
const WING_STOW = [...D.wing.stow];
const WING_STOW_R = [-D.wing.stow[0], D.wing.stow[1], D.wing.stow[2]];

/**
 * Wing-root swing arm hinge (port; torso frame). Each carriage rides on a parallel pair of links
 * hinged in the glove, level with the flight pivot and equidistant from it and the stowage point,
 * so one 147° swing lifts the carriage straight up out of the glove, carries it over and sets it
 * down on the back beside the backpack, the wing keeping its attitude all the way.
 */
export const WING_ARM_HINGE: readonly [number, number, number] = (() => {
  const [px, py, pz] = D.wing.pivot;
  const [sx, sy, sz] = D.wing.stow;
  const run = Math.hypot(sx - px, sy - py);
  const c = (run * run + (sz - pz) ** 2) / (2 * run);
  return [px + ((sx - px) / run) * c, py + ((sy - py) / run) * c, pz];
})();
const WING_ARM_HINGE_R = [-WING_ARM_HINGE[0], WING_ARM_HINGE[1], WING_ARM_HINGE[2]];

/**
 * Where the swing arm's two links pick up the carriage (port, carriage frame): a yoke above the
 * pivot, clear of the wing's root at every sweep and stowed, the second link offset in the swing
 * plane at an angle the links never reach (so the pair never folds flat and always holds attitude).
 */
export const WING_ARM_PICKUPS: readonly (readonly [number, number, number])[] = (() => {
  const [px, py] = D.wing.pivot;
  const [hx, hy] = WING_ARM_HINGE;
  const r = Math.hypot(px - hx, py - hy);
  const u = [(px - hx) / r, (py - hy) / r, 0];
  const psi = (163.5 * Math.PI) / 180;
  const off = [u[0] * Math.cos(psi), u[1] * Math.cos(psi), -Math.sin(psi)].map((x) => x * 0.15);
  const main = [0, 0.4, 0] as const;
  return [main, [main[0] + off[0], main[1] + off[1], main[2] + off[2]] as const];
})();

const FIGHTER: PoseKey = {
  // Whole robot lies face-down: the torso's +Y (shoulders) becomes the nose direction,
  // parked on its landing gear (the wheels meet the floor).
  root: { r: [90, 0, 0], p: [0, 1.55, -3.9] },
  nose: { r: [0, 0, 0] },
  cockpit: { p: [0, N.rearLen, 0] },
  shieldA: { p: [0, N.shield.stowA, 0] },
  shieldB: { p: [0, N.shield.stowB, 0] },
  radome: { p: [0, N.cockpitLen, 0] },
  // Laser turret stowed upright in its bay: visor flush with the belly, barrels folded forward
  // and down in front of the cheek housings.
  head: { r: [0, 0, 0], p: [...D.head.stowed] },
  laserL: { r: [180, 0, 0] },
  laserR: { r: [180, 0, 0] },
  tailModule: { r: [0, 0, 0], p: TAIL_HINGE },
  mast: { r: [0, 0, 0], p: MAST },
  whip: { p: WHIP_IN },
  wingRootL: { p: WING_PIVOT },
  wingRootR: { p: WING_PIVOT_R },
  wingL: { r: [0, 0, -20] },
  wingR: { r: [0, 0, 20] },
  ...sym({
    // Fins canted 22.5° outboard (five-view front view); the backpack's verniers flush.
    fin: { r: [0, -TL.finCant, 0], p: FIN_ROOT },
    vernier: { r: [0, 0, 0], p: VERNIER_IN },
    // Legs hang from the intake lips, level with the fuselage under the gloves.
    hipRail: { p: [...L.railFighter] },
    hipRailExt: { p: [0, 0, 0] },
    hip: { r: [0, 0, 0] },
    legSlide: { p: [L.hipIn, -L.intakeLen, 0] },
    thighSwing: { r: [0, 0, 0] },
    thighExt: { p: [0, -L.thighLen + L.thighPivot, 0] },
    knee: { r: [0, 0, 0] },
    shinExt: { p: [0, -L.shinLen, L.ankleBack] },
    // Nozzle in line with the nacelle, the toe / heel flaps closed.
    ankle: { r: [0, 0, 0] },
    toe: { r: [0, 0, 0] },
    heel: { r: [0, 0, 0] },
    // Hip swing-bar locks engaged in the fuselage sides; shoulder locks retracted into the blocks.
    hipLock: { r: [0, 0, 0] },
    shoulderLock: { p: [0, 0, A.lockStroke] },
    // Arms lie in the ventral bay between the engines, twisted 90° onto their edges, hands retracted.
    shoulder: { p: [...A.shoulderFighter], r: [0, -90, 0] },
    upperArm: { r: [0, 0, 0] },
    elbow: { r: [0, 0, 0] },
    wrist: { p: [0, -A.foreLen + A.handRetract, 0], r: [0, 0, 0] },
  }),
};

/**
 * GERWALK shoulder: under the wing root (glove edge x 2.98), outboard of the thighs and behind the
 * knees. The block has turned 90° down (transformation sheet: "then turned 90° down about this
 * point, the arm is ready"), so it hangs the way it does in Battroid: top face latched against the
 * glove's underside, the arm hanging from its bottom.
 */
const G_SHOULDER = [2.85, 3.35, D.glove.z + D.glove.thickness / 2 + A.blockTop];
/**
 * The shoulder block's hinge pin (top-back edge) in GERWALK, seated in its clevis under the glove:
 * the block turns 90° down about it (and back up for Battroid). Turned down, the pin lies at
 * (y, z) + (pin z, −pin y) from the block's origin.
 */
const G_EDGE = [G_SHOULDER[0], G_SHOULDER[1] + A.hingePin[2], G_SHOULDER[2] - A.hingePin[1]];
/** The block upright under the glove on the same pin, its back face on the glove's underside. */
const G_UPRIGHT = [G_EDGE[0], G_EDGE[1] - A.hingePin[1], G_EDGE[2] - A.hingePin[2]];
/** The clevis the pin seats in (port, torso frame), for the geometry. */
export const SHOULDER_CLEVIS: readonly [number, number, number] = [G_EDGE[0], G_EDGE[1], G_EDGE[2]];
/** For Battroid the block lifts clear of the back on its rails before it settles on the wings. */
const G_BLOCK_SLIDE = 0.65;
/**
 * GERWALK: the back block lies flipped over flat on the back behind the cockpit (the GERWALK kit),
 * its hinge end here: its fins, folded flat under it, just clear of the dorsal skin and gloves.
 */
const G_BLOCK = [0, 1.75, -1.0];


const GERWALK: PoseKey = {
  // Converting from the Fighter the craft holds its spot (the ground solve sets the height).
  root: { r: [86, 0, 0], p: [0, 6.3, -3.9] },
  nose: { r: [0, 0, 0] },
  cockpit: { p: [0, N.rearLen, 0] },
  shieldA: { p: [0, N.shield.stowA, 0] },
  shieldB: { p: [0, N.shield.stowB, 0] },
  radome: { p: [0, N.cockpitLen, 0] },
  head: { r: [0, 0, 0], p: [...D.head.stowed] },
  laserL: { r: [180, 0, 0] },
  laserR: { r: [180, 0, 0] },
  // Transformation sheet: the fins fold, then the whole back block rises as an airbrake and goes
  // on over onto the back. On the VF-1J GERWALK kit it lies there flat behind the cockpit: the aft
  // face's bevel, with the three-port vent, faces forward and up, the red disc is on top, two
  // vernier nozzles stand up at its rear and the antenna stands up just behind its front edge
  // (the boom slid 0.3 m into the block), its whip out.
  tailModule: { r: [180, 0, 0], p: G_BLOCK },
  mast: { r: [-90, 0, 0], p: [0, -TL.length + 0.3, 0.15] },
  whip: { p: [0, -TL.mastLen - TL.whipLen + 0.3, 0] },
  wingRootL: { p: WING_PIVOT },
  wingRootR: { p: WING_PIVOT_R },
  wingL: { r: [0, 0, -20] },
  wingR: { r: [0, 0, 20] },
  ...sym({
    // Transformation sheet: the fins fold down flat before the back block rises into the airbrake,
    // and go over with it: they lie flat under the block, pointing forward (the kit).
    fin: { r: [0, -90, 0], p: FIN_ROOT },
    vernier: { r: [-40, 0, 0], p: VERNIER_OUT },
    // Thighs stay level along the fuselage; the shins drop 90° at the knees (VTOL nozzles down).
    hipRail: { p: [...L.railFighter] },
    hipRailExt: { p: [0, 0, 0] },
    hip: { r: [-6, 0, 0] },
    legSlide: { p: [L.hipIn, -L.intakeLen, 0] },
    thighSwing: { r: [0, 0, 0] },
    thighExt: { p: [0, -L.thighLen + L.thighPivot, 0] },
    knee: { r: [-88, 0, 0] },
    shinExt: { p: [0, -L.shinLen, L.ankleBack] },
    ankle: { r: [0, 0, 0] },
    // The split nozzle opens into the foot: toe forward, heel back, the exhaust slot between.
    toe: { r: [-80, 0, 0] },
    heel: { r: [80, 0, 0] },
    hipLock: { r: [0, 0, 0] },
    // The shoulder locks stay in their blocks (they clamp into the back for Battroid).
    shoulderLock: { p: [0, 0, A.lockStroke] },
    // Arms slid aft out of the bay, spread, untwisted, then turned 90° down under the wing roots:
    // the upper arms hang, the left forearm reaches forward and down, fist ready (GERWALK art).
    shoulder: { p: G_SHOULDER, r: [-90, 0, 0] },
    upperArm: { r: [-15, 0, 14] },
    elbow: { r: [-50, 0, 0] },
    wrist: { p: [0, -A.foreLen, 0], r: [0, 90, 0] },
  }),
  // Right forearm points straight ahead, fist rolled palm-down around the GU-11's grip.
  upperArmR: { r: [-10, 0, 0] },
  elbowR: { r: [-90, 0, 0] },
  wristR: { p: [0, -A.foreLen, 0], r: [0, 180, 0] },
};

const BATTROID: PoseKey = {
  root: { r: [0, 0, 0], p: [0, 7.2, -1.2] },
  nose: { r: [180, 0, 0] },
  cockpit: { p: [0, N.rearLen - N.cockpitSlide, 0] },
  // The canopy shield has run forward over the glazing (before the cockpit retracted).
  shieldA: { p: [0, 0, 0] },
  shieldB: { p: [0, 0, 0] },
  radome: { p: [0, N.cockpitLen - N.radomeSlide, 0] },
  head: { r: [0, 0, 0], p: [...D.head.battroid] },
  laserL: { r: [-6, 0, -11] },
  laserR: { r: [-6, 0, 11] },
  // Backpack: flipped up the back and lifted between the shoulder blades, antenna retracted.
  tailModule: { r: [180, 0, 0], p: [0, TL.hinge[1] + TL.battroidLift, TL.hinge[2] + TL.battroidOut] },
  mast: { r: [0, 0, 0], p: [0, -TL.length + TL.mastLen - 0.1, 0.15] },
  whip: { p: WHIP_IN },
  // Wings swing down past vertical behind the back (stowage position), tips converging;
  // the pivots first run back so the panels clear the torso and the intakes.
  wingRootL: { p: WING_STOW },
  wingRootR: { p: WING_STOW_R },
  wingL: { r: [0, 0, -D.wing.stowSweep] },
  wingR: { r: [0, 0, D.wing.stowSweep] },
  ...sym({
    // Fins swing on past their GERWALK fold to point back and 40° outboard from the backpack's
    // edges: chords up the backpack's sides, tips rising above the shoulders, so from the front
    // they are the blocks flanking the head (Battroid schematic, ±0.9–1.8 m) and from behind the
    // blocks above the shoulders (rear art), with the backpack's red disc and verniers clear.
    fin: { r: [0, -140, 0], p: FIN_ROOT },
    vernier: { r: [0, 0, 0], p: VERNIER_IN },
    hipRail: { p: [...L.railBattroid] },
    hipRailExt: { p: RAIL_EXT },
    // The legs splay 3° at the thigh joint under the intakes, which stay upright beside their rails.
    hip: { r: [0, 0, 0] },
    legSlide: { p: [L.hipIn, 0, 0] },
    thighSwing: { r: [0, 0, 3] },
    thighExt: { p: [0, -L.thighLen + L.thighPivot, 0] },
    knee: { r: [6, 0, 0] },
    shinExt: { p: [0, -L.shinLen, L.ankleBack] },
    ankle: { r: [-6, 0, -3] },
    // The split nozzle opens into the foot: toe forward, heel back, the exhaust slot between.
    toe: { r: [-80, 0, 0] },
    heel: { r: [80, 0, 0] },
    // Hip locks folded up into the intakes (the carriages ran down the torso); shoulder locks clamped.
    hipLock: { r: [0, 0, -90] },
    shoulderLock: { p: [0, 0, 0] },
    shoulder: { p: [...A.shoulderBattroid], r: [0, 0, 0] },
    // Arms hang splayed as in the Battroid schematic (forearm shields out to ~4 m).
    upperArm: { r: [-6, 0, 10.5] },
    elbow: { r: [-30, 0, 0] },
    wrist: { p: [0, -A.foreLen, 0], r: [0, 0, 0] },
  }),
  upperArmR: { r: [-26, 0, -10.5] },
  elbowR: { r: [-68, 0, 0] },
  wristR: { p: [0, -A.foreLen, 0], r: [0, 180, 0] },
};

export const KEYS = { fighter: FIGHTER, gerwalk: GERWALK, battroid: BATTROID } as const;

/* ------------------------------------------------------------------------- */
/* Timing: per-joint windows inside each half of the timeline                */
/* ------------------------------------------------------------------------- */

type Windows = Record<string, readonly [number, number]>;

/** Fighter → GERWALK (progress 0 … 0.5). Unlisted joints use [0, 1]. */
const WIN_A: Windows = {
  root: [0.3, 1],
  ...sym2({
    // The shins drop first (the toes open as airbrakes), clearing the space behind the knees.
    hip: [0.05, 0.4],
    knee: [0.05, 0.45],
    ankle: [0.35, 0.8],
    // The flaps spread into toe and heel as the shins come down.
    toe: [0.4, 0.8],
    heel: [0.4, 0.8],
    // Arms: slide aft, spread and drop, untwist and run forward until the blocks' backs meet the
    // gloves' underside (waypoints), then turn 90° down on their hinge pins (slowly: the arms
    // hang 6 m below the pins)…
    shoulder: [0.7, 0.88],
    // …and swing down; the right fist takes the GU-11.
    // (the upper arms swing down still spread wide – waypoint – and close in once the forearms
    // are ahead of the calves)
    upperArm: [0.8, 0.88],
    elbow: [0.72, 0.9],
    wrist: [0.7, 0.88],
    // The fins fold flat first (waypoint) and go over with the block; the verniers stand up last.
    fin: [0.4, 0.82],
    vernier: [0.84, 0.96],
  }),
  // "The whole block on the back rises and becomes an airbrake": it lifts off the waist keel
  // (waypoint), then flips forward over the back; the antenna boom swings up with it, so it never
  // points forward into the chest, and the whip comes out last.
  tailModule: [0.4, 0.82],
  mast: [0.4, 0.82],
  whip: [0.9, 1],
};

/** GERWALK → Battroid (progress 0.5 … 1). */
const WIN_B: Windows = {
  root: [0.1, 0.6],
  whip: [0, 0.12],
  mast: [0.22, 0.3],
  ...sym2({
    // Legs: the swing-bar locks let go, then the knees straighten while the hip carriages run
    // down the torso to the waist, the thighs sliding up through the hips so the intakes flank it.
    hipLock: [0.04, 0.13],
    // The rail's lower section runs out below the waist before the carriages come down to it.
    hipRailExt: [0.04, 0.24],
    hipRail: [0.15, 0.6],
    hip: [0.15, 0.6],
    knee: [0.1, 0.55],
    ankle: [0.1, 0.6],
    legSlide: [0.35, 0.75],
    // Fins swing back on their fold hinges while the backpack is lifted clear (its verniers first
    // sink back into their well).
    fin: [0.14, 0.34],
    vernier: [0, 0.1],
    // Arms swing down to the Battroid pose (the blocks unlatch, then turn back upright as the body
    // stands), then the shoulder locks clamp them into the back.
    shoulder: [0.52, 0.6],
    shoulderLock: [0.46, 0.56],
    upperArm: [0.3, 0.7],
    elbow: [0.3, 0.7],
    wrist: [0.3, 0.7],
  }),
  // The wing-root carriages swing up out of the gloves and over onto the back on their arms,
  // then the wings fold down into the V under the lifted backpack.
  wingRootL: [0.12, 0.36],
  wingRootR: [0.12, 0.36],
  wingL: [0.36, 0.7],
  wingR: [0.36, 0.7],
  // The backpack (lifted clear first, waypoint) settles over the stowed wings, between the
  // shoulder blades, once the chest has folded out of its way.
  tailModule: [0.86, 0.98],
  // The canopy shield runs forward out of the chest spine over the glazing, the front hood
  // telescoping out of the rear one; then the nose section retracts (shield and all), folds
  // down once the arms are clear, and the head rises out of its bay.
  shieldA: [0.18, 0.38],
  shieldB: [0.22, 0.42],
  cockpit: [0.45, 0.6],
  radome: [0.45, 0.6],
  nose: [0.68, 0.88],
  // (the lasers swing up over the chest once the head is out)
  head: [0.84, 0.94],
  laserL: [0.94, 1],
  laserR: [0.94, 1],
};

function sym2(port: Record<string, readonly [number, number]>): Windows {
  const out: Windows = {};
  for (const [id, w] of Object.entries(port)) {
    out[`${id}L`] = w;
    out[`${id}R`] = w;
  }
  return out;
}

/** Extra intermediate moves (segment-relative windows), run before the main move. */
interface Waypoint {
  seg: 'A' | 'B';
  w: readonly [number, number];
  r?: readonly number[];
  p?: readonly number[];
  /** Arc centre: p swings round it instead of running straight. */
  c?: readonly number[];
}

/** Main moves whose position runs along a circular arc about a centre (a swing arm's hinge). */
const ARCS: Record<string, { seg: 'A' | 'B'; c: readonly number[] }> = {
  wingRootL: { seg: 'B', c: WING_ARM_HINGE },
  wingRootR: { seg: 'B', c: WING_ARM_HINGE_R },
  // The shoulder blocks turn down about their top-back edge on the gloves' underside.
  shoulderL: { seg: 'A', c: G_EDGE },
  shoulderR: { seg: 'A', c: [-G_EDGE[0], G_EDGE[1], G_EDGE[2]] },
};

const WAYPOINTS: Record<string, Waypoint[]> = (() => {
  const out: Record<string, Waypoint[]> = {};
  for (const [S, s] of [['L', 1], ['R', -1]] as const) {
    const [fx, , fz] = A.shoulderFighter;
    // The arms slide aft out of the bay behind the dropped shins, drop clear of the
    // engines and spread outboard, then untwist (m3 transformation sheet: 腕全体が後ろに
    // スライド → 左右に分かれて広がる → 90°ひねって → 90°下に回転).
    out[`shoulder${S}`] = [
      { seg: 'A', w: [0.1, 0.3], p: [s * fx, 0.5, fz] },
      { seg: 'A', w: [0.3, 0.45], p: [s * G_SHOULDER[0], 0.5, G_SHOULDER[2]] },
      { seg: 'A', w: [0.45, 0.55], r: [0, 0, 0] },
      // …forward until its back face meets the glove's underside (…then it turns down, below).
      { seg: 'A', w: [0.55, 0.7], p: [s * G_UPRIGHT[0], G_UPRIGHT[1], G_UPRIGHT[2]], r: [0, 0, 0] },
      // For Battroid: turn back upright about the same edge, slide forward along the glove's
      // underside past its leading edge (the lock running out), then settle at the shoulder.
      { seg: 'B', w: [0.3, 0.42], p: [s * G_UPRIGHT[0], G_UPRIGHT[1], G_UPRIGHT[2]], r: [0, 0, 0], c: [s * G_EDGE[0], G_EDGE[1], G_EDGE[2]] },
      { seg: 'B', w: [0.42, 0.52], p: [s * A.shoulderBattroid[0], 3.2, G_UPRIGHT[2]] },
    ];
  }
  // The fins fold down flat before the block rises.
  out.finL = [{ seg: 'A', w: [0.12, 0.4], r: [0, -90, 0] }];
  out.finR = [{ seg: 'A', w: [0.12, 0.4], r: [0, 90, 0] }];
  // The arms swing down past the calves spread wide, closing in only as the forearms come up
  // ahead of them.
  out.upperArmL = [
    { seg: 'A', w: [0.55, 0.7], r: [0, 0, 16] },
    { seg: 'A', w: [0.7, 0.8], r: [GERWALK.upperArmL?.r?.[0] ?? -15, 0, 16] },
  ];
  out.upperArmR = [
    { seg: 'A', w: [0.55, 0.7], r: [0, 0, -16] },
    { seg: 'A', w: [0.7, 0.8], r: [GERWALK.upperArmR.r![0], 0, -16] },
  ];
  // For Battroid the antenna boom swings down along the block before it slides in.
  out.mast = [{ seg: 'B', w: [0.12, 0.22], r: [0, 0, 0] }];
  // The back block first lifts its channel clear of the waist keel it straddles in Fighter mode.
  out.tailModule = [
    { seg: 'A', w: [0.3, 0.4], p: [0, TL.hinge[1], TL.hinge[2] - 0.47] },
    // For Battroid the block first lifts off the back so the wing roots can run in under it.
    { seg: 'B', w: [0, 0.12], p: [0, TL.hinge[1] + G_BLOCK_SLIDE, TL.hinge[2] - 0.85] },
  ];
  return out;
})();

/* ------------------------------------------------------------------------- */
/* Evaluation                                                                */
/* ------------------------------------------------------------------------- */

/** Smoothstep with clamping: zero velocity at both ends (no jerky starts). */
export function smooth(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

const ALL_JOINTS = Array.from(
  new Set([...Object.keys(FIGHTER), ...Object.keys(GERWALK), ...Object.keys(BATTROID)]),
);

/** One scheduled motion of a joint: eases to (r, p) over [t0, t1] of overall progress. */
interface Move {
  t0: number;
  t1: number;
  r?: readonly number[];
  p?: readonly number[];
  /** Arc centre: p swings round it instead of running straight. */
  c?: readonly number[];
}

/** Per-joint timelines: waypoints then the main move, for each half of the transformation. */
const TRACKS: Record<string, Move[]> = (() => {
  const tracks: Record<string, Move[]> = {};
  for (const id of ALL_JOINTS) {
    const moves: Move[] = [];
    for (const [seg, start, wins, key] of [['A', 0, WIN_A, GERWALK], ['B', 0.5, WIN_B, BATTROID]] as const) {
      for (const wp of WAYPOINTS[id] ?? []) {
        if (wp.seg === seg) moves.push({ t0: start + wp.w[0] * 0.5, t1: start + wp.w[1] * 0.5, r: wp.r, p: wp.p, c: wp.c });
      }
      const [a, b] = wins[id] ?? [0, 1];
      const arc = ARCS[id]?.seg === seg ? ARCS[id].c : undefined;
      moves.push({ t0: start + a * 0.5, t1: start + b * 0.5, r: key[id]?.r ?? [0, 0, 0], p: key[id]?.p, c: arc });
    }
    for (let i = 1; i < moves.length; i++) {
      if (moves[i].t0 < moves[i - 1].t1 - 1e-9) throw new Error(`overlapping moves for ${id}`);
    }
    tracks[id] = moves;
  }
  return tracks;
})();

const lerp3 = (a: readonly number[], b: readonly number[], k: number) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);

/** Swing from a toward b round centre c (the shorter way), the radius blending if they differ. */
export function arcLerp(a: readonly number[], b: readonly number[], c: readonly number[], k: number): number[] {
  const va = [0, 1, 2].map((i) => a[i] - c[i]);
  const vb = [0, 1, 2].map((i) => b[i] - c[i]);
  const ra = Math.hypot(va[0], va[1], va[2]);
  const rb = Math.hypot(vb[0], vb[1], vb[2]);
  if (ra < 1e-9 || rb < 1e-9) return lerp3(a, b, k);
  const n = [va[1] * vb[2] - va[2] * vb[1], va[2] * vb[0] - va[0] * vb[2], va[0] * vb[1] - va[1] * vb[0]];
  const nl = Math.hypot(n[0], n[1], n[2]);
  if (nl < 1e-9) return lerp3(a, b, k);
  const angle = Math.atan2(nl, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]) * k;
  const u = va.map((x) => x / ra);
  const w = n.map((x) => x / nl);
  // Rodrigues: u turned by angle about w (u is perpendicular to w).
  const wxu = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  const r = ra + (rb - ra) * k;
  return [0, 1, 2].map((i) => c[i] + r * (u[i] * Math.cos(angle) + wxu[i] * Math.sin(angle)));
}

/**
 * Evaluate the rig at transformation progress t ∈ [0, 1]
 * (0 = Fighter, 0.5 = GERWALK, 1 = Battroid).
 */
export function evaluatePose(t: number): EvaluatedPose {
  const tc = Math.min(1, Math.max(0, t));
  const out: EvaluatedPose = {};
  for (const id of ALL_JOINTS) {
    let r: readonly number[] = FIGHTER[id]?.r ?? [0, 0, 0];
    let p: readonly number[] | undefined = FIGHTER[id]?.p;
    for (const mv of TRACKS[id]) {
      if (tc <= mv.t0) break;
      const k = smooth((tc - mv.t0) / (mv.t1 - mv.t0));
      if (mv.r) r = lerp3(r, mv.r, k);
      if (mv.p) p = p ? (mv.c ? arcLerp(p, mv.p, mv.c, k) : lerp3(p, mv.p, k)) : mv.p;
      if (tc < mv.t1) break;
    }
    out[id] = p ? { r: [...r], p: [...p] } : { r: [...r] };
  }
  return out;
}

/**
 * How much the GU-11 is in the right fist (1) versus on its mount (0): the mount has delivered it
 * into the fist's GERWALK hold, so the fist just closes on the grip (the two coincide).
 */
export function gripWeight(t: number): number {
  if (t >= 0.5) return 1;
  return smooth((t / 0.5 - 0.93) / 0.02);
}

/**
 * The ventral mount's run, as offsets of the grip from its Fighter position (torso frame): forward
 * until the stock clears the dropped knees, then down clear of the intakes.
 */
export function mountPath(t: number): [number, number, number] {
  if (t >= 0.5) return [0, D.gun.slide, D.gun.drop];
  const u = t / 0.5;
  return [0, D.gun.slide * smooth((u - 0.02) / 0.3), D.gun.drop * smooth((u - 0.34) / 0.14)];
}

/**
 * …then the mount strut swings the pod out under the right intake, rolling it grip-up, to just
 * inboard of the right fist's hold (0 → 1), clear of the arm as it swings down…
 */
export function mountDeliver(t: number): number {
  if (t >= 0.5) return 1;
  return smooth((t / 0.5 - 0.52) / 0.38);
}

/** …and, once the arm has settled, slides it outboard into the fist (0 → 1). */
export function mountRise(t: number): number {
  if (t >= 0.5) return 1;
  return smooth((t / 0.5 - 0.9) / 0.03);
}

/** The mount strut holds the pod until the fist has it, then retracts under the intake. */
export function mountStrutWeight(t: number): number {
  if (t <= 0) return 1;
  if (t >= 0.5) return 0;
  return 1 - smooth((t / 0.5 - 0.95) / 0.05);
}


/**
 * Shoulder transfer arms: `pole` swings the folded arm's elbow from forward under the glove to
 * hanging aft and down; `end` runs the gripper from the base to the shoulder block's socket. They
 * unfold (elbow first) once the legs have dropped, pick the blocks up as they finish sliding aft
 * out of the bay, carry them out and forward under the gloves, and fold away (gripper first) once
 * the shoulder locks have clamped the blocks and the arms have swung down.
 */
export function transferWeights(t: number): { end: number; pole: number } {
  if (t <= 0 || t >= 0.5) return { end: 0, pole: 0 };
  const u = t / 0.5;
  // They hand the blocks over once the blocks' backs rest on the gloves (and fold away).
  const hold = smooth((u - 0.24) / 0.06) * (1 - smooth((u - 0.7) / 0.04));
  const pole = smooth((u - 0.2) / 0.04) * (1 - smooth((u - 0.74) / 0.04));
  return { end: hold, pole };
}

/**
 * How strongly the feet are planted on the ground (drives the ground solve and
 * ankle levelling): 0 in flight, ramps in as the Fighter lands into GERWALK.
 */
export function plantWeight(t: number): number {
  if (t >= 0.5) return 1;
  return smooth((t / 0.5 - 0.62) / (0.96 - 0.62));
}
