import type { MechMode } from '../core/types';
import { useApp } from '../state/store';
import { useMech } from './useMech';

function currentMode(modes: MechMode[], progress: number) {
  return modes.find((m) => Math.abs(m.progress - progress) < 0.004) ?? null;
}

export function Inspector() {
  const selectedId = useApp((s) => s.selectedId);
  const progress = useApp((s) => s.progress);
  const focusPart = useApp((s) => s.focusPart);
  const select = useApp((s) => s.select);
  const setMode = useApp((s) => s.setMode);
  const mech = useMech();

  const info = selectedId ? mech.parts.find((p) => p.id === selectedId) : null;
  if (!info) {
    return (
      <section className="card inspector empty" aria-labelledby="insp-h" data-testid="inspector">
        <div className="card-head">
          <h2 id="insp-h">Inspector</h2>
        </div>
        <p className="muted">Tap any panel or internal component, or search for a part by name.</p>
      </section>
    );
  }
  const sys = mech.systems.find((s) => s.id === info.system);
  const mode = currentMode(mech.modes, progress);
  const stowed = mode && info.stowedIn?.includes(mode.id);
  const showIn = [...mech.modes].reverse().find((m) => !info.stowedIn?.includes(m.id));

  return (
    <section className="card inspector" aria-labelledby="insp-h" data-testid="inspector">
      <div className="card-head">
        <h2 id="insp-h">Inspector</h2>
        <span className="badge" style={sys ? { borderColor: sys.color, color: sys.color } : undefined}>
          {info.group === 'internal' ? `Internal · ${info.category}` : `Exterior · ${info.category}`}
        </span>
      </div>
      <h3 className="part-name" data-testid="part-name">{info.name}</h3>
      <p className="part-desc">{info.description}</p>
      {stowed && (
        <p className="note">
          Stowed inside the airframe in {mode.label} mode.{' '}
          {showIn && (
            <button type="button" className="link" onClick={() => setMode(showIn.id)}>
              Show in {showIn.label}
            </button>
          )}
        </p>
      )}
      <div className="row-actions">
        <button type="button" className="btn" onClick={() => focusPart(info.id)}>Focus camera</button>
        <button type="button" className="btn ghost" onClick={() => select(null)}>Clear</button>
      </div>
    </section>
  );
}
