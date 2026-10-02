import * as THREE from 'three';
import type { DofResult, DrivePose, FlightSurfaces, MechRuntime } from '../../core/types';
import type { Mecha } from './build';
import { applyCutaway } from './materials';
import { D } from './dims';
import { evaluatePose, gripWeight, mountDeliver, mountPath, mountRise, mountStrutWeight, plantWeight, transferWeights } from './poses';
import { solveTwoLink } from './parts/transfer';
import { SYSTEM_IDS, type SystemId } from './systems';
import { AIRBRAKE, HINGES, TRAVEL } from './surfaces';
import { JointOverlay } from '../../core/jointOverlay';
import { BELLOWS, bellowsLength, bellowsPoint } from './airpath';
import { KNEE_BACK } from './parts/legs';
import { flowSpeed } from './flow';
import { CollisionWorld } from '../../core/collisions';
import { guardedMove } from '../../core/jointGuard';
import { VF1J_COLLISION_RULES } from './collisionRules';
import { DOF_BY_ID } from './dofs';

const SMALL_JOINT = /^(slat|flapIn|flapOut|spoiler|rudder|toe|heel|airbrake|laser|ramp|bypass)/;

const D2R = Math.PI / 180;
/** Converting from the Fighter the craft lifts this far on its jets while the legs unfold. */
const HOVER_CLEAR = 0.35;
const SOLE_IDS = ['L', 'R'].flatMap((s) =>
  ['toeIn', 'toeOut', 'heelIn', 'heelOut'].map((c) => `sole${s}_${c}`),
);
const UP = new THREE.Vector3(0, 1, 0);
const SELECT_GLOW = new THREE.Color('#ff8a1f');
const HOVER_GLOW = new THREE.Color('#ffc27a');
const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Air-inlet schedule (0…1): the ramps start lowering at 35° of sweep and are fully down at 72°. */
const inletSchedule = (sweep: number) => smoothstep((sweep - 35) / 37);
/** Engine spool while idling on the ground (the cutaway's slowly turning fans). */
const IDLE_SPOOL = 0.11;

/** Slerp a toward b along the arc b's sign selects (THREE's slerp always takes the shorter one). */
function slerpArc(a: THREE.Quaternion, b: THREE.Quaternion, t: number) {
  const cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const th = Math.acos(Math.min(1, Math.max(-1, cos)));
  const s = Math.sin(th);
  if (s < 1e-6) return a.slerp(b, t);
  const ka = Math.sin((1 - t) * th) / s;
  const kb = Math.sin(t * th) / s;
  return a.set(a.x * ka + b.x * kb, a.y * ka + b.y * kb, a.z * ka + b.z * kb, a.w * ka + b.w * kb);
}
const NEUTRAL_SURFACES: FlightSurfaces = {
  sweep: 20, flaps: 0, slats: 0, spoilerL: 0, spoilerR: 0, rudder: 0, airbrake: 0,
  nozzlePitch: 0, nozzleOpen: 0.25, rcsL: 0, rcsR: 0, spool: 0, overboost: 0,
};

/** A control-surface bone: rest position on its hinge, hinge axis, and which way it turns. */
interface SurfaceBone {
  bone: THREE.Bone;
  kind: string;
  side: 'L' | 'R' | '';
  pivot: THREE.Vector3;
  axis: THREE.Vector3;
  /** −1 where the starboard copy mirrors the port motion. */
  sign: number;
}

/**
 * Drives the rig: applies the keyframed pose for a transformation progress,
 * levels and plants the feet, re-aims the hydraulic rams, and owns the
 * anatomy (cutaway) and selection styling.
 */
export class MechaController implements MechRuntime {
  private readonly v = new THREE.Vector3();
  private readonly pa = new THREE.Vector3();
  private readonly pb = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly qParent = new THREE.Quaternion();
  private readonly qTarget = new THREE.Quaternion();
  private readonly basis = new THREE.Matrix4();
  private readonly ax = new THREE.Vector3();
  private readonly az = new THREE.Vector3();
  private readonly mountPos = new THREE.Vector3(...D.gun.mount);
  // Slung grip-down, muzzle toward the nose.
  private readonly mountQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
  private readonly gripOffset = new THREE.Matrix4().makeTranslation(...D.gun.grip);
  /**
   * The fist's orientation in the torso frame once it holds the GU-11 in GERWALK (the arm chain's
   * keyframes), signed to lie on the mount's side: fixes which arc the hand-over blend takes.
   */
  private readonly gripHold = (() => {
    const pose = evaluatePose(0.5);
    const q = new THREE.Quaternion();
    const k = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (const id of ['shoulderR', 'upperArmR', 'elbowR', 'wristR']) {
      const r = pose[id].r;
      q.multiply(k.setFromEuler(e.set(r[0] * D2R, r[1] * D2R, r[2] * D2R)));
    }
    return q.dot(this.mountQuat) < 0 ? q.set(-q.x, -q.y, -q.z, -q.w) : q;
  })();
  /** The fist's grip frame in its GERWALK hold (torso frame): where the mount delivers the pod. */
  private readonly holdPos = new THREE.Vector3();
  private readonly holdQuat = new THREE.Quaternion();
  private readonly m4 = new THREE.Matrix4();
  private readonly gp = new THREE.Vector3();
  private readonly gq = new THREE.Quaternion();
  private readonly gs = new THREE.Vector3();

