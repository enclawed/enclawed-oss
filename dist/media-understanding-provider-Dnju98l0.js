import { r as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-Btc9P6hl.js";
import "./media-understanding-BEWZG7O9.js";
//#region extensions/openrouter/media-understanding-provider.ts
const openrouterMediaUnderstandingProvider = {
	id: "openrouter",
	capabilities: ["image"],
	defaultModels: { image: "auto" },
	describeImage: describeImageWithModel,
	describeImages: describeImagesWithModel
};
//#endregion
export { openrouterMediaUnderstandingProvider as t };
