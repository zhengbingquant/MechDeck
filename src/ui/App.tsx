import { useEffect, useRef, useState } from 'react';
import { Stage } from '../scene/Stage';
import { getMech } from '../mechs';
import { useApp } from '../state/store';
import { flightKeyDown, flightKeyUp, releaseAllKeys } from '../scene/flightInput';
import { pilotKeyDown } from '../scene/pilotInput';
import { debugHandle } from '../scene/debug';
import { sound } from '../audio/engine';
import { AnatomyControls, CutawayToggle, SystemsList } from './AnatomyControls';
import { FlightHud } from './FlightHud';
import { FlightControlsPanel, FlightPanel, FlightToggle } from './FlightPanel';
import { PilotControlsPanel, PilotPanel, PilotToggle } from './PilotPanel';
import { PilotHud } from './PilotHud';
import { JointControls, JointPanel } from './JointPanel';
import { useMediaQuery, WIDE_LAYOUT } from './hooks';
import { Inspector } from './Inspector';
import { Logo } from './Logo';
import { MechSwitcher } from './MechSwitcher';
import { ModeControls } from './ModeControls';
import { SearchBox } from './SearchBox';
import { SpecsCard } from './SpecsCard';
import { useMech } from './useMech';

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox' && (el as HTMLInputElement).type !== 'range';
      const s = useApp.getState();
      // Flight keys (Ctrl is the throttle-down key there, so check before the modifier bail-out).
      // Only text entry blocks them; a focused slider keeps its arrow keys.
      const type = (el as HTMLInputElement).type;
      const textEntry = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(type));
      const sliderArrow = el.tagName === 'INPUT' && type === 'range' && e.key.startsWith('Arrow');
      if (s.flightOn && !textEntry && !sliderArrow && !e.metaKey && !e.altKey && flightKeyDown(e)) return;
      // Pilot keys likewise. Space always jumps there (Enter still presses a focused button).
      if (s.pilotOn && !textEntry && !sliderArrow && !e.metaKey && !e.altKey && !e.ctrlKey && pilotKeyDown(e)) return;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const modes = getMech(s.mechId).modes;
      const n = Number(e.key);
      if (n >= 1 && n <= modes.length) {
        if (!s.flightOn) s.setMode(modes[n - 1].id);
      }
      else if (e.key === 'c' || e.key === 'C') s.setCutaway(!s.cutaway);
      else if (e.key === 'm' || e.key === 'M') s.setSoundOn(!s.soundOn);
      else if (e.key === 'h' || e.key === 'H' || e.key === 'r' || e.key === 'R') s.resetView();
      else if (e.key === 'Escape') s.select(null);
      else if (e.key === '/') {
        e.preventDefault();
        document.getElementById('part-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', flightKeyUp);
    window.addEventListener('blur', releaseAllKeys);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', flightKeyUp);
      window.removeEventListener('blur', releaseAllKeys);
    };
  }, []);
}

/** Audio unlocks on the first gesture (browser autoplay rules) and follows the mute switch. */
function useSound() {
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    sound.setMuted(!useApp.getState().soundOn);
    const unsub = useApp.subscribe((s) => sound.setMuted(!s.soundOn));
    debugHandle().sound = () => ({ state: sound.state, muted: sound.isMuted, ...sound.stats });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      unsub();
    };
  }, []);
}

