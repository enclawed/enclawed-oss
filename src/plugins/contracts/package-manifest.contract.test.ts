import { describePackageManifestContract } from "../../../test/helpers/plugins/package-manifest-contract.js";

type PackageManifestContractParams = Parameters<typeof describePackageManifestContract>[0];

// Only plugins shipped in this fork. Channels/providers stripped pending
// enclawed security review have their entries quarantined to attic/ and are
// re-added here when restored. Original list preserved at
// attic/channels-pending-security-review/src/plugins/contracts/package-manifest.contract.test.ts.full.ts
const packageManifestContractTests: PackageManifestContractParams[] = [
  {
    pluginId: "memory-lancedb",
    mirroredRootRuntimeDeps: ["@lancedb/lancedb", "openai"],
    minHostVersionBaseline: "2026.3.22",
  },
  { pluginId: "openshell", pluginLocalRuntimeDeps: ["openshell"] },
];

for (const params of packageManifestContractTests) {
  describePackageManifestContract(params);
}
