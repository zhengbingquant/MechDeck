import { useRef, useState } from 'react';
import { useApp } from '../state/store';
import { useMech } from './useMech';

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const FLAPS: [number, string][] = [[0, 'Up'], [0.5, 'Manoeuvre'], [1, 'Landing']];

/** Touch / mouse control stick: drag down to pull (nose up), sideways to roll. Springs back on release. */
function StickPad() {
  const setFlight = useApp((s) => s.setFlight);
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const update = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    setKnob({ x, y });
    setFlight({ roll: x, pitch: y });
  };
  const release = () => {
    setKnob({ x: 0, y: 0 });
    setFlight({ roll: 0, pitch: 0 });
  };
  return (
    <div
      ref={ref}
      className="stick"
      data-testid="flight-stick"
      aria-label="Control stick: drag down to pull up, sideways to roll"
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
      <span className="stick-label up" aria-hidden="true">push</span>
      <span className="stick-label down" aria-hidden="true">pull</span>
    </div>
  );
}

export function FlightToggle() {
  const on = useApp((s) => s.flightOn);
  const setOn = useApp((s) => s.setFlightOn);
  return (
    <label className="switch" data-testid="flight-toggle">
      <input type="checkbox" role="switch" checked={on} onChange={(e) => setOn(e.currentTarget.checked)} />
      <span className="track" aria-hidden="true" />
      <span>Flight lab</span>
    </label>
  );
}

export function FlightControlsPanel() {
  const on = useApp((s) => s.flightOn);
  const flight = useApp((s) => s.flight);
  const setFlight = useApp((s) => s.setFlight);
  const resetFlight = useApp((s) => s.resetFlight);
  const telemetry = useApp((s) => s.telemetry);
  const showForces = useApp((s) => s.showForces);
  const showAirflow = useApp((s) => s.showAirflow);
  const setShowForces = useApp((s) => s.setShowForces);
  const setShowAirflow = useApp((s) => s.setShowAirflow);
  const mech = useMech();
  const af = mech.airframe;
  if (!af) return null;
  if (!on) {
    return (
      <p className="muted small" data-testid="flight-intro">
        Fly the {mech.designation} in Fighter mode with a real flight model: lift, drag, thrust and weight, a fly-by-wire g-command law,
        the Mach-scheduled swing wing, and the VF-1’s own controls (vectored-thrust pitch, spoiler and wingtip-thruster roll, rudders).
      </p>
    );
  }
  const sweepShown = flight.sweep ?? Math.round(telemetry?.sweep ?? af.sweep.min);
  const thr = Math.round(flight.throttle * 100);
  return (
    <div className="flight-controls" data-testid="flight-controls">
      <div className="flight-row">
        <StickPad />
        <div className="flight-col">
          <label className="slider compact throttle">
            <span className="row-label">
              Throttle <b>{thr}%</b>
              {thr > 90 && <em className="ob"> overboost</em>}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={thr}
              data-testid="flight-throttle"
              aria-valuetext={`${thr}%${thr > 90 ? ', overboost' : ''}`}
              onChange={(e) => setFlight({ throttle: Number(e.currentTarget.value) / 100 })}
            />
            <span className="ticks" aria-hidden="true">
              <span style={{ left: '0%' }}>Idle</span>
              <span style={{ left: '90%' }}>MIL · OB</span>
            </span>
          </label>
          <label className="slider compact">
            <span className="row-label">Rudder</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={Math.round(flight.yaw * 100)}
              data-testid="flight-rudder"
              onChange={(e) => setFlight({ yaw: Number(e.currentTarget.value) / 100 })}
              onPointerUp={() => setFlight({ yaw: 0 })}
              onBlur={() => setFlight({ yaw: 0 })}
            />
          </label>
        </div>
      </div>

      <div className="flight-row wrap">
        <div className="segmented small" role="group" aria-label="Flaps">
          {FLAPS.map(([v, label]) => (
            <button key={label} type="button" className="seg" aria-pressed={flight.flaps === v} onClick={() => setFlight({ flaps: v })}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="btn toggle" aria-pressed={flight.airbrake} onClick={() => setFlight({ airbrake: !flight.airbrake })} data-testid="flight-airbrake">
          Airbrake
        </button>
      </div>

      <div className="flight-row wrap">
        <label className="check compact">
          <input type="checkbox" checked={flight.sweep === null} onChange={(e) => setFlight({ sweep: e.currentTarget.checked ? null : sweepShown })} data-testid="flight-sweep-auto" />
          <span className="check-label">Auto sweep</span>
        </label>
        <label className="slider compact grow">
          <span className="row-label">Wing sweep <b>{sweepShown}°</b></span>
          <input
            type="range"
            min={af.sweep.min}
            max={af.sweep.max}
            value={sweepShown}
            disabled={flight.sweep === null}
            data-testid="flight-sweep"
            onChange={(e) => setFlight({ sweep: Number(e.currentTarget.value) })}
          />
        </label>
      </div>

      <div className="flight-row wrap">
        <label className="check compact">
          <input type="checkbox" checked={showForces} onChange={(e) => setShowForces(e.currentTarget.checked)} />
          <span className="check-label">Force vectors</span>
        </label>
        <label className="check compact">
          <input type="checkbox" checked={showAirflow} onChange={(e) => setShowAirflow(e.currentTarget.checked)} />
          <span className="check-label">Airflow</span>
        </label>
        <button type="button" className="btn ghost small" onClick={resetFlight} data-testid="flight-retrim">
          Re-trim
        </button>
      </div>
      <p className="muted small keys">
        Keys: W/S or ↑/↓ pitch · A/D or ←/→ roll · Q/E rudder · Shift/Ctrl throttle · F flaps · B airbrake · V auto sweep · [ ] sweep
      </p>
    </div>
  );
}

export function FlightPanel() {
  const mech = useMech();
  if (!mech.airframe) return null;
  return (
    <section className="card flight" aria-labelledby="flight-h">
      <div className="card-head">
        <h2 id="flight-h">Flight lab</h2>
      </div>
      <FlightToggle />
      <FlightControlsPanel />
    </section>
  );
}
