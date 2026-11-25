import { r as createLegacyPrivateNetworkDoctorContract } from "./ssrf-policy-DVcaXdVR.js";
import "./ssrf-runtime-g42yz-N7.js";
//#region extensions/nextcloud-talk/src/doctor-contract.ts
const contract = createLegacyPrivateNetworkDoctorContract({ channelKey: "nextcloud-talk" });
const legacyConfigRules = contract.legacyConfigRules;
const normalizeCompatibilityConfig = contract.normalizeCompatibilityConfig;
//#endregion
export { normalizeCompatibilityConfig as n, legacyConfigRules as t };
