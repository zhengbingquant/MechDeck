import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { MechRuntime, PilotProfile } from '../core/types';
import { initialDrive, stepDrive, type DriveInput, type DriveParams, type DriveState } from '../core/drive/locomotion';
import { useApp } from '../state/store';
import { stageAnchor } from './anchor';
import { pilotDemand } from './pilotInput';

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const IDLE: DriveInput = { forward: 0, turn: 0, strafe: 0, boost: false, jump: false };

interface Props {
  runtime: MechRuntime;
  profile: PilotProfile;
  /** Carries the whole mech across the floor (parent of the flight gimbal). */
  drive: THREE.Group;
}

/**
 * Pilot mode: drives the GERWALK or Battroid across the hangar floor. Steps the
 * locomotion model at the display rate, layers the mode's gait on the rig, moves
 * the mech (and the stage anchor the light, shadow and camera follow), and
 * publishes a read-out for the HUD. While converting between modes the mech
 * coasts to a stop and the gait is lifted so the transformation plays cleanly.
 */
export function PilotSim({ runtime, profile, drive }: Props) {
  const state = useRef<DriveState>(initialDrive());
  const params = useRef<DriveParams>(profile.modes[0].params);
  const posed = useRef(false);
  const lastTelemetry = useRef(0);

  const place = () => {
    const s = state.current;
    drive.position.set(s.x, s.y, s.z);
    drive.rotation.set(0, s.heading, 0);
    drive.updateMatrixWorld(true);
    // The camera rises part of the way with a jump or a hover (light and shadow use x / z only).
    stageAnchor.position.set(s.x, s.y * 0.6, s.z);
    stageAnchor.heading = s.heading;
  };

  const reset = () => {
    state.current = initialDrive();
    place();
  };

  // Back to the centre of the floor: re-centre, a new mech, or the flight lab (it flies from the origin).
  const nonce = useApp((s) => s.pilotNonce);
  const flightOn = useApp((s) => s.flightOn);
  useEffect(() => {
    reset();
    return () => {
      runtime.setDrive?.(null);
      posed.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, runtime]);
  useEffect(() => {
    if (flightOn) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightOn]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const app = useApp.getState();
    if (!app.pilotOn) {
      if (posed.current) {
        posed.current = false;
        runtime.setDrive?.(null);
      }
      stageAnchor.drive = null;
      stageAnchor.mode = null;
      return;
    }
    // Drivable only when settled in a pilot mode; while converting, coast with the gait lifted.
    const settled = app.progress === app.target && runtime.lastProgress === app.progress;
    const mode = settled ? profile.modes.find((m) => Math.abs(m.progress - app.progress) < 1e-6) : undefined;
    let input = IDLE;
    if (mode) {
      params.current = mode.params;
      const k = pilotDemand();
      input = {
        forward: clamp(app.pilot.forward + k.forward, -1, 1),
        turn: clamp(app.pilot.turn + k.turn, -1, 1),
        strafe: clamp(k.strafe, -1, 1),
        boost: app.pilot.boost || k.boost,
        jump: app.pilot.jump || k.jump,
      };
    }
    state.current = stepDrive(state.current, input, params.current, dt);
    const s = state.current;
    if (mode) {
      runtime.setDrive?.(profile.pose(mode.id, s, mode.params));
      posed.current = true;
    } else if (posed.current) {
      posed.current = false;
      runtime.setDrive?.(null);
    }
    place();
    stageAnchor.drive = s;
    stageAnchor.mode = mode?.id ?? null;

    lastTelemetry.current += dt;
    if (lastTelemetry.current > 1 / 12) {
      lastTelemetry.current = 0;
      const speed = Math.hypot(s.forward, s.side);
      app.setPilotTelemetry({
        mode: mode?.id ?? null,
        speed,
        heading: (((-s.heading * 180) / Math.PI) % 360 + 360) % 360,
        hover: s.hover,
        airborne: !s.grounded,
        running: input.boost && speed > params.current.walkSpeed * 1.05,
        distance: s.distance,
      });
    }
  });

  return null;
}
