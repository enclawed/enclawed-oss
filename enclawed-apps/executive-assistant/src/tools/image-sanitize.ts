// Make an inbound image safe to look at.
//
// A screenshot of a stack trace is a legitimate and common thing to mail
// a support address, so images have to be usable. But an image is a far
// richer carrier than text: a payload can ride in EXIF/XMP/ICC metadata,
// in ancillary PNG chunks, in the low-order bits of the pixels, or in
// trailing bytes after the image data. None of that is visible to the
// operator looking at the picture.
//
// The defence is not detection -- you cannot reliably detect a good LSB
// embedding -- it is destruction. Decode to raw pixels, throw away
// everything that is not a pixel, perturb the low bit of every channel,
// and re-encode. Whatever was hidden in the discarded containers or in
// the low bits does not survive; what the operator can actually see is
// preserved.

import sharp from "sharp";

export type SanitizedImage = {
  bytes: Buffer;
  contentType: "image/png";
  width: number;
  height: number;
  /** Bytes dropped between the original container and the clean re-encode. */
  droppedBytes: number;
};

/** Formats worth accepting from a stranger. Anything else is refused, not guessed at. */
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

export function isSanitizableImage(contentType: string): boolean {
  return ACCEPTED.has(contentType.toLowerCase().split(";")[0].trim());
}

/**
 * Cap on decoded dimensions. A "decompression bomb" is a small file that
 * expands to gigapixels; sharp is told the limit up front rather than
 * discovering it in memory.
 */
const MAX_DIMENSION = 4096;

/**
 * JPEG quality for the scrambling pass, chosen by measurement rather
 * than taste. Sweeping it against a 1px-stroke test pattern -- harsher
 * than real text, which is thicker -- gave:
 *
 *     q   mean |delta|   max   stroke vs background
 *     15     4.40        19      51 vs 227   <- smearing, text going
 *     25     2.55        13       4 vs 252   <- still crisp
 *     35     2.12        10       2 vs 253
 *     62     1.22         7       2 vs 254
 *
 * 25 roughly doubles the pixel disruption of 62 at no legibility cost;
 * below about 20 the ringing starts eating thin strokes, which is the
 * one thing this app must not do to a screenshot of a stack trace.
 */
const JPEG_SCRAMBLE_QUALITY = Number(process.env.ENCLAWED_IMAGE_SCRAMBLE_QUALITY) || 25;

export async function sanitizeImage(input: {
  bytes: Buffer;
  contentType: string;
}): Promise<SanitizedImage> {
  if (!isSanitizableImage(input.contentType)) {
    throw new Error(`unsupported image type: ${input.contentType}`);
  }

  // failOn:"none" so a merely non-conforming file is still processed --
  // a truncated screenshot is a nuisance, not an attack, and refusing it
  // would make the assistant less useful for the case this exists for.
  const pipeline = sharp(input.bytes, { failOn: "none", limitInputPixels: MAX_DIMENSION ** 2 });
  const meta = await pipeline.metadata();

  // Decode to raw RGB. This is the step that discards EXIF, XMP, ICC,
  // ancillary chunks, multi-frame payloads and any trailing bytes: none
  // of them survive a trip through a pixel buffer.
  const { data, info } = await pipeline
    .rotate() // apply EXIF orientation BEFORE the metadata is dropped
    .resize({
      width: Math.min(meta.width ?? MAX_DIMENSION, MAX_DIMENSION),
      height: Math.min(meta.height ?? MAX_DIMENSION, MAX_DIMENSION),
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Perturb the low bits. This alone kills a single-LSB embedding, but
  // it is the weakest of the three steps and does nothing to anything
  // hidden in the frequency domain.
  for (let i = 0; i < data.length; i += 1) {
    if (Math.random() < 0.5) {
      data[i] ^= 1;
    }
    if (Math.random() < 0.25) {
      data[i] ^= 2;
    }
  }

  // The step that actually does the work: a deliberately lossy JPEG
  // round-trip. Bit-flipping only touches the spatial low bits, so an
  // embedding in the DCT coefficients, or spread across several bits
  // per channel, walks straight through it. Quantising to JPEG at this
  // quality rewrites every 8x8 block through a lossy transform and
  // discards the high-frequency detail such an embedding lives in.
  // Chroma subsampling (4:2:0, sharp's default here) throws away three
  // quarters of the colour information as well.
  //
  // The quality is a trade: this app exists partly to read screenshots
  // of stack traces, and JPEG ringing around small text is what makes
  // one unreadable. 62 is chosen to be destructive while leaving
  // monospaced text legible; the tests measure both sides of that.
  const scrambled = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .jpeg({ quality: JPEG_SCRAMBLE_QUALITY, chromaSubsampling: "4:2:0", mozjpeg: true })
    .toBuffer();

  // Land on PNG so downstream never has to care about JPEG artefacts
  // being re-compressed again.
  const bytes = await sharp(scrambled).png({ compressionLevel: 9 }).toBuffer();

  return {
    bytes,
    contentType: "image/png",
    width: info.width,
    height: info.height,
    droppedBytes: Math.max(0, input.bytes.byteLength - bytes.byteLength),
  };
}
