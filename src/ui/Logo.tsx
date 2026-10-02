/** VARIABLE mark: a split, blade-cut "V" — two wings converging on a point, with a vermilion afterburner notch. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="VARIABLE">
      <defs>
        <linearGradient id="v-left" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#8fe9ff" />
          <stop offset="1" stopColor="#1f63ff" />
        </linearGradient>
        <linearGradient id="v-right" x1="1" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#8aa0c2" />
        </linearGradient>
      </defs>
      {/* left wing: thick blade with a stepped leading edge */}
      <path d="M2 10 H18 L33 46 L29.5 56 Z" fill="url(#v-left)" />
      <path d="M2 10 H9 L11.5 16 H4.5 Z" fill="#dff8ff" opacity="0.85" />
      {/* right wing: thinner blade split from the left by a hairline gap */}
      <path d="M62 10 H49 L35.2 44.5 L31.8 53 Z" fill="url(#v-right)" />
      {/* speed slash through the right wing */}
      <path d="M44 22 H57 L55.4 26 H42.4 Z" fill="#0b1426" opacity="0.75" />
      {/* vermilion notch */}
      <path d="M24 10 H40 L32 27 Z" fill="#e2402f" />
      <path d="M28.5 10 H35.5 L32 17.5 Z" fill="#ff9a7a" />
    </svg>
  );
}
