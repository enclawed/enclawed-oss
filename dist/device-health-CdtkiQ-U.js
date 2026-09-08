//#region extensions/matrix/src/matrix/device-health.ts
const ENCLAWED_DEVICE_NAME_PREFIX = "Enclawed ";
function isEnclawedManagedMatrixDevice(displayName) {
	return displayName?.startsWith(ENCLAWED_DEVICE_NAME_PREFIX) === true;
}
function summarizeMatrixDeviceHealth(devices) {
	const currentDeviceId = devices.find((device) => device.current)?.deviceId ?? null;
	const enclawedDevices = devices.filter((device) => isEnclawedManagedMatrixDevice(device.displayName));
	return {
		currentDeviceId,
		staleEnclawedDevices: enclawedDevices.filter((device) => !device.current),
		currentEnclawedDevices: enclawedDevices.filter((device) => device.current)
	};
}
//#endregion
export { summarizeMatrixDeviceHealth as n, isEnclawedManagedMatrixDevice as t };
