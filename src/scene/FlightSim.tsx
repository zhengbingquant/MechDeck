import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import type { MechRuntime } from '../core/types';
import { attitude, headingOf, initialState, stepFlight, type Airframe, type FlightOutputs, type FlightState } from '../core/flight/model';
import { useApp } from '../state/store';
import { keyboardDemand } from './flightInput';
import { streakMotion } from '../core/flight/streaks';

/** Start of every flight-lab sortie: 3,000 m, 220 m/s (about M0.67), wings level. */
export const START_ALTITUDE = 3000;
export const START_SPEED = 220;
/** The grid stands in for the ground this far below the aircraft (parallax scales with altitude). */
const GROUND_BELOW = 14;
const STEP = 1 / 120;
const STREAKS = 240;
const FORCE_COLORS = { lift: '#4ade80', weight: '#fbbf24', thrust: '#60a5fa', drag: '#f87171' } as const;
export type ForceKey = keyof typeof FORCE_COLORS;
export { FORCE_COLORS };

const STREAK_BOX = new THREE.Vector3(13, 9, 22);
const DOWN = new THREE.Vector3(0, -1, 0);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const mod = (x: number, m: number) => ((x % m) + m) % m;

function makeArrow(color: string): THREE.ArrowHelper {
  const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, color, 0.45, 0.24);
  for (const m of [a.line.material, a.cone.material] as THREE.Material[]) {
    m.depthTest = false;
    m.transparent = true;
    m.opacity = 0.95;
  }
  a.renderOrder = 30;
  a.line.renderOrder = 30;
  a.cone.renderOrder = 30;
  a.visible = false;
  return a;
}

/** Relative-wind streaks: short lines drifting past the aircraft along the airflow. */
function makeStreaks() {
  const pos = new Float32Array(STREAKS * 6);
  const col = new Float32Array(STREAKS * 6);
  const seeds = Array.from({ length: STREAKS }, () => new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1));
  for (let i = 0; i < STREAKS; i++) {
    col.set([0.75, 0.88, 1, 0, 0, 0], i * 6); // bright head, dark (invisible when added) tail
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  lines.raycast = () => {};
  return { lines, seeds };
}

interface Props {
  runtime: MechRuntime;
  airframe: Airframe;
  /** Rotates the craft about its centre of gravity (see Stage). */
  gimbal: THREE.Group;
  offset: THREE.Group;
}

/**
 * The flight lab: runs the flight model at 120 Hz, poses the control surfaces,
 * tilts the craft to its attitude (heading-up: the world turns beneath it),
 * scrolls the ground with altitude parallax, and draws the airflow and the
 * four forces acting at the centre of gravity.
 */
