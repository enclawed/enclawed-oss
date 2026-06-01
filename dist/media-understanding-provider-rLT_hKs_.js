import { r as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-Vegx5Msw.js";
import "./media-understanding-C6B2Zcfg.js";
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