  private surfaces: FlightSurfaces | null = null;
  private drive: DrivePose | null = null;
  /** Joint-control offsets (DoF id → degrees / %), on top of the mode's keyframe pose. */
  private dofs: Record<string, number> = {};
  /** Every body of the rig, prepared on first use, that a posed joint must not pass through. */
  private guard: CollisionWorld | null = null;
  /** Landing gear command (1 = down); multiplied by the conversion's own retraction. */
  private gearCmd = 1;
  /** Ankle in line with the shin (the Fighter-mode alignment). */
  private readonly qTilt = new THREE.Quaternion();
  private readonly surfaceBones: SurfaceBone[] = [];
  private readonly slide = new THREE.Vector3();
  private cutaway = false;
  private systems = Object.fromEntries(SYSTEM_IDS.map((id) => [id, true])) as Record<SystemId, boolean>;
  private selected: string | null = null;
  private hovered: string | null = null;
  private readonly variants = new Map<string, THREE.Material>();
  private readonly joints: JointOverlay;

  /** Last progress applied to the rig (NaN before the first call). */
  lastProgress = NaN;
  /**
   * Where the feet stand (rig-frame z of the soles' mean) from GERWALK on: where they land at the
   * end of the Fighter → GERWALK conversion, which the craft makes without moving off its spot.
   */
  private zPlant = NaN;
  /**
   * The soles' mean in the root's own frame in the plain GERWALK and Battroid stances. Striding,
   * the body keeps station over it (turned with the body's lean), rather than chasing the mean of
   * a swinging and a planted foot, which would drag the planted one along the ground.
   */
  private readonly stanceRef = new Map<number, THREE.Vector3>();
  /**
   * Ankle x (rig frame) where each foot stands from GERWALK on, and where it stands in the Battroid
   * stance (the legs splay 3° and the hip carriages run slightly outboard): standing up, the feet
   * stay put, then step out to the Battroid stance one after the other.
   */
  private readonly ankleX = { plant: [NaN, NaN], battroid: [NaN, NaN] };
  /** Whether each foot (L, R) is mid-step: a stepping foot bears no weight. */
  private readonly stepLift = [0, 0];
  private readonly rootHold = new THREE.Vector3();
  /** Rig-frame centres of the Fighter, GERWALK and Battroid (camera framing). */
  private readonly modeCenters: THREE.Vector3[] = [];

  constructor(readonly mecha: Mecha) {
    for (const h of HINGES) {
      for (const side of ['L', 'R'] as const) {
        const sx = side === 'L' ? 1 : -1;
        const axis = new THREE.Vector3(h.to[0] - h.pivot[0], h.to[1] - h.pivot[1], h.to[2] - h.pivot[2]).normalize();
        axis.x *= sx;
        this.surfaceBones.push({
          bone: mecha.bones[h.bone + side],
          kind: h.bone,
          side,
          pivot: new THREE.Vector3(sx * h.pivot[0], h.pivot[1], h.pivot[2]),
          axis,
          sign: side === 'L' || h.antisymmetric ? 1 : -1,
        });
      }
    }
    this.surfaceBones.push({
      bone: mecha.bones[AIRBRAKE.bone],
      kind: 'airbrake',
      side: '',
      pivot: new THREE.Vector3(...AIRBRAKE.pivot),
      axis: new THREE.Vector3(1, 0, 0),
      sign: 1,
    });
    this.joints = new JointOverlay(
      Object.values(mecha.bones).filter((b) => b.name !== 'torso'),
      (b) => (SMALL_JOINT.test(b.name) ? 0.16 : b.name === 'gunPod' ? 0.3 : 0.34),
    );
    this.refreshInternals();
    // Measure where the GERWALK's feet land, then leave the rig unposed.
    this.lastProgress = 0.5;
    this.solve(0.5, false, null);
    this.zPlant = this.soleMean().z;
    this.ankleX.plant = ['L', 'R'].map((S) => this.markerLocal(mecha.bones[`ankle${S}`], this.v).x);
    this.lastProgress = 1;
    this.solve(1, false, null);
    this.ankleX.battroid = ['L', 'R'].map((S) => this.markerLocal(mecha.bones[`ankle${S}`], this.v).x);
    this.lastProgress = 0.5;
    this.solve(0.5, false, null);
    this.m4.copy(mecha.bones.torso.matrixWorld).invert().multiply(mecha.bones.wristR.matrixWorld).multiply(this.gripOffset);
    this.m4.decompose(this.holdPos, this.holdQuat, this.gs);
    for (const t of [0, 0.5, 1]) {
      this.lastProgress = t;
      this.solve(t, false, null);
      this.modeCenters.push(this.exteriorBox().getCenter(new THREE.Vector3()));
      if (t > 0) this.stanceRef.set(t, this.soleMean().applyMatrix4(this.m4.copy(this.mecha.root.matrix).invert()));
    }
    this.lastProgress = NaN;
  }

