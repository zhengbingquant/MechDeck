import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { footfalls, locksCrossed, servoLevel } from '../audio/cues';
import { sound } from '../audio/engine';
import { useApp } from '../state/store';
import { stageAnchor } from './anchor';

const MODE_LOCKS = new Set([0, 0.5, 1]);

/**
 * Turns the scene into sound every frame: servo whine and lock clunks while
 * transforming; turbines and jet roar in the flight lab and on the GERWALK's
 * foot jets; footfalls, vernier blasts and landings in pilot mode.
 */
export function Soundscape() {
  const last = useRef({ progress: Number.NaN, phase: 0, grounded: true, landing: 0 });

  useFrame((_, delta) => {
    const dt = Math.max(1e-3, Math.min(delta, 0.05));
    const app = useApp.getState();
    const l = last.current;
    const d = app.pilotOn ? stageAnchor.drive : null;
    const live = app.soundOn && sound.state === 'running';

    // Transformation: servo whine with the conversion rate; a clunk as each assembly locks home.
    const p = app.progress;
    const rate = Number.isNaN(l.progress) ? 0 : (p - l.progress) / dt;
    sound.setServo(live ? servoLevel(rate) : 0, rate);
    if (live && !Number.isNaN(l.progress)) for (const lock of locksCrossed(l.progress, p)) sound.clunk(MODE_LOCKS.has(lock) ? 1.3 : 0.75);
    l.progress = p;

    // Engines.
    if (!live) sound.setEngines(0, 0, 0);
    else if (app.flightOn && app.telemetry) {
      const t = app.telemetry;
      sound.setEngines(t.spool, 0.3 + 0.7 * t.spool, t.afterburner ? 1 : 0);
    } else if (d) {
      const jets = Math.max(d.hover, d.grounded ? 0 : 0.8);
      sound.setEngines(0.35 + 0.45 * jets + 0.2 * Math.min(1, Math.hypot(d.forward, d.side) / 30), jets, 0);
    } else sound.setEngines(0, 0, 0);

    // Pilot mode: footfalls, jump blasts, landings.
    if (d && live) {
      const walking = d.grounded && d.hover < 0.05;
      const steps = walking ? footfalls(l.phase, d.phase) : 0;
      const weight = stageAnchor.mode === 'battroid' ? 0.8 + 0.2 * Math.min(1, Math.abs(d.forward) / 20) : 0.5;
      for (let i = 0; i < steps; i++) sound.footstep(weight);
      if (l.grounded && !d.grounded && d.hover < 0.05) sound.blast();
      if (d.landing > l.landing + 0.3) sound.thump(d.landing);
    }
    if (d) {
      l.phase = d.phase;
      l.grounded = d.grounded;
      l.landing = d.landing;
    }
  });

  return null;
}
