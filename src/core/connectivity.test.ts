import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Connectivity } from './connectivity';

function cube(name: string, size: number, x: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size));
  m.name = name;
  m.position.x = x;
  m.updateMatrixWorld(true);
  return m;
}

const names = (groups: THREE.Mesh[][]) => groups.map((g) => g.map((m) => m.name).sort());

describe('Connectivity', () => {
  it('links bodies whose surfaces touch (within the gap) and chains them into one group', () => {
    const a = cube('a', 1, 0);
    const b = cube('b', 1, 1.01); // 1 cm apart
    const c = cube('c', 1, 2.02);
    expect(names(new Connectivity([a, b, c], 0.02).groups())).toEqual([['a', 'b', 'c']]);
  });

  it('links a body embedded inside another (a pin in its bore)', () => {
    const housing = cube('housing', 2, 0);
    const pin = cube('pin', 0.3, 0.2);
    expect(names(new Connectivity([housing, pin], 0.02).groups())).toEqual([['housing', 'pin']]);
  });

  it('reports a body that touches nothing as its own (floating) group', () => {
    const a = cube('a', 1, 0);
    const b = cube('b', 1, 1.01);
    const loose = cube('loose', 1, 3.5);
    expect(names(new Connectivity([a, b, loose], 0.02).groups())).toEqual([['a', 'b'], ['loose']]);
  });

  it('follows the bodies as they move (world matrices are read on every call)', () => {
    const a = cube('a', 1, 0);
    const b = cube('b', 1, 1.01);
    const conn = new Connectivity([a, b], 0.02);
    expect(conn.groups()).toHaveLength(1);
    b.position.x = 3;
    b.updateMatrixWorld(true);
    expect(conn.groups()).toHaveLength(2);
  });
});