  frameCenter(t: number, out: THREE.Vector3): THREE.Vector3 {
    const [c0, c1, c2] = this.modeCenters;
    const tc = Math.min(1, Math.max(0, Number.isNaN(t) ? 0 : t));
    if (tc <= 0.5) out.lerpVectors(c0, c1, smoothstep(tc / 0.5));
    else out.lerpVectors(c1, c2, smoothstep((tc - 0.5) / 0.5));
    const parent = this.mecha.root.parent;
    if (parent) out.applyMatrix4(parent.matrixWorld);
    return out;
  }

  get root(): THREE.Object3D {
    return this.mecha.root;
  }

  get parts(): Map<string, THREE.Mesh[]> {
    return this.mecha.parts;
  }

  /* ------------------------------------------------------------------ pose */

  setProgress(t: number): void {
    this.lastProgress = t;
    // Posed joints move only the limbs: the body holds where the plain pose stands it.
    if (this.dofMode() && Object.values(this.dofs).some((v) => v)) {
      this.solve(t, false, null);
      this.rootHold.copy(this.mecha.root.position);
      this.solve(t, true, this.rootHold);
    } else this.solve(t, false, null);
  }

  /** Pose the rig for progress t, with or without the joint-control offsets; `hold` fixes the body. */
  private solve(t: number, dofs: boolean, hold: THREE.Vector3 | null) {
    const { root, bones } = this.mecha;
    const pose = evaluatePose(t);
    for (const [id, jp] of Object.entries(pose)) {
      const obj: THREE.Object3D | undefined = id === 'root' ? root : bones[id];
      if (!obj) continue;
      obj.rotation.set(jp.r[0] * D2R, jp.r[1] * D2R, jp.r[2] * D2R);
      if (jp.p) obj.position.set(jp.p[0], jp.p[1], jp.p[2]);
    }
    // Knees sit on their front hinge unless bent about the rear pivot below (no keyframe moves them).
    for (const S of ['L', 'R']) bones[`knee${S}`].position.set(...(bones[`knee${S}`].userData.rest as [number, number, number]));
    // Pilot modes: the gait rides on top of the keyframe pose (the stride's small knee bends use
    // the front hinge, which lifts the swinging foot most per degree).
    const drive = this.drive;
    if (drive) {
      for (const [id, r] of Object.entries(drive.joints)) {
        const b = bones[id];
        if (b) b.rotation.set(b.rotation.x + r[0] * D2R, b.rotation.y + r[1] * D2R, b.rotation.z + r[2] * D2R);
      }
      root.rotation.x += drive.lean * D2R;
      if (drive.yaw) root.rotation.y += drive.yaw * D2R;
      // A swinging leg folds at the knee's rear pivot, as the joint control's knee flex does.
      if (drive.flex) for (const [id, deg] of Object.entries(drive.flex)) if (deg) this.flexKnee(bones[id], deg);
    }
    this.applySurfaces();
    if (dofs) this.applyDofs('body');
    this.stepLift.fill(0);
    if (t > 0.5 && t < 1 && !hold && !drive) this.keepStance(t);
    this.applyGear(t);
    this.updateGears();
    this.updateBellows();
    root.updateMatrixWorld(true);
    // The pod's torso-frame transform depends only on the pose, and the ground
    // solve below must see where it is now (not where the previous call left it).
    this.updateGunPod(t);
    const w = plantWeight(t);
    if (w > 0) {
      this.levelFeet(w);
      // Hover: the nozzles swing back into line with the trailing shins, as in flight (the
      // gait closes the toe and heel in toward the nozzle shape).
      if (drive && drive.hover > 0) {
        const swing = Math.max(0, drive.hover * 2 - 1);
        for (const side of ['L', 'R']) this.mecha.bones[`ankle${side}`].quaternion.slerp(this.qTilt, swing);
      }
      // The stride rolls the feet heel to toe; posed ankles tilt the nozzles relative to level.
      if (drive?.feet) for (const [id, deg] of Object.entries(drive.feet)) this.mecha.bones[id].rotation.x += deg * D2R;
      if (dofs) this.applyDofs('foot');
      root.updateMatrixWorld(true);
      if (hold) root.position.copy(hold);
      else this.plant(w, t);
      // Airborne between running steps.
      if (drive?.lift) root.position.y += drive.lift;
      root.updateMatrixWorld(true);
      this.relaxLiftedFeet();
    }
    if (!hold) this.liftAboveGround(t);
    this.updateTransfers(t);
    this.updatePistons();
  }

