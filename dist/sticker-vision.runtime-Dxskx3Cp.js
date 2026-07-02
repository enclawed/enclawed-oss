import { f as resolveDefaultModelForAgent } from "./model-selection-CRPDotcW.js";
import { a as modelSupportsVision, n as findModelInCatalog, r as loadModelCatalog } from "./model-catalog-CRDyvMk8.js";
import "./agent-runtime-CQoWHj4A.js";
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
