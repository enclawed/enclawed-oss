export type MatrixManagedDeviceInfo = {
  deviceId: string;
  displayName: string | null;
  current: boolean;
};

export type MatrixDeviceHealthSummary = {
  currentDeviceId: string | null;
  staleEnclawedDevices: MatrixManagedDeviceInfo[];
  currentEnclawedDevices: MatrixManagedDeviceInfo[];
};

const ENCLAWED_DEVICE_NAME_PREFIX = "Enclawed ";

export function isEnclawedManagedMatrixDevice(displayName: string | null | undefined): boolean {
  return displayName?.startsWith(ENCLAWED_DEVICE_NAME_PREFIX) === true;
}

export function summarizeMatrixDeviceHealth(
  devices: MatrixManagedDeviceInfo[],
): MatrixDeviceHealthSummary {
  const currentDeviceId = devices.find((device) => device.current)?.deviceId ?? null;
  const enclawedDevices = devices.filter((device) =>
    isEnclawedManagedMatrixDevice(device.displayName),
  );
  return {
    currentDeviceId,
    staleEnclawedDevices: enclawedDevices.filter((device) => !device.current),
    currentEnclawedDevices: enclawedDevices.filter((device) => device.current),
  };
}