  /** Shoulder transfer arms: the gripper folds in under the glove or holds the block's socket. */
  private updateTransfers(t: number) {
    // The gun-pod mount strut: its end on the pod's lug, or retracted under the intake.
    const strut = this.mecha.gunStrut;
    strut.frame.worldToLocal(strut.lug.getWorldPosition(this.pa));
    // It swings about its hinge on the intake and telescopes: direction and length blend
    // separately, so its length always lies between the stowed and the reaching one.
    const base = strut.piston.a.position;
    const ws = mountStrutWeight(t);
    this.pb.subVectors(strut.stow, base);
    this.pa.sub(base);
    const len = THREE.MathUtils.lerp(this.pb.length(), this.pa.length(), ws);
    this.qParent.setFromUnitVectors(this.pb.normalize(), this.pa.normalize());
    this.qTarget.identity().slerp(this.qParent, ws);
    strut.end.position.copy(this.pb).applyQuaternion(this.qTarget).multiplyScalar(len).add(base);
    strut.end.updateMatrixWorld(true);
    const w = transferWeights(t);
    const torso = this.mecha.bones.torso;
    for (const arm of this.mecha.transfers) {
      torso.worldToLocal(arm.coupling.getWorldPosition(this.pa));
      this.pb.copy(arm.stow).lerp(this.pa, w.end);
      this.v.copy(arm.poleStow).lerp(arm.poleCarry, w.pole);
      solveTwoLink(arm.base.position, this.pb, arm.l1, arm.l2, this.v, arm.elbow.position, arm.hand.position);
      arm.elbow.updateMatrixWorld(true);
      arm.hand.updateMatrixWorld(true);
    }
  }

  /* ---------------------------------------------------------- joint control */

  /** GERWALK or Battroid when the rig sits exactly in that mode (joint control applies only there). */
  private dofMode(): string | null {
    const t = this.lastProgress;
    if (Math.abs(t - 0.5) < 1e-9) return 'gerwalk';
    if (Math.abs(t - 1) < 1e-9) return 'battroid';
    return null;
  }

  private applyDofs(stage: 'body' | 'foot') {
    const mode = this.dofMode();
    if (!mode) return;
    for (const [id, v] of Object.entries(this.dofs)) {
      const def = DOF_BY_ID[id];
      if (!v || !def || def.stage !== stage || !def.modes.includes(mode)) continue;
      for (const t of (mode === 'battroid' && def.battroidTargets) || def.targets) {
        const b = this.mecha.bones[t.bone];
        if (t.kind === 'kneeFlex') this.flexKnee(b, v * t.scale);
        else if (t.kind === 'rot') b.rotation[t.axis] += v * t.scale * D2R;
        else b.position[t.axis] += v * t.scale;
      }
    }
  }

  /**
   * Bend a knee back by `deg` about its rear pivot (the shin's back-top edge) rather than the
   * front hinge: turn the bone and shift it so the pivot stays put. (The front hinge alone lifts
   * the calf into the thigh after ~20°.)
   */
  private flexKnee(knee: THREE.Bone, deg: number) {
    this.pa.set(...KNEE_BACK).applyQuaternion(knee.quaternion);
    knee.rotation.x += deg * D2R;
    this.pb.set(...KNEE_BACK).applyQuaternion(knee.quaternion);
    knee.position.add(this.pa).sub(this.pb);
  }

  /**
   * Pose one degree of freedom (offset from the mode's keyframe pose). The joint moves in small
   * steps and stops at the first contact with any other part, exterior or internal, so a posed
   * rig never interpenetrates; the result says what stopped it.
   */
  setDof(id: string, value: number): DofResult {
    const def = DOF_BY_ID[id];
    if (!def || !this.dofMode() || !def.modes.includes(this.dofMode()!)) return { value: this.dofs[id] ?? 0 };
    const target = THREE.MathUtils.clamp(value, def.min, def.max);
    const from = this.dofs[id] ?? 0;
    this.guard ??= new CollisionWorld(this.mecha, VF1J_COLLISION_RULES, true);
    let contact: [string, string] | undefined;
    const clear = (v: number) => {
      this.dofs[id] = v;
      this.setProgress(this.lastProgress);
      // The floor is solid too: nothing may be pushed below it.
      if (this.lowestMarker() < -0.03) {
        contact = ['ground', id];
        return false;
      }
      const hit = this.guard!.check(true)[0];
      if (hit) contact = [hit.a, hit.b];
      return !hit;
    };
    const r = guardedMove(from, target, def.unit === '°' ? 4 : (def.max - def.min) / 25, clear);
    this.dofs[id] = r.value;
    this.setProgress(this.lastProgress);
    return r.blocked && contact ? { value: r.value, blockedBy: contact } : { value: r.value };
  }

  highlightDof(id: string | null) {
    const def = id ? DOF_BY_ID[id] : undefined;
    this.joints.focus(def ? def.targets.map((t) => ({ bone: t.bone, axis: t.axis, slide: t.kind === 'pos' })) : null);
  }

  /** Clear every joint-control offset (back to the mode's keyframe pose). */
  resetDofs() {
    this.dofs = {};
    if (!Number.isNaN(this.lastProgress)) this.setProgress(this.lastProgress);
  }

