import type * as THREE from 'three';
import type { Airframe } from './flight/model';
import type { DriveParams, DriveState } from './drive/locomotion';

/**
 * Contracts every mech in the MechDeck hangar implements. The app shell (UI,
 * camera, store, search) only talks to these, so adding a mech means adding a
 * folder under src/mechs/ and one registry entry.
 */

export interface SystemInfo {
  id: string;
  label: string;
  /** Legend / technical-diagram colour. */
  color: string;
  blurb: string;
}

export interface PartInfo {
  id: string;
  name: string;
  group: 'exterior' | 'internal';
  /** Anatomy system for internal parts. */
  system?: string;
  /** Short category label shown in the inspector. */
  category: string;
  description: string;
  aliases?: string[];
  /** Mode ids in which the part is folded away inside the airframe. */
  stowedIn?: string[];
}

export interface MechMode {
  id: string;
  label: string;
  /** Position on the 0…1 transformation timeline. */
  progress: number;
}

export interface MechSpec {
  label: string;
  value: string;
}

/** Pilot inputs for mechs with a flight mode (all normalised). */
export interface FlightControls {
  /** 0 … 1 (1 = military power; >0.9 lights the afterburner). */
  throttle: number;
  /** -1 … 1 stick inputs. */
  pitch: number;
  roll: number;
  yaw: number;
  /** 0 … 1 flap extension. */
  flaps: number;
  airbrake: boolean;
  /** Wing sweep in degrees, or null for the automatic Mach schedule. */
  sweep: number | null;
}

/** Live flight-model output for the HUD. */
export interface FlightTelemetry {
  airspeed: number; // true airspeed, m/s
  eas: number; // equivalent airspeed, m/s
  mach: number;
  altitude: number; // m
  vs: number; // vertical speed, m/s
  aoa: number; // degrees
  gLoad: number;
  sweep: number; // degrees
  pitch: number; // degrees
  bank: number; // degrees, + = right wing down
  heading: number; // degrees 0…360
  stall: boolean;
  /** Overboost ("afterburner") lit. */
  afterburner: boolean;
  /** Engine spool 0…1 (N1). */
  spool: number;
  /** Forces in newtons, for the force-vector overlay. */
  forces: { lift: number; weight: number; thrust: number; drag: number };
}

/** Control-surface and engine positions produced by the flight model, applied to the rig. */
export interface FlightSurfaces {
  sweep: number; // degrees
  flaps: number; // 0…1 (Fowler + two-section flap)
  slats: number; // 0…1
  spoilerL: number; // 0…1 raised
  spoilerR: number;
  rudder: number; // degrees, + = trailing edge to starboard (yaw right)
  airbrake: number; // 0…1
  nozzlePitch: number; // degrees, + = exhaust deflected up (nose-up moment)
  nozzleOpen: number; // 0…1 nozzle exit opening
  rcsL: number; // -1…1 wingtip roll thrusters, + pushes that wing up
  rcsR: number;
  spool: number; // 0…1
  overboost: number; // 0…1
}

/** On-screen pilot-mode controls (all normalised). */
export interface PilotControls {
  /** −1 … 1: back … forward. */
  forward: number;
  /** −1 … 1: left … right. */
  turn: number;
  /** Run (Battroid) / skim on the jets (GERWALK). */
  boost: boolean;
  /** Vernier-assisted jump (Battroid). */
  jump: boolean;
}

/** Live pilot-mode read-out for the HUD. */
export interface PilotTelemetry {
  /** The mode being driven, or null while converting between modes. */
  mode: string | null;
  speed: number; // m/s over the ground
  heading: number; // degrees 0…360
  hover: number; // 0…1
  airborne: boolean;
  running: boolean;
  distance: number; // m
}

