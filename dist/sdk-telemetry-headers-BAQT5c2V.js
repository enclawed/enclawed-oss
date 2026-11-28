//#region extensions/anthropic-vertex/sdk-telemetry-headers.ts
/**
* Default headers that remove provider-SDK telemetry from every request this
* plugin's Stainless SDK client sends. The client adds `X-Stainless-*`
* headers (OS, CPU architecture, runtime and runtime version, SDK language
* and package version, retry count, timeout) and a `User-Agent` carrying the
* SDK version; a `null` default header removes a header in Stainless SDKs.
* None of them is needed for a request to succeed.
*/
const SDK_TELEMETRY_DEFAULT_HEADERS = {
	"X-Stainless-Lang": null,
	"X-Stainless-Package-Version": null,
	"X-Stainless-OS": null,
	"X-Stainless-Arch": null,
	"X-Stainless-Runtime": null,
	"X-Stainless-Runtime-Version": null,
	"X-Stainless-Retry-Count": null,
	"X-Stainless-Timeout": null,
	"X-Stainless-Helper-Method": null,
	"User-Agent": "AnthropicVertex/JS"
};
//#endregion
export { SDK_TELEMETRY_DEFAULT_HEADERS as t };
