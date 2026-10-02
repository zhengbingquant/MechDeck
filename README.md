<p align="center">
  <img src="public/favicon.svg" width="84" alt="MechDeck logo">
</p>

<h1 align="center">MechDeck</h1>

<p align="center">
  <b>An interactive 3D hangar of transformable mechs, right in your browser.</b><br>
  Transform, fly, pilot and x-ray the VF-1J Valkyrie on a real bone rig.
</p>

<p align="center">
  <a href="https://mechdeck.vercel.app"><img alt="Live demo: mechdeck.vercel.app" src="https://img.shields.io/badge/live_demo-mechdeck.vercel.app-e2402f?style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1f63ff?style=flat-square"></a>
  <img alt="three.js r182" src="https://img.shields.io/badge/three.js-r182-000000?style=flat-square&logo=threedotjs&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-20232a?style=flat-square&logo=react&logoColor=61dafb">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white">
</p>

<p align="center"><b>English</b> · <a href="README.zh-CN.md">简体中文</a></p>

<p align="center">
  <img src="docs/media/transform.gif" width="600" alt="The VF-1J transforming from Fighter to GERWALK to Battroid">
</p>

<p align="center">
  <a href="https://x.com/neo_7749/status/2106042557776146556"><img alt="Watch the demo on X" src="https://img.shields.io/badge/watch_the_demo-on_X-000000?style=flat-square&logo=x&logoColor=white"></a>
  <a href="https://www.bilibili.com/video/BV1K5aQ6qEKq"><img alt="Watch the demo on Bilibili" src="https://img.shields.io/badge/watch_the_demo-on_Bilibili-00a1d6?style=flat-square&logo=bilibili&logoColor=white"></a>
</p>

MechDeck runs entirely in the browser. Spin the **VF-1J Valkyrie** round, transform it
between Fighter, GERWALK and Battroid on a real bone rig, x-ray it to see the engines and
actuators, fly it on a flight model, or walk it across the hangar floor.

