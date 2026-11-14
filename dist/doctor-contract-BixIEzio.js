import { r as createLegacyPrivateNetworkDoctorContract } from "./ssrf-policy-Dl1VYtZa.js";
import "./ssrf-runtime-6jw1bI8U.js";
//#region extensions/mattermost/src/doctor-contract.ts
const contract = createLegacyPrivateNetworkDoctorContract({ channelKey: "mattermost" });
const legacyConfigRules = contract.legacyConfigRules;
const normalizeCompatibilityConfig = contract.normalizeCompatibilityConfig;
//#endregion
export { normalizeCompatibilityConfig as n, legacyConfigRules as t };
