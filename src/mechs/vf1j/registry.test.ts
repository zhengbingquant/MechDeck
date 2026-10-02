import { describe, it, expect, beforeAll } from 'vitest';
import { createMecha, type Mecha } from './build';
import { PARTS, PART_BY_ID } from './registry';
import { SYSTEM_IDS } from './systems';

let mecha: Mecha;
beforeAll(() => {
  mecha = createMecha();
});

describe('part registry', () => {
  it('has unique ids with a name and a real description', () => {
    expect(new Set(PARTS.map((p) => p.id)).size).toBe(PARTS.length);
    for (const p of PARTS) {
      expect(p.name.length, p.id).toBeGreaterThan(3);
      expect(p.description.length, p.id).toBeGreaterThan(30);
    }
  });

  it('describes every mesh in the model', () => {
    for (const id of mecha.parts.keys()) expect(PART_BY_ID[id], `unregistered part ${id}`).toBeDefined();
  });

  it('has geometry for every registered part', () => {
    for (const p of PARTS) expect(mecha.parts.get(p.id)?.length ?? 0, `no meshes for ${p.id}`).toBeGreaterThan(0);
  });

  it('files every internal part under a system, with at least 6 systems populated', () => {
    const internal = PARTS.filter((p) => p.group === 'internal');
    for (const p of internal) expect(SYSTEM_IDS, p.id).toContain(p.system);
    const populated = new Set(internal.map((p) => p.system));
    expect(populated.size).toBeGreaterThanOrEqual(6);
    for (const id of SYSTEM_IDS) expect(populated.has(id), `system ${id} has no parts`).toBe(true);
  });

  it('keeps internal meshes tagged with their system', () => {
    for (const mesh of mecha.internal) {
      const info = PART_BY_ID[mesh.userData.partId];
      expect(mesh.userData.system, mesh.userData.partId).toBe(info.system);
    }
  });
});
