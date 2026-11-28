// Media payloads and the media-scrambler registry.
//
// The text pipeline (EgressStage) carries a string; it cannot carry binary
// media. Image and audio covert-channel defenses therefore operate on decoded
// media buffers through a parallel abstraction. A media scrambler registers
// here; a media-egress chokepoint drains this registry through
// `mediateMediaBatch` (see `media-egress.ts`) exactly as the mediator drains
// the text-stage registry. In the gateway that chokepoint is the egress
// mediator's `media_sending` handler, which covers outbound attachments.

/** A decoded raster image: RGBA, 8 bits per channel, row-major. */
export type ImagePayload = {
  width: number;
  height: number;
  /** Length width*height*4. */
  rgba: Uint8ClampedArray;
  /**
   * Opaque, host-defined exemption evidence. The open core never reads it; a
   * host-installed media-exemption check (see `media-exemption.ts`) may.
   */
  exemption?: unknown;
};

/** Decoded mono PCM audio with samples in [-1, 1]. */
export type AudioPayload = {
  sampleRate: number;
  samples: Float32Array;
  /**
   * Opaque, host-defined exemption evidence. The open core never reads it; a
   * host-installed media-exemption check (see `media-exemption.ts`) may.
   */
  exemption?: unknown;
};

export type MediaScrambler =
  | { kind: "image"; id: string; scramble: (image: ImagePayload) => ImagePayload }
  | { kind: "audio"; id: string; scramble: (audio: AudioPayload) => AudioPayload };

export type MediaKind = MediaScrambler["kind"];

type MediaRegistryState = { scramblers: Map<string, MediaScrambler> };

const MEDIA_KEY = Symbol.for("enclawed.egress-core.media-registry");

function getState(): MediaRegistryState {
  const globals = globalThis as unknown as Record<symbol, MediaRegistryState | undefined>;
  let state = globals[MEDIA_KEY];
  if (!state) {
    state = { scramblers: new Map() };
    globals[MEDIA_KEY] = state;
  }
  return state;
}

/** Register a media scrambler. Returns an unregister function. */
export function registerMediaScrambler(scrambler: MediaScrambler): () => void {
  getState().scramblers.set(scrambler.id, scrambler);
  return () => {
    const { scramblers } = getState();
    if (scramblers.get(scrambler.id) === scrambler) {
      scramblers.delete(scrambler.id);
    }
  };
}

/** All registered media scramblers, optionally filtered by media kind. */
export function getMediaScramblers(kind?: MediaKind): readonly MediaScrambler[] {
  const all = [...getState().scramblers.values()];
  return kind ? all.filter((s) => s.kind === kind) : all;
}

/** Test-only: clear the media registry. */
export function resetMediaRegistry(): void {
  getState().scramblers.clear();
}
