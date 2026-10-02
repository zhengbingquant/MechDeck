import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { MechRuntime } from '../core/types';
import { pickPart } from '../core/pick';
import { stepProgress, useApp } from '../state/store';
import { debugHandle } from './debug';

/** Progress units per second: a full Fighter → Battroid conversion takes ~3 s. */
const SPEED = 0.34;
const SPEED_SCRUB = 1.8;

interface Props {
  runtime: MechRuntime;
  /** Outermost group (pilot mode moves it across the floor; the flight gimbal sits inside). */
  drive: THREE.Group;
  /** The innermost group holding the rig. */
  offset: THREE.Group;
}

export function MechaView({ runtime, drive, offset }: Props) {
  useEffect(() => {
    offset.add(runtime.root);
    return () => {
      offset.remove(runtime.root);
    };
  }, [runtime, offset]);

  const rig = useMemo(() => {
    const h = new THREE.SkeletonHelper(runtime.root);
    const m = h.material as THREE.LineBasicMaterial;
    m.depthTest = false;
    m.transparent = true;
    h.renderOrder = 10;
    h.visible = false;
    return h;
  }, [runtime]);
  const { camera, gl, scene } = useThree();

  // Debug / automation hook.
  useEffect(() => {
    runtime.setProgress(useApp.getState().progress);
    const dbg = debugHandle();
    dbg.runtime = runtime;
    dbg.store = useApp as unknown as NonNullable<typeof dbg.store>;
    dbg.camera = camera as THREE.PerspectiveCamera;
    dbg.canvas = gl.domElement;
    dbg.studio = (on) => {
      scene.background = on ? new THREE.Color('#ffffff') : null;
      const ground = scene.getObjectByName('ground');
      if (ground) ground.visible = !on;
      gl.domElement.parentElement!.style.background = on ? '#fff' : '';
    };
    const black = new THREE.MeshBasicMaterial({ color: '#000000' });
    dbg.silhouette = (on) => {
      dbg.studio?.(on);
      scene.overrideMaterial = on ? black : null;
      runtime.setJointsVisible?.(on ? false : useApp.getState().showJoints);
    };
    dbg.setProgressNow = (t) => {
      useApp.setState({ target: t, progress: t });
      runtime.setProgress(t);
    };
    dbg.ready = true;
    return () => {
      dbg.ready = false;
    };
  }, [runtime, camera, gl, scene]);

  // Joint control: hand each requested offset to the rig, which stops the joint at its first
  // contact, and report what it actually took.
  useEffect(() => {
    let last = useApp.getState().dofs;
    let nonce = useApp.getState().dofNonce;
    runtime.resetDofs?.();
    return useApp.subscribe((s) => {
      if (s.dofNonce !== nonce) {
        nonce = s.dofNonce;
        last = s.dofs;
        runtime.resetDofs?.();
        return;
      }
      if (s.dofs === last || !runtime.setDof) return;
      const prev = last;
      last = s.dofs;
      for (const [id, v] of Object.entries(s.dofs)) {
        if (prev[id] !== v) s.applyDofResult(id, runtime.setDof(id, v));
      }
    });
  }, [runtime]);

  // Mirror UI state into the scene.
  useEffect(() => {
    const sync = (s: ReturnType<typeof useApp.getState>) => {
      runtime.setCutaway(s.cutaway);
      runtime.setSystems(s.systems);
      runtime.setSelected(s.selectedId);
      runtime.setHovered(s.hoveredId);
      runtime.setJointsVisible?.(s.showJoints);
      runtime.highlightDof?.(s.dofFocus);
      rig.visible = s.showRig;
    };
    sync(useApp.getState());
    return useApp.subscribe(sync);
  }, [runtime, rig]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    runtime.tick(dt);
    const s = useApp.getState();
    if (s.progress === s.target && runtime.lastProgress === s.progress) return;
    const next = stepProgress(s.progress, s.target, dt, s.dragging ? SPEED_SCRUB : SPEED);
    runtime.setProgress(next);
    if (next !== s.progress) s.setProgress(next);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return; // that was an orbit drag, not a tap
    useApp.getState().select(pickPart(e.intersections, useApp.getState().cutaway));
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.pointerType !== 'mouse') return;
    e.stopPropagation();
    const id = pickPart(e.intersections, useApp.getState().cutaway);
    useApp.getState().hover(id);
    gl.domElement.style.cursor = id ? 'pointer' : '';
  };

  const onOut = () => {
    useApp.getState().hover(null);
    gl.domElement.style.cursor = '';
  };

  return (
    <>
      <primitive object={drive} onClick={onClick} onPointerMove={onMove} onPointerOut={onOut} />
      <primitive object={rig} />
    </>
  );
}
