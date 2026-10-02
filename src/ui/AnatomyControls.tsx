import { useApp } from '../state/store';
import { useMech } from './useMech';

export function CutawayToggle() {
  const cutaway = useApp((s) => s.cutaway);
  const setCutaway = useApp((s) => s.setCutaway);
  return (
    <label className="switch" data-testid="cutaway-toggle">
      <input type="checkbox" role="switch" checked={cutaway} onChange={(e) => setCutaway(e.currentTarget.checked)} />
      <span className="track" aria-hidden="true" />
      <span className="hide-narrow">Anatomy cutaway</span>
      <span className="show-narrow">Cutaway</span>
    </label>
  );
}

export function SystemsList() {
  const cutaway = useApp((s) => s.cutaway);
  const systems = useApp((s) => s.systems);
  const setSystem = useApp((s) => s.setSystem);
  const setAll = useApp((s) => s.setAllSystems);
  const setCutaway = useApp((s) => s.setCutaway);
  const showRig = useApp((s) => s.showRig);
  const setShowRig = useApp((s) => s.setShowRig);
  const showJoints = useApp((s) => s.showJoints);
  const setShowJoints = useApp((s) => s.setShowJoints);
  const { systems: SYSTEMS } = useMech();

  return (
    <div className="systems" data-testid="systems-list">
      <div className="systems-head">
        <span className="muted">{cutaway ? 'Internal systems' : 'Turn on cutaway to see inside'}</span>
        <span className="row-actions">
          <button type="button" className="link" onClick={() => setAll(true)}>All</button>
          <button type="button" className="link" onClick={() => setAll(false)}>None</button>
        </span>
      </div>
      <ul>
        {SYSTEMS.map((s) => (
          <li key={s.id}>
            <label className="check" title={s.blurb}>
              <input
                type="checkbox"
                checked={systems[s.id]}
                data-testid={`system-${s.id}`}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  setSystem(s.id, on);
                  if (on && !cutaway) setCutaway(true);
                }}
              />
              <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
              <span className="check-label">{s.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <label className="check subtle">
        <input type="checkbox" checked={showRig} onChange={(e) => setShowRig(e.currentTarget.checked)} data-testid="rig-toggle" />
        <span className="check-label">Show bone rig</span>
      </label>
      <label className="check subtle" title="Rings light up on hinges, arrows on slides, while they move">
        <input type="checkbox" checked={showJoints} onChange={(e) => setShowJoints(e.currentTarget.checked)} data-testid="joints-toggle" />
        <span className="check-label">Highlight moving joints</span>
      </label>
    </div>
  );
}

export function AnatomyControls() {
  return (
    <section className="card" aria-labelledby="anatomy-h">
      <div className="card-head">
        <h2 id="anatomy-h">Anatomy</h2>
      </div>
      <CutawayToggle />
      <SystemsList />
    </section>
  );
}
