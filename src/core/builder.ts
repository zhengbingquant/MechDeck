import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** What the builder needs from a mech's material set. */
export interface BuilderMaterials {
  ext: Record<string, THREE.Material>;
  sys: Record<string, THREE.Material>;
  /** Crease outlines along hard edges. */
  edge: THREE.LineBasicMaterial;
  /** Engraved panel lines (defaults to the edge material). */
  panel?: THREE.LineBasicMaterial;
}

export type V3 = readonly [number, number, number];
const D2R = Math.PI / 180;

export interface PlaceOpts {
  pos?: V3;
  /** Euler degrees, XYZ order. */
  rot?: V3;
  scale?: V3;
  /** Crease-line threshold in degrees, or false for no outline. */
  edges?: number | false;
  /**
   * Shading: faces meeting at less than this angle (degrees) are smoothed, harder
   * edges stay crisp (default 35°); false keeps flat facets.
   */
  smooth?: number | false;
  /**
   * Include in the collision checks (default: every body, surface details included: a stripe or
   * light on its own panel shares that panel's bone, so only a real clash with another body shows).
   */
  collide?: boolean;
  /**
   * Hinge / pivot hardware that is seated in the parts it joins: `true` means
   * its parent and child bones; a comma-separated list names the bones exactly.
   */
  joint?: boolean | string;
}

export type MeshKind = 'exterior' | 'internal' | 'decal';

export interface MeshTag {
  partId: string;
  kind: MeshKind;
  system?: string;
  /** Internal parts that stay visible outside cutaway (cockpit seen through the canopy). */
  always?: boolean;
  collide?: boolean;
  joint?: boolean | string;
  baseMaterial: THREE.Material;
}

const noRaycast = () => {};

/**
 * Collects meshes onto bones and keeps the bookkeeping the controller needs:
 * part lookups, exterior/internal lists, markers and merged outline geometry.
 */
export class Builder<M extends BuilderMaterials = BuilderMaterials, K extends string = string, S extends string = string> {
  readonly exterior: THREE.Mesh[] = [];
  readonly internal: THREE.Mesh[] = [];
  readonly parts = new Map<string, THREE.Mesh[]>();
  readonly markers: Record<string, THREE.Object3D> = {};
  readonly outlines: THREE.LineSegments[] = [];
  private readonly lineBuckets = new Map<THREE.Object3D, THREE.BufferGeometry[]>();
  private readonly panelBuckets = new Map<THREE.Object3D, THREE.BufferGeometry[]>();

  constructor(
    readonly bones: Record<string, THREE.Bone>,
    readonly mats: M,
  ) {}

  bone(id: string): THREE.Bone {
    const b = this.bones[id];
    if (!b) throw new Error(`unknown bone ${id}`);
    return b;
  }

  private place(mesh: THREE.Mesh, boneId: string, o: PlaceOpts) {
    if (o.pos) mesh.position.set(...o.pos);
    if (o.rot) mesh.rotation.set(o.rot[0] * D2R, o.rot[1] * D2R, o.rot[2] * D2R);
    if (o.scale) mesh.scale.set(...o.scale);
    mesh.updateMatrix();
    this.bone(boneId).add(mesh);
  }

  private register(partId: string, mesh: THREE.Mesh) {
    const list = this.parts.get(partId) ?? [];
    list.push(mesh);
    this.parts.set(partId, list);
  }

  private pushLines(bucket: Map<THREE.Object3D, THREE.BufferGeometry[]>, boneId: string, g: THREE.BufferGeometry) {
    const b = this.bone(boneId);
    const list = bucket.get(b) ?? [];
    list.push(g);
    bucket.set(b, list);
  }