export function FlightSim({ runtime, airframe, gimbal, offset }: Props) {
  const state = useRef<FlightState | null>(null);
  const out = useRef<FlightOutputs | null>(null);
  const cg = useRef(new THREE.Vector3());
  const scroll = useRef(new THREE.Vector2());
  const lastTelemetry = useRef(0);
  const blend = useRef(0);
  /** Landing gear: retracts over ~0.8 s once flying, comes back down on leaving the lab. */
  const gear = useRef(1);
  /** Keyboard stick positions, ramped like a real stick throw (full deflection in ~0.25 s). */
  const kbd = useRef({ pitch: 0, roll: 0, yaw: 0 });
  const gridGroup = useRef<THREE.Group>(null);
  const grid = useRef<THREE.Mesh>(null);
  const tmp = useMemo(
    () => ({ q: new THREE.Quaternion(), id: new THREE.Quaternion(), box: new THREE.Box3(), qh: new THREE.Quaternion(), v: new THREE.Vector3(), u: new THREE.Vector3(), f: new THREE.Vector3(), w: new THREE.Vector3() }),
    [],
  );
  const arrows = useMemo(() => {
    const group = new THREE.Group();
    const map = {} as Record<ForceKey, THREE.ArrowHelper>;
    for (const k of Object.keys(FORCE_COLORS) as ForceKey[]) {
      map[k] = makeArrow(FORCE_COLORS[k]);
      group.add(map[k]);
    }
    return { group, map };
  }, []);
  const streaks = useMemo(makeStreaks, []);

  // A new sortie on entering the lab or re-trimming.
  const nonce = useApp((s) => s.flightNonce);
  const flightOn = useApp((s) => s.flightOn);
  useEffect(() => {
    state.current = null;
  }, [nonce, flightOn]);

  useEffect(
    () => () => {
      runtime.setFlightSurfaces?.(null);
      gimbal.quaternion.identity();
    },
    [runtime, gimbal],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const app = useApp.getState();
    const active = app.flightOn && app.progress === 0 && runtime.lastProgress === 0;
    blend.current = clamp(blend.current + (active ? dt : -dt) * 1.5, 0, 1);
    const g = clamp(gear.current + (active ? -dt : dt) * 1.25, 0, 1);
    if (g !== gear.current) {
      gear.current = g;
      runtime.setGear?.(g);
    }

    if (!active) {
      if (state.current) {
        state.current = null;
        out.current = null;
        runtime.setFlightSurfaces?.(null);
        app.setTelemetry(null);
      }
      gimbal.quaternion.slerp(tmp.id, Math.min(1, dt * 4));
      streaks.lines.visible = false;
      arrows.group.visible = false;
      if (gridGroup.current) gridGroup.current.visible = false;
      return;
    }

    if (!state.current) {
      // Centre of gravity: centre of the Fighter-mode bounds, measured with the gimbal level.
      gimbal.quaternion.identity();
      gimbal.position.set(0, 0, 0);
      offset.position.set(0, 0, 0);
      gimbal.updateMatrixWorld(true);
      runtime.approxBox(tmp.box).getCenter(cg.current);
      gimbal.position.copy(cg.current);
      offset.position.copy(cg.current).negate();
      const init = initialState(airframe, START_ALTITUDE, START_SPEED);
      state.current = init.state;
      app.setFlight({ throttle: Math.round(init.throttle * 100) / 100 });
      scroll.current.set(0, 0);
    }
    const s = state.current;

    // Pilot inputs: on-screen stick / sliders plus the keyboard.
    const keys = keyboardDemand();
    const ramp = (cur: number, target: number) => cur + clamp(target - cur, -dt * 4, dt * 4);
    kbd.current.pitch = ramp(kbd.current.pitch, keys.pitch);
    kbd.current.roll = ramp(kbd.current.roll, keys.roll);
    kbd.current.yaw = ramp(kbd.current.yaw, keys.yaw);
    let throttle = app.flight.throttle;
    if (keys.throttle) {
      throttle = clamp(throttle + keys.throttle * dt * 0.4, 0, 1);
      app.setFlight({ throttle });
    }
    const controls = {
      ...app.flight,
      throttle,
      pitch: clamp(app.flight.pitch + kbd.current.pitch, -1, 1),
      roll: clamp(app.flight.roll + kbd.current.roll, -1, 1),
      yaw: clamp(app.flight.yaw + kbd.current.yaw, -1, 1),
    };
    for (let left = dt; left > 1e-6; left -= STEP) out.current = stepFlight(airframe, s, controls, Math.min(STEP, left));
    const o = out.current!;
    runtime.setFlightSurfaces?.(o.surfaces);

    // Attitude, heading removed: the craft keeps facing into the screen and the world turns.
    attitude(s, tmp.q, true);
    gimbal.quaternion.copy(tmp.id).slerp(tmp.q, blend.current);

    // Ground: rotate with the heading, scroll with the ground track (parallax ∝ 1 / altitude).
    const heading = headingOf(s.dir);
    if (gridGroup.current && grid.current) {
      gridGroup.current.visible = true;
      gridGroup.current.position.set(cg.current.x, cg.current.y - GROUND_BELOW, cg.current.z);
      gridGroup.current.rotation.y = heading;
      const k = GROUND_BELOW / Math.max(s.position.y, GROUND_BELOW);
      scroll.current.x += s.dir.x * s.speed * dt * k;
      scroll.current.y += s.dir.z * s.speed * dt * k;
      grid.current.position.set(-mod(scroll.current.x, 10), 0, -mod(scroll.current.y, 10));
    }

    // Display-frame flight vectors.
    tmp.qh.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, heading);
    tmp.v.copy(s.dir).applyQuaternion(tmp.qh);
    tmp.u.copy(s.up).applyQuaternion(tmp.qh);
    tmp.f.copy(tmp.v).multiplyScalar(Math.cos(s.alpha)).addScaledVector(tmp.u, Math.sin(s.alpha));

    // Airflow streaks drift along the relative wind (−velocity), faster and longer with speed.
    streaks.lines.visible = app.showAirflow;
    if (app.showAirflow) {
      const pos = streaks.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const motion = streakMotion(s.speed);
      const drift = motion.drift * dt;
      const len = motion.length;
      tmp.w.copy(tmp.v).negate();
      const half = STREAK_BOX;
      for (let i = 0; i < STREAKS; i++) {
        const p = streaks.seeds[i];
        p.x += (tmp.w.x * drift) / half.x;
        p.y += (tmp.w.y * drift) / half.y;
        p.z += (tmp.w.z * drift) / half.z;
        if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || Math.abs(p.z) > 1) {
          // Respawn upstream on the far side of the box.
          p.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
          const axis = Math.abs(tmp.w.z) > 0.5 ? 'z' : Math.abs(tmp.w.y) > Math.abs(tmp.w.x) ? 'y' : 'x';
          p[axis] = -Math.sign(tmp.w[axis]) * 0.999;
        }
        const hx = cg.current.x + p.x * half.x;
        const hy = cg.current.y + p.y * half.y;
        const hz = cg.current.z + p.z * half.z;
        pos.setXYZ(i * 2, hx, hy, hz);
        pos.setXYZ(i * 2 + 1, hx - tmp.w.x * len, hy - tmp.w.y * len, hz - tmp.w.z * len);
      }
      pos.needsUpdate = true;
    }

    // Force vectors at the centre of gravity (arrow length ∝ √force, weight = 2.6 m).
    arrows.group.visible = app.showForces;
    if (app.showForces) {
      arrows.group.position.copy(cg.current);
      const F = o.telemetry.forces;
      const scale = (n: number) => 2.6 * Math.sqrt(Math.max(0, n) / F.weight);
      const set = (k: ForceKey, dir: THREE.Vector3, n: number) => {
        const a = arrows.map[k];
        a.visible = n > F.weight * 0.004;
        a.setDirection(dir.lengthSq() > 0 ? dir.clone().normalize() : THREE.Object3D.DEFAULT_UP);
        a.setLength(Math.max(0.5, scale(n)), 0.45, 0.24);
      };
      set('lift', F.lift >= 0 ? tmp.u : tmp.u.clone().negate(), Math.abs(F.lift));
      set('weight', DOWN, F.weight);
      set('thrust', tmp.f, F.thrust);
      set('drag', tmp.v.clone().negate(), F.drag);
    }

    // Telemetry for the HUD, ~12 Hz.
    lastTelemetry.current += dt;
    if (lastTelemetry.current > 1 / 12) {
      lastTelemetry.current = 0;
      app.setTelemetry({ ...o.telemetry, forces: { ...o.telemetry.forces } });
    }
  });

  return (
    <>
      <primitive object={arrows.group} />
      <primitive object={streaks.lines} />
      <group ref={gridGroup} visible={false}>
        <Grid
          ref={grid}
          args={[40, 40]}
          cellSize={2}
          cellThickness={0.6}
          cellColor="#2b3a57"
          sectionSize={10}
          sectionThickness={1.2}
          sectionColor="#4a6ea8"
          fadeDistance={90}
          fadeStrength={1.2}
          infiniteGrid
        />
      </group>
    </>
  );
}
