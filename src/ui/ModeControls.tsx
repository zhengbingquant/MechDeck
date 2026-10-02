import { modeLabel, useApp } from '../state/store';
import { sound } from '../audio/engine';
import { useMech } from './useMech';

export function ModeControls() {
  const target = useApp((s) => s.target);
  const progress = useApp((s) => s.progress);
  const dragging = useApp((s) => s.dragging);
  const setMode = useApp((s) => s.setMode);
  const setTarget = useApp((s) => s.setTarget);
  const setDragging = useApp((s) => s.setDragging);
  const { id: mechId, modes } = useMech();
  const flightOn = useApp((s) => s.flightOn);

  const shown = dragging ? target : progress;
  const pct = Math.round(shown * 100);
  const label = modeLabel(progress, mechId);
  const moving = progress !== target;

  return (
    <section className="card modes" aria-labelledby="modes-h">
      <div className="card-head">
        <h2 id="modes-h">Transformation</h2>
        <span className="status" aria-live="polite" data-testid="mode-status">
          {label}
          {moving ? ` · ${pct}%` : ''}
        </span>
      </div>
      <div className="segmented" role="group" aria-label="Mode" style={{ gridTemplateColumns: `repeat(${modes.length}, 1fr)` }}>
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            className="seg"
            aria-pressed={target === m.progress}
            data-testid={`mode-${m.id}`}
            disabled={flightOn}
            onClick={() => {
              sound.tick();
              setMode(m.id);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <label className="slider">
        <span className="visually-hidden">Transformation progress</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          data-testid="mode-slider"
          disabled={flightOn}
          aria-valuetext={`${pct}% · ${modeLabel(shown, mechId)}`}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => setDragging(false)}
          onBlur={() => setDragging(false)}
          onChange={(e) => setTarget(Number(e.currentTarget.value) / 100)}
        />
        <span className="ticks" aria-hidden="true">
          {modes.map((m) => (
            <span key={m.id} style={{ left: `${m.progress * 100}%` }}>
              {m.label}
            </span>
          ))}
        </span>
      </label>
      {flightOn && <p className="muted small">Leave the flight lab to transform.</p>}
    </section>
  );
}
