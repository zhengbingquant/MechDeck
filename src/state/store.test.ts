import { describe, it, expect, beforeEach } from 'vitest';
import { useApp, stepProgress, modeLabel } from './store';
import { MECHS, getMech } from '../mechs';

const SYSTEM_IDS = getMech('vf1j').systems.map((s) => s.id);

beforeEach(() => useApp.getState().reset());

describe('stepProgress', () => {
  it('moves toward the target at the given speed without overshooting', () => {
    expect(stepProgress(0, 1, 0.1, 0.5)).toBeCloseTo(0.05);
    expect(stepProgress(0.98, 1, 0.1, 0.5)).toBe(1);
    expect(stepProgress(0.5, 0, 0.1, 0.5)).toBeCloseTo(0.45);
    expect(stepProgress(0.3, 0.3, 0.1, 0.5)).toBe(0.3);
  });
});

describe('modeLabel', () => {
  it('names the three modes and the transitions between them', () => {
    expect(modeLabel(0)).toBe('Fighter');
    expect(modeLabel(0.5)).toBe('GERWALK');
    expect(modeLabel(1)).toBe('Battroid');
    expect(modeLabel(0.25)).toBe('Fighter → GERWALK');
    expect(modeLabel(0.8)).toBe('GERWALK → Battroid');
  });
});