  /**
   * Landing gear: down when parked in Fighter mode, up in the air (flight lab) and
   * as soon as a conversion starts. The doors open before the nose gear drops and
   * close only once it is home.
   */
  private applyGear(t: number) {
    const { bones } = this.mecha;
    const g = this.gearCmd * (1 - smoothstep(t / 0.04));
    const up = 1 - g;
    bones.noseGear.rotation.set(-92 * up * D2R, 0, 0);
    const door = smoothstep(Math.min(1, g * 12)) * 84 * D2R;
    bones.noseDoorL.rotation.set(0, door, 0);
    bones.noseDoorR.rotation.set(0, -door, 0);
    for (const side of ['L', 'R']) bones[`mainGear${side}`].rotation.set(90 * up * D2R, 0, 0);
  }

  setGear(down: number) {
    const g = Math.min(1, Math.max(0, down));
    if (g === this.gearCmd) return;
    this.gearCmd = g;
    if (!Number.isNaN(this.lastProgress)) this.setProgress(this.lastProgress);
  }

  /** GU-11: on its ventral mount in flight, run forward and handed to the right fist during GERWALK conversion. */
  private updateGunPod(t: number) {
    const pod = this.mecha.bones.gunPod;
    const w = gripWeight(t);
    pod.position.copy(this.mountPos).add(this.v.set(...mountPath(t)));
    pod.quaternion.copy(this.mountQuat);
    const d = mountDeliver(t);
    if (d > 0) {
      // Out under the intake to just inboard of the fist's hold, clear of the arm as it swings
      // down, then (the arm settled) outboard into the fist.
      this.gp.copy(this.holdPos).add(this.v.set(0.9 * (1 - mountRise(t)), 0, 0));
      pod.position.lerp(this.gp, d);
      pod.quaternion.slerp(this.holdQuat, d);
    }
    if (w > 0) {
      const torso = this.mecha.bones.torso;
      this.m4.copy(torso.matrixWorld).invert().multiply(this.mecha.bones.wristR.matrixWorld).multiply(this.gripOffset);
      this.m4.decompose(this.gp, this.gq, this.gs);
      pod.position.lerp(this.gp, w);
      // Mount and grip are nearly opposite orientations, where a shortest-path slerp flips
      // direction as the arm moves. Keep the arc that ends in the GERWALK hold instead.
      if (this.gq.dot(this.gripHold) < 0) this.gq.set(-this.gq.x, -this.gq.y, -this.gq.z, -this.gq.w);
      slerpArc(pod.quaternion, this.gq, w);
    }
    pod.updateMatrixWorld(true);
  }

  /**
   * Turn each ankle gimbal so the nozzle stands upright (exhaust straight down, toe and heel
   * flat on the ground), heading where the shin faces.
   */
  private levelFeet(w: number) {
    for (const side of ['L', 'R']) {
      const ankle = this.mecha.bones[`ankle${side}`];
      const parent = ankle.parent!;
      parent.getWorldQuaternion(this.qParent);
      this.az.set(0, 0, 1).applyQuaternion(this.qParent);
      this.az.y = 0;
      if (this.az.lengthSq() < 1e-6) this.az.set(0, 0, 1);
      this.az.normalize();
      this.ax.crossVectors(UP, this.az);
      this.basis.makeBasis(this.ax, UP, this.az);
      this.qTarget.setFromRotationMatrix(this.basis);
      this.qParent.invert().multiply(this.qTarget);
      ankle.quaternion.slerp(this.qParent, w);
    }
  }

  /**
   * A foot lifted well clear of the ground (a leg posed up) needn't stay level: its ankle eases back
   * into line with the shin between 0.4 and 1.2 m of lift, as a raised leg relaxes, instead of
   * holding the nozzle upright at an angle the ankle's ball joint can't reach.
   */
  private relaxLiftedFeet() {
    for (const S of ['L', 'R']) {
      let low = Infinity;
      for (const c of ['toeIn', 'toeOut', 'heelIn', 'heelOut']) low = Math.min(low, this.markerLocal(this.mecha.markers[`sole${S}_${c}`], this.v).y);
      const k = smoothstep((low - 0.4) / 0.8);
      if (k <= 0) continue;
      this.mecha.bones[`ankle${S}`].quaternion.slerp(this.qTilt, k);
      this.mecha.bones[`ankle${S}`].updateMatrixWorld(true);
    }
  }

  /**
   * Standing up from GERWALK the feet stay where they landed (the legs' splay is taken up at the
   * thigh joints); then the machine steps each foot out to the Battroid stance, left then right:
   * the thigh swings forward and the knee folds on its front hinge so the boot lifts straight up,
   * moves out and sets down again.
   */
  private keepStance(t: number) {
    const { plant, battroid } = this.ankleX;
    if (![...plant, ...battroid].every(Number.isFinite)) return;
    const { bones, root } = this.mecha;
    for (const [i, S] of ['L', 'R'].entries()) {
      const u = Math.min(1, Math.max(0, (t - (S === 'L' ? 0.86 : 0.9)) / 0.04));
      const lift = Math.sin(Math.PI * u);
      this.stepLift[i] = u > 0 && u < 1 ? 1 : 0;
      const thigh = bones[`thighSwing${S}`];
      if (lift > 0) {
        // Thigh 13.5° forward and the knee's front hinge 17° more (23° with the stance's 6°, inside
        // the hinge's ~25°): the boot rises 0.25 m almost straight up.
        thigh.rotation.x -= 13.5 * lift * D2R;
        bones[`knee${S}`].rotation.x += 17 * lift * D2R;
      }
      const target = plant[i] + (battroid[i] - plant[i]) * smoothstep(u);
      // Two passes of the splay correction (lever: thigh pivot to ankle, ~5.4 m).
      for (let k = 0; k < 2; k++) {
        root.updateMatrixWorld(true);
        thigh.rotation.z += (target - this.markerLocal(bones[`ankle${S}`], this.v).x) / 5.4;
      }
    }
    root.updateMatrixWorld(true);
  }