**[Try the live demo →](https://mechdeck.vercel.app)** It is a static site with no backend
and no API keys, and it runs on desktop and on touch devices (a WebGL2-capable browser is all
it needs). Built with React, three.js and react-three-fiber. The VF-1J is the first mech in
the hangar; more can be added (see [Adding a mech](#adding-a-mech)).

MechDeck is fan-made and not affiliated with Studio Nue / Big West.

## Gallery

| Fighter | GERWALK | Battroid |
| :---: | :---: | :---: |
| <img src="docs/media/fighter.jpg" width="260" alt="Fighter mode, parked on its landing gear"> | <img src="docs/media/gerwalk.jpg" width="260" alt="GERWALK mode with the GU-11 gun pod"> | <img src="docs/media/battroid.jpg" width="260" alt="Battroid mode"> |
| **Anatomy x-ray** | **Flight lab** | **Pilot mode** |
| <img src="docs/media/anatomy.jpg" width="260" alt="Cutaway view: engines, ducts, actuators and gears"> | <img src="docs/media/flight-lab.jpg" width="260" alt="Flight lab: banking turn with the HUD and force vectors"> | <img src="docs/media/pilot-mode.jpg" width="260" alt="Pilot mode: the GERWALK skimming on its foot jets"> |

Every picture here is a live render of the app, made by `scripts/readme-media.mjs`.

## Features

- **Transform:** Fighter ⇄ GERWALK ⇄ Battroid on a real bone rig, with per-joint
  timing that follows the official transformation sheets. The legs drop at the
  knees, the back block rises into an airbrake and goes over onto the back, and the
  arms slide aft, spread, untwist and swing down to take the GU-11. The collision
  tests keep every rigid body clear of the others at every 1% of the conversion.
- **Line-art accuracy:** proportions are measured from the official VF-1A
  five-view (14.23 m), the Battroid schematic (12.68 m) and the MAHQ VF-1J art:
  - fins canted 22.5° with the measured planform;
  - F-14-style raked 2-D intakes: two variable ramps and a bypass door (scheduled with
    the wing sweep in the flight lab) and the fan face deep at the end of the diffuser;
  - the GU-11 slung lowest;
  - the Fighter parked on its nose and main landing gear;
  - the GERWALK back block lying flat behind the cockpit, as on the kit.
- **Anatomy:** an x-ray cutaway with eight independently toggleable systems:
  - FF-2001 engines with spinning fan, compressor and turbine stages and a glowing
    reaction chamber. One duct runs unbroken from the fan to the compressor, through a
    ball swivel at the hip and a bellows that bends round the knee (visible between
    thigh and shin in GERWALK). Air particles stream through it, faster as the engine
    spools up.
  - 2-D nozzles
  - avionics
  - cockpit
  - hydraulics and joint gear sets
  - power core
  - frame
  - weapons
- **Joints & pivots:** a ring lights up on every hinge (on its real axis), and an
  arrow on every slide, while it moves.
- **Joint control:** pose the GERWALK and the Battroid joint by joint; every joint
  stops at its first contact, so no pose can drive one part through another.
- **Pilot mode:** drive the GERWALK (walk, or skim on the foot jets) or the
  Battroid (walk, run up to 160 km/h, vernier-assisted jumps) across the hangar
  floor. It uses the keyboard or a touch stick, with a chase camera and a HUD.
- **Flight lab:** fly the Fighter on a physics model. It has lift, drag, thrust
  and weight, a fly-by-wire g-command law, a Mach-scheduled swing wing, and the
  VF-1's real control scheme: vectored-thrust pitch, spoiler plus wingtip-thruster
  roll (it has no ailerons or tailplane), rudders, slats, Fowler and two-section
  flaps, and the dorsal airbrake. There is a HUD, force vectors and relative-wind
  streaks that move in proportion to airspeed.
- **Sound:** synthesised live with the Web Audio API (no audio files):
  - transformation servos and lock clunks;
  - turbine whine and jet roar;
  - footfalls, jump blasts and landings.
- **Inspect:** tap any part, or search ("left engine", "aileron", "reactor") to
  fly the camera to it.
- **Engineering checks:** tests keep every body (armour, internals, rams, links) clear of
  every other, keep every part attached to the airframe at every step, and keep every
  ram engaged (never pulled apart or bottomed out) and every link rigid, through the
  transformation, walking, flight and every joint range.

No official artwork, models or audio are included: the geometry is built procedurally
in code, the paint is a texture-free shader and the sound is synthesised.

## Controls

| | |
| --- | --- |
| Look around | drag to orbit · scroll or pinch to zoom · right-drag or two fingers to pan · Home re-centres |
| Pilot mode | W/S or ↑/↓ drive · A/D or ←/→ turn · Q/E sidestep · Shift run or skim · Space jump (a touch stick on phones) |
| Flight lab | W/S or ↑/↓ pitch (pull back for nose up) · A/D or ←/→ roll · Q/E rudder · Shift/Ctrl or =/- throttle · F flaps · B airbrake · V automatic sweep · [ / ] sweep the wings |
| Sound | silent until the first tap or key press · M or the speaker button mutes |

## Run it

```bash
npm install
npm run dev          # local dev server
```

It is developed on Node 24. `npm run build` type-checks and writes a static site to
`dist/`, which any static host can serve (`vercel.json` is included for Vercel).

| Command | What it does |
| --- | --- |
| `npm run dev` | local dev server |
| `npm run build` | type-check + production build |
| `npm run preview` | serve the production build on `http://localhost:4173` |
| `npm test` | unit tests (Vitest): kinematics, collisions, connectivity, rams, flight model, UI state |
| `npm run e2e` | Playwright on desktop 1440×900 and mobile 390×844 (uses the system Chrome) |
| `npm run shots` | screenshots of named views (needs `npm run preview` running) |
| `npm run flightcheck` | flies a short flight-lab sortie and screenshots it (same) |
| `node scripts/livecheck.mjs <url>` | smoke test of a deployed build, on desktop and phone |
| `node scripts/readme-media.mjs` | re-renders the README's GIF and gallery (needs `npm run preview` and ffmpeg) |

## Architecture

```text
src/core/            mech-agnostic machinery
  types.ts           MechDefinition / MechRuntime contracts the app talks to
  builder.ts         puts meshes on bones; outlines, panel lines, part registry bookkeeping
  collisions.ts      triangle-level interpenetration harness (BVH) with declared designed contacts
  connectivity.ts    proves every part stays attached to the airframe
  jointGuard.ts      stops a joint at its first contact
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
e2e/                 Playwright tests
scripts/             screenshot, smoke-test, README-media and accuracy tools
docs/media/          the README's GIF and gallery
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

## Accuracy and sources

Flight model: the published figures below are calibration targets, enforced by tests.

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

Shape: `scripts/score.mjs` and `scripts/compare.mjs` measure the model's silhouette
against the official line art (overlap and overlays at matched scale). The artwork is
copyrighted and is not part of this repository: put your own copies in `shots/ref/`
(git-ignored) and see the `VIEWS` tables in the scripts for the file names they expect.

## Contributing

Issues and pull requests are welcome. Before opening a pull request, run
`npm run build`, `npm test` and `npm run e2e`. The geometry tests are strict on
purpose: nothing may overlap, float or pull apart at any step of the transformation,
so a change to a part usually has to keep the collision, connectivity and ram tests green.

## License and credits

The code is released under the [MIT license](LICENSE), © 2026 Teh Bing Quan.

MechDeck is fan work. Macross, the VF-1 Valkyrie and its designs belong to
Studio Nue / Big West; this project is not affiliated with them, and the MIT license
covers the code and original assets in this repository, not those designs.
