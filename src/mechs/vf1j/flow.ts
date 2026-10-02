import * as THREE from 'three';
import { airPath, type AirPathPoint } from './airpath';

/** Particles per engine. */
const PER_LEG = 44;
const COOL = new THREE.Color('#8fd3ff');
const HOT = new THREE.Color('#ffae55');

/**
 * Speed of the air through the engine (display metres per second): a slow drift at idle,
 * several times faster at full power, faster still in overboost.
 */
export function flowSpeed(spool: number, overboost = 0): number {
  return 1.4 + 10 * Math.max(0, spool) + 6 * Math.max(0, overboost);
}

/** Soft round sprite for the particles (browser only). */
function dotTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * Air streaming through both engines in the cutaway: in at the intake face, down the duct,
 * round the knee bellows, through the core and out of the nozzle, cool until the reaction
 * chamber and hot after it. It follows the legs through every pose, since it rides the
 * same air path the ducts are built on. Purely visual: never picked, never collided.
 */
export class EngineFlow {
  readonly points: THREE.Points;
  /** Total distance the air has travelled (display metres); advances with the spool. */
  distance = 0;
  private readonly phase: number[] = [];
  private readonly spread: [number, number][] = [];
  private readonly v = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly w = new THREE.Vector3();

  constructor(private readonly bones: Record<string, THREE.Bone>, private readonly frame: THREE.Object3D) {
    const n = PER_LEG * 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      // Seen through the duct walls, like an X-ray of the airflow.
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      map: dotTexture(),
    });
    this.points = new THREE.Points(geo, mat);
    this.points.name = 'fx:engineFlow';
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.raycast = () => {};
    this.points.visible = false;
    frame.add(this.points);
    // Evenly spread along the path, scattered across the duct (golden-angle spiral).
    for (let i = 0; i < PER_LEG; i++) {
      this.phase.push(i / PER_LEG);
      this.spread.push([i * 2.39996, 0.08 + 0.17 * Math.sqrt(((i * 7) % PER_LEG) / PER_LEG)]);
    }
  }

  /** Advance the air by speed × dt and lay the particles along each leg's current air path. */
  update(dt: number, speed: number) {
    this.distance += speed * dt;
    if (!this.points.visible) return;
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.points.geometry.getAttribute('color') as THREE.BufferAttribute;
    (['L', 'R'] as const).forEach((S, leg) => {
      const path = airPath(this.bones, S, this.frame);
      const cum = [0];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].p.distanceTo(path[i - 1].p));
      const total = cum[cum.length - 1];
      for (let j = 0; j < PER_LEG; j++) {
        const s = (((this.phase[j] * total + this.distance) % total) + total) % total;
        let i = 1;
        while (i < path.length - 1 && cum[i] < s) i++;
        const seg = Math.max(1e-6, cum[i] - cum[i - 1]);
        this.place(path[i - 1], path[i], (s - cum[i - 1]) / seg, j);
        pos.setXYZ(leg * PER_LEG + j, this.v.x, this.v.y, this.v.z);
        const c = path[i].hot ? HOT : COOL;
        col.setXYZ(leg * PER_LEG + j, c.r, c.g, c.b);
      }
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.points.geometry.computeBoundingSphere();
  }

  /** Point f along a → b, pushed off the centre line within the duct. */
  private place(a: AirPathPoint, b: AirPathPoint, f: number, j: number) {
    this.w.subVectors(b.p, a.p).normalize();
    this.u.set(1, 0, 0);
    if (Math.abs(this.w.dot(this.u)) > 0.9) this.u.set(0, 1, 0);
    this.u.cross(this.w).normalize();
    const [ang, r] = this.spread[j];
    this.v.lerpVectors(a.p, b.p, f).addScaledVector(this.u, r * Math.cos(ang));
    this.u.cross(this.w);
    this.v.addScaledVector(this.u, r * Math.sin(ang));
  }
}
