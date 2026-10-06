import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { MsgContext } from "../templating.js";
import type { HandleCommandsParams } from "./commands-types.js";
export declare function buildCommandTestParams(commandBody: string, cfg: EnclawedConfig, ctxOverrides?: Partial<MsgContext>, options?: {
    workspaceDir?: string;
}): HandleCommandsParams;
