import { FORCE_COLORS, type ForceKey } from '../scene/FlightSim';
import { useApp } from '../state/store';

const KT = 1 / 0.514444;
const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Small attitude indicator: sky / ground split rotated by bank and shifted by pitch. */
function Attitude({ pitch, bank }: { pitch: number; bank: number }) {
  const shift = Math.max(-28, Math.min(28, pitch * 0.9));
  return (
    <svg className="adi" viewBox="-32 -32 64 64" aria-hidden="true">
      <defs>
        <clipPath id="adi-clip">
          <circle r="30" />
        </clipPath>
      </defs>
      <g clipPath="url(#adi-clip)">
        <g transform={`rotate(${-bank}) translate(0 ${shift})`}>
          <rect x="-80" y="-80" width="160" height="80" fill="#2f6fb3" />
          <rect x="-80" y="0" width="160" height="80" fill="#6b4a2e" />
          <line x1="-80" y1="0" x2="80" y2="0" stroke="#fff" strokeWidth="1.2" />
          {[-20, -10, 10, 20].map((p) => (
            <line key={p} x1={-8} x2={8} y1={-p * 0.9} y2={-p * 0.9} stroke="#fff" strokeWidth="0.7" opacity="0.8" />
          ))}
        </g>
      </g>
      <path d="M-14 0 H-5 L0 4 L5 0 H14" fill="none" stroke="#ffd166" strokeWidth="2" />
      <circle r="30" fill="none" stroke="#9fb3d3" strokeWidth="1.2" />
    </svg>
  );
}

/** Heads-up read-out for the flight lab, drawn over the corner of the stage. */
export function FlightHud() {
  const t = useApp((s) => s.telemetry);
  const flight = useApp((s) => s.flight);
  const showForces = useApp((s) => s.showForces);
  if (!t) {
    return (
      <div className="hud" data-testid="flight-hud">
        <p className="hud-wait">Converting to Fighter mode…</p>
      </div>
    );
  }
  const warnings: [string, string][] = [];
  if (t.stall) warnings.push(['STALL', 'danger']);
  if (t.altitude < 300 && t.vs < -20) warnings.push(['PULL UP', 'danger']);
  if (t.gLoad > 6.8) warnings.push(['G LIMIT', 'warn']);
  if (t.afterburner) warnings.push(['OVERBOOST', 'hot']);
  if (t.mach >= 1) warnings.push(['SUPERSONIC', 'info']);
  if (t.sweep > 57) warnings.push(['SPOILERS LOCKED · RCS ROLL', 'info']);
  if (flight.airbrake) warnings.push(['AIRBRAKE', 'info']);
  if (flight.flaps > 0 && t.eas > 125) warnings.push(['FLAP BLOWBACK', 'warn']);

  const kN = (n: number) => `${fmt(n / 1000)} kN`;
  const forces: [ForceKey, string, number][] = [
    ['lift', 'Lift', t.forces.lift],
    ['weight', 'Weight', t.forces.weight],
    ['thrust', 'Thrust', t.forces.thrust],
    ['drag', 'Drag', t.forces.drag],
  ];
  return (
    <div className="hud" data-testid="flight-hud" aria-live="off">
      <div className="hud-top">
        <Attitude pitch={t.pitch} bank={t.bank} />
        <dl className="hud-grid">
          <div><dt>SPD</dt><dd data-testid="hud-speed">{fmt(t.airspeed * KT)}<small> kt</small></dd></div>
          <div><dt>M</dt><dd>{fmt(t.mach, 2)}</dd></div>
          <div><dt>ALT</dt><dd>{fmt(t.altitude)}<small> m</small></dd></div>
          <div><dt>V/S</dt><dd>{t.vs >= 0 ? '+' : ''}{fmt(t.vs)}<small> m/s</small></dd></div>
          <div><dt>AoA</dt><dd>{fmt(t.aoa, 1)}°</dd></div>
          <div><dt>G</dt><dd>{fmt(t.gLoad, 1)}</dd></div>
          <div><dt>HDG</dt><dd>{String(Math.round(t.heading) % 360).padStart(3, '0')}°</dd></div>
          <div><dt>SWP</dt><dd>{fmt(t.sweep)}°<small>{flight.sweep === null ? ' auto' : ' man'}</small></dd></div>
          <div><dt>THR</dt><dd>{fmt(t.spool * 100)}<small>%</small></dd></div>
        </dl>
      </div>
      {showForces && (
        <ul className="hud-forces" aria-label="Forces">
          {forces.map(([k, label, n]) => (
            <li key={k}>
              <span className="swatch" style={{ background: FORCE_COLORS[k] }} aria-hidden="true" />
              {label} <b>{kN(n)}</b>
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <p className="hud-warnings">
          {warnings.map(([w, kind]) => (
            <span key={w} className={`warn ${kind}`}>{w}</span>
          ))}
        </p>
      )}
    </div>
  );
}
