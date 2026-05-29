import { transcribeFirstAudio as transcribeFirstAudioImpl } from "@enclawed/plugin-sdk/media-runtime";

type TranscribeFirstAudio = typeof import("@enclawed/plugin-sdk/media-runtime").transcribeFirstAudio;

export async function transcribeFirstAudio(
  ...args: Parameters<TranscribeFirstAudio>
): ReturnType<TranscribeFirstAudio> {
  return await transcribeFirstAudioImpl(...args);
}
