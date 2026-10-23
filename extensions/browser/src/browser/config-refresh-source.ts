import {
  getRuntimeConfig,
  getRuntimeConfigSourceSnapshot,
  type EnclawedConfig,
} from "../config/config.js";

export function loadBrowserConfigForRuntimeRefresh(): EnclawedConfig {
  return getRuntimeConfigSourceSnapshot() ?? getRuntimeConfig();
}
