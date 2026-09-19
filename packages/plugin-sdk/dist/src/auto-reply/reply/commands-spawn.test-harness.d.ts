import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { MsgContext } from "../templating.js";
export declare function buildCommandTestParams(commandBody: string, cfg: EnclawedConfig, ctxOverrides?: Partial<MsgContext>): import("./commands-types.ts").HandleCommandsParams;
