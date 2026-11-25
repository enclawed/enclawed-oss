import { r as describeImagesWithModel, t as describeImageWithModel } from "./image-runtime-BB1E0LBs.js";
import "./media-understanding-DmQW5_1C.js";
//#region extensions/opencode-go/media-understanding-provider.ts
const opencodeGoMediaUnderstandingProvider = {
	id: "opencode-go",
	capabilities: ["image"],
	defaultModels: { image: "kimi-k2.6" },
	describeImage: describeImageWithModel,
	describeImages: describeImagesWithModel
};
//#endregion
export { opencodeGoMediaUnderstandingProvider as t };
