import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createMecha, type Mecha } from './build';
import { MechaController } from './controller';
import { pickPart } from '../../core/pick';
import { SYSTEM_IDS, type SystemId } from './systems';

let mecha: Mecha;
let ctl: MechaController;
beforeAll(() => {
  mecha = createMecha();
  ctl = new MechaController(mecha);
  ctl.setProgress(0);
});

const all = (on: boolean) => Object.fromEntries(SYSTEM_IDS.map((id) => [id, on])) as Record<SystemId, boolean>;
const visibleOf = (sys: SystemId) => mecha.internal.filter((m) => m.userData.system === sys && m.visible).length;

describe('anatomy / cutaway', () => {
  it('hides internal systems when cutaway is off, except what shows through the canopy, the intake mouths and the folded knees', () => {
    ctl.setCutaway(false);
    // Only the first fan stage, its spinner and the guide vanes show inside the open intake lips,
    // and the air duct where it runs round the knee (the bellows between thigh and shin).
    const engines = mecha.internal.filter((m) => m.userData.system === 'engines' && m.visible);
    expect(engines.length).toBeGreaterThan(0);
    for (const m of engines) expect(m.userData.partId, 'visible engine part').toMatch(/^(fan|intake-duct|duct-bellows)-/);
    expect(engines.some((m) => /^duct-bellows-/.test(m.userData.partId))).toBe(true);
    expect(mecha.parts.get('compressor-port')!.some((m) => m.visible)).toBe(false);
    expect(visibleOf('power')).toBe(0);
    expect(mecha.parts.get('ejection-seat')!.every((m) => m.visible)).toBe(true);
    expect(mecha.mats.ext.white.opacity).toBe(1);
  });

  it('ghosts the armour and reveals systems independently in cutaway', () => {
    ctl.setCutaway(true);
    ctl.setSystems({ ...all(true), engines: false });
    expect(mecha.mats.ext.white.transparent).toBe(true);
    expect(mecha.mats.ext.white.opacity).toBeLessThan(0.3);
    expect(visibleOf('engines')).toBe(0);
    for (const id of SYSTEM_IDS.filter((s) => s !== 'engines')) expect(visibleOf(id), id).toBeGreaterThan(0);
    ctl.setSystems({ ...all(false), engines: true });
    expect(visibleOf('engines')).toBeGreaterThan(0);
    expect(visibleOf('power')).toBe(0);
    ctl.setCutaway(false);
    ctl.setSystems(all(true));
  });

  it('keeps hydraulic rams attached to both anchor bones through the transformation', () => {
    for (const t of [0, 0.5, 1]) {
      ctl.setProgress(t);
      for (const p of mecha.pistons) {
        const a = p.a.getWorldPosition(new THREE.Vector3());
        const b = p.b.getWorldPosition(new THREE.Vector3());
        const barrelBase = p.barrel.getWorldPosition(new THREE.Vector3());
        const rodBase = p.rod.getWorldPosition(new THREE.Vector3());
        expect(barrelBase.distanceTo(a), `${p.partId} barrel @${t}`).toBeLessThan(1e-3);
        expect(rodBase.distanceTo(b), `${p.partId} rod @${t}`).toBeLessThan(1e-3);
      }
    }
  });

  it('highlights the selected part and restores it when deselected', () => {
    const meshes = mecha.parts.get('canopy')!.filter((m) => m.userData.kind === 'exterior');
    ctl.setSelected('canopy');
    for (const m of meshes) expect(m.material).not.toBe(m.userData.baseMaterial);
    ctl.setSelected(null);
    for (const m of meshes) expect(m.material).toBe(m.userData.baseMaterial);
  });
});

describe('pickPart', () => {
  const obj = (partId: string, kind: string, visible = true) => {
    const parent = new THREE.Object3D();
    parent.visible = visible;
    const o = new THREE.Object3D();
    o.userData = { partId, kind };
    parent.add(o);
    return { object: o };
  };

  it('returns the nearest visible part', () => {
    expect(pickPart([obj('a', 'exterior', false), obj('b', 'exterior'), obj('c', 'internal')], false)).toBe('b');
  });

  it('prefers internal parts behind ghosted armour in cutaway', () => {
    expect(pickPart([obj('armor', 'exterior'), obj('core', 'internal')], true)).toBe('core');
    expect(pickPart([obj('armor', 'exterior')], true)).toBe('armor');
  });

  it('ignores hits without a part id', () => {
    expect(pickPart([{ object: new THREE.Object3D() }], false)).toBeNull();
  });
});
