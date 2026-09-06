import { r as createLegacyPrivateNetworkDoctorContract } from "./ssrf-policy-CRYhPVuv.js";
import "./ssrf-runtime-9LvoQ5Lf.js";
//#region extensions/mattermost/src/doctor-contract.ts
const contract = createLegacyPrivateNetworkDoctorContract({ channelKey: "mattermost" });
const legacyConfigRules = contract.legacyConfigRules;
const normalizeCompatibilityConfig = contract.normalizeCompatibilityConfig;
//#endregion
export { normalizeCompatibilityConfig as n, legacyConfigRules as t };
