import * as THREE from 'three';
import type { Builder } from '../../core/builder';
import { PALETTE } from './config';
import { addSurfaceVariation } from '../../core/materials/surface';
import { SYSTEMS, type SystemId } from './systems';

export type MatKey =
  | 'white'
  | 'offWhite'
  | 'grey'
  | 'steel'
  | 'red'
  | 'black'
  | 'gunmetal'
  | 'navy'
  | 'canopy'
  | 'amber'
  | 'navRed'
  | 'navBlue'
  | 'wingtip'
  | 'intake'
  | 'visor'
  | 'gunpod';

/** Builder specialised to the VF-1J's materials and systems. */
export type Vf1Builder = Builder<MaterialSet, MatKey, SystemId>;

export interface MaterialSet {
  ext: Record<MatKey, THREE.MeshStandardMaterial>;
  sys: Record<SystemId, THREE.MeshStandardMaterial>;
  /** Secondary per-system materials: chrome rods, glowing cores, dark casings. */
  chrome: THREE.MeshStandardMaterial;
  glowHot: THREE.MeshStandardMaterial;
  glowCore: THREE.MeshStandardMaterial;
  casing: THREE.MeshStandardMaterial;
  pilot: THREE.MeshStandardMaterial;
  edge: THREE.LineBasicMaterial;
  panel: THREE.LineBasicMaterial;
  /** Decal materials (markings); they fade with the armour in cutaway. */
  decals: THREE.MeshStandardMaterial[];
}

/** Keys that stay opaque in cutaway (glass, lights and markings are not armour). */
const CUTAWAY_EXEMPT: MatKey[] = ['canopy', 'visor', 'amber', 'navRed', 'navBlue', 'wingtip'];
const CUTAWAY_OPACITY = 0.12;

function std(color: string, roughness: number, metalness: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

/** Clear-coated aircraft paint with subtle mottle and grain. */
function paint(color: string, roughness: number, extra: THREE.MeshPhysicalMaterialParameters = {}) {
  return addSurfaceVariation(
    new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.05, clearcoat: 0.45, clearcoatRoughness: 0.32, ...extra }),
  );
}

/** Bare or anodised metal with a little variation. */
function metal(color: string, roughness: number, metalness: number) {
  return addSurfaceVariation(new THREE.MeshStandardMaterial({ color, roughness, metalness }), 0.8);
}

export function createMaterials(): MaterialSet {
  const ext: Record<MatKey, THREE.MeshStandardMaterial> = {
    white: paint(PALETTE.white, 0.5),
    offWhite: paint(PALETTE.offWhite, 0.52),
    grey: paint(PALETTE.lightGrey, 0.5),
    steel: paint(PALETTE.steel, 0.7, { clearcoat: 0.15 }),
    red: paint(PALETTE.vermilion, 0.45),
    black: paint(PALETTE.black, 0.55, { clearcoat: 0.2 }),
    gunmetal: metal(PALETTE.gunmetal, 0.4, 0.7),
    navy: paint(PALETTE.navy, 0.5, { metalness: 0.25 }),
    canopy: std(PALETTE.canopy, 0.05, 0.35, { transparent: true, opacity: 0.5, depthWrite: false, envMapIntensity: 1.6 }),
    amber: std(PALETTE.amber, 0.3, 0.1, { emissive: PALETTE.amber, emissiveIntensity: 0.6 }),
    navRed: std(PALETTE.navRed, 0.3, 0.1, { emissive: PALETTE.navRed, emissiveIntensity: 0.8 }),
    navBlue: std(PALETTE.navBlue, 0.3, 0.1, { emissive: PALETTE.navBlue, emissiveIntensity: 0.8 }),
    wingtip: std(PALETTE.wingtip, 0.3, 0.1, { emissive: PALETTE.wingtip, emissiveIntensity: 0.5 }),
    intake: std('#10141c', 0.8, 0.2),
    visor: std('#39d98a', 0.15, 0.3, { emissive: '#2bd47a', emissiveIntensity: 0.9 }),
    gunpod: std('#2b2f36', 0.45, 0.55),
  };
  for (const [key, m] of Object.entries(ext)) {
    m.name = `ext:${key}`;
    m.userData.baseOpacity = m.opacity;
    m.userData.baseTransparent = m.transparent;
    m.userData.baseDepthWrite = m.depthWrite;
  }
  const sys = {} as Record<SystemId, THREE.MeshStandardMaterial>;
  for (const s of SYSTEMS) {
    sys[s.id] = std(s.color, 0.45, 0.45, { emissive: s.color, emissiveIntensity: 0.12 });
    sys[s.id].name = `sys:${s.id}`;
  }
  return {
    ext,
    sys,
    chrome: std('#dfe6ee', 0.18, 0.95),
    glowHot: std('#ff6a1a', 0.4, 0.2, { emissive: '#ff5a0a', emissiveIntensity: 1.6 }),
    glowCore: std('#7ff0ff', 0.2, 0.1, { emissive: '#39d6ff', emissiveIntensity: 2.2 }),
    casing: std('#3a4150', 0.5, 0.6),
    pilot: std('#f4f4f4', 0.5, 0.05),
    // Hard-edge creases stay faint; engraved panel lines read a little stronger.
    edge: new THREE.LineBasicMaterial({ color: '#1b2029', transparent: true, opacity: 0.3 }),
    panel: new THREE.LineBasicMaterial({ color: '#232932', transparent: true, opacity: 0.55 }),
    decals: [],
  };
}

/** Ghost the armour for the anatomy / cutaway view. */
export function applyCutaway(set: MaterialSet, on: boolean): void {
  for (const [key, m] of Object.entries(set.ext) as [MatKey, THREE.MeshStandardMaterial][]) {
    if (CUTAWAY_EXEMPT.includes(key)) continue;
    m.transparent = on ? true : m.userData.baseTransparent;
    m.opacity = on ? CUTAWAY_OPACITY : m.userData.baseOpacity;
    m.depthWrite = on ? false : m.userData.baseDepthWrite;
    m.needsUpdate = true;
  }
  set.edge.opacity = on ? 0.18 : 0.3;
  set.panel.opacity = on ? 0.25 : 0.55;
  for (const m of set.decals) m.opacity = on ? CUTAWAY_OPACITY : 1;
}
