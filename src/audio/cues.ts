/**
 * When sounds fire: pure helpers the soundscape uses to turn the rig's state
 * into audio events.
 */

/** Gait-cycle phases at which a foot strikes the ground (left at ¼, right at ¾). */
const STRIKES = [0.25, 0.75];

/** Footfalls passed going from gait phase `prev` to `next` (phases wrap at 1; the gait only runs forward). */
export function footfalls(prev: number, next: number): number {
  if (next === prev) return 0;
  const end = next < prev ? next + 1 : next;
  let n = 0;
  for (const s of STRIKES) for (const k of [s, s + 1]) if (k > prev && k <= end) n++;
  return n;
}

/**
 * Transformation progress where assemblies lock home with a clunk: Fighter;
 * knees, back block, arms and the gun hand-over; GERWALK; hips at the waist,
 * wings stowed, nose folded, head up; Battroid.
 */
export const LOCK_POINTS = [0, 0.225, 0.35, 0.36, 0.475, 0.5, 0.8, 0.85, 0.94, 0.985, 1];

/** Lock points passed going from `prev` to `next`, in the order they are passed. */
export function locksCrossed(prev: number, next: number): number[] {
  if (next > prev) return LOCK_POINTS.filter((p) => p > prev && p <= next);
  if (next < prev) return LOCK_POINTS.filter((p) => p >= next && p < prev).reverse();
  return [];
}

/** Servo loudness 0 … 1 for a transformation rate (progress per second). */
export function servoLevel(rate: number): number {
  const r = Math.abs(rate);
  if (r < 0.01) return 0;
  return Math.min(1, (r - 0.01) / 0.2);
}
