import { describe, it, expect } from 'vitest';
import { searchParts as search, levenshtein } from './search';
import { vf1j } from '../mechs/vf1j';

const searchParts = (q: string, limit?: number) => search(q, vf1j.parts, vf1j.systems, limit);
const ids = (q: string) => searchParts(q).map((r) => r.id);

describe('levenshtein', () => {
  it('counts single-character edits', () => {
    expect(levenshtein('turbine', 'turbine')).toBe(0);
    expect(levenshtein('turbin', 'turbine')).toBe(1);
    expect(levenshtein('canopi', 'canopy')).toBe(1);
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });
});

describe('searchParts', () => {
  it('finds the starboard turbine first', () => {
    expect(ids('starboard turbine')[0]).toBe('turbine-starboard');
  });

  it('finds a hydraulic knee actuator first', () => {
    expect(ids('hydraulic knee actuator')[0]).toMatch(/^knee-actuator-(port|starboard)$/);
  });

  it('understands left/right as port/starboard', () => {
    expect(ids('right turbine')[0]).toBe('turbine-starboard');
    expect(ids('left wing')[0]).toBe('wing-port');
  });

  it('tolerates typos and partial words', () => {
    expect(ids('canopi')[0]).toBe('canopy');
    expect(ids('turbin')).toContain('turbine-port');
    expect(ids('gun p')[0]).toBe('gun-pod');
  });

  it('matches aliases and is case-insensitive', () => {
    expect(ids('NOSE CONE')[0]).toBe('radome');
    expect(ids('reactor')[0]).toMatch(/^reaction-chamber-/);
    expect(ids('FF-2001')).toContain('turbine-port');
  });

  it('leads "aileron" to the VF-1’s actual roll controls (it has no ailerons)', () => {
    const found = ids('aileron');
    expect(found[0]).toMatch(/^(wing-spoiler|wingtip-rcs)-/);
    expect(found.some((id) => id.startsWith('wing-spoiler-'))).toBe(true);
    expect(found.some((id) => id.startsWith('wingtip-rcs-'))).toBe(true);
  });

  it('returns nothing for an empty or nonsense query', () => {
    expect(searchParts('')).toEqual([]);
    expect(searchParts('   ')).toEqual([]);
    expect(searchParts('zzqqxx')).toEqual([]);
  });

  it('limits the number of results', () => {
    expect(searchParts('port', 5).length).toBeLessThanOrEqual(5);
  });
});
