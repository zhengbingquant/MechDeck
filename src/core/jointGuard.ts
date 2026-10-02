/**
 * Move a joint from `from` (a clear pose) toward `to` in steps no bigger than `maxStep`, checking
 * each pose with `clear`. At the first blocked step it bisects back to the last clear value, so a
 * big jump can't tunnel through a part that lies between the two ends of the move. The caller must
 * re-apply the returned value (the last `clear` call may have been on a blocked pose).
 */
export function guardedMove(
  from: number,
  to: number,
  maxStep: number,
  clear: (v: number) => boolean,
  iterations = 8,
): { value: number; blocked: boolean } {
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / maxStep));
  let safe = from;
  for (let k = 1; k <= n; k++) {
    const v = k === n ? to : from + ((to - from) * k) / n;
    if (clear(v)) {
      safe = v;
      continue;
    }
    let lo = safe;
    let hi = v;
    for (let i = 0; i < iterations; i++) {
      const mid = (lo + hi) / 2;
      if (clear(mid)) lo = mid;
      else hi = mid;
    }
    return { value: lo, blocked: true };
  }
  return { value: to, blocked: false };
}
