export type SystemId =
  | 'engines'
  | 'nozzles'
  | 'avionics'
  | 'cockpit'
  | 'actuators'
  | 'power'
  | 'frame'
  | 'weapons';

import type { SystemInfo } from '../../core/types';

export const SYSTEMS: (SystemInfo & { id: SystemId })[] = [
  { id: 'engines', label: 'Engines & turbine cores', color: '#ff8a3d', blurb: 'Twin FF-2001 thermonuclear reaction turbines in the legs.' },
  { id: 'nozzles', label: 'Thrust-vectoring nozzles', color: '#e0503a', blurb: '2-D vectoring nozzles that double as the feet.' },
  { id: 'avionics', label: 'Avionics & sensors', color: '#36c47f', blurb: 'Nose radar, avionics racks and the head sensor cluster.' },
  { id: 'cockpit', label: 'Cockpit capsule', color: '#f2b632', blurb: 'Armoured cockpit block with ejection seat and pilot.' },
  { id: 'actuators', label: 'Actuators & hydraulics', color: '#ffd24a', blurb: 'Hydraulic rams and rotary actuators that drive transformation.' },
  { id: 'power', label: 'Main power core', color: '#39d6ff', blurb: 'Energy converter and power conduits fed by the reactors.' },
  { id: 'frame', label: 'Structural frame', color: '#8aa0bf', blurb: 'Keel, swing-bar rails and limb load frames.' },
  { id: 'weapons', label: 'Weapon bay & ammo feed', color: '#c9a34f', blurb: 'GU-11 gun pod internals and the twin head lasers.' },
];

export const SYSTEM_IDS: SystemId[] = SYSTEMS.map((s) => s.id);
