import * as THREE from 'three';
import { D } from './dims';
import { AIRBRAKE, HINGES, NOZZLE } from './surfaces';
import { MAIN_GEAR, NOSE_DOOR, NOSE_GEAR } from './parts/gear';
import { SHIN_AXIS_Z, shinAt } from './parts/legs';

const FIN_ROOT = D.tail.finRoot;
/** Antenna boom height on the module's tail face (five-view side view: mid-depth). */
export const MAST_Z = 0.15;

export type V3 = readonly [number, number, number];

export interface BoneDef {
  id: string;
  parent: string | null;
  /** Rest position in the parent bone's frame (overridden by pose `p`). */
  pos: V3;
  /** Human-readable joint name for the rig overlay / docs. */
  joint: string;
}

const L = D.leg;
const A = D.arm;

function legBones(side: 'L' | 'R'): BoneDef[] {
  const s = side === 'L' ? 1 : -1;
  return [
    { id: `hipRail${side}`, parent: 'torso', pos: [s * L.railBattroid[0], L.railBattroid[1], L.railBattroid[2]], joint: 'hip swing-bar carriage' },
    // The hip rail's telescoping lower section (runs out below the waist for Battroid).
    { id: `hipRailExt${side}`, parent: 'torso', pos: [0, 0, 0], joint: 'hip rail extension' },
    // The hip hub, inboard of the intake box (the leg turns on it, clear of the mouth and duct).
    { id: `hip${side}`, parent: `hipRail${side}`, pos: [-s * L.hipIn, 0, 0], joint: 'hip' },
    // Swing-bar lock: the carriage's arm into the fuselage side (Fighter / GERWALK), folded up into
    // the intake before the carriage slides (hinged at its outer end, on the carriage).
    { id: `hipLock${side}`, parent: `hipRail${side}`, pos: [-s * 0.55, 0, -0.26], joint: 'hip swing-bar lock' },
    // In flight the leg hangs from the intake lip; in Battroid it slides up so the intake flanks the waist.
    { id: `legSlide${side}`, parent: `hip${side}`, pos: [s * L.hipIn, 0, 0], joint: 'hip slide' },
    // Walking swings the leg here, under the intake box that flanks the waist.
    { id: `thighSwing${side}`, parent: `legSlide${side}`, pos: [0, -L.thighPivot, 0], joint: 'hip swing' },
    { id: `thighExt${side}`, parent: `thighSwing${side}`, pos: [0, -L.thighLen + L.thighPivot, 0], joint: 'thigh / knee housing' },
    { id: `knee${side}`, parent: `thighExt${side}`, pos: [0, 0, L.kneeFront], joint: 'knee' },
    { id: `shinExt${side}`, parent: `knee${side}`, pos: [0, -L.shinLen, L.ankleBack], joint: 'ankle housing' },
    { id: `ankle${side}`, parent: `shinExt${side}`, pos: [0, 0, 0], joint: 'ankle gimbal (pitch / roll)' },
    { id: `foot${side}`, parent: `ankle${side}`, pos: [0, 0, 0], joint: 'nozzle body' },
    // The split nozzle's clamshell flaps, pinned below the body end: toe in front, heel behind.
    { id: `toe${side}`, parent: `foot${side}`, pos: [0, NOZZLE.hingeY, NOZZLE.toeZ], joint: 'toe flap hinge' },
    { id: `heel${side}`, parent: `foot${side}`, pos: [0, NOZZLE.hingeY, NOZZLE.heelZ], joint: 'heel flap hinge' },
    // Main landing gear, hinged deep in the front (belly-side) face of the shin.
    {
      id: `mainGear${side}`,
      parent: `knee${side}`,
      pos: [0, MAIN_GEAR.alongShin, SHIN_AXIS_Z + shinAt(MAIN_GEAR.alongShin).d / 2 - MAIN_GEAR.depth],
      joint: 'main gear retraction',
    },
  ];
}

function armBones(side: 'L' | 'R'): BoneDef[] {
  const s = side === 'L' ? 1 : -1;
  return [
    { id: `shoulder${side}`, parent: 'torso', pos: [s * A.shoulderBattroid[0], A.shoulderBattroid[1], A.shoulderBattroid[2]], joint: 'shoulder slide carriage' },
    { id: `upperArm${side}`, parent: `shoulder${side}`, pos: [0, -A.pivotDrop, 0], joint: 'shoulder' },
    // Shoulder lock: a saddle that runs out of the block's back and clamps into the glove.
    { id: `shoulderLock${side}`, parent: `shoulder${side}`, pos: [0, 0, 0], joint: 'shoulder lock' },
    { id: `elbow${side}`, parent: `upperArm${side}`, pos: [0, -A.upperLen, 0], joint: 'elbow' },
    { id: `wrist${side}`, parent: `elbow${side}`, pos: [0, -A.foreLen, 0], joint: 'wrist' },
  ];
}

