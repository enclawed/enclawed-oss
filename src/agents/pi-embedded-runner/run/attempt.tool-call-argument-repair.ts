import type { StreamFn } from "@mariozechner/pi-agent-core";
import {
  createHtmlEntityToolCallArgumentDecodingWrapper,
  decodeHtmlEntitiesInObject,
} from "../../../plugin-sdk/provider-stream-shared.js";

export function wrapStreamFnDecodeXaiToolCallArguments(baseFn: StreamFn): StreamFn {
  return createHtmlEntityToolCallArgumentDecodingWrapper(baseFn);
}

export { decodeHtmlEntitiesInObject };
