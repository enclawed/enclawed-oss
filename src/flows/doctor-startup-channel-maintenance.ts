import { runChannelPluginStartupMaintenance } from "../channels/plugins/lifecycle-startup.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";

type DoctorStartupMaintenanceRuntime = {
  error: (message: string) => void;
  log: (message: string) => void;
};

export async function maybeRunDoctorStartupChannelMaintenance(params: {
  cfg: EnclawedConfig;
  env?: NodeJS.ProcessEnv;
  runtime: DoctorStartupMaintenanceRuntime;
  shouldRepair: boolean;
}): Promise<void> {
  if (!params.shouldRepair) {
    return;
  }
  await runChannelPluginStartupMaintenance({
    cfg: params.cfg,
    env: params.env ?? process.env,
    log: {
      info: (message) => params.runtime.log(message),
      warn: (message) => params.runtime.error(message),
    },
    trigger: "doctor-fix",
    logPrefix: "doctor",
  });
}
