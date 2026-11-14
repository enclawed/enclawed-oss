import { t as loadWebMedia } from "./web-media-CCqPCymR.js";
import { t as buildOutboundMediaLoadOptions } from "./load-options-BBtax1XH.js";
import "./web-media-DdCbuL41.js";
//#region src/plugin-sdk/outbound-media.ts
/** Load outbound media from a remote URL or approved local path using the shared web-media policy. */
async function loadOutboundMediaFromUrl(mediaUrl, options = {}) {
	return await loadWebMedia(mediaUrl, buildOutboundMediaLoadOptions({
		maxBytes: options.maxBytes,
		mediaAccess: options.mediaAccess,
		mediaLocalRoots: options.mediaLocalRoots,
		mediaReadFile: options.mediaReadFile
	}));
}
//#endregion
export { loadOutboundMediaFromUrl as t };