  /** Mean position of the soles in the rig's own frame. */
  private soleMean(out = new THREE.Vector3()): THREE.Vector3 {
    out.set(0, 0, 0);
    for (const id of SOLE_IDS) out.add(this.markerLocal(this.mecha.markers[id], this.v));
    return out.divideScalar(SOLE_IDS.length);
  }

  /** Lowest marker in the rig's own frame (the floor is y = 0). */
  private lowestMarker(): number {
    let minY = Infinity;
    for (const o of Object.values(this.mecha.markers)) minY = Math.min(minY, this.markerLocal(o, this.v).y);
    return minY;
  }

  /**
   * Put the soles on the ground. From GERWALK on they also stay where they landed (zPlant); while
   * converting from the Fighter the craft keeps its own spot and settles onto its unfolded legs.
   */
  /**
   * A marker's position in the rig's own frame (the root's parent), so the ground
   * solve works wherever a parent group carries the mech (pilot mode, flight lab).
   */
  private markerLocal(o: THREE.Object3D, target: THREE.Vector3): THREE.Vector3 {
    o.getWorldPosition(target);
    const parent = this.mecha.root.parent;
    return parent ? parent.worldToLocal(target) : target;
  }

  private plant(w: number, t: number) {
    let minY = Infinity;
    // Soles' mean z per foot, weighted by the weight the foot bears (a stepping foot bears none).
    let sumZ = 0;
    let sumW = 0;
    for (const id of SOLE_IDS) {
      const p = this.markerLocal(this.mecha.markers[id], this.v);
      minY = Math.min(minY, p.y);
      const k = 1 - this.stepLift[id.startsWith('soleL') ? 0 : 1];
      sumZ += k * p.z;
      sumW += k;
    }
    const root = this.mecha.root;
    root.position.y -= w * minY;
    if (t >= 0.5 && !Number.isNaN(this.zPlant)) {
      const ref = this.drive ? this.stanceRef.get(t) : undefined;
      const meanZ = ref ? this.v.copy(ref).applyMatrix4(root.matrix).z : sumZ / Math.max(1e-6, sumW);
      root.position.z += w * (this.zPlant - meanZ);
    }
  }

  /**
   * Keep everything above the floor. Converting from the Fighter the craft lifts off on its jets as
   * the gear retracts (VTOL), so the unfolding legs swing clear instead of scraping the floor, and
   * settles onto its feet as they plant.
   */
  private liftAboveGround(t: number) {
    const clear = t > 0 && t < 0.5 ? HOVER_CLEAR * smoothstep(t / 0.06) * (1 - plantWeight(t)) : 0;
    const minY = this.lowestMarker();
    if (minY < clear) {
      this.mecha.root.position.y += clear - minY;
      this.mecha.root.updateMatrixWorld(true);
    }
  }

  /** Point every ram's barrel at its rod anchor and vice versa. */
  private updatePistons() {
    const torso = this.mecha.bones.torso;
    for (const p of this.mecha.pistons) {
      torso.worldToLocal(p.a.getWorldPosition(this.pa));
      torso.worldToLocal(p.b.getWorldPosition(this.pb));
      this.dir.subVectors(this.pb, this.pa);
      if (this.dir.lengthSq() < 1e-8) continue;
      this.dir.normalize();
      p.barrel.position.copy(this.pa);
      p.barrel.quaternion.setFromUnitVectors(UP, this.dir);
      // Multi-stage rams: the intermediate tubes share the extension evenly.
      const step = (this.pa.distanceTo(this.pb) - p.length) / (p.stages.length + 1);
      p.stages.forEach((tube, i) => {
        tube.position.copy(this.pa).addScaledVector(this.dir, step * (i + 1));
        tube.quaternion.copy(p.barrel.quaternion);
        tube.updateMatrixWorld(true);
      });
      p.rod.position.copy(this.pb);
      p.rod.quaternion.setFromUnitVectors(UP, this.dir.negate());
      p.barrel.updateMatrixWorld(true);
      p.rod.updateMatrixWorld(true);
    }
  }

  /* ------------------------------------------------------------ flight */

  /**
   * Pose the flight controls: wing sweep, slats, flaps, spoilers, rudders,
   * airbrake and the 2-D nozzle flaps (Fighter mode only; null = neutral).
   */
  setFlightSurfaces(s: FlightSurfaces | null) {
    this.surfaces = s;
    if (!Number.isNaN(this.lastProgress)) this.setProgress(this.lastProgress);
    this.mecha.fx.update(s);
  }

