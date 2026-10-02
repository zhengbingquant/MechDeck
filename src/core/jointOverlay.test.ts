import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { JointOverlay } from './jointOverlay';

function rig() {
  const root = new THREE.Bone();
  root.name = 'root';
  const hinge = new THREE.Bone();
  hinge.name = 'hinge';
  const slide = new THREE.Bone();
  slide.name = 'slide';
  root.add(hinge, slide);
  return { root, hinge, slide };
}

describe('JointOverlay', () => {
  it('lights a ring on a rotating joint, aligned with its rotation axis, and nothing on still joints', () => {
    const { root, hinge, slide } = rig();
    const overlay = new JointOverlay([hinge, slide]);
    overlay.update(1 / 60);
    for (let i = 0; i < 10; i++) {
      hinge.rotation.x += 0.03; // ~1.8 rad/s about X
      overlay.update(1 / 60);
    }
    const g = overlay.gizmo('hinge')!;
    expect(g.level).toBeGreaterThan(0.5);
    expect(g.ring.visible).toBe(true);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(g.ring.quaternion);
    expect(Math.abs(normal.x)).toBeGreaterThan(0.95);
    expect(overlay.gizmo('slide')!.level).toBe(0);
    expect(root.children.length).toBeGreaterThan(2); // gizmos live in the parent's frame
  });

  it('shows an arrow along a sliding joint and fades out once it stops', () => {
    const { hinge, slide } = rig();
    const overlay = new JointOverlay([hinge, slide]);
    overlay.update(1 / 60);
    for (let i = 0; i < 10; i++) {
      slide.position.y += 0.03;
      overlay.update(1 / 60);
    }
    const g = overlay.gizmo('slide')!;
    expect(g.arrow.visible).toBe(true);
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(g.arrow.quaternion);
    expect(dir.y).toBeGreaterThan(0.95);
    overlay.update(1 / 60); // stopped: fading out
    expect(g.arrow.visible).toBe(true);
    expect(g.ring.visible).toBe(false);
    for (let i = 0; i < 120; i++) overlay.update(1 / 60);
    expect(g.level).toBeLessThan(0.02);
    expect(g.arrow.visible).toBe(false);
  });

  it('can be hidden entirely', () => {
    const { hinge, slide } = rig();
    const overlay = new JointOverlay([hinge, slide]);
    overlay.setVisible(false);
    hinge.rotation.x = 1;
    overlay.update(1 / 60);
    expect(overlay.gizmo('hinge')!.ring.visible).toBe(false);
  });

  it('keeps a focused joint lit on the axis being posed, even with the overlay hidden', () => {
    const { hinge, slide } = rig();
    const overlay = new JointOverlay([hinge, slide]);
    overlay.setVisible(false);
    hinge.rotation.set(0.4, 0, 0);
    overlay.focus([{ bone: 'hinge', axis: 'z', slide: false }, { bone: 'slide', axis: 'y', slide: true }]);
    for (let i = 0; i < 60; i++) overlay.update(1 / 60);
    const g = overlay.gizmo('hinge')!;
    expect(g.ring.visible).toBe(true);
    expect(g.level).toBe(1);
    // A Z-axis ring follows the bone's own Z (tilted 0.4 rad about X).
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(g.ring.quaternion);
    expect(normal.dot(new THREE.Vector3(0, 0, 1).applyQuaternion(hinge.quaternion))).toBeGreaterThan(0.99);
    expect(overlay.gizmo('slide')!.arrow.visible).toBe(true);
    overlay.focus(null);
    for (let i = 0; i < 120; i++) overlay.update(1 / 60);
    expect(g.ring.visible).toBe(false);
  });
});
