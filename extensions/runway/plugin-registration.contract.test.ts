import { describePluginRegistrationContract } from "@enclawed/plugin-sdk/plugin-test-contracts";

describePluginRegistrationContract({
  pluginId: "runway",
  videoGenerationProviderIds: ["runway"],
  requireGenerateVideo: true,
});
