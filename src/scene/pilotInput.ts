import { heldKeys } from './flightInput';

const PILOT_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' ']);

/** Stick demands from the keyboard for pilot mode, each −1…1, plus boost and jump. */
export function pilotDemand() {
  const k = (c: string) => (heldKeys.has(c) ? 1 : 0);
  return {
    forward: k('w') + k('arrowup') - k('s') - k('arrowdown'),
    turn: k('d') + k('arrowright') - k('a') - k('arrowleft'),
    strafe: k('e') - k('q'),
    boost: heldKeys.has('shift'),
    jump: heldKeys.has(' '),
  };
}

/**
 * Keyboard handler for pilot mode (W/S or ↑/↓ drive, A/D or ←/→ turn, Q/E sidestep,
 * Shift run / skim, Space jump). Returns true when it consumed the key; key-up and
 * window blur are shared with the flight lab (they release held keys).
 */
export function pilotKeyDown(e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  if (!PILOT_KEYS.has(key)) return false;
  heldKeys.add(key);
  if (key.startsWith('arrow') || key === ' ') e.preventDefault();
  return true;
}
