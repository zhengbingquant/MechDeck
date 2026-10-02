import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/**
 * Triangle-level interpenetration check between rigid bodies on different
 * bones, sampled across a transformation timeline. Designed contacts
 * (telescoping sleeves, hinge hardware seated in the parts it joins, nested
 * parts) are declared per mech in CollisionRules.
 */

export interface Collision {
  a: string;
  b: string;
  boneA: string;
  boneB: string;
  /** Progress values at which the pair interpenetrates. */
  at: number[];
}

export interface CollisionSubject {
  exterior: THREE.Mesh[];
  internal: THREE.Mesh[];
  /** Hydraulic rams: barrel/rod meshes plus the two anchor objects they span. */
  pistons: { a: THREE.Object3D; b: THREE.Object3D; barrel: THREE.Mesh; rod: THREE.Mesh; stages?: THREE.Mesh[] }[];
  setProgress(t: number): void;
}

export interface CollisionRules {
  /** Bone pairs "boneA|boneB" that telescope into each other by design. */
  telescoping: string[];
  /** Part-id pairs that are nested by design. */
  nested: [RegExp, RegExp][];
  /** Internal part id → extra bones it may touch (e.g. a guide rail and its carriages). */
  internalAllow?: Record<string, string[]>;
}

interface Collider {
  mesh: THREE.Mesh;
  bone: THREE.Bone;
  partId: string;
  joint: boolean | string;
  internal: boolean;
  /** Extra bones this body may touch (a ram's anchor bones, a rail's carriages). */
  allowBones?: Set<string>;
  geometry: THREE.BufferGeometry;
  bvh: MeshBVH;
  box: THREE.Box3;
}

/** Bodies are shrunk by this much per side so flush contact is not a collision. */
const EPS = 0.025;

function boneOf(o: THREE.Object3D): THREE.Bone {
  let n: THREE.Object3D | null = o.parent;
  while (n && !(n as THREE.Bone).isBone) n = n.parent;
  if (!n) throw new Error(`mesh ${o.name} is not attached to a bone`);
  return n as THREE.Bone;
}

function hops(a: THREE.Bone, b: THREE.Bone, max: number): boolean {
  const up = (x: THREE.Object3D, target: THREE.Object3D) => {
    let n: THREE.Object3D | null = x;
    for (let i = 0; i <= max && n; i++, n = n.parent) if (n === target) return true;
    return false;
  };
  return up(a, b) || up(b, a);
}

function shrink(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const s = g.clone();
  s.computeBoundingBox();
  const bb = s.boundingBox!;
  const size = bb.getSize(new THREE.Vector3());
  const c = bb.getCenter(new THREE.Vector3());
  const f = (d: number) => (d > 4 * EPS ? (d - 2 * EPS) / d : 0.5);
  s.translate(-c.x, -c.y, -c.z);
  s.scale(f(size.x), f(size.y), f(size.z));
  s.translate(c.x, c.y, c.z);
  s.computeBoundingBox();
  return s;
}

function collider(mesh: THREE.Mesh, internal: boolean, allowBones?: Set<string>): Collider {
  const geometry = shrink(mesh.geometry);
  const bvh = new MeshBVH(geometry);
  // Lets BVH-vs-BVH checks use this tree (drei bundles its own three-mesh-bvh typings).
  (geometry as unknown as { boundsTree: unknown }).boundsTree = bvh;
  return {
    mesh,
    bone: boneOf(mesh),
    partId: mesh.userData.partId as string,
    joint: (mesh.userData.joint as boolean | string | undefined) ?? false,
    internal,
    allowBones,
    geometry,
    bvh,
    box: new THREE.Box3(),
  };
}

