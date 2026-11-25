import type { Flavor } from "./flavor.js";
import type { ClearanceLevel } from "./module-manifest.js";
export type ModuleDecision = {
    allowed: true;
    flavor: Flavor;
    clearance: ClearanceLevel;
    signerKeyId: string | null;
    warnings: ReadonlyArray<string>;
} | {
    allowed: false;
    flavor: Flavor;
    reason: string;
};
