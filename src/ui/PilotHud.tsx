import { useApp } from '../state/store';
import { useMech } from './useMech';

const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Pilot-mode read-out, drawn over the corner of the stage like the flight HUD. */
export function PilotHud() {
  const t = useApp((s) => s.pilotTelemetry);
  const mech = useMech();
  if (!t) {
    return (
      <div className="hud" data-testid="pilot-hud">
        <p className="hud-wait">Converting…</p>
      </div>
    );
  }
  const label = t.mode ? (mech.modes.find((m) => m.id === t.mode)?.label ?? t.mode) : null;
  const tags: [string, string][] = [];
  if (!label) tags.push(['CONVERTING', 'info']);
  else tags.push([label.toUpperCase(), 'info']);
  if (t.hover > 0.05) tags.push([t.hover > 0.95 ? 'SKIMMING ON JETS' : 'LIFTING', 'hot']);
  else if (t.airborne) tags.push(['AIRBORNE · VERNIERS', 'hot']);
  else if (t.running) tags.push(['RUN', 'warn']);
  else if (t.speed > 0.2) tags.push(['WALK', 'info']);
  return (
    <div className="hud" data-testid="pilot-hud" aria-live="off">
      <dl className="hud-grid">
        <div><dt>SPD</dt><dd data-testid="pilot-speed">{fmt(t.speed * 3.6)}<small> km/h</small></dd></div>
        <div><dt>HDG</dt><dd>{String(Math.round(t.heading) % 360).padStart(3, '0')}°</dd></div>
        <div><dt>ODO</dt><dd data-testid="pilot-distance">{fmt(t.distance)}<small> m</small></dd></div>
      </dl>
      <p className="hud-warnings">
        {tags.map(([w, kind]) => (
          <span key={w} className={`warn ${kind}`}>{w}</span>
        ))}
      </p>
    </div>
  );
}
