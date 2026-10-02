/** MechDeck mark: a blade-cut "M" — two halves split by a hairline gap, with a vermilion afterburner notch between the strokes. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="MechDeck">
      <defs>
        <linearGradient id="m-left" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#8fe9ff" />
          <stop offset="1" stopColor="#1f63ff" />
        </linearGradient>
        <linearGradient id="m-right" x1="1" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#8aa0c2" />
        </linearGradient>
      </defs>
      {/* left half: pillar and the stroke running down to the centre */}
      <path d="M3 56 V10 H14 L31.3 38.3 V56 L14 27.7 V56 Z" fill="url(#m-left)" />
      <path d="M3 10 H9.5 L11.5 15.5 H3 Z" fill="#dff8ff" opacity="0.85" />
      {/* right half: its mirror, split from the left by the hairline gap */}
      <path d="M61 56 V10 H50 L32.7 38.3 V56 L50 27.7 V56 Z" fill="url(#m-right)" />
      {/* vermilion notch */}
      <path d="M17 10 H47 L32 35 Z" fill="#e2402f" />
      <path d="M27 10 H37 L32 19 Z" fill="#ff9a7a" />
    </svg>
  );
}
