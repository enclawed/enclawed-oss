import { f as resolveDefaultModelForAgent } from "./model-selection-D0i1_wAd.js";
import { a as modelSupportsVision, n as findModelInCatalog, r as loadModelCatalog } from "./model-catalog-DKUaYqeM.js";
import "./agent-runtime-DMCOTWLn.js";
//#region extensions/telegram/src/sticker-vision.runtime.ts
async function resolveStickerVisionSupportRuntime(params) {
	const catalog = await loadModelCatalog({ config: params.cfg });
	const defaultModel = resolveDefaultModelForAgent({
		cfg: params.cfg,
		agentId: params.agentId
	});
	const entry = findModelInCatalog(catalog, defaultModel.provider, defaultModel.model);
	if (!entry) return false;
	return modelSupportsVision(entry);
}
//#endregion
export { resolveStickerVisionSupportRuntime };
