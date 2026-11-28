// Leaf type for module admission decisions. Kept separate from
// module-loader.ts so runtime.ts can describe the preloaded decision map
// without importing the loader (which itself consults the runtime).

import type { Flavor } from "./flavor.js";
import type { ClearanceLevel } from "./module-manifest.js";

export type ModuleDecision =
  | {
      allowed: true;
      flavor: Flavor;
      clearance: ClearanceLevel;
      signerKeyId: string | null;
      warnings: ReadonlyArray<string>;
    }
  | {
      allowed: false;
      flavor: Flavor;
      reason: string;
    };
