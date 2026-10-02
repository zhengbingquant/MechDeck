import * as THREE from 'three';
import type { DriveState } from '../core/drive/locomotion';

/**
 * Where the mech stands on the hangar floor (pilot mode moves it). The key light,
 * its shadow and the floor's shadow catcher follow it; the camera tracks it.
 */
export const stageAnchor = {
  position: new THREE.Vector3(),
  /** Heading about +Y in radians (0 faces +Z). */
  heading: 0,
  /** Live drive state in pilot mode (null otherwise), and the mode being driven. */
  drive: null as DriveState | null,
  mode: null as string | null,
};
