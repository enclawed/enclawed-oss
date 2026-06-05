import { r as createLegacyPrivateNetworkDoctorContract } from "./ssrf-policy-ZujUx1uT.js";
import "./ssrf-runtime-DqMve8F8.js";
//#region extensions/tlon/src/doctor-contract.ts
const contract = createLegacyPrivateNetworkDoctorContract({ channelKey: "tlon" });
const legacyConfigRules = contract.legacyConfigRules;
const normalizeCompatibilityConfig = contract.normalizeCompatibilityConfig;
//#endregion
export { normalizeCompatibilityConfig as n, legacyConfigRules as t };