  /**
   * Pilot modes (GERWALK / Battroid): layer the gait on the current pose and run the
   * engines for it; null returns to the plain keyframe pose.
   */
  setDrive(d: DrivePose | null) {
    this.drive = d;
    if (!Number.isNaN(this.lastProgress)) this.setProgress(this.lastProgress);
    if (!this.surfaces) {
      const e = d?.exhaust;
      this.mecha.fx.update(e ? { ...NEUTRAL_SURFACES, spool: e.spool, overboost: e.overboost, nozzleOpen: 0.4 + 0.6 * e.overboost } : null);
    }
  }

  private applySurfaces() {
    const s = this.surfaces;
    const flying = !!s && this.lastProgress <= 1e-6;
    const { bones } = this.mecha;
    if (flying) {
      bones.wingL.rotation.z = -s.sweep * D2R;
      bones.wingR.rotation.z = s.sweep * D2R;
    }
    const nozzleOpen = THREE.MathUtils.lerp(TRAVEL.nozzleClosed, TRAVEL.nozzleOpen, s?.nozzleOpen ?? 0.25);
    for (const sb of this.surfaceBones) {
      let deg = 0;
      this.slide.set(0, 0, 0);
      if (flying) {
        switch (sb.kind) {
          case 'slat':
            deg = TRAVEL.slatDeg * s.slats;
            this.slide.set(...TRAVEL.slatSlide).multiplyScalar(s.slats);
            break;
          case 'flapIn':
            deg = -TRAVEL.fowlerDeg * s.flaps;
            this.slide.set(...TRAVEL.fowlerSlide).multiplyScalar(smoothstep(Math.min(1, s.flaps * 1.6)));
            break;
          case 'flapOut':
            deg = -TRAVEL.outerDeg * s.flaps;
            break;
          case 'spoiler':
            deg = TRAVEL.spoilerDeg * (sb.side === 'L' ? s.spoilerL : s.spoilerR);
            break;
          case 'rudder':
            deg = s.rudder;
            break;
          case 'airbrake':
            deg = AIRBRAKE.maxDeg * s.airbrake;
            break;
          // Air-inlet control: ramps down and the bypass door open as the speed (sweep) rises.
          case 'ramp1':
            deg = -TRAVEL.ramp1Deg * inletSchedule(s.sweep);
            break;
          case 'ramp2':
            deg = TRAVEL.ramp2Deg * inletSchedule(s.sweep);
            break;
          case 'bypass':
            deg = TRAVEL.bypassDeg * inletSchedule(s.sweep);
            break;
        }
      }
      if (sb.side === 'R') this.slide.x = -this.slide.x;
      sb.bone.position.copy(sb.pivot).add(this.slide);
      sb.bone.quaternion.setFromAxisAngle(sb.axis, sb.sign * deg * D2R);
    }
    // Split-nozzle flaps (toe below, heel above in flight): pitch turns both together, opening
    // spreads them apart, on top of their keyframe angles.
    if (flying) {
      for (const S of ['L', 'R']) {
        bones[`heel${S}`].rotation.x += (s.nozzlePitch + nozzleOpen) * D2R;
        bones[`toe${S}`].rotation.x += (s.nozzlePitch - nozzleOpen) * D2R;
      }
    }
  }

  /**
   * Knee bellows: the duct segments lie along an arc about the knee hinge, sharing out the
   * knee angle, so the thigh duct runs smoothly into the shin's at any bend.
   */
  private updateBellows() {
    const n = BELLOWS.segments;
    const len: Record<string, number> = {};
    for (const seg of this.mecha.bellows) {
      const { S, i, ring } = seg.userData.bellows as { S: string; i: number; ring: boolean };
      const knee = this.mecha.bones[`knee${S}`];
      len[S] ??= bellowsLength(knee);
      const f = (i + 0.5) / n;
      bellowsPoint(knee, f, seg.position, this.dir);
      seg.quaternion.setFromUnitVectors(UP, this.dir.negate());
      // Sleeves span their share of the curve (with overlap); rings mark the convolutions.
      if (!ring) seg.scale.set(1, Math.max(0.03, (len[S] / n) * 1.3), 1);
      seg.updateMatrix();
    }
  }

  /** Joint pinions turn with their joint angle through the gear ratio. */
  private updateGears() {
    for (const g of this.mecha.gears) {
      const { bone, axis, ratio } = g.userData.gearFollow as { bone: string; axis: 'x' | 'y' | 'z'; ratio: number };
      g.rotation[axis] = this.mecha.bones[bone].rotation[axis] * ratio;
    }
  }

