/** Display metres per second of streak drift per m/s of airspeed (a slowed-down relative wind). */
const DRIFT_PER_MPS = 0.16;
/** Trail length per m/s of airspeed: the streak's motion blur. */
const TRAIL_PER_MPS = 0.011;

/**
 * Relative-wind streaks in the flight lab: how fast they drift past the aircraft and how long
 * their trails are (display metres per second / metres) for a true airspeed in m/s. Both are
 * proportional to airspeed over the whole envelope, so speeding up visibly speeds them up.
 */
export function streakMotion(airspeed: number): { drift: number; length: number } {
  const v = Math.max(0, airspeed);
  return { drift: DRIFT_PER_MPS * v, length: TRAIL_PER_MPS * v };
}
