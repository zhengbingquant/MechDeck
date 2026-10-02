import { useApp } from '../state/store';

/** Keys currently held for flight control (read every frame by the sim). */
export const heldKeys = new Set<string>();

const STICK_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'control', '=', '+', '-']);

/** Stick / rudder / throttle-rate demands from the keyboard, each −1…1. */
export function keyboardDemand() {
  const k = (c: string) => (heldKeys.has(c) ? 1 : 0);
  return {
    // Pull back (S / ↓) raises the nose.
    pitch: k('s') + k('arrowdown') - k('w') - k('arrowup'),
    roll: k('d') + k('arrowright') - k('a') - k('arrowleft'),
    yaw: k('e') - k('q'),
    throttle: Math.sign(k('shift') + k('=') + k('+') - k('control') - k('-')),
  };
}

const FLAP_STEPS = [0, 0.5, 1];

/**
 * Keyboard handler for the flight lab. Returns true when it consumed the key.
 * Held keys fly the aircraft; F cycles the flaps, B the airbrake, V toggles
 * the automatic sweep schedule and [ / ] sweep the wings by hand.
 */
export function flightKeyDown(e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  const s = useApp.getState();
  if (STICK_KEYS.has(key)) {
    heldKeys.add(key);
    if (key.startsWith('arrow')) e.preventDefault();
    return true;
  }
  if (e.repeat) return false;
  const sweepNow = s.telemetry?.sweep ?? 20;
  switch (key) {
    case 'f': {
      const i = FLAP_STEPS.findIndex((v) => v >= s.flight.flaps - 1e-3);
      s.setFlight({ flaps: FLAP_STEPS[(i + 1) % FLAP_STEPS.length] });
      return true;
    }
    case 'b':
      s.setFlight({ airbrake: !s.flight.airbrake });
      return true;
    case 'v':
      s.setFlight({ sweep: s.flight.sweep === null ? Math.round(sweepNow) : null });
      return true;
    case '[':
    case ']': {
      const base = s.flight.sweep ?? sweepNow;
      s.setFlight({ sweep: Math.min(72, Math.max(20, Math.round(base + (key === ']' ? 4 : -4)))) });
      return true;
    }
  }
  return false;
}

export function flightKeyUp(e: KeyboardEvent) {
  heldKeys.delete(e.key.toLowerCase());
}

export function releaseAllKeys() {
  heldKeys.clear();
}
