import { getMech } from '../mechs';
import { useApp } from '../state/store';

/** The mech currently on the stage. */
export function useMech() {
  return getMech(useApp((s) => s.mechId));
}