/** Flight-control surfaces hinged to the wings, fins, feet and chest plate. */
function surfaceBones(): BoneDef[] {
  const out: BoneDef[] = [];
  for (const h of HINGES) {
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const name = `${side === 'L' ? 'port' : 'starboard'} ${h.label}`;
      out.push({ id: h.bone + side, parent: h.parent + side, pos: [sx * h.pivot[0], h.pivot[1], h.pivot[2]], joint: name });
    }
  }
  out.push({ id: AIRBRAKE.bone, parent: AIRBRAKE.parent, pos: AIRBRAKE.pivot, joint: AIRBRAKE.label });
  return out;
}

export const BONES: BoneDef[] = [
  { id: 'torso', parent: null, pos: [0, 0, 0], joint: 'waist / centre fuselage' },
  { id: 'nose', parent: 'torso', pos: D.nose.hinge, joint: 'nose-section fold hinge' },
  { id: 'cockpit', parent: 'nose', pos: [0, D.nose.rearLen, 0], joint: 'cockpit slide' },
  { id: 'radome', parent: 'cockpit', pos: [0, D.nose.cockpitLen, 0], joint: 'radome telescope' },
  // Canopy shield: two nested hoods on rails along the canopy sills.
  { id: 'shieldA', parent: 'cockpit', pos: [0, 0, 0], joint: 'canopy shield rear hood slide' },
  { id: 'shieldB', parent: 'cockpit', pos: [0, 0, 0], joint: 'canopy shield front hood slide' },
  { id: 'noseGear', parent: 'cockpit', pos: NOSE_GEAR.pivot, joint: 'nose gear retraction' },
  { id: 'noseDoorL', parent: 'cockpit', pos: [NOSE_DOOR.halfWidth, NOSE_DOOR.y0, NOSE_DOOR.z], joint: 'port nose-gear door' },
  { id: 'noseDoorR', parent: 'cockpit', pos: [-NOSE_DOOR.halfWidth, NOSE_DOOR.y0, NOSE_DOOR.z], joint: 'starboard nose-gear door' },
  { id: 'head', parent: 'torso', pos: D.head.battroid, joint: 'neck / head turret' },
  // Laser fold pivots on the cheek housings' top front edges.
  { id: 'laserL', parent: 'head', pos: [0.66, 1.18, 0.25], joint: 'port laser fold' },
  { id: 'laserR', parent: 'head', pos: [-0.66, 1.18, 0.25], joint: 'starboard laser fold' },
  { id: 'tailModule', parent: 'torso', pos: D.tail.hinge, joint: 'tail-module fold hinge' },
  { id: 'finL', parent: 'tailModule', pos: [FIN_ROOT[0], FIN_ROOT[1], FIN_ROOT[2]], joint: 'port fin fold' },
  { id: 'finR', parent: 'tailModule', pos: [-FIN_ROOT[0], FIN_ROOT[1], FIN_ROOT[2]], joint: 'starboard fin fold' },
  // Antenna boom off the module's tail end; the whip telescopes out of it in GERWALK.
  { id: 'mast', parent: 'tailModule', pos: [0, -D.tail.length, MAST_Z], joint: 'antenna mast hinge' },
  { id: 'whip', parent: 'mast', pos: [0, -D.tail.mastLen + 0.02, 0], joint: 'antenna whip telescope' },
  // Pop-out vernier nozzles in the belly's well (they stand up for GERWALK).
  { id: 'vernierL', parent: 'tailModule', pos: [D.tail.vernier[0], D.tail.vernier[1], D.tail.depth - 0.25], joint: 'port vernier nozzle mount' },
  { id: 'vernierR', parent: 'tailModule', pos: [-D.tail.vernier[0], D.tail.vernier[1], D.tail.depth - 0.25], joint: 'starboard vernier nozzle mount' },
  // Wing-root carriages: in flight they sit in the gloves; for Battroid they run up the back.
  { id: 'wingRootL', parent: 'torso', pos: D.wing.pivot, joint: 'port wing-root carriage' },
  { id: 'wingRootR', parent: 'torso', pos: [-D.wing.pivot[0], D.wing.pivot[1], D.wing.pivot[2]], joint: 'starboard wing-root carriage' },
  { id: 'wingL', parent: 'wingRootL', pos: [0, 0, 0], joint: 'port wing sweep' },
  { id: 'wingR', parent: 'wingRootR', pos: [0, 0, 0], joint: 'starboard wing sweep' },
  ...legBones('L'),
  ...legBones('R'),
  ...armBones('L'),
  ...armBones('R'),
  // The GU-11 rides a ventral mount; the right hand takes it over during GERWALK (see controller).
  { id: 'gunPod', parent: 'torso', pos: D.gun.mount, joint: 'gun-pod mount / grip' },
  ...surfaceBones(),
];

/** Build the THREE.Bone tree; returns the root bone and a lookup map. */
export function buildSkeleton(): { root: THREE.Bone; bones: Record<string, THREE.Bone> } {
  const bones: Record<string, THREE.Bone> = {};
  for (const def of BONES) {
    const b = new THREE.Bone();
    b.name = def.id;
    b.position.set(...def.pos);
    b.userData.rest = def.pos;
    b.userData.joint = def.joint;
    bones[def.id] = b;
  }
  for (const def of BONES) {
    if (def.parent) bones[def.parent].add(bones[def.id]);
  }
  return { root: bones.torso, bones };
}
