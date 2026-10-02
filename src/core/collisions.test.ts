import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findCollisions, type CollisionSubject } from './collisions';

/** A hull bone with an arm bone that slides along x; each carries a 1 m cube. */
function rig(joint?: boolean | string) {
  const root = new THREE.Bone();
  root.name = 'hull';
  const arm = new THREE.Bone();
  arm.name = 'arm';
  root.add(arm);
  const cube = (partId: string, parent: THREE.Object3D) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    m.userData = { partId, collide: true, joint };
    parent.add(m);
    return m;
  };
  const a = cube('hull-panel', root);
  const b = cube('arm-panel', arm);
  const subject: CollisionSubject = {
    exterior: [a, b],
    internal: [],
    pistons: [],
    setProgress: (t) => {
      arm.position.x = t < 0.5 ? 0.5 : 3; // overlapping, then clear
      root.updateMatrixWorld(true);
    },
  };
  return subject;
}

describe('findCollisions', () => {
  it('reports bodies on different bones that interpenetrate, and only at the samples where they do', () => {
    expect(findCollisions(rig(), [0, 1], { telescoping: [], nested: [] })).toEqual([
      { a: 'hull-panel', b: 'arm-panel', boneA: 'hull', boneB: 'arm', at: [0] },
    ]);
  });

  it('accepts designed contacts: telescoping bones, nested parts and seated joint hardware', () => {
    expect(findCollisions(rig(), [0], { telescoping: ['arm|hull'], nested: [] })).toEqual([]);
    expect(findCollisions(rig(), [0], { telescoping: [], nested: [[/^arm-/, /^hull-/]] })).toEqual([]);
    expect(findCollisions(rig(true), [0], { telescoping: [], nested: [] })).toEqual([]);
    expect(findCollisions(rig('arm'), [0], { telescoping: [], nested: [] })).toEqual([]);
  });
});