function SoundToggle() {
  const on = useApp((s) => s.soundOn);
  const setOn = useApp((s) => s.setSoundOn);
  return (
    <button
      type="button"
      className="icon-btn sound"
      aria-pressed={on}
      onClick={() => setOn(!on)}
      aria-label={on ? 'Mute sound effects' : 'Turn sound effects on'}
      title={on ? 'Sound on (M to mute)' : 'Sound off (M to turn on)'}
      data-testid="sound-toggle"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
        {on ? (
          <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        ) : (
          <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}

function StageOverlay() {
  const hoveredId = useApp((s) => s.hoveredId);
  const resetView = useApp((s) => s.resetView);
  const flightOn = useApp((s) => s.flightOn);
  const pilotOn = useApp((s) => s.pilotOn);
  const mech = useMech();
  const [hint, setHint] = useState(true);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = document.querySelector<HTMLElement>('.stage');
    if (!stage) return;
    const move = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      if (labelRef.current) labelRef.current.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 16}px)`;
    };
    const dismiss = () => setHint(false);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerdown', dismiss, { once: true });
    stage.addEventListener('wheel', dismiss, { once: true });
    return () => {
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerdown', dismiss);
      stage.removeEventListener('wheel', dismiss);
    };
  }, []);

  return (
    <>
      <button type="button" className="icon-btn home" onClick={resetView} aria-label="Home view" title="Home view (H): re-centre the camera on the mech" data-testid="home-view">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 11.2 12 4l8.5 7.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 10v9.5h4.5V15h3v4.5H18V10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </button>
      <SoundToggle />
      {flightOn && <FlightHud />}
      {pilotOn && <PilotHud />}
      {hint && !flightOn && !pilotOn && (
        <p className="hint" data-testid="hint">
          Drag to orbit · pinch or scroll to zoom · right-drag or two fingers to pan · tap a part to inspect · Home re-centres
        </p>
      )}
      <div ref={labelRef} className={`hover-label${hoveredId ? ' on' : ''}`} aria-hidden="true">
        {hoveredId ? mech.parts.find((p) => p.id === hoveredId)?.name : ''}
      </div>
    </>
  );
}

function BottomSheet() {
  const panel = useApp((s) => s.panel);
  const setPanel = useApp((s) => s.setPanel);
  const selectedId = useApp((s) => s.selectedId);
  const flightOn = useApp((s) => s.flightOn);
  const mech = useMech();
  const toggle = (p: 'systems' | 'info' | 'flight' | 'pilot' | 'pose') => setPanel(panel === p ? 'none' : p);
  return (
    <section className="sheet" data-testid="panel" aria-label="Controls">
      {/* Transformation is locked in the flight lab: give the stage the room on phones. */}
      {!flightOn && <ModeControls />}
      <div className="sheet-bar">
        <CutawayToggle />
        <div className="tabs" role="tablist" aria-label="Details">
          <button type="button" role="tab" aria-selected={panel === 'systems'} className="tab" onClick={() => toggle('systems')} data-testid="tab-systems">
            Systems
          </button>
          <button type="button" role="tab" aria-selected={panel === 'info'} className="tab" onClick={() => toggle('info')} data-testid="tab-info">
            Info{selectedId ? <span className="dot" aria-label="(part selected)" /> : null}
          </button>
          {mech.airframe && (
            <button type="button" role="tab" aria-selected={panel === 'flight'} className="tab" onClick={() => toggle('flight')} data-testid="tab-flight">
              Fly
            </button>
          )}
          {mech.pilot && (
            <button type="button" role="tab" aria-selected={panel === 'pilot'} className="tab" onClick={() => toggle('pilot')} data-testid="tab-pilot">
              Drive
            </button>
          )}
          {mech.dofs && (
            <button type="button" role="tab" aria-selected={panel === 'pose'} className="tab" onClick={() => toggle('pose')} data-testid="tab-pose">
              Pose
            </button>
          )}
        </div>
      </div>
      {panel !== 'none' && (
        <div className="sheet-body" role="tabpanel">
          {panel === 'systems' ? (
            <SystemsList />
          ) : panel === 'flight' ? (
            <div className="sheet-flight">
              <FlightToggle />
              <FlightControlsPanel />
            </div>
          ) : panel === 'pilot' ? (
            <div className="sheet-flight">
              <PilotToggle />
              <PilotControlsPanel />
            </div>
          ) : panel === 'pose' ? (
            <JointControls />
          ) : (
            <Inspector />
          )}
        </div>
      )}
    </section>
  );
}

export function App() {
  const wide = useMediaQuery(WIDE_LAYOUT);
  const mech = useMech();
  useShortcuts();
  useSound();
  return (
    <div className={`app ${wide ? 'wide' : 'narrow'}`}>
      <header className="topbar">
        <div className="brand">
          <Logo size={34} />
          <h1 className="wordmark">VARIABLE</h1>
        </div>
        <MechSwitcher />
        <SearchBox />
      </header>
      <main className="stage" data-testid="stage" aria-label={`Interactive 3D model of the ${mech.name}`}>
        <Stage />
        <StageOverlay />
      </main>
      {wide ? (
        <aside className="sidebar" data-testid="panel" aria-label="Controls">
          <ModeControls />
          <FlightPanel />
          <PilotPanel />
          <JointPanel />
          <AnatomyControls />
          <Inspector />
          <SpecsCard />
          <p className="footnote muted">{mech.credit}</p>
        </aside>
      ) : (
        <BottomSheet />
      )}
    </div>
  );
}
