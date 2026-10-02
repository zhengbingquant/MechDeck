import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { MechRuntime } from '../core/types';
import { useApp } from '../state/store';
import { debugHandle } from './debug';
import { stageAnchor } from './anchor';
import { fitDistance, focusGoal } from './framing';

const DEFAULT_DIR = new THREE.Vector3(1.05, 0.42, 1.25).normalize();
/** Flight-lab chase camera: behind (nose is +Z), a little to starboard and above. */
const CHASE_OFFSET = new THREE.Vector3(-6.5, 4.4, -17);
/** Pilot-mode chase direction from the mech's centre at heading 0 (it faces +Z): behind, a little to starboard, above. */
const PILOT_CHASE = new THREE.Vector3(-0.3, 0.32, -0.9).normalize();
const UP = new THREE.Vector3(0, 1, 0);

interface Tween {
  fromPos: THREE.Vector3;
  fromTgt: THREE.Vector3;
  toPos: THREE.Vector3;
  toTgt: THREE.Vector3;
  t: number;
  duration: number;
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * Orbit camera. On load, and after Home, it keeps the craft framed while it
 * transforms ("auto-framing"). The moment the user orbits, zooms or pans,
 * the camera stays exactly where they put it until Home is pressed again.
 * In pilot mode it chases the mech: camera and target travel with it and turn
 * with its heading, so the user's own zoom and angle are kept.
 */
export function CameraRig({ runtime, frameRadius }: { runtime: MechRuntime; frameRadius: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  /** Auto-framing is on until the user takes the camera. */
  const auto = useRef(true);
  const tween = useRef<Tween | null>(null);
  const tmpBox = useRef(new THREE.Box3());
  const tmpV = useRef(new THREE.Vector3());
  const tmpOff = useRef(new THREE.Vector3());
  const lastAnchor = useRef<{ pos: THREE.Vector3; heading: number } | null>(null);

  const cam = camera as THREE.PerspectiveCamera;
  const aspect = () => size.width / Math.max(1, size.height);

  /** Framing centre: the mode's own centre (smooth through a conversion), else the live box's. */
  const frameCenter = (out: THREE.Vector3) => runtime.frameCenter?.(runtime.lastProgress, out) ?? runtime.approxBox(tmpBox.current).getCenter(out);

  const defaultView = () => {
    const center = frameCenter(new THREE.Vector3());
    const radius = Math.max(frameRadius, runtime.approxRadius(center) * 1.03);
    const dist = fitDistance(radius, cam.fov, aspect());
    return { position: center.clone().addScaledVector(DEFAULT_DIR, dist), target: center };
  };

  const chaseView = () => {
    const center = runtime.approxBox(tmpBox.current).getCenter(new THREE.Vector3());
    // Far enough to keep the whole mech in view, with head-room for a jump.
    const dist = fitDistance(runtime.approxRadius(center) * 1.12, cam.fov, aspect());
    const off = PILOT_CHASE.clone().applyAxisAngle(UP, stageAnchor.heading).multiplyScalar(dist);
    return { position: center.clone().add(off), target: center };
  };

  const startTween = (toPos: THREE.Vector3, toTgt: THREE.Vector3, duration = 0.9) => {
    const c = controls.current;
    if (!c) return;
    tween.current = { fromPos: cam.position.clone(), fromTgt: c.target.clone(), toPos, toTgt, t: 0, duration };
  };

  // Framing whenever a mech arrives on stage, plus the debug hooks.
  useEffect(() => {
    auto.current = true;
    tween.current = null;
    const v = defaultView();
    cam.position.copy(v.position);
    controls.current?.target.copy(v.target);
    controls.current?.update();
    debugHandle().controls = controls.current ?? undefined;
    debugHandle().cameraTarget = () => (controls.current?.target.toArray() ?? [0, 0, 0]) as [number, number, number];
    debugHandle().setCameraView = (p, t) => {
      auto.current = false;
      tween.current = null;
      cam.position.set(...p);
      controls.current?.target.set(...t);
      controls.current?.update();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime]);

  // Focus requests from search / inspector: fly there and leave the camera to the user.
  const focus = useApp((s) => s.focus);
  useEffect(() => {
    if (!focus || !controls.current) return;
    const box = runtime.partBox(focus.id);
    if (box.isEmpty()) return;
    const g = focusGoal(box, cam.position, controls.current.target, cam.fov, aspect());
    auto.current = false;
    startTween(g.position, g.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // Home: back to the framed view (the chase view in pilot mode), auto-framing on again.
  const viewNonce = useApp((s) => s.viewNonce);
  useEffect(() => {
    if (viewNonce === 0) return;
    auto.current = true;
    const v = useApp.getState().pilotOn ? chaseView() : defaultView();
    startTween(v.position, v.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewNonce]);

  // Pilot mode: swing round behind the mech; leaving it frames the mech where it stands.
  const pilotOn = useApp((s) => s.pilotOn);
  const firstPilot = useRef(true);
  useEffect(() => {
    if (firstPilot.current) {
      firstPilot.current = false;
      return;
    }
    auto.current = true;
    const v = pilotOn ? chaseView() : defaultView();
    startTween(v.position, v.target, 1.1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pilotOn]);

  // Flight lab: chase view from behind and above; leaving it returns to the showroom view.
  const flightOn = useApp((s) => s.flightOn);
  const firstFlight = useRef(true);
  useEffect(() => {
    if (firstFlight.current) {
      firstFlight.current = false;
      return;
    }
    auto.current = true;
    if (flightOn) {
      const c = runtime.approxBox(tmpBox.current).getCenter(new THREE.Vector3());
      startTween(c.clone().add(CHASE_OFFSET), c, 1.2);
    } else {
      const v = defaultView();
      startTween(v.position, v.target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightOn]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;

    // Pilot mode: travel and turn with the mech, keeping the user's zoom and angle.
    const piloting = useApp.getState().pilotOn;
    if (piloting) {
      const a = stageAnchor;
      const last = lastAnchor.current;
      if (last) {
        const d = tmpV.current.subVectors(a.position, last.pos);
        const turn = a.heading - last.heading;
        const tw = tween.current;
        const carry = (p: THREE.Vector3, pivot: THREE.Vector3) => {
          p.add(d);
          if (turn) p.sub(pivot).applyAxisAngle(UP, turn).add(pivot);
        };
        if (d.lengthSq() > 0 || turn) {
          c.target.add(d);
          carry(cam.position, c.target);
          if (tw) {
            tw.fromTgt.add(d);
            tw.toTgt.add(d);
            carry(tw.fromPos, tw.fromTgt);
            carry(tw.toPos, tw.toTgt);
          }
        }
        last.pos.copy(a.position);
        last.heading = a.heading;
      } else {
        lastAnchor.current = { pos: a.position.clone(), heading: a.heading };
      }
    } else {
      lastAnchor.current = null;
    }

    const tw = tween.current;
    if (tw) {
      tw.t = Math.min(1, tw.t + delta / tw.duration);
      const k = ease(tw.t);
      cam.position.lerpVectors(tw.fromPos, tw.toPos, k);
      c.target.lerpVectors(tw.fromTgt, tw.toTgt, k);
      if (tw.t >= 1) tween.current = null;
      c.update();
      return;
    }
    if (!auto.current || piloting) {
      if (piloting) c.update();
      return;
    }
    // Auto-framing: keep the craft centred (on its modes' own centres, so posed joints and moving
    // limbs don't pan the view) and back off if it outgrows the view.
    const center = frameCenter(tmpOff.current);
    const need = fitDistance(runtime.approxRadius(center) * 1.03, cam.fov, aspect());
    const shift = center.sub(c.target).multiplyScalar(Math.min(1, delta * 3));
    let changed = false;
    if (shift.lengthSq() > 1e-8) {
      c.target.add(shift);
      cam.position.add(shift);
      changed = true;
    }
    const offset = tmpV.current.subVectors(cam.position, c.target);
    const dist = offset.length();
    if (dist < need - 0.01) {
      offset.multiplyScalar((dist + (need - dist) * Math.min(1, delta * 4)) / dist);
      cam.position.copy(c.target).add(offset);
      changed = true;
    }
    if (changed) c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={1.5}
      maxDistance={120}
      maxPolarAngle={Math.PI * 0.86}
      onStart={() => {
        // Any orbit, zoom or pan hands the camera to the user until Home.
        tween.current = null;
        auto.current = false;
      }}
    />
  );
}
