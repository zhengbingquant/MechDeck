import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * "Joints & pivots" overlay: while a joint moves, a glowing ring appears on
 * it, aligned with its actual rotation axis, and slides get an arrow along
 * their travel. Both fade out once the joint stops, so the overlay only
 * shows what the mechanism is doing right now. Gizmos live in each bone's
 * parent frame, so they do not spin with the part they mark.
 */

export interface JointGizmo {
  bone: THREE.Bone;
  ring: THREE.Mesh;
  arrow: THREE.Mesh;
  /** 0…1 glow level. */
  level: number;
}

interface Item extends JointGizmo {
  prevQ: THREE.Quaternion;
  prevP: THREE.Vector3;
  axis: THREE.Vector3;
  dir: THREE.Vector3;
  /** Which gizmo the latest motion lit: a hinge ring or a slide arrow. */
  kind: 'ring' | 'arrow';
}

const RING_COLOR = '#5ee7ff';
const SLIDE_COLOR = '#ffb347';
/** Angular (rad/s) and linear (m/s) speeds that light a gizmo fully. */
const FULL_SPIN = 1.2;
const FULL_SLIDE = 1.2;
const RELEASE = 0.35; // s
const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
const noRaycast = () => {};

function overlayMaterial(color: string) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function arrowGeometry(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.025, 0.025, 0.45, 8).translate(0, 0.225, 0).toNonIndexed();
  const head = new THREE.ConeGeometry(0.08, 0.2, 12).translate(0, 0.55, 0).toNonIndexed();
  return mergeGeometries([shaft, head], false)!;
}

/** A joint being posed: its rotation axis (bone Euler axis) or slide axis, kept lit. */
export interface JointFocus {
  bone: string;
  axis: 'x' | 'y' | 'z';
  slide: boolean;
}

const UNIT = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export class JointOverlay {
  private readonly items: Item[] = [];
  private visible = true;
  private focused: JointFocus[] = [];
  private readonly e = new THREE.Euler();
  private readonly dq = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();

  /** `size(bone)` gives the ring radius for a joint (defaults to 0.3 m). */
  constructor(bones: THREE.Bone[], size: (bone: THREE.Bone) => number = () => 0.3) {
    const ringGeo = new Map<number, THREE.BufferGeometry>();
    const arrow = arrowGeometry();
    for (const bone of bones) {
      const parent = bone.parent;
      if (!parent) continue;
      const r = size(bone);
      if (!ringGeo.has(r)) ringGeo.set(r, new THREE.TorusGeometry(r, Math.max(0.012, r * 0.07), 8, 40));
      const mk = (geo: THREE.BufferGeometry, color: string) => {
        const m = new THREE.Mesh(geo, overlayMaterial(color));
        m.name = `joint-gizmo:${bone.name}`;
        m.raycast = noRaycast;
        m.renderOrder = 25;
        m.visible = false;
        m.userData.kind = 'gizmo';
        parent.add(m);
        return m;
      };
      this.items.push({
        bone,
        ring: mk(ringGeo.get(r)!, RING_COLOR),
        arrow: mk(arrow, SLIDE_COLOR),
        level: 0,
        prevQ: bone.quaternion.clone(),
        prevP: bone.position.clone(),
        axis: new THREE.Vector3(0, 0, 1),
        dir: new THREE.Vector3(0, 1, 0),
        kind: 'ring',
      });
    }
  }

  gizmo(boneName: string): JointGizmo | undefined {
    return this.items.find((i) => i.bone.name === boneName);
  }

  /** Keep these joints lit (the one being posed), whatever they are doing and even when hidden. */
  focus(targets: JointFocus[] | null) {
    this.focused = targets ?? [];
  }

  /**
   * An Euler (XYZ) axis of a bone in its parent's frame: X is the parent's X, Y is turned by the
   * X angle, Z is the bone's own Z.
   */
  private eulerAxis(bone: THREE.Bone, axis: 'x' | 'y' | 'z', out: THREE.Vector3) {
    out.copy(UNIT[axis]);
    if (axis === 'y') out.applyEuler(this.e.set(bone.rotation.x, 0, 0));
    else if (axis === 'z') out.applyQuaternion(bone.quaternion);
    return out;
  }

  setVisible(on: boolean) {
    this.visible = on;
    if (!on) for (const i of this.items) i.ring.visible = i.arrow.visible = false;
  }

  /** Measure how each joint moved since the last call and light the gizmos accordingly. */
  update(dt: number) {
    if (dt <= 0) return;
    const decay = Math.exp(-dt / RELEASE);
    for (const it of this.items) {
      const { bone } = it;
      // Rotation since last frame, in the parent frame: q · prevQ⁻¹.
      this.dq.copy(it.prevQ).invert().premultiply(bone.quaternion);
      const angle = 2 * Math.acos(Math.min(1, Math.abs(this.dq.w)));
      const spin = angle / dt;
      if (angle > 1e-5) {
        const s = Math.sqrt(1 - this.dq.w * this.dq.w) * Math.sign(this.dq.w || 1);
        this.v.set(this.dq.x / s, this.dq.y / s, this.dq.z / s).normalize();
        if (this.v.dot(it.axis) < 0) this.v.negate(); // keep a stable orientation
        it.axis.lerp(this.v, 0.5).normalize();
      }
      this.v.subVectors(bone.position, it.prevP);
      const dist = this.v.length();
      const slide = dist / dt;
      if (dist > 1e-6) it.dir.lerp(this.v.divideScalar(dist), 0.5).normalize();

      const spinLevel = Math.min(1, spin / FULL_SPIN);
      const slideLevel = Math.min(1, slide / FULL_SLIDE);
      it.level = Math.max(it.level * decay, spinLevel, slideLevel);
      it.prevQ.copy(bone.quaternion);
      it.prevP.copy(bone.position);

      if (Math.max(spinLevel, slideLevel) > 0.02) it.kind = spinLevel >= slideLevel ? 'ring' : 'arrow';
      const f = this.focused.find((x) => x.bone === bone.name);
      if (f) {
        it.level = 1;
        it.kind = f.slide ? 'arrow' : 'ring';
        if (f.slide) it.dir.copy(UNIT[f.axis]);
        else this.eulerAxis(bone, f.axis, it.axis);
      }
      const show = (this.visible || !!f) && it.level > 0.02;
      it.ring.visible = show && it.kind === 'ring';
      it.arrow.visible = show && it.kind === 'arrow';
      if (!show) continue;
      it.ring.position.copy(bone.position);
      it.ring.quaternion.copy(this.q.setFromUnitVectors(Z, it.axis));
      (it.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * it.level;
      it.arrow.position.copy(bone.position);
      it.arrow.quaternion.copy(this.q.setFromUnitVectors(Y, it.dir));
      (it.arrow.material as THREE.MeshBasicMaterial).opacity = 0.9 * it.level;
    }
  }

  dispose() {
    for (const it of this.items) {
      for (const m of [it.ring, it.arrow]) {
        m.removeFromParent();
        (m.material as THREE.Material).dispose();
      }
    }
  }
}