function buildColliders(subject: CollisionSubject, rules: CollisionRules, internals: boolean): Collider[] {
  const rams = new Map<THREE.Mesh, Set<string>>();
  for (const p of subject.pistons) {
    // A ram may touch only the bodies it is pinned to (its anchor bones): it must never pass
    // through anything else, not even the armour of the joint it drives.
    const bones = new Set<string>([boneOf(p.a).name, boneOf(p.b).name]);
    for (const m of [p.barrel, p.rod, ...(p.stages ?? [])]) rams.set(m, bones);
  }
  // Exterior struts (a surface's deployment strut) are rams too.
  const out = subject.exterior.filter((m) => m.userData.collide).map((m) => collider(m, false, rams.get(m)));
  if (!internals) return out;
  for (const m of subject.internal) {
    const extra = rules.internalAllow?.[m.userData.partId as string];
    const ram = rams.get(m);
    out.push(collider(m, true, ram || extra ? new Set([...(ram ?? []), ...(extra ?? [])]) : undefined));
  }
  return out;
}

/** Is `j` hinge hardware seated in the bone that carries `other`? */
function seats(j: Collider, other: Collider): boolean {
  if (j.joint === true) return hops(j.bone, other.bone, 1);
  if (typeof j.joint === 'string') return j.joint.split(',').includes(other.bone.name);
  return false;
}

function allowed(a: Collider, b: Collider, telescoping: Set<string>, nested: [RegExp, RegExp][]): boolean {
  if (a.bone === b.bone) return true;
  if (a.allowBones?.has(b.bone.name) || b.allowBones?.has(a.bone.name)) return true;
  if (telescoping.has(`${a.bone.name}|${b.bone.name}`) || telescoping.has(`${b.bone.name}|${a.bone.name}`)) return true;
  if (seats(a, b) || seats(b, a)) return true;
  return nested.some(([x, y]) => (x.test(a.partId) && y.test(b.partId)) || (x.test(b.partId) && y.test(a.partId)));
}

/** An interpenetrating pair in one pose. */
export interface Contact {
  a: string;
  b: string;
  boneA: string;
  boneB: string;
}

/**
 * The bodies of a rig, prepared once (shrunk copies with BVHs), so any number of poses can be
 * checked cheaply: the collision tests sample a timeline with it, and the joint-control guard
 * checks each pose the user asks for.
 */
export class CollisionWorld {
  private readonly colliders: Collider[];
  private readonly telescoping: Set<string>;
  private readonly m = new THREE.Matrix4();

  constructor(subject: Pick<CollisionSubject, 'exterior' | 'internal' | 'pistons'>, private readonly rules: CollisionRules, internals = false) {
    this.colliders = buildColliders(subject as CollisionSubject, rules, internals);
    this.telescoping = new Set(rules.telescoping);
  }

  /** Pairs interpenetrating in the current pose (world matrices must be up to date); `first` stops at one. */
  check(first = false): Contact[] {
    const { colliders, m } = this;
    const out: Contact[] = [];
    for (const c of colliders) c.box.copy(c.geometry.boundingBox!).applyMatrix4(c.mesh.matrixWorld);
    for (let i = 0; i < colliders.length; i++) {
      const a = colliders[i];
      for (let j = i + 1; j < colliders.length; j++) {
        const b = colliders[j];
        if (!a.box.intersectsBox(b.box) || allowed(a, b, this.telescoping, this.rules.nested)) continue;
        m.copy(a.mesh.matrixWorld).invert().multiply(b.mesh.matrixWorld);
        if (!a.bvh.intersectsGeometry(b.geometry, m)) continue;
        out.push({ a: a.partId, b: b.partId, boneA: a.bone.name, boneB: b.bone.name });
        if (first) return out;
      }
    }
    return out;
  }
}

export function findCollisions(subject: CollisionSubject, samples: number[], rules: CollisionRules, internals = false): Collision[] {
  const world = new CollisionWorld(subject, rules, internals);
  const found = new Map<string, Collision>();
  for (const t of samples) {
    subject.setProgress(t);
    for (const c of world.check()) {
      const key = [c.a, c.b].sort().join(' ⟷ ');
      const hit = found.get(key) ?? { ...c, at: [] };
      if (!hit.at.includes(t)) hit.at.push(t);
      found.set(key, hit);
    }
  }
  return [...found.values()];
}
