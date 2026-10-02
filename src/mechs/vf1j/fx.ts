import * as THREE from 'three';
import type { FlightSurfaces } from '../../core/types';
import { NOZZLE } from './surfaces';
import { rcsPortPos } from './parts/wings';

/**
 * Flight-lab effects attached to the rig: exhaust plumes (with shock diamonds
 * in overboost) that follow the nozzle vectoring, the glowing nozzle throats
 * and the wingtip roll-thruster jets. Purely visual: never picked, never part
 * of the collision set.
 */

const noRaycast = () => {};

/** Soft additive glow: bright where the surface faces the viewer, fading along −Y unless `uniform`. */
function plumeMaterial(core: string, tail: string, uniformAlong = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    defines: uniformAlong ? { UNIFORM_ALONG: '' } : {},
    uniforms: {
      uCore: { value: new THREE.Color(core) },
      uTail: { value: new THREE.Color(tail) },
      uIntensity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vAlong = clamp(-position.y, 0.0, 1.0);
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore;
      uniform vec3 uTail;
      uniform float uIntensity;
      uniform float uTime;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float flicker = 0.85 + 0.15 * sin(uTime * 53.0 + vAlong * 31.0);
        #ifdef UNIFORM_ALONG
          float a = pow(facing, 2.6) * uIntensity * flicker;
        #else
          float a = pow(facing, 1.6) * pow(1.0 - vAlong, 1.3) * uIntensity * flicker;
        #endif
        gl_FragColor = vec4(mix(uCore, uTail, smoothstep(0.0, 0.8, vAlong)), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const glow = (color: string) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

function fxMesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.raycast = noRaycast;
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.kind = 'fx';
  m.renderOrder = 5;
  return m;
}

interface Plume {
  group: THREE.Group;
  outer: THREE.Mesh;
  core: THREE.Mesh;
  diamonds: THREE.Mesh[];
  throat: THREE.Mesh;
}

export class FlightFx {
  private readonly plumes: Plume[] = [];
  private readonly jets: { mesh: THREE.Mesh; side: 'L' | 'R'; dir: 1 | -1 }[] = [];
  private readonly outerMat = plumeMaterial('#fff3d6', '#ff5a1f');
  private readonly coreMat = plumeMaterial('#e8f6ff', '#6fb6ff');
  private readonly diamondMat = plumeMaterial('#e6f6ff', '#9fd0ff', true);
  private readonly throatMat = glow('#ff7a2a');
  private readonly jetMat = glow('#cfe8ff');
  private time = 0;
  private on = false;

  constructor(bones: Record<string, THREE.Bone>) {
    // Plume: open cone from the nozzle exit (y = 0) back along −Y to y = −1, scaled per frame.
    const cone = new THREE.CylinderGeometry(1, 0.35, 1, 20, 6, true).translate(0, -0.5, 0);
    const diamond = new THREE.SphereGeometry(1, 12, 8);
    for (const S of ['L', 'R'] as const) {
      const foot = bones[`foot${S}`];
      const group = new THREE.Group();
      group.name = `fx:plume${S}`;
      group.position.set(0, NOZZLE.exitY - 0.02, NOZZLE.axisZ);
      const outer = fxMesh(cone, this.outerMat);
      const core = fxMesh(cone, this.coreMat);
      const diamonds = [0, 1, 2, 3].map(() => fxMesh(diamond, this.diamondMat));
      group.add(outer, core, ...diamonds);
      foot.add(group);
      const throat = fxMesh(new THREE.PlaneGeometry(2 * NOZZLE.halfWidth - 0.2, 2 * NOZZLE.slot + 0.04).rotateX(Math.PI / 2), this.throatMat);
      throat.position.set(0, NOZZLE.throatY, NOZZLE.axisZ);
      foot.add(throat);
      this.plumes.push({ group, outer, core, diamonds, throat });

      // Roll-thruster jets: narrow at the port, flaring outward (+Z below the wing, −Z above).
      const wing = bones[`wing${S}`];
      const sx = S === 'L' ? 1 : -1;
      for (const [side, dir] of [['upper', -1], ['lower', 1]] as const) {
        const [x, y, z] = rcsPortPos(side);
        const geo = new THREE.ConeGeometry(0.1, 0.7, 12, 1, true).translate(0, -0.35, 0).rotateX(dir < 0 ? Math.PI / 2 : -Math.PI / 2);
        const jet = fxMesh(geo, this.jetMat);
        jet.position.set(sx * x, y, z);
        wing.add(jet);
        this.jets.push({ mesh: jet, side: S, dir });
      }
    }
    this.update(null);
  }

  /** Pose the effects for the current flight state (null hides them). */
  update(s: FlightSurfaces | null) {
    this.on = !!s;
    const spool = s?.spool ?? 0;
    const ob = s?.overboost ?? 0;
    const open = s?.nozzleOpen ?? 0.25;
    this.outerMat.uniforms.uIntensity.value = 0.35 + 0.5 * spool + 0.6 * ob;
    this.coreMat.uniforms.uIntensity.value = 0.25 + 0.4 * spool + 0.9 * ob;
    this.diamondMat.uniforms.uIntensity.value = 0.9 * ob;
    this.throatMat.opacity = 0.25 + 0.7 * spool;
    for (const p of this.plumes) {
      p.group.visible = this.on;
      p.throat.visible = this.on;
      if (!s) continue;
      const len = 1.2 + 3.2 * spool + 3.8 * ob;
      // A flat plume from the 2-D slot, fanning as the flaps open.
      const w = 0.6;
      const h = 0.13 + 0.2 * open;
      p.outer.scale.set(w, len, h);
      p.core.scale.set(w * 0.62, len * 0.55, h * 0.62);
      // Exhaust leaves along the vectored flaps.
      p.group.rotation.x = (s.nozzlePitch * Math.PI) / 180;
      p.diamonds.forEach((d, i) => {
        d.visible = ob > 0.02;
        d.position.set(0, -(0.55 + i * 0.62) * (0.8 + 0.4 * ob), 0);
        const k = 1 - i * 0.16;
        d.scale.set(0.2 * k, 0.3 * k, 0.13 * k);
      });
    }
    for (const j of this.jets) {
      const cmd = s ? (j.side === 'L' ? s.rcsL : s.rcsR) : 0;
      // + pushes the wing up, so the lower port fires (exhaust down), and vice versa.
      const fire = j.dir > 0 ? Math.max(0, cmd) : Math.max(0, -cmd);
      j.mesh.visible = this.on && fire > 0.02;
      j.mesh.scale.setScalar(0.4 + 0.6 * fire);
    }
    this.jetMat.opacity = 0.8;
  }

  tick(dt: number) {
    if (!this.on) return;
    this.time += dt;
    this.outerMat.uniforms.uTime.value = this.time;
    this.coreMat.uniforms.uTime.value = this.time * 1.3;
    this.diamondMat.uniforms.uTime.value = this.time * 0.7;
  }
}
