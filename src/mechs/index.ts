import type { MechDefinition } from '../core/types';
import { vf1j } from './vf1j';

/**
 * The MechDeck hangar. To add a mech: build it under src/mechs/<id>/ exporting a
 * MechDefinition, then list it here.
 */
export const MECHS: MechDefinition[] = [vf1j];

export const DEFAULT_MECH_ID = vf1j.id;

export function getMech(id: string): MechDefinition {
  return MECHS.find((m) => m.id === id) ?? vf1j;
}
