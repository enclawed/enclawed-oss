import { pluginRegistrationContractCases } from "@enclawed/plugin-sdk/plugin-test-contracts";
import { describePluginRegistrationContract } from "@enclawed/plugin-sdk/plugin-test-contracts";

describePluginRegistrationContract({
  ...pluginRegistrationContractCases.openai,
  videoGenerationProviderIds: ["openai"],
  requireGenerateImage: true,
  requireGenerateVideo: true,
});
