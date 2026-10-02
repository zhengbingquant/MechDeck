/** International Standard Atmosphere (US Standard Atmosphere 1976) up to 47 km geopotential. */

export const G0 = 9.80665;
const R = 287.053; // J/(kg·K), dry air
const GAMMA = 1.4;
const EARTH_RADIUS = 6_356_766; // m, used for the geometric → geopotential conversion

export interface Atmosphere {
  temperature: number; // K
  pressure: number; // Pa
  density: number; // kg/m³
  speedOfSound: number; // m/s
}

/** Layer bases: [base altitude m, base temperature K, lapse rate K/m, base pressure Pa]. */
const LAYERS: [number, number, number, number][] = [
  [0, 288.15, -0.0065, 101325],
  [11_000, 216.65, 0, 22632.06],
  [20_000, 216.65, 0.001, 5474.889],
  [32_000, 228.65, 0.0028, 868.0187],
];

/** Conditions at a geometric altitude (metres above sea level). */
export function atmosphere(altitude: number): Atmosphere {
  const z = Math.max(0, altitude);
  const h = Math.min(47_000, (EARTH_RADIUS * z) / (EARTH_RADIUS + z));
  let layer = LAYERS[0];
  for (const l of LAYERS) if (h >= l[0]) layer = l;
  const [h0, t0, lapse, p0] = layer;
  const temperature = t0 + lapse * (h - h0);
  const pressure =
    lapse === 0
      ? p0 * Math.exp((-G0 * (h - h0)) / (R * t0))
      : p0 * Math.pow(temperature / t0, -G0 / (R * lapse));
  return {
    temperature,
    pressure,
    density: pressure / (R * temperature),
    speedOfSound: Math.sqrt(GAMMA * R * temperature),
  };
}
