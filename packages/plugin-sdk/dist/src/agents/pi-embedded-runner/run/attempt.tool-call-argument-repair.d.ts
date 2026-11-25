import type { StreamFn } from "@mariozechner/pi-agent-core";
import { decodeHtmlEntitiesInObject } from "../../../plugin-sdk/provider-stream-shared.js";
export declare function wrapStreamFnDecodeXaiToolCallArguments(baseFn: StreamFn): StreamFn;
export { decodeHtmlEntitiesInObject };
