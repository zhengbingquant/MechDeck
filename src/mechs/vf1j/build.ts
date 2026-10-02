import * as THREE from 'three';
import { Builder } from '../../core/builder';
import { createMaterials, type MaterialSet, type MatKey } from './materials';
import type { SystemId } from './systems';
import { buildSkeleton } from './rig';
import { buildFuselage } from './parts/fuselage';
import { buildHead } from './parts/head';
import { buildTail } from './parts/tail';
import { buildWings } from './parts/wings';
import { buildHipRails, buildLegs } from './parts/legs';
import { buildArms } from './parts/arms';
import { buildGunPod } from './parts/gunpod';
import { buildGear } from './parts/gear';
import { buildInternals, type Piston } from './parts/internals';
import { buildDrives } from './parts/drives';
import { buildGunStrut, buildTransferArms, type GunStrut, type TransferArm } from './parts/transfer';
import { addDecals } from './decals';
import { FlightFx } from './fx';
import { EngineFlow } from './flow';

export interface Mecha {
  /** Placement group: positioned/rotated by the controller's pose + ground solve. */
  root: THREE.Group;
  bones: Record<string, THREE.Bone>;
  markers: Record<string, THREE.Object3D>;
  exterior: THREE.Mesh[];
  internal: THREE.Mesh[];
  parts: Map<string, THREE.Mesh[]>;
  outlines: THREE.LineSegments[];
  pistons: Piston[];
  /** Shoulder transfer arms (two-link, solved by the controller each frame). */
  transfers: TransferArm[];
  /** GU-11 mount strut: telescopes between the starboard intake and the pod's lug. */
  gunStrut: GunStrut;
  /** Engine spools (userData.spin = relative rate) that turn while shown in cutaway or flying. */
  fans: THREE.Object3D[];
  /** Joint pinions that turn with their joint (userData.gearFollow). */
  gears: THREE.Object3D[];
  /** Knee-bellows duct segments (userData.bellows), laid along the knee arc by the controller. */
  bellows: THREE.Mesh[];
  /** Exhaust plumes, nozzle glow and roll-thruster jets for the flight lab. */
  fx: FlightFx;
  /** Air particles streaming through the engines in the cutaway. */
  flow: EngineFlow;
  mats: MaterialSet;
}

export function createMecha(): Mecha {
  const mats = createMaterials();
  const { root: skeletonRoot, bones } = buildSkeleton();
  const b = new Builder<MaterialSet, MatKey, SystemId>(bones, mats);
  buildFuselage(b);
  buildHead(b);
  buildTail(b);
  buildWings(b);
  buildLegs(b);
  buildHipRails(b);
  buildArms(b);
  buildGunPod(b);
  buildGear(b);
  const pistons = buildInternals(b);
  const transfer = buildTransferArms(b);
  pistons.push(...transfer.pistons);
  const gunStrut = buildGunStrut(b);
  pistons.push(gunStrut.piston);
  buildDrives(b);
  addDecals(b);
  b.finish();

  const fx = new FlightFx(bones);

  const root = new THREE.Group();
  root.name = 'VF-1J';
  root.add(skeletonRoot);
  const fans: THREE.Object3D[] = [];
  const gears: THREE.Object3D[] = [];
  const bellows: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o.userData.spin) fans.push(o);
    if (o.userData.gearFollow) gears.push(o);
    if (o.userData.bellows) bellows.push(o as THREE.Mesh);
  });
  const flow = new EngineFlow(bones, root);
  return {
    root,
    bones,
    markers: b.markers,
    exterior: b.exterior,
    internal: b.internal,
    parts: b.parts,
    outlines: b.outlines,
    pistons,
    transfers: transfer.arms,
    gunStrut,
    fans,
    gears,
    bellows,
    fx,
    flow,
    mats,
  };
}
