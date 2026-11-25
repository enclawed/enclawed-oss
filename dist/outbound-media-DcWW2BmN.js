import { t as loadWebMedia } from "./web-media-5z_GzdX3.js";
import { t as buildOutboundMediaLoadOptions } from "./load-options-DUeaBIoT.js";
import "./web-media-DM45MfbG.js";
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