/** Procedural motion layered on a mode's keyframe pose while the user drives the mech. */
export interface DrivePose {
  /** Extra joint rotations (Euler degrees, XYZ) added to the keyframe pose. */
  joints: Record<string, readonly [number, number, number]>;
  /** Extra torso pitch in degrees (+ leans / noses forward). */
  lean: number;
  /** 0 … 1: the feet tilt nozzles-down and the mech skims on its jets (GERWALK). */
  hover: number;
  /** Engines while driving: spool and overboost 0 … 1; null leaves them idle with no plumes. */
  exhaust: { spool: number; overboost: number } | null;
  /** Knees folded about their rear pivot (degrees, per knee bone), as a swinging leg bends. */
  flex?: Record<string, number>;
  /** Ankle pitch on top of the level stance (degrees, per ankle bone): − lifts the toe, + the heel. */
  feet?: Record<string, number>;
  /** Pelvis turn with the stride (degrees, + to the left). */
  yaw?: number;
  /** Extra height of the whole machine over the ground solve (m): the airborne phase of a run. */
  lift?: number;
}

/** One posable degree of freedom (joint control in the walking modes). */
export interface DofInfo {
  id: string;
  label: string;
  /** Panel group, e.g. "Left arm". */
  group: string;
  /** Offset range from the mode's keyframe pose. */
  min: number;
  max: number;
  step: number;
  unit: string;
  /** Mode ids in which the joint can be posed. */
  modes: string[];
}

/** The offset a joint actually took, and the two parts that stopped it short (if any). */
export interface DofResult {
  value: number;
  blockedBy?: [string, string];
}

export interface MechRuntime {
  readonly root: THREE.Object3D;
  readonly parts: Map<string, THREE.Mesh[]>;
  lastProgress: number;
  setProgress(t: number): void;
  tick(dt: number): void;
  setCutaway(on: boolean): void;
  setSystems(systems: Record<string, boolean>): void;
  setSelected(id: string | null): void;
  setHovered(id: string | null): void;
  exteriorBox(target?: THREE.Box3): THREE.Box3;
  approxBox(target?: THREE.Box3): THREE.Box3;
  /** Distance from `center` to the farthest extremity (within ~1% of the true silhouette radius). */
  approxRadius(center: THREE.Vector3): number;
  partBox(id: string, target?: THREE.Box3): THREE.Box3;
  markerWorld(id: string): THREE.Vector3;
  setJointsVisible?(on: boolean): void;
  /** Pose the flight controls (Fighter mode only); null returns everything to neutral. */
  setFlightSurfaces?(s: FlightSurfaces | null): void;
  /** Landing gear command 0 (up) … 1 (down); the gear also retracts as a conversion begins. */
  setGear?(down: number): void;
  /** Pilot modes: layer procedural gait / hover on the current pose (null: plain pose). */
  setDrive?(d: DrivePose | null): void;
  /** Joint control: pose one degree of freedom; it stops at the first contact with another part. */
  setDof?(id: string, value: number): DofResult;
  /** Clear every joint-control offset. */
  resetDofs?(): void;
  /** Keep one DoF's joint lit on its axis while it is being posed (null: none). */
  highlightDof?(id: string | null): void;
  /**
   * Where the camera should frame the mech at progress t (world space): a smooth path between the
   * modes' own centres, so neither the limbs' motion nor a posed joint makes the view wander.
   */
  frameCenter?(t: number, out: THREE.Vector3): THREE.Vector3;
  /** Free GPU resources once the mech leaves the stage. */
  dispose(): void;
}

export interface PilotProfile {
  /** Modes that can be driven, with their handling. */
  modes: { id: string; progress: number; params: DriveParams }[];
  /** Gait / hover layered on the mode's pose for the current drive state. */
  pose(modeId: string, drive: DriveState, params: DriveParams): DrivePose;
}

export interface MechDefinition {
  id: string;
  /** Short designation for tight spaces, e.g. "VF-1J". */
  designation: string;
  name: string;
  subtitle: string;
  blurb: string;
  modes: MechMode[];
  systems: SystemInfo[];
  parts: PartInfo[];
  specs: MechSpec[];
  /** Radius (m) of a sphere that contains the mech in every mode, for camera framing. */
  frameRadius: number;
  /** Attribution shown under the controls (design ownership, data sources). */
  credit: string;
  /** Flight-model parameters; mechs without one have no flight lab. */
  airframe?: Airframe;
  /** Ground-driving modes (pilot mode); mechs without one cannot be driven. */
  pilot?: PilotProfile;
  /** Posable joints (joint control); mechs without them have no joint panel. */
  dofs?: DofInfo[];
  create(): MechRuntime;
}
