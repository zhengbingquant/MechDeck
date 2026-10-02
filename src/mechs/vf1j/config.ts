/**
 * Single source of truth for naming, official dimensions and livery.
 *
 * Dimensions are the published VF-1 figures (MAHQ / Wikipedia, identical for
 * the VF-1A/D/J). The kinematic tests assert the procedural model against them.
 */

export const SPECS = {
  fighter: { length: 14.23, height: 3.84, span: 14.78, spanSwept: 8.25 },
  battroid: { height: 12.68, width: 7.3, depth: 4.0 },
} as const;

export const PALETTE = {
  white: '#ecebe6',
  offWhite: '#d9dadb',
  lightGrey: '#b9bdc3',
  /** Mid grey of the panels on the dark feet (line art). */
  steel: '#646a73',
  vermilion: '#c42e22',
  black: '#1b1d22',
  gunmetal: '#5d646e',
  /** Blue-grey used for mechanical areas in the official line art. */
  navy: '#27324b',
  canopy: '#3f9e86',
  amber: '#f2b632',
  navRed: '#e0302a',
  navBlue: '#2f7bf5',
  wingtip: '#f5d23a',
} as const;

export type ModeId = 'fighter' | 'gerwalk' | 'battroid';

export const MODES: { id: ModeId; label: string; progress: number }[] = [
  { id: 'fighter', label: 'Fighter', progress: 0 },
  { id: 'gerwalk', label: 'GERWALK', progress: 0.5 },
  { id: 'battroid', label: 'Battroid', progress: 1 },
];
