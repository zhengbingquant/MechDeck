import { useRef, useState } from 'react';
import { useApp } from '../state/store';
import { useMech } from './useMech';

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Touch / mouse drive stick: push up to walk forward, sideways to turn. Springs back on release. */
function DriveStick() {
  const setPilot = useApp((s) => s.setPilot);
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const update = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    setKnob({ x, y });
    setPilot({ forward: -y, turn: x });
  };
  const release = () => {
    setKnob({ x: 0, y: 0 });
    setPilot({ forward: 0, turn: 0 });
  };
  return (
    <div
      ref={ref}
      className="stick"
      data-testid="pilot-stick"
      aria-label="Drive stick: push up to walk forward, sideways to turn"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span className="stick-cross" aria-hidden="true" />
      <span className="stick-knob" aria-hidden="true" style={{ transform: `translate(${knob.x * 38}px, ${knob.y * 38}px)` }} />
      <span className="stick-label up" aria-hidden="true">forward</span>
      <span className="stick-label down" aria-hidden="true">back</span>
    </div>
  );
}

/** A button that is "on" while held (pointer or keyboard). */
function HoldButton({ label, hint, active, onChange, testId }: { label: string; hint: string; active: boolean; onChange: (on: boolean) => void; testId: string }) {
  return (
    <button
      type="button"
      className="btn toggle hold"
      aria-pressed={active}
      data-testid={testId}
      title={hint}
      onPointerDown={(e) => {
        // Keep receiving the release even if the finger slides off the button.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic events have no capturable pointer */
        }
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(true);
        }
      }}
      onKeyUp={() => onChange(false)}
      onBlur={() => onChange(false)}
    >
      {label}
    </button>
  );
}

export function PilotToggle() {
  const on = useApp((s) => s.pilotOn);
  const setOn = useApp((s) => s.setPilotOn);
  return (
    <label className="switch" data-testid="pilot-toggle">
      <input type="checkbox" role="switch" checked={on} onChange={(e) => setOn(e.currentTarget.checked)} />
      <span className="track" aria-hidden="true" />
      <span>Pilot mode</span>
    </label>
  );
}

export function PilotControlsPanel() {
  const on = useApp((s) => s.pilotOn);
  const pilot = useApp((s) => s.pilot);
  const setPilot = useApp((s) => s.setPilot);
  const recentre = useApp((s) => s.recentrePilot);
  const target = useApp((s) => s.target);
  const mech = useMech();
  const profile = mech.pilot;
  if (!profile) return null;
  const labels = profile.modes.map((m) => mech.modes.find((x) => x.id === m.id)?.label ?? m.id).join(' or ');
  if (!on) {
    return (
      <p className="muted small" data-testid="pilot-intro">
        Drive the {mech.designation} across the hangar floor as a {labels}: walk, run and jump on the verniers as a Battroid; walk, or skim on the
        foot jets, as a GERWALK.
      </p>
    );
  }
  const mode = profile.modes.find((m) => Math.abs(m.progress - target) < 1e-6);
  const canJump = !!mode?.params.jump;
  const boostLabel = mode?.params.hover ? 'Skim' : 'Run';
  return (
    <div className="flight-controls" data-testid="pilot-controls">
      <div className="flight-row">
        <DriveStick />
        <div className="flight-col">
          <HoldButton label={boostLabel} hint={`${boostLabel} while held (Shift)`} active={pilot.boost} onChange={(b) => setPilot({ boost: b })} testId="pilot-boost" />
          {canJump && <HoldButton label="Jump" hint="Vernier-assisted jump (Space)" active={pilot.jump} onChange={(j) => setPilot({ jump: j })} testId="pilot-jump" />}
          <button type="button" className="btn ghost small" onClick={recentre} data-testid="pilot-recentre">
            Back to centre
          </button>
        </div>
      </div>
      <p className="muted small keys">
        Keys: W/S or ↑/↓ drive · A/D or ←/→ turn · Q/E sidestep · Shift run / skim · Space jump · 2 GERWALK · 3 Battroid
      </p>
    </div>
  );
}

export function PilotPanel() {
  const mech = useMech();
  if (!mech.pilot) return null;
  return (
    <section className="card flight" aria-labelledby="pilot-h">
      <div className="card-head">
        <h2 id="pilot-h">Pilot mode</h2>
      </div>
      <PilotToggle />
      <PilotControlsPanel />
    </section>
  );
}
