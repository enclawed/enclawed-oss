import { r as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-Dm7T02mY.js";
import "./media-understanding-Bv0ljZMI.js";
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
