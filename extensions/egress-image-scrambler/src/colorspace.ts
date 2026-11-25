// Color-space conversion and bit-depth requantization.
//
// A covert payload hidden in an image — most commonly in the least-significant
// bits of one color channel — depends on the exact per-channel integer values
// surviving transit.
//
// An honest subtlety: a *pure* RGB <-> CMYK roundtrip is exactly invertible
// (CMYK is an overcomplete reparametrization of RGB), so color-space
// conversion ON ITS OWN destroys nothing. What destroys covert bits is
// *requantization* — snapping each component to a coarser set of levels. The
// value of the CMYK basis is that requantizing there places the quantization
// grid in a four-component space misaligned with any RGB-channel LSB encoding,
// so an attacker who knows the defense cannot pre-compensate in RGB. This
// module therefore provides requantization for both an integer (0-255) channel
// and a unit (0-1) CMYK component.

/** RGB (0-255) -> CMYK (each 0-1). */
export function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const k = 1 - Math.max(rf, gf, bf);
  if (k >= 1) {
    return [0, 0, 0, 1];
  }
  const d = 1 - k;
  return [(1 - rf - k) / d, (1 - gf - k) / d, (1 - bf - k) / d, k];
}

/** CMYK (each 0-1) -> RGB (0-255, rounded). */
export function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const d = 1 - k;
  return [
    Math.round(255 * (1 - c) * d),
    Math.round(255 * (1 - m) * d),
    Math.round(255 * (1 - y) * d),
  ];
}

/**
 * Snap a 0-255 channel value to `levels` evenly spaced levels and back. With
 * `levels` = 64 this clears the low two bits; `levels` >= 256 is a no-op.
 */
export function requantize(value: number, levels: number): number {
  if (levels >= 256 || levels < 2) {
    return value;
  }
  const step = 255 / (levels - 1);
  return Math.round(Math.round(value / step) * step);
}

/** Snap a unit (0-1) component — e.g. a CMYK channel — to `levels` levels. */
export function requantizeUnit(value: number, levels: number): number {
  if (levels < 2) {
    return value;
  }
  return Math.round(value * (levels - 1)) / (levels - 1);
}