  /** Per-frame animation independent of the pose: engine spools, reactor glow, flickering exhaust. */
  tick(dt: number) {
    this.joints.update(dt);
    this.mecha.fx.tick(dt);
    const spool = this.surfaces?.spool ?? this.drive?.exhaust?.spool;
    const overboost = this.surfaces?.overboost ?? this.drive?.exhaust?.overboost ?? 0;
    this.mecha.flow.update(dt, flowSpeed(spool ?? IDLE_SPOOL, overboost));
    const { glowHot } = this.mecha.mats;
    if (spool !== undefined) {
      glowHot.emissiveIntensity = 1.0 + 2.2 * spool;
      for (const f of this.mecha.fans) f.rotation.y += dt * (4 + 18 * spool) * (f.userData.spin as number);
      return;
    }
    glowHot.emissiveIntensity = 1.6;
    if (!this.cutaway || !this.systems.engines) return;
    for (const f of this.mecha.fans) f.rotation.y += dt * (4 + 18 * IDLE_SPOOL) * (f.userData.spin as number);
  }

  /* --------------------------------------------------------------- anatomy */

  setCutaway(on: boolean) {
    if (on === this.cutaway) return;
    this.cutaway = on;
    applyCutaway(this.mecha.mats, on);
    this.refreshInternals();
    this.restyle([]);
  }

  setSystems(systems: Record<string, boolean>) {
    this.systems = { ...this.systems, ...(systems as Record<SystemId, boolean>) };
    this.refreshInternals();
  }

  private refreshInternals() {
    for (const mesh of this.mecha.internal) {
      const sys = mesh.userData.system as SystemId;
      mesh.visible = this.cutaway ? this.systems[sys] : !!mesh.userData.always;
    }
    this.mecha.flow.points.visible = this.cutaway && this.systems.engines;
  }

  /* ------------------------------------------------------------- selection */

  setSelected(id: string | null) {
    const prev = this.selected;
    this.selected = id;
    this.restyle([prev]);
  }

  setHovered(id: string | null) {
    const prev = this.hovered;
    this.hovered = id;
    this.restyle([prev]);
  }

  private restyle(touched: (string | null)[]) {
    const ids = new Set([...touched, this.selected, this.hovered].filter((x): x is string => !!x));
    for (const id of ids) {
      const mode = id === this.selected ? 'sel' : id === this.hovered ? 'hov' : null;
      for (const mesh of this.mecha.parts.get(id) ?? []) {
        if (mesh.userData.kind === 'decal') continue;
        const base = mesh.userData.baseMaterial as THREE.Material;
        mesh.material = mode ? this.variant(base, mode) : base;
      }
    }
  }

  private variant(base: THREE.Material, mode: 'sel' | 'hov'): THREE.Material {
    const key = `${base.uuid}:${mode}:${this.cutaway ? 1 : 0}`;
    let v = this.variants.get(key);
    if (!v) {
      const m = (base as THREE.MeshStandardMaterial).clone();
      m.emissive = (mode === 'sel' ? SELECT_GLOW : HOVER_GLOW).clone();
      m.emissiveIntensity = mode === 'sel' ? 0.55 : 0.25;
      if (this.cutaway && base.name.startsWith('ext:') && m.transparent) {
        m.opacity = mode === 'sel' ? 0.55 : 0.3;
      }
      this.variants.set(key, m);
      v = m;
    }
    return v;
  }

  /* --------------------------------------------------------------- queries */

  /** Precise world-space bounds of the exterior armour (optionally only some parts). */
  exteriorBox(target = new THREE.Box3(), include?: (partId: string) => boolean): THREE.Box3 {
    target.makeEmpty();
    for (const mesh of this.mecha.exterior) {
      if (include && !include(mesh.userData.partId)) continue;
      target.expandByObject(mesh, true);
    }
    return target;
  }

  /** Cheap bounds from the rig markers (good enough for camera framing each frame). */
  approxBox(target = new THREE.Box3()): THREE.Box3 {
    target.makeEmpty();
    for (const o of Object.values(this.mecha.markers)) target.expandByPoint(o.getWorldPosition(this.v));
    return target;
  }

  approxRadius(center: THREE.Vector3): number {
    let r = 0;
    for (const o of Object.values(this.mecha.markers)) r = Math.max(r, o.getWorldPosition(this.v).distanceTo(center));
    return r;
  }

  /** World bounds of one part's meshes (for camera focus / projection). */
  partBox(id: string, target = new THREE.Box3()): THREE.Box3 {
    target.makeEmpty();
    for (const mesh of this.mecha.parts.get(id) ?? []) {
      if (mesh.userData.kind !== 'decal') target.expandByObject(mesh);
    }
    return target;
  }

  markerWorld(id: string): THREE.Vector3 {
    const m = this.mecha.markers[id];
    if (!m) throw new Error(`unknown marker ${id}`);
    return m.getWorldPosition(new THREE.Vector3());
  }

  markerIds(): string[] {
    return Object.keys(this.mecha.markers);
  }

  /** Glowing rings and arrows on joints while they move. */
  setJointsVisible(on: boolean) {
    this.joints.setVisible(on);
  }

  dispose() {
    this.joints.dispose();
    const mats = new Set<THREE.Material>(this.variants.values());
    this.mecha.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
      if (o.userData.baseMaterial) mats.add(o.userData.baseMaterial);
    });
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  }
}
