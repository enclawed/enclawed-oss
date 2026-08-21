import { type Api, type Model } from "@mariozechner/pi-ai";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export declare function prepareModelForSimpleCompletion<TApi extends Api>(params: {
    model: Model<TApi>;
    cfg?: EnclawedConfig;
}): Model<Api>;
