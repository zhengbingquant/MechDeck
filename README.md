# MechDeck

An interactive 3D hangar of transformable mechs, built with React,
three.js and react-three-fiber. It is a static site with no API keys, and it
runs on desktop and on touch devices.

The first mech is the **VF-1J Valkyrie** (Hikaru Ichijyo's Vermilion 1). It is
a fan-made procedural model; the VF-1 design belongs to Studio Nue / Big West.

**Live:** https://variable-liard.vercel.app

- **Transform:** Fighter ⇄ GERWALK ⇄ Battroid on a real bone rig, with per-joint
  timing that follows the official transformation sheets. The legs drop at the
  knees, the back block rises into an airbrake, and the arms slide aft, spread,
  untwist and swing down to take the GU-11. The collision tests keep every rigid
  body clear of the others at every 1% of the conversion.
- **Line-art accuracy:** proportions are measured from the official VF-1A
  five-view (14.23 m), the Battroid schematic (12.68 m) and the MAHQ VF-1J art:
  - fins canted 22.5° with the measured planform;
  - F-14-style raked 2-D intakes: two variable ramps and a bypass door (scheduled with
    the wing sweep in the flight lab) and the fan face deep at the end of the diffuser;
  - the GU-11 slung lowest;
  - the Fighter parked on its nose and main landing gear.
- **Pilot mode:** drive the GERWALK (walk, or skim on the foot jets) or the
  Battroid (walk, run up to 160 km/h, vernier-assisted jumps) across the hangar
  floor. It uses the keyboard or a touch stick, with a chase camera and a HUD.
- **Sound:** synthesised live with the Web Audio API (no audio files):
  - transformation servos and lock clunks;
  - turbine whine and jet roar;
  - footfalls, jump blasts and landings.

  Sound is silent until the first tap or key press; mute with the speaker button or M.
- **Anatomy:** an x-ray cutaway with eight independently toggleable systems:
  - FF-2001 engines with spinning fan, compressor and turbine stages and a glowing reaction chamber.
    One duct runs unbroken from the fan to the compressor, through a ball swivel at the hip and a
    bellows that bends round the knee (visible between thigh and shin in GERWALK). Air particles stream through it, faster as the engine
    spools up.
  - 2-D nozzles
  - avionics
  - cockpit
  - hydraulics and joint gear sets
  - power core
  - frame
  - weapons
- **Engineering checks:** tests keep every body (armour, internals, rams, links) clear of
  every other, keep every part attached to the airframe at every step, and keep every
  ram engaged (never pulled apart or bottomed out) and every link rigid, through the
  transformation, walking, flight and every joint range.
- **Joints & pivots:** a ring lights up on every hinge (on its real axis), and an
  arrow on every slide, while it moves.
- **Flight lab:** fly the Fighter on a physics model. It has lift, drag, thrust
  and weight, a fly-by-wire g-command law, a Mach-scheduled swing wing, and the
  VF-1's real control scheme: vectored-thrust pitch, spoiler plus wingtip-thruster
  roll (it has no ailerons or tailplane), rudders, slats, Fowler and two-section
  flaps, and the dorsal airbrake. There is a HUD, force vectors and relative-wind
  streaks that move in proportion to airspeed.
- **Inspect:** tap any part, or search ("left engine", "aileron", "reactor") to
  fly the camera to it.

## Commands

```bash
npm install
npm run dev          # local dev server
npm run build        # type-check + production build (dist/ is static-deployable)
npm test             # unit tests (Vitest): kinematics, collisions, flight model, UI state
npm run e2e          # Playwright on desktop 1440×900 and mobile 390×844 (uses the system Chrome)
npm run shots        # screenshots of named views      (needs `npm run preview` running)
npm run flightcheck  # flies a short flight-lab sortie and screenshots it (same)
```

## Architecture

```
src/core/            mech-agnostic machinery
  types.ts           MechDefinition / MechRuntime contracts the app talks to
  builder.ts         puts meshes on bones; outlines, panel lines, part registry bookkeeping
  collisions.ts      triangle-level interpenetration harness (BVH) with declared designed contacts
  jointOverlay.ts    glowing hinge rings / slide arrows while joints move
  flight/            ISA atmosphere + point-mass flight model with a fly-by-wire law
  drive/             ground locomotion for pilot mode (walk / run / jump / hover-skim)
  geometry/          lofts, airfoil (NACA) wing slices, gears, bladed rotor stages, …
  materials/         texture-free paint variation shader
src/mechs/
  index.ts           the hangar registry (MECHS)
  vf1j/              everything VF-1J: rig, poses, parts, control surfaces, airframe, tests
src/scene/           canvas, camera rig, flight sim, pilot mode, soundscape, input
src/audio/           Web Audio synthesiser and sound cues
src/ui/              app shell, panels, HUD, search
src/state/store.ts   zustand store shared by the scene and the UI
```

### Adding a mech

1. Create `src/mechs/<id>/` and export a `MechDefinition` (see `src/core/types.ts`)
   with these fields:
   - identity, blurb and credit
   - `modes` (named points on the 0…1 transformation timeline)
   - `systems` and `parts` (they drive the anatomy list, the inspector and search)
   - `specs`
   - `frameRadius`
   - an optional `airframe` (this enables the flight lab)
   - `create()`, which returns a `MechRuntime`
2. Build the runtime the way `vf1j/` does: bones from a rig table, parts placed
   with the core `Builder`, and a controller implementing `MechRuntime`.
3. Add it to `MECHS` in `src/mechs/index.ts`. The hangar menu, store, search,
   camera and panels pick it up from there.
4. Copy the VF-1J test pattern: official dimensions per mode, no jumps, no
   sinking, and zero collisions across the timeline. For flyers, also calibrate
   the airframe against the published performance.

## Flight model notes

Published figures, used as calibration targets and enforced by tests:
- 18.5 t take-off mass
- 2 × 11,500 kgf thrust (23,000 kgf in overboost)
- Mach 2.71 at 10,000 m and Mach 3.87 at 30,000+ m
- +7 g
- 20°–72° wing sweep

Sources: Macross Compendium and MAHQ.

Estimated values:
- wing area (the F-14's scaled by span²)
- the aerodynamic coefficients
- the thrust lapse, which is calibrated so the model reproduces both published top speeds

The flap/sweep interlock, the 250 kt flap blow-back and the 57° spoiler lockout
are modelled on F-14 practice (the values are approximate). They do not come
from VF-1 sources.

## Credits

Fan work by Teh Bing Quan. Macross, the VF-1 Valkyrie and its designs belong to
Studio Nue / Big West; this project is not affiliated with them.
