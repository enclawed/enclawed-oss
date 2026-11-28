// Per-channel least-significant-bit-plane steganalysis.
//
// A clean photograph's LSB plane is close to noise: adjacent pixels agree on
// their least-significant bit about half the time. A hidden *image* stashed in
// that plane carries spatial structure — smooth regions, edges — so adjacent
// LSBs agree far more often. Splitting the image into single color channels
// and scoring each LSB plane therefore surfaces a channel that "suddenly makes
// sense" on its own. This is a detector; the scrambler destroys the plane
// regardless of what this finds.

import type { ImagePayload } from "@enclawed/egress-core";

export type ChannelReport = {
  channel: "R" | "G" | "B";
  /** Fraction of horizontal neighbours whose LSB agrees (~0.5 for noise). */
  lsbAgreement: number;
  /** True when the LSB plane is far more structured than random. */
  suspicious: boolean;
};

/** Score each color channel's LSB plane for hidden structure. */
export function analyzeLsbPlanes(image: ImagePayload, suspicionThreshold = 0.62): ChannelReport[] {
  const { width, height, rgba } = image;
  const channels: Array<{ name: "R" | "G" | "B"; offset: number }> = [
    { name: "R", offset: 0 },
    { name: "G", offset: 1 },
    { name: "B", offset: 2 },
  ];

  return channels.map(({ name, offset }) => {
    let agree = 0;
    let total = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 1; x < width; x++) {
        const here = rgba[(y * width + x) * 4 + offset]! & 1;
        const left = rgba[(y * width + x - 1) * 4 + offset]! & 1;
        if (here === left) {
          agree++;
        }
        total++;
      }
    }
    const lsbAgreement = total === 0 ? 0.5 : agree / total;
    return { channel: name, lsbAgreement, suspicious: lsbAgreement > suspicionThreshold };
  });
}
