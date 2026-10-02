import * as THREE from 'three';

/** Distance at which a sphere of `radius` fits inside a perspective frustum. */
export function fitDistance(radius: number, vfovDeg: number, aspect: number, margin = 1.08): number {
  const v = THREE.MathUtils.degToRad(vfovDeg);
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  const fov = Math.min(v, h);
  return (radius * margin) / Math.sin(fov / 2);
}

/**
 * Camera goal that frames a box: keep the current viewing direction, centre on
 * the box and back off far enough to see it comfortably.
 */
export function focusGoal(
  box: THREE.Box3,
  cameraPos: THREE.Vector3,
  target: THREE.Vector3,
  vfovDeg: number,
  aspect: number,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.9);
  const dir = cameraPos.clone().sub(target);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0.5, 1);
  dir.normalize();
  const dist = THREE.MathUtils.clamp(fitDistance(radius, vfovDeg, aspect, 1.6), 4.5, 40);
  return { position: center.clone().addScaledVector(dir, dist), target: center };
}
