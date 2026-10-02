import * as THREE from 'three';
import type { MechRuntime } from '../core/types';

/**
 * Small automation surface for e2e tests and screenshot tooling.
 * Everything here reads/writes the same state the UI uses.
 */
export interface MechDeckDebug {
  ready: boolean;
  runtime?: MechRuntime;
  camera?: THREE.PerspectiveCamera;
  canvas?: HTMLCanvasElement;
  setCameraView?: (position: [number, number, number], target: [number, number, number]) => void;
  /** The orbit controls (tooling may lift their distance limits). */
  controls?: { maxDistance: number; minDistance: number; enabled: boolean; target: { copy(v: unknown): unknown }; update(): void };
  /** White backdrop and no ground: for comparing renders against line art. */
  studio?: (on: boolean) => void;
  /** Studio backdrop with the whole craft drawn flat black: its silhouette, for accuracy scoring. */
  silhouette?: (on: boolean) => void;
  /** Current orbit target (the point the camera looks at and orbits around). */
  cameraTarget?: () => [number, number, number];
  /** The app store (getState / setState), for tooling. */
  store?: { getState(): unknown; setState(partial: Record<string, unknown>): void };
  /** Jump straight to a transformation progress (no animation). */
  setProgressNow?: (t: number) => void;
  /** Sound engine read-out: AudioContext state, mute, voice levels and one-shot count. */
  sound?: () => { state: string; muted: boolean; servo: number; turbine: number; roar: number; oneShots: number };
}

declare global {
  interface Window {
    __mechdeck?: MechDeckDebug;
  }
}

export function debugHandle(): MechDeckDebug {
  if (!window.__mechdeck) window.__mechdeck = { ready: false };
  return window.__mechdeck;
}

/** Project a world point into CSS pixels relative to the page. */
export function projectToPage(p: THREE.Vector3, camera: THREE.Camera, canvas: HTMLCanvasElement) {
  const v = p.clone().project(camera);
  const r = canvas.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, z: v.z };
}
