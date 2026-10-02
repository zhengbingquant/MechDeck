import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fitDistance, focusGoal } from './framing';

describe('fitDistance', () => {
  it('uses the vertical field of view on wide screens', () => {
    const d = fitDistance(10, 40, 2, 1);
    expect(d).toBeCloseTo(10 / Math.sin(THREE.MathUtils.degToRad(20)), 5);
  });

  it('backs off further on portrait screens where the horizontal fov is narrower', () => {
    expect(fitDistance(10, 40, 0.5, 1)).toBeGreaterThan(fitDistance(10, 40, 2, 1));
  });
});

describe('focusGoal', () => {
  it('centres on the box and keeps the current viewing direction', () => {
    const box = new THREE.Box3(new THREE.Vector3(1, 1, 1), new THREE.Vector3(3, 3, 3));
    const cam = new THREE.Vector3(10, 0, 0);
    const tgt = new THREE.Vector3(0, 0, 0);
    const g = focusGoal(box, cam, tgt, 35, 1.5);
    expect(g.target.toArray()).toEqual([2, 2, 2]);
    const dir = g.position.clone().sub(g.target).normalize();
    expect(dir.x).toBeCloseTo(1, 5);
    expect(g.position.distanceTo(g.target)).toBeGreaterThanOrEqual(4.5);
  });
});
