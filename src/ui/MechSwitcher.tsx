import { useEffect, useRef, useState } from 'react';
import { MECHS } from '../mechs';
import { useApp } from '../state/store';
import { useMech } from './useMech';

/** Hangar menu: pick which mech is on the stage. */
export function MechSwitcher() {
  const mech = useMech();
  const setMech = useApp((s) => s.setMech);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="switcher" ref={ref}>
      <button
        type="button"
        className="switcher-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="mech-switcher"
      >
        <span className="switcher-name">{mech.name}</span>
        {mech.subtitle && <span className="switcher-sub muted">{mech.subtitle}</span>}
        <svg viewBox="0 0 12 12" aria-hidden="true" className="chev">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {open && (
        <div className="switcher-menu" role="menu" aria-label="Hangar">
          <p className="menu-head muted">Hangar</p>
          {MECHS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="menuitemradio"
              aria-checked={m.id === mech.id}
              className="menu-item"
              onClick={() => {
                if (m.id !== mech.id) setMech(m.id);
                setOpen(false);
              }}
            >
              <strong>{m.name}</strong>
              <span className="muted">{m.blurb}</span>
            </button>
          ))}
          <div className="menu-item soon" role="menuitem" aria-disabled="true">
            <strong>More mechs</strong>
            <span className="muted">Coming soon to the hangar.</span>
          </div>
        </div>
      )}
    </div>
  );
}
