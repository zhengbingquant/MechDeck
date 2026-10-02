import { useMemo } from 'react';
import type { DofInfo } from '../core/types';
import { useApp } from '../state/store';
import { useMech } from './useMech';

/** The walking mode the rig is sitting in (joint control only applies once a conversion is done). */
function usePoseMode(): string | null {
  const progress = useApp((s) => s.progress);
  const target = useApp((s) => s.target);
  const pilotOn = useApp((s) => s.pilotOn);
  const flightOn = useApp((s) => s.flightOn);
  const mech = useMech();
  if (pilotOn || flightOn || progress !== target) return null;
  const mode = mech.modes.find((m) => m.progress === progress);
  return mode && mech.dofs?.some((d) => d.modes.includes(mode.id)) ? mode.id : null;
}

function fmt(v: number, unit: string) {
  const r = Math.round(v);
  return `${r > 0 ? '+' : ''}${r}${unit}`;
}

function DofSlider({ d }: { d: DofInfo }) {
  const requested = useApp((s) => s.dofs[d.id]);
  const applied = useApp((s) => s.dofsApplied[d.id]);
  const note = useApp((s) => (s.dofNote?.id === d.id ? s.dofNote : null));
  const setDof = useApp((s) => s.setDof);
  const setFocus = useApp((s) => s.setDofFocus);
  const leave = () => {
    if (useApp.getState().dofFocus === d.id) setFocus(null);
  };
  const parts = useMech().parts;
  // Shown on the slider's own step: the input would otherwise snap an off-step value and report
  // that as a new move (which, after a joint was stopped short, clears the contact note).
  const value = Math.round((applied ?? requested ?? 0) / d.step) * d.step;
  const name = (id: string) => parts.find((p) => p.id === id)?.name ?? id;
  return (
    <div className={`dof${note ? ' blocked' : ''}`}>
      <label className="dof-row">
        <span className="dof-label">{d.label}</span>
        <output className="dof-value" data-testid={`dof-value-${d.id}`}>
          {fmt(value, d.unit)}
        </output>
        <input
          type="range"
          min={d.min}
          max={d.max}
          step={d.step}
          value={value}
          data-testid={`dof-${d.id}`}
          aria-valuetext={`${d.label} ${fmt(value, d.unit)}`}
          onChange={(e) => setDof(d.id, Number(e.currentTarget.value))}
          onFocus={() => setFocus(d.id)}
          onBlur={leave}
          onPointerEnter={() => setFocus(d.id)}
          onPointerDown={() => setFocus(d.id)}
          onPointerLeave={leave}
        />
      </label>
      {note && (
        <p className="dof-note" role="status" data-testid={`dof-note-${d.id}`}>
          {note.parts[0] === 'ground' ? 'Stopped at the ground: it would push into the floor' : `Stopped at contact: ${name(note.parts[0])} meets ${name(note.parts[1])}`}
        </p>
      )}
    </div>
  );
}

/** Sliders for every posable joint in the current mode, grouped by limb. */
export function JointControls() {
  const mech = useMech();
  const mode = usePoseMode();
  const resetDofs = useApp((s) => s.resetDofs);
  const posed = useApp((s) => Object.values(s.dofsApplied).some((v) => v !== 0));
  const groups = useMemo(() => {
    const out = new Map<string, DofInfo[]>();
    for (const d of mech.dofs ?? []) {
      if (!mode || !d.modes.includes(mode)) continue;
      out.set(d.group, [...(out.get(d.group) ?? []), d]);
    }
    return [...out.entries()];
  }, [mech, mode]);
  if (!mech.dofs) return null;
  if (!mode) {
    const labels = mech.modes.filter((m) => mech.dofs!.some((d) => d.modes.includes(m.id))).map((m) => m.label).join(' or ');
    return (
      <p className="muted small" data-testid="joints-intro">
        Settle in {labels} (outside pilot mode) to pose each joint: shoulders, elbows, wrists, hips, knees, ankles, the toe and heel flaps and
        more. Every joint stops at its first contact, so no part can pass through another.
      </p>
    );
  }
  return (
    <div className="joints" data-testid="joint-controls">
      <div className="joints-head">
        <p className="muted small">Offsets from the {mech.modes.find((m) => m.id === mode)?.label} pose. Joints stop at first contact.</p>
        <button type="button" className="btn ghost small" onClick={resetDofs} disabled={!posed} data-testid="joints-reset">
          Reset pose
        </button>
      </div>
      {groups.map(([group, dofs], i) => (
        <details key={group} className="joint-group" open={i === 0}>
          <summary>
            {group} <span className="muted small">{dofs.length}</span>
          </summary>
          {dofs.map((d) => (
            <DofSlider key={d.id} d={d} />
          ))}
        </details>
      ))}
    </div>
  );
}

export function JointPanel() {
  const mech = useMech();
  if (!mech.dofs) return null;
  return (
    <section className="card joints-card" aria-labelledby="joints-h">
      <div className="card-head">
        <h2 id="joints-h">Joint control</h2>
      </div>
      <JointControls />
    </section>
  );
}
