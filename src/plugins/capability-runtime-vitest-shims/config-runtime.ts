import { resolveActiveTalkProviderConfig } from "../../config/talk.js";
import type { EnclawedConfig } from "../../config/types.js";

export { resolveActiveTalkProviderConfig };

export function getRuntimeConfigSnapshot(): EnclawedConfig | null {
  return null;
}
