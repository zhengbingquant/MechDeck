import { create } from 'zustand';
import type { DofResult, FlightControls, FlightTelemetry, PilotControls, PilotTelemetry } from '../core/types';
import { DEFAULT_MECH_ID, getMech } from '../mechs';

/** Advance `cur` toward `target` by at most speed·dt (progress units per second). */
export function stepProgress(cur: number, target: number, dt: number, speed: number): number {
  const d = target - cur;
  const step = speed * dt;
  if (Math.abs(d) <= step) return target;
  return cur + Math.sign(d) * step;
}

/** Human label for a transformation progress value, e.g. "Fighter → GERWALK". */
export function modeLabel(p: number, mechId = DEFAULT_MECH_ID): string {
  const modes = getMech(mechId).modes;
  const eps = 0.004;
  const exact = modes.find((m) => Math.abs(m.progress - p) <= eps);
  if (exact) return exact.label;
  const next = modes.findIndex((m) => m.progress > p);
  return `${modes[next - 1].label} → ${modes[next].label}`;
}

export type SheetPanel = 'none' | 'systems' | 'info' | 'flight' | 'pilot' | 'pose';

export const DEFAULT_FLIGHT: FlightControls = {
  throttle: 0.62,
  pitch: 0,
  roll: 0,
  yaw: 0,
  flaps: 0,
  airbrake: false,
  sweep: null,
};

export const IDLE_PILOT: PilotControls = { forward: 0, turn: 0, boost: false, jump: false };
/** Below this progress the mech is (becoming) a Fighter, which cannot walk. */
const PILOT_MIN_PROGRESS = 0.3;

interface AppState {
  mechId: string;
  /** Requested transformation progress (0 Fighter · 0.5 GERWALK · 1 Battroid). */
  target: number;
  /** Animated progress actually applied to the rig. */
  progress: number;
  dragging: boolean;
  cutaway: boolean;
  systems: Record<string, boolean>;
  showRig: boolean;
  showJoints: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  /** Camera snap request (nonce lets the same part be re-focused). */
  focus: { id: string; nonce: number } | null;
  viewNonce: number;
  panel: SheetPanel;
  flight: FlightControls;
  flightOn: boolean;
  /** Bumped to re-trim the flight lab (straight and level at the start altitude). */
  flightNonce: number;
  showForces: boolean;
  showAirflow: boolean;
  telemetry: FlightTelemetry | null;
  /** Pilot mode: drive the GERWALK or Battroid across the ground. */
  pilotOn: boolean;
  /** On-screen stick and buttons (the keyboard adds to these). */
  pilot: PilotControls;
  /** Bumped to bring the mech back to the hangar floor's centre. */
  pilotNonce: number;
  pilotTelemetry: PilotTelemetry | null;
  /** Sound effects on (persisted). */
  soundOn: boolean;
  /** Joint control (GERWALK / Battroid): requested offset per degree of freedom. */
  dofs: Record<string, number>;
  /** The offsets the rig actually took (a joint stops at its first contact). */
  dofsApplied: Record<string, number>;
  /** The last joint that was stopped short, and the two parts that met. */
  dofNote: { id: string; parts: [string, string] } | null;
  /** Bumped when every offset is cleared (the scene resets the rig). */
  dofNonce: number;
  /** The joint whose slider is in use (kept lit on the model). */
  dofFocus: string | null;

  setMech(id: string): void;
  setTarget(t: number): void;
  setProgress(p: number): void;
  setDragging(d: boolean): void;
  setMode(modeId: string): void;
  setCutaway(on: boolean): void;
  setSystem(id: string, on: boolean): void;
  setAllSystems(on: boolean): void;
  setShowRig(on: boolean): void;
  setShowJoints(on: boolean): void;
  select(id: string | null): void;
  hover(id: string | null): void;
  focusPart(id: string): void;
  resetView(): void;
  setPanel(p: SheetPanel): void;
  setFlight(patch: Partial<FlightControls>): void;
  setFlightOn(on: boolean): void;
  resetFlight(): void;
  setShowForces(on: boolean): void;
  setShowAirflow(on: boolean): void;
  setTelemetry(t: FlightTelemetry | null): void;
  setPilotOn(on: boolean): void;
  setPilot(patch: Partial<PilotControls>): void;
  recentrePilot(): void;
  setPilotTelemetry(t: PilotTelemetry | null): void;
  setSoundOn(on: boolean): void;
  setDof(id: string, value: number): void;
  applyDofResult(id: string, r: DofResult): void;
  resetDofs(): void;
  setDofFocus(id: string | null): void;
  reset(): void;
}

const SOUND_KEY = 'variable.sound';
const storedSound = () => {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
};

const allSystems = (mechId: string, on: boolean) =>
  Object.fromEntries(getMech(mechId).systems.map((s) => [s.id, on])) as Record<string, boolean>;

