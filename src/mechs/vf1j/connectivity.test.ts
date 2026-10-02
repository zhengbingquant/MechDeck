import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { createMecha } from './build';
import { MechaController } from './controller';
import { Connectivity } from '../../core/connectivity';

const fmt = (t: number) => `${Math.round(t * 1000) / 10}%`;

/** Parts not linked (through touching parts, surfaces within 2 cm) to the airframe, at 41 steps. */
function floating(select: (mecha: ReturnType<typeof createMecha>) => THREE.Mesh[]): string[] {
  const mecha = createMecha();
  const ctl = new MechaController(mecha);
  const conn = new Connectivity(select(mecha), 0.02);
  const report: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    ctl.setProgress(t);
    mecha.root.updateMatrixWorld(true);
    const groups = conn.groups();
    const main = groups.find((g) => g.some((m) => m.userData.partId === 'center-fuselage'))!;
    for (const g of groups) {
      if (g !== main) report.push(`${fmt(t)}: ${[...new Set(g.map((m) => m.userData.partId as string))].join(', ')}`);
    }
  }
  return report;
}

describe('structural connectivity', () => {
  it('holds every part on the airframe (nothing floats) in all three modes and at every step between', () => {
    // Everything that exists physically: armour, internals, rams, links.
    expect(floating((m) => [...m.exterior, ...m.internal])).toEqual([]);
  }, 600_000);

  it('shows every visible part attached, without the cutaway (the linkages that carry parts show too)', () => {
    expect(floating((m) => [...m.exterior, ...m.internal.filter((x) => x.userData.always)])).toEqual([]);
  }, 600_000);
});
