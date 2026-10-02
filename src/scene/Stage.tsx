import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Grid, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { MechaView } from './MechaView';
import { CameraRig } from './CameraRig';
import { FlightSim } from './FlightSim';
import { PilotSim } from './PilotSim';
import { Soundscape } from './Soundscape';
import { stageAnchor } from './anchor';
import type { MechRuntime } from '../core/types';
import { useApp } from '../state/store';
import { useMech } from '../ui/useMech';

const KEY_LIGHT = new THREE.Vector3(14, 24, 12);

function Lights() {
  // The key light (and its shadow frustum) travel with the mech across the floor.
  const key = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const l = key.current;
    if (!l) return;
    const a = stageAnchor.position;
    l.position.set(a.x + KEY_LIGHT.x, KEY_LIGHT.y, a.z + KEY_LIGHT.z);
    l.target.position.set(a.x, 0, a.z);
    l.target.updateMatrixWorld();
  });
  return (
    <>
      <hemisphereLight args={['#dfe7ff', '#6a7389', 0.85]} />
      <directionalLight
        ref={key}
        position={[KEY_LIGHT.x, KEY_LIGHT.y, KEY_LIGHT.z]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      >
        <orthographicCamera attach="shadow-camera" args={[-16, 16, 16, -16, 1, 70]} />
      </directionalLight>
      <directionalLight position={[-16, 10, -8]} intensity={0.55} color="#b8c8ff" />
      <directionalLight position={[0, 6, -20]} intensity={0.9} color="#ffe2c8" />
    </>
  );
}

/** Studio reflections built locally (no HDR download). */
function Reflections() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={['#1a2233']} />
      <Lightformer form="rect" intensity={3} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[-14, 4, 6]} rotation-y={Math.PI / 2} scale={[14, 6, 1]} color="#cfe0ff" />
      <Lightformer form="rect" intensity={1.4} position={[14, 4, -6]} rotation-y={-Math.PI / 2} scale={[14, 6, 1]} color="#ffe6d0" />
      <Lightformer form="ring" intensity={2} position={[0, 3, 16]} scale={6} />
    </Environment>
  );
}

function Ground() {
  // In the flight lab the moving flight grid takes over.
  const flying = useApp((s) => s.flightOn);
  // The shadow catcher follows the mech; the grid is infinite.
  const catcher = useRef<THREE.Mesh>(null);
  useFrame(() => {
    catcher.current?.position.set(stageAnchor.position.x, -0.001, stageAnchor.position.z);
  });
  return (
    <group name="ground" visible={!flying}>
      <mesh ref={catcher} rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <shadowMaterial transparent opacity={0.32} />
      </mesh>
      <Grid
        position={[0, 0, 0]}
        args={[120, 120]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#2b3a57"
        sectionSize={5}
        sectionThickness={1.1}
        sectionColor="#3f5c8a"
        fadeDistance={70}
        fadeStrength={1.4}
        infiniteGrid
      />
    </group>
  );
}

export function Stage() {
  const mech = useMech();
  const runtime = useMemo(() => mech.create(), [mech]);
  // Free the previous mech's GPU resources once its replacement is on stage.
  const shown = useRef<MechRuntime | null>(null);
  useEffect(() => {
    if (shown.current && shown.current !== runtime) shown.current.dispose();
    shown.current = runtime;
  }, [runtime]);

  const rig = useMemo(() => {
    // drive (pilot mode: across the floor) → gimbal (flight attitude about the CG) → offset → rig.
    const drive = new THREE.Group();
    drive.name = 'pilot-drive';
    const gimbal = new THREE.Group();
    gimbal.name = 'flight-gimbal';
    const offset = new THREE.Group();
    drive.add(gimbal);
    gimbal.add(offset);
    return { drive, gimbal, offset };
  }, []);

  const onMissed = () => useApp.getState().select(null);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 34, near: 0.3, far: 400, position: [18, 10, 22] }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.0 }}
      onCreated={({ gl }) => {
        // three.js recommends skipping shader diagnostics in production (perf); it also
        // silences benign HLSL constant-folding warnings from ANGLE/D3D on Windows.
        gl.debug.checkShaderErrors = import.meta.env.DEV;
      }}
      onPointerMissed={onMissed}
      style={{ touchAction: 'none' }}
      fallback={<div className="fallback">This viewer needs WebGL. Please try a current browser with hardware acceleration enabled.</div>}
    >
      <Lights />
      <Reflections />
      <Ground />
      <MechaView runtime={runtime} drive={rig.drive} offset={rig.offset} />
      {mech.airframe && <FlightSim runtime={runtime} airframe={mech.airframe} gimbal={rig.gimbal} offset={rig.offset} />}
      {mech.pilot && <PilotSim runtime={runtime} profile={mech.pilot} drive={rig.drive} />}
      <Soundscape />
      <CameraRig runtime={runtime} frameRadius={mech.frameRadius} />
    </Canvas>
  );
}