const initial = (mechId = DEFAULT_MECH_ID) => ({
  mechId,
  target: 0,
  progress: 0,
  dragging: false,
  cutaway: false,
  systems: allSystems(mechId, true),
  showRig: false,
  showJoints: true,
  selectedId: null,
  hoveredId: null,
  focus: null,
  viewNonce: 0,
  panel: 'none' as SheetPanel,
  flight: { ...DEFAULT_FLIGHT },
  flightOn: false,
  flightNonce: 0,
  showForces: true,
  showAirflow: true,
  telemetry: null,
  pilotOn: false,
  pilot: { ...IDLE_PILOT },
  pilotNonce: 0,
  pilotTelemetry: null,
  dofs: {},
  dofsApplied: {},
  dofNote: null,
  dofNonce: 0,
  dofFocus: null,
});

/** Leaving pilot mode: stick released, read-out cleared. */
const pilotOff = { pilotOn: false, pilot: { ...IDLE_PILOT }, pilotTelemetry: null };

type Get = () => AppState;
/** Joint-control offsets cleared (the rig goes back to the keyframe pose). */
const noDofs = (get: Get) => ({ dofs: {}, dofsApplied: {}, dofNote: null, dofNonce: get().dofNonce + 1 });
/** Changing the transformation target always starts from the plain keyframe pose. */
const retarget = (get: Get, target: number) => (target === get().target && !Object.keys(get().dofs).length ? {} : noDofs(get));

export const useApp = create<AppState>()((set, get) => ({
  ...initial(),
  soundOn: storedSound(),
  setMech: (id) => set({ ...initial(getMech(id).id), dofNonce: get().dofNonce + 1 }),
  setTarget: (t) => {
    const target = Math.min(1, Math.max(0, t));
    const dofs = target === get().target ? {} : noDofs(get);
    set(get().pilotOn && target < PILOT_MIN_PROGRESS ? { target, ...pilotOff, ...dofs } : { target, ...dofs });
  },
  setProgress: (p) => set({ progress: p }),
  setDragging: (d) => set({ dragging: d }),
  setMode: (modeId) => {
    const mode = getMech(get().mechId).modes.find((m) => m.id === modeId);
    if (!mode) return;
    const dofs = retarget(get, mode.progress);
    set(get().pilotOn && mode.progress < PILOT_MIN_PROGRESS ? { target: mode.progress, ...pilotOff, ...dofs } : { target: mode.progress, ...dofs });
  },
  setCutaway: (on) => set({ cutaway: on }),
  setSystem: (id, on) => set({ systems: { ...get().systems, [id]: on } }),
  setAllSystems: (on) => set({ systems: allSystems(get().mechId, on) }),
  setShowRig: (on) => set({ showRig: on }),
  setShowJoints: (on) => set({ showJoints: on }),
  select: (id) => set({ selectedId: id, panel: id ? 'info' : get().panel }),
  hover: (id) => {
    if (get().hoveredId !== id) set({ hoveredId: id });
  },
  focusPart: (id) => {
    const s = get();
    const info = getMech(s.mechId).parts.find((p) => p.id === id);
    if (!info) return;
    const internal = info.group === 'internal' && info.system;
    set({
      selectedId: id,
      panel: 'info',
      focus: { id, nonce: (s.focus?.nonce ?? 0) + 1 },
      cutaway: internal ? true : s.cutaway,
      systems: internal ? { ...s.systems, [info.system!]: true } : s.systems,
    });
  },
  resetView: () => set({ viewNonce: get().viewNonce + 1, focus: null }),
  setPanel: (p) => set({ panel: p }),
  setFlight: (patch) => set({ flight: { ...get().flight, ...patch } }),
  setFlightOn: (on) => set(on ? { flightOn: true, target: 0, ...pilotOff, ...noDofs(get) } : { flightOn: false, telemetry: null }),
  resetFlight: () => set({ flight: { ...DEFAULT_FLIGHT, throttle: get().flight.throttle }, flightNonce: get().flightNonce + 1 }),
  setShowForces: (on) => set({ showForces: on }),
  setShowAirflow: (on) => set({ showAirflow: on }),
  setTelemetry: (t) => set({ telemetry: t }),
  setPilotOn: (on) => {
    if (!on) return set(pilotOff);
    const s = get();
    set({ pilotOn: true, flightOn: false, telemetry: null, target: s.target < PILOT_MIN_PROGRESS ? 0.5 : s.target, ...noDofs(get) });
  },
  setPilot: (patch) => set({ pilot: { ...get().pilot, ...patch } }),
  recentrePilot: () => set({ pilotNonce: get().pilotNonce + 1 }),
  setPilotTelemetry: (t) => set({ pilotTelemetry: t }),
  setSoundOn: (on) => {
    try {
      localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    } catch {
      /* private mode: keep it for the session */
    }
    set({ soundOn: on });
  },
  setDof: (id, value) => set({ dofs: { ...get().dofs, [id]: value } }),
  applyDofResult: (id, r) => {
    const note = get().dofNote;
    set({
      dofsApplied: { ...get().dofsApplied, [id]: r.value },
      dofNote: r.blockedBy ? { id, parts: r.blockedBy } : note?.id === id ? null : note,
    });
  },
  resetDofs: () => set(noDofs(get)),
  setDofFocus: (id) => {
    if (get().dofFocus !== id) set({ dofFocus: id });
  },
  reset: () => set({ ...initial(get().mechId), dofNonce: get().dofNonce + 1 }),
}));
