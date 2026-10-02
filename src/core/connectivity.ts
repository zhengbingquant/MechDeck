import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/**
 * Structural connectivity: which meshes touch (surfaces within `gap`, or one embedded in the other)
 * and which groups of them hang together. A part that isn't linked, through touching parts, to the
 * main airframe is floating: nothing holds it.
 */

interface Body {
  mesh: THREE.Mesh;
  bvh: MeshBVH;
  box: THREE.Box3;
  /** A few surface points (local), for the inside test. */
  probes: THREE.Vector3[];
}

const RAY_DIR = new THREE.Vector3(0.31, 0.83, 0.47).normalize();

function body(mesh: THREE.Mesh): Body | null {
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  if (!pos || pos.count < 3) return null;
  g.computeBoundingBox();
  const bvh = new MeshBVH(g);
  const probes: THREE.Vector3[] = [];
  const step = Math.max(1, Math.floor(pos.count / 6));
  for (let i = 0; i < pos.count && probes.length < 6; i += step) probes.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  return { mesh, bvh, box: new THREE.Box3(), probes };
}

/** Is world point p inside the closed mesh b (ray parity)? */
function inside(b: Body, pWorld: THREE.Vector3, inv: THREE.Matrix4): boolean {
  const o = pWorld.clone().applyMatrix4(inv);
  const d = RAY_DIR.clone().transformDirection(inv);
  const hits = b.bvh.raycast(new THREE.Ray(o, d), THREE.DoubleSide);
  return hits.length % 2 === 1;
}

export class Connectivity {
  private readonly bodies: Body[];

  constructor(meshes: THREE.Mesh[], private readonly gap = 0.02) {
    this.bodies = meshes.map(body).filter((b): b is Body => !!b);
  }

  /** Groups of meshes that hang together in the current pose (world matrices must be current). */
  groups(): THREE.Mesh[][] {
    const { bodies, gap } = this;
    for (const b of bodies) b.box.copy(b.mesh.geometry.boundingBox!).applyMatrix4(b.mesh.matrixWorld).expandByScalar(gap);
    const parent = bodies.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const m = new THREE.Matrix4();
    const invA = new THREE.Matrix4();
    const invB = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
    const hit2 = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      invA.copy(a.mesh.matrixWorld).invert();
      for (let j = i + 1; j < bodies.length; j++) {
        if (find(i) === find(j)) continue;
        const b = bodies[j];
        if (!a.box.intersectsBox(b.box)) continue;
        // Surfaces within the gap (touching or crossing)…
        m.copy(invA).multiply(b.mesh.matrixWorld);
        const near = a.bvh.closestPointToGeometry(b.mesh.geometry, m, hit, hit2, 0, gap);
        let linked = !!near && near.distance <= gap;
        // …or one embedded in the other.
        if (!linked) {
          invB.copy(b.mesh.matrixWorld).invert();
          linked = b.probes.some((q) => inside(a, p.copy(q).applyMatrix4(b.mesh.matrixWorld), invA))
            || a.probes.some((q) => inside(b, p.copy(q).applyMatrix4(a.mesh.matrixWorld), invB));
        }
        if (linked) parent[find(i)] = find(j);
      }
    }
    const out = new Map<number, THREE.Mesh[]>();
    bodies.forEach((b, i) => {
      const r = find(i);
      out.set(r, [...(out.get(r) ?? []), b.mesh]);
    });
    return [...out.values()].sort((x, y) => y.length - x.length);
  }
}
