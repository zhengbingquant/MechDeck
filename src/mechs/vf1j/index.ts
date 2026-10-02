import type { MechDefinition } from '../../core/types';
import { VF1J_AIRFRAME } from './airframe';
import { createMecha } from './build';
import { MechaController } from './controller';
import { MODES } from './config';
import { PARTS } from './registry';
import { SYSTEMS } from './systems';
import { drivePose, PILOT_PARAMS, type PilotMode } from './gait';
import { DOF_INFO } from './dofs';

export const vf1j: MechDefinition = {
  id: 'vf1j',
  designation: 'VF-1J',
  name: 'VF-1J',
  subtitle: '',
  blurb:
    'U.N. Spacy variable fighter with twin FF-2001 thermonuclear turbines. Converts between a swing-wing fighter, the GERWALK hover-walker and the Battroid robot.',
  modes: MODES,
  systems: SYSTEMS,
  parts: PARTS,
  specs: [
    { label: 'Fighter length', value: '14.23 m' },
    { label: 'Wingspan', value: '14.78 m (20°) · 8.25 m (72°)' },
    { label: 'Battroid height', value: '12.68 m' },
    { label: 'Mass', value: '13.25 t empty · 18.5 t take-off' },
    { label: 'Engines', value: '2 × FF-2001, 11,500 kgf each' },
    { label: 'Top speed', value: 'Mach 2.71 @ 10,000 m' },
  ],
  credit:
    'Fan-made procedural model. Dimensions follow the published VF-1 specs; the VF-1 design belongs to Studio Nue / Big West.',
  // Measured: the Fighter reaches 8.1 m from its centre (GERWALK 9.2 m; the camera backs off while transforming).
  frameRadius: 8.4,
  airframe: VF1J_AIRFRAME,
  pilot: {
    modes: [
      { id: 'gerwalk', progress: 0.5, params: PILOT_PARAMS.gerwalk },
      { id: 'battroid', progress: 1, params: PILOT_PARAMS.battroid },
    ],
    pose: (modeId, drive, params) => drivePose(modeId as PilotMode, drive, params),
  },
  dofs: DOF_INFO,
  create: () => new MechaController(createMecha()),
};