describe('app store', () => {
  it('starts in Fighter mode with the anatomy view off and every system enabled', () => {
    const s = useApp.getState();
    expect(s.target).toBe(0);
    expect(s.cutaway).toBe(false);
    for (const id of SYSTEM_IDS) expect(s.systems[id]).toBe(true);
  });

  it('setMode sets the transformation target', () => {
    useApp.getState().setMode('battroid');
    expect(useApp.getState().target).toBe(1);
    useApp.getState().setMode('gerwalk');
    expect(useApp.getState().target).toBe(0.5);
  });

  it('toggles individual systems independently', () => {
    useApp.getState().setSystem('engines', false);
    const s = useApp.getState().systems;
    expect(s.engines).toBe(false);
    expect(s.power).toBe(true);
    useApp.getState().setAllSystems(false);
    expect(Object.values(useApp.getState().systems).every((v) => !v)).toBe(true);
  });

  it('focusing an internal part selects it and reveals its system in cutaway', () => {
    useApp.getState().setSystem('engines', false);
    useApp.getState().focusPart('turbine-starboard');
    const s = useApp.getState();
    expect(s.selectedId).toBe('turbine-starboard');
    expect(s.cutaway).toBe(true);
    expect(s.systems.engines).toBe(true);
    expect(s.focus?.id).toBe('turbine-starboard');
  });

  it('knows the registered mechs and resets to the defaults when switching mech', () => {
    expect(MECHS.map((m) => m.id)).toContain('vf1j');
    useApp.getState().setCutaway(true);
    useApp.getState().setMech('vf1j');
    expect(useApp.getState().mechId).toBe('vf1j');
    expect(useApp.getState().cutaway).toBe(false);
  });

  it('entering the flight lab returns the craft to Fighter mode', () => {
    useApp.getState().setMode('battroid');
    useApp.getState().setFlightOn(true);
    expect(useApp.getState().flightOn).toBe(true);
    expect(useApp.getState().target).toBe(0);
    useApp.getState().setFlight({ throttle: 1, sweep: 45 });
    expect(useApp.getState().flight.throttle).toBe(1);
    expect(useApp.getState().flight.sweep).toBe(45);
    expect(useApp.getState().flight.pitch).toBe(0);
  });

  it('can re-trim the flight lab and toggles its force and airflow overlays', () => {
    const s = useApp.getState();
    expect(s.showForces).toBe(true);
    expect(s.showAirflow).toBe(true);
    s.setFlight({ throttle: 1, pitch: 0.5, airbrake: true });
    const nonce = useApp.getState().flightNonce;
    useApp.getState().resetFlight();
    expect(useApp.getState().flightNonce).toBe(nonce + 1);
    expect(useApp.getState().flight.pitch).toBe(0);
    expect(useApp.getState().flight.airbrake).toBe(false);
    useApp.getState().setShowForces(false);
    useApp.getState().setShowAirflow(false);
    expect(useApp.getState().showForces).toBe(false);
    expect(useApp.getState().showAirflow).toBe(false);
  });

  it('pilot mode drives GERWALK or Battroid: entering from Fighter converts to GERWALK and leaves the flight lab', () => {
    useApp.getState().setFlightOn(true);
    useApp.getState().setPilotOn(true);
    let s = useApp.getState();
    expect(s.pilotOn).toBe(true);
    expect(s.flightOn).toBe(false);
    expect(s.target).toBe(0.5);
    // Battroid stays Battroid.
    useApp.getState().setPilotOn(false);
    useApp.getState().setMode('battroid');
    useApp.getState().setPilotOn(true);
    expect(useApp.getState().target).toBe(1);
    useApp.getState().setPilot({ forward: 1, turn: -0.5, boost: true });
    s = useApp.getState();
    expect(s.pilot).toEqual({ forward: 1, turn: -0.5, boost: true, jump: false });
    // The flight lab and pilot mode exclude each other.
    useApp.getState().setFlightOn(true);
    s = useApp.getState();
    expect(s.pilotOn).toBe(false);
    expect(s.pilot.forward).toBe(0);
    expect(s.target).toBe(0);
  });

  it('choosing Fighter, or dragging the slider to it, ends pilot mode', () => {
    useApp.getState().setFlightOn(false);
    useApp.getState().setMode('gerwalk');
    useApp.getState().setPilotOn(true);
    useApp.getState().setMode('battroid');
    expect(useApp.getState().pilotOn).toBe(true);
    useApp.getState().setMode('fighter');
    expect(useApp.getState().pilotOn).toBe(false);
    expect(useApp.getState().target).toBe(0);
    useApp.getState().setMode('gerwalk');
    useApp.getState().setPilotOn(true);
    useApp.getState().setTarget(0.2);
    expect(useApp.getState().pilotOn).toBe(false);
  });

  it('focusing an exterior part selects it without forcing cutaway', () => {
    useApp.getState().focusPart('canopy');
    const s = useApp.getState();
    expect(s.selectedId).toBe('canopy');
    expect(s.cutaway).toBe(false);
    const nonce = s.focus!.nonce;
    useApp.getState().focusPart('canopy');
    expect(useApp.getState().focus!.nonce).toBeGreaterThan(nonce);
  });

  it('joint control: keeps requested and applied offsets, and clears them whenever the pose would change mode', () => {
    const st = () => useApp.getState();
    st().setMode('battroid');
    st().setDof('elbowL.bend', -40);
    expect(st().dofs['elbowL.bend']).toBe(-40);
    st().applyDofResult('elbowL.bend', { value: -35, blockedBy: ['forearm-port', 'upper-arm-port'] });
    expect(st().dofsApplied['elbowL.bend']).toBe(-35);
    expect(st().dofNote).toEqual({ id: 'elbowL.bend', parts: ['forearm-port', 'upper-arm-port'] });
    st().applyDofResult('elbowL.bend', { value: -20 });
    expect(st().dofNote).toBeNull();
    const nonce = st().dofNonce;
    st().setMode('gerwalk');
    expect(st().dofs).toEqual({});
    expect(st().dofsApplied).toEqual({});
    expect(st().dofNonce).toBeGreaterThan(nonce);
    st().setDof('kneeL.bend', 10);
    st().setPilotOn(true);
    expect(st().dofs).toEqual({});
    st().setPilotOn(false);
    st().setDof('kneeL.bend', 10);
    st().resetDofs();
    expect(st().dofs).toEqual({});
  });
});
