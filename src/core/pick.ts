import type * as THREE from 'three';

function visibleInHierarchy(o: THREE.Object3D | null): boolean {
  for (let n = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}

/**
 * Choose the part a tap/click refers to from raycast hits (nearest first).
 * Hidden meshes are ignored; in cutaway the first internal component wins over
 * the ghosted armour in front of it.
 */
export function pickPart(hits: { object: THREE.Object3D }[], cutaway: boolean): string | null {
  const valid = hits.filter((h) => h.object.userData?.partId && visibleInHierarchy(h.object));
  if (cutaway) {
    const inner = valid.find((h) => h.object.userData.kind === 'internal');
    if (inner) return inner.object.userData.partId;
  }
  return valid[0]?.object.userData.partId ?? null;
}