  /** Exterior armour / airframe mesh. */
  ext(partId: string, boneId: string, geo: THREE.BufferGeometry, mat: K, o: PlaceOpts = {}): THREE.Mesh {
    const material = this.mats.ext[mat];
    // Glazing (transparent materials) casts no shadow and gets no crease outline.
    const glass = material.transparent;
    const shaded = o.smooth === false ? geo : toCreasedNormals(geo, ((o.smooth ?? 35) * Math.PI) / 180);
    const mesh = new THREE.Mesh(shaded, material);
    mesh.name = partId;
    mesh.castShadow = !glass;
    mesh.receiveShadow = true;
    mesh.userData = {
      partId,
      kind: 'exterior',
      collide: o.collide ?? true,
      joint: o.joint,
      baseMaterial: material,
    } satisfies MeshTag;
    this.place(mesh, boneId, o);
    this.register(partId, mesh);
    this.exterior.push(mesh);
    if (o.edges !== false && !glass) {
      const edges = new THREE.EdgesGeometry(geo, o.edges ?? 30);
      edges.applyMatrix4(mesh.matrix);
      this.pushLines(this.lineBuckets, boneId, edges);
    }
    return mesh;
  }

  /** Internal component belonging to one of the anatomy systems. */
  int(
    partId: string,
    boneId: string,
    geo: THREE.BufferGeometry,
    system: S,
    material?: THREE.Material,
    o: PlaceOpts & { always?: boolean } = {},
  ): THREE.Mesh {
    const m = material ?? this.mats.sys[system];
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = partId;
    mesh.userData = { partId, kind: 'internal', system, always: o.always, baseMaterial: m } satisfies MeshTag;
    mesh.visible = !!o.always;
    this.place(mesh, boneId, o);
    this.register(partId, mesh);
    this.internal.push(mesh);
    return mesh;
  }

  /** Panel lines drawn on a bone: flat list of segment endpoints [x,y,z, x,y,z, ...]. */
  panelLines(boneId: string, pts: number[]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.pushLines(this.panelBuckets, boneId, g);
  }

  /**
   * Flat decal (marking) lying on a surface: normal n, text/up direction up.
   * Uses a basis rather than Euler angles so orientation is explicit.
   */
  decal(partId: string, boneId: string, material: THREE.MeshStandardMaterial, w: number, h: number, pos: V3, n: V3, up: V3) {
    const N = new THREE.Vector3(...n).normalize();
    const U = new THREE.Vector3(...up).normalize();
    const R = new THREE.Vector3().crossVectors(U, N).normalize();
    U.crossVectors(N, R);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.name = `decal:${partId}`;
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, U, N));
    mesh.position.set(...pos);
    mesh.userData = { partId, kind: 'decal', baseMaterial: material } satisfies MeshTag;
    mesh.updateMatrix();
    this.bone(boneId).add(mesh);
    this.register(partId, mesh);
    return mesh;
  }

  marker(id: string, boneId: string, pos: V3) {
    const o = new THREE.Object3D();
    o.name = `marker:${id}`;
    o.position.set(...pos);
    this.bone(boneId).add(o);
    this.markers[id] = o;
  }

  /** Merge all outline geometry into one LineSegments per bone (creases and panel lines separately). */
  finish() {
    const merge = (bucket: Map<THREE.Object3D, THREE.BufferGeometry[]>, material: THREE.LineBasicMaterial, kind: string) => {
      for (const [bone, list] of bucket) {
        const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
        if (!merged) continue;
        const lines = new THREE.LineSegments(merged, material);
        lines.name = `${kind}:${bone.name}`;
        lines.userData = { kind: 'outline' };
        lines.raycast = noRaycast;
        bone.add(lines);
        this.outlines.push(lines);
      }
      for (const g of [...bucket.values()].flat()) g.dispose();
      bucket.clear();
    };
    merge(this.lineBuckets, this.mats.edge, 'outline');
    merge(this.panelBuckets, this.mats.panel ?? this.mats.edge, 'panel');
  }
}

/** Flat panel-line segments on an axis-aligned face. */
export function faceLines(
  axis: 'x' | 'y' | 'z',
  at: number,
  segs: [number, number, number, number][],
): number[] {
  const out: number[] = [];
  for (const [a0, b0, a1, b1] of segs) {
    if (axis === 'z') out.push(a0, b0, at, a1, b1, at);
    else if (axis === 'x') out.push(at, a0, b0, at, a1, b1);
    else out.push(a0, at, b0, a1, at, b1);
  }
  return out;
}
