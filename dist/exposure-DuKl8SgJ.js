//#region src/channels/plugins/exposure.ts
function resolveChannelExposure(meta) {
	return {
		configured: meta.exposure?.configured ?? meta.showConfigured ?? true,
		setup: meta.exposure?.setup ?? meta.showInSetup ?? true,
		docs: meta.exposure?.docs ?? true
	};
}
function isChannelVisibleInConfiguredLists(meta) {
	return resolveChannelExposure(meta).configured;
}
function isChannelVisibleInSetup(meta) {
	return resolveChannelExposure(meta).setup;
}
//#endregion
export { isChannelVisibleInSetup as n, resolveChannelExposure as r, isChannelVisibleInConfiguredLists as t };
