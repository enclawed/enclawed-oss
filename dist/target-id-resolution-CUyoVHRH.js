import { r as maybeResolvePluginMessagingTarget } from "./target-normalization-DA4nTuql.js";
//#region src/infra/outbound/target-id-resolution.ts
async function maybeResolveIdLikeTarget(params) {
	const target = await maybeResolvePluginMessagingTarget({
		...params,
		requireIdLike: true
	});
	if (!target) return;
	return target;
}
//#endregion
export { maybeResolveIdLikeTarget as t };
