// The device-verified second factor (TOTP checked by a bound Enclaweder).
// The open core has none: in a software-only deployment the only accepted
// second factor is a roaming FIDO2 authenticator, and a TOTP secret would
// have to live on this computer. enclawed-enclaved replaces this file with
// the adapter to the Enclaweder's on-device TOTP verification.

import type { DeviceSecondFactor } from "./gate.js";

export async function resolveDeviceSecondFactor(): Promise<DeviceSecondFactor | null> {
  return null;
}
